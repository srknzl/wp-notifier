import { statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from './config.js';
import { logger } from './logger.js';
import { SessionManager } from './session.js';
import { PdfExtractor } from './pdf.js';
import { createMessageHandler } from './processor.js';
import { StorageService } from './storage.js';
import { SmsNotifier, templates } from './sms.js';
import { DedupeStore } from './dedupe.js';
import { AuditLog } from './audit.js';

const config = loadConfig();
const sms = new SmsNotifier(config.twilio);
const storage = new StorageService(config.s3);
const extractor = new PdfExtractor(config.pdf);
const dedupe = new DedupeStore(config.dataDir);
const audit = new AuditLog(config.dataDir);
const session = new SessionManager(config.whatsapp);

const handleMessage = createMessageHandler({ config, sms, storage, extractor, dedupe, audit });

session.on('message', (msg) => {
  handleMessage(msg).catch((err) => {
    logger.error(`Mesaj işlenemedi: ${err.stack || err.message}`);
    audit.record('processing_error', { error: err.message });
  });
});

session.on('critical', (reason) => {
  logger.error(`KRİTİK: ${reason}`);
  audit.record('session_failure', { reason });
  sms.send(templates.sessionFailure({ reason })).catch(() => {});
});

// Kalıcı bir hata yeniden başlatma döngüsüne girerse her çöküşte SMS gitmesin.
const CRASH_ALERT_COOLDOWN_MS = 60 * 60_000;
const crashStamp = join(config.dataDir, 'last-crash-alert');

function crashAlertSentRecently() {
  try {
    return Date.now() - statSync(crashStamp).mtimeMs < CRASH_ALERT_COOLDOWN_MS;
  } catch {
    return false;
  }
}

// Damga yalnızca SMS gerçekten gidince yazılır; gitmediyse sonraki açılış yeniden dener.
function markCrashAlertSent() {
  try {
    writeFileSync(crashStamp, new Date().toISOString());
  } catch (err) {
    logger.warn(`Çöküş damgası yazılamadı: ${err.message}`);
  }
}

// Beklenmeyen çökme: SMS at ve çık, PM2/Docker yeniden başlatsın.
let dying = false;
async function fatal(err) {
  logger.error(`Ölümcül hata: ${err?.stack || err}`);
  // Çöküş genelde art arda birkaç hata üretir; ilki SMS'i bitirip çıkar, sonrakiler onu kesmez.
  if (dying) return;
  dying = true;
  try {
    if (crashAlertSentRecently()) {
      logger.warn('Çöküş SMSi son bir saat içinde gönderildi, tekrar gönderilmiyor');
      return;
    }
    const sent = sms.send(templates.processError({ reason: err?.message || String(err) })).then(markCrashAlertSent);
    await Promise.race([sent, new Promise((r) => setTimeout(r, 15_000))]);
  } catch {
    // gönderim hatası SmsNotifier içinde loglandı
  } finally {
    process.exit(1);
  }
}
process.on('uncaughtException', fatal);
process.on('unhandledRejection', fatal);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    logger.info(`${signal} alındı, kapanıyor`);
    await session.stop().catch(() => {});
    process.exit(0);
  });
}

logger.info(`wp-notifier başlıyor; hedef grup ${config.whatsapp.targetGroupId}`);
session.start().catch(fatal);
