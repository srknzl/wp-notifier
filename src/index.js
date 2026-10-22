import { statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from './config.js';
import { logger } from './logger.js';
import { SessionManager } from './session.js';
import { PdfExtractor } from './pdf.js';
import { ImageExtractor } from './image.js';
import { createMessageHandler } from './processor.js';
import { StorageService } from './storage.js';
import { SmsNotifier, templates } from './sms.js';
import { DedupeStore } from './dedupe.js';
import { CheckpointStore } from './checkpoint.js';
import { AuditLog } from './audit.js';

const config = loadConfig();
const pdfExtractor = new PdfExtractor(config.pdf);
const imageExtractor = new ImageExtractor(config.pdf);
const dedupe = new DedupeStore(config.dataDir);
const checkpoint = new CheckpointStore(config.dataDir);
const audit = new AuditLog(config.dataDir);
const session = new SessionManager(config.whatsapp);

let sms = null;
let storage = null;
if (config.channel === 'twilio') {
  sms = new SmsNotifier(config.twilio);
  storage = new StorageService(config.s3);
}

const handleMessage = createMessageHandler({
  config,
  session,
  sms,
  storage,
  pdfExtractor,
  imageExtractor,
  dedupe,
  checkpoint,
  audit,
});

// Sync history starting from checkpoint timestamp on session ready
session.on('ready', async () => {
  const targetId = config.whatsapp.targetGroupId;
  let since = config.rescanOnStartup ? null : checkpoint.getLastTimestamp(targetId);
  if (!since) {
    const lookbackSec = (config.whatsapp.historyLookbackHours || 168) * 3600;
    since = Math.floor(Date.now() / 1000) - lookbackSec;
  }
  await session.syncHistory({
    targetChatId: targetId,
    sinceTimestamp: since,
    onMessage: (msg) =>
      handleMessage(msg).catch((err) => {
        logger.error(`Failed to process history message: ${err.message}`);
      }),
  }).catch((err) => {
    logger.warn(`Warning during history synchronization: ${err.message}`);
  });
});

session.on('message', (msg) => {
  handleMessage(msg).catch((err) => {
    logger.error(`Message processing failed: ${err.stack || err.message}`);
    audit.record('processing_error', { error: err.message });
  });
});

session.on('critical', (reason) => {
  logger.error(`CRITICAL: ${reason}`);
  audit.record('session_failure', { reason });
  if (sms) {
    sms.send(templates.sessionFailure({ reason })).catch(() => {});
  }
});

// Avoid alert storms during crash/reboot loops
const CRASH_ALERT_COOLDOWN_MS = 60 * 60_000;
const crashStamp = join(config.dataDir, 'last-crash-alert');

function crashAlertSentRecently() {
  try {
    return Date.now() - statSync(crashStamp).mtimeMs < CRASH_ALERT_COOLDOWN_MS;
  } catch {
    return false;
  }
}

function markCrashAlertSent() {
  try {
    writeFileSync(crashStamp, new Date().toISOString());
  } catch (err) {
    logger.warn(`Could not write crash timestamp: ${err.message}`);
  }
}

// Unexpected crash: send alert and exit
let dying = false;
async function fatal(err) {
  logger.error(`Fatal process error: ${err?.stack || err}`);
  if (dying) return;
  dying = true;
  try {
    if (crashAlertSentRecently()) {
      logger.warn('Crash alert sent recently; skipping duplicate alert');
      return;
    }
    if (sms) {
      const sent = sms.send(templates.processError({ reason: err?.message || String(err) })).then(markCrashAlertSent);
      await Promise.race([sent, new Promise((r) => setTimeout(r, 15_000))]);
    }
  } catch {
    // Alert dispatch error logged
  } finally {
    process.exit(1);
  }
}
process.on('uncaughtException', fatal);
process.on('unhandledRejection', fatal);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    logger.info(`${signal} received, shutting down gracefully`);
    await imageExtractor.close().catch(() => {});
    await session.stop().catch(() => {});
    process.exit(0);
  });
}

logger.info(`wp-notifier starting; target group ${config.whatsapp.targetGroupId} (Notification channel: ${config.channel})`);
session.start().catch(fatal);
