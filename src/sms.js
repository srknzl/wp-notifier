import twilio from 'twilio';
import { logger } from './logger.js';
import { withRetry } from './retry.js';

const SMS_LIMIT = 160;

// Non-ASCII characters fall outside GSM-7 and force SMS into UCS-2 encoding (70-char limit).
// Transliterate to preserve the single 160-character segment limit.
const TRANSLIT = { ç: 'c', Ç: 'C', ğ: 'g', Ğ: 'G', ı: 'i', İ: 'I', ö: 'o', Ö: 'O', ş: 's', Ş: 'S', ü: 'u', Ü: 'U', '₺': 'TL', '€': 'EUR' };

// In GSM-7, characters [ ] { } \ ^ ~ | use escape prefix and count as 2 chars; backtick is not supported.
const GSM_EXTENDED = /[\^{}\\[\]~|]/g;

export function gsmLength(text) {
  return text.length + (text.match(GSM_EXTENDED)?.length ?? 0);
}

export function toGsmSafe(text) {
  return text
    .replace(/[çÇğĞıİöÖşŞüÜ₺€]/g, (c) => TRANSLIT[c])
    .replace(/`/g, "'")
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7E\n]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function fit(text) {
  let safe = toGsmSafe(text);
  if (gsmLength(safe) <= SMS_LIMIT) return safe;
  while (gsmLength(safe) > SMS_LIMIT - 3) safe = safe.slice(0, -1);
  return `${safe}...`;
}

function shorten(value, max) {
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1))}.`;
}

export const templates = {
  // URLs are never truncated. When over budget: truncate keyword, fallback to compact template, truncate amount.
  targetFound({ keyword, amount, url }) {
    const full = (k, a) => toGsmSafe(`[ALERT] PDF Data Extracted: ${k} - Amount: ${a}. Evidence: ${url}`);
    const compact = (k, a) => toGsmSafe(`[ALERT] ${k}: ${a} ${url}`);
    let k = toGsmSafe(keyword);
    let a = toGsmSafe(amount);

    const over = (m) => gsmLength(m) - SMS_LIMIT;

    let msg = full(k, a);
    if (over(msg) > 0) msg = full(shorten(k, Math.max(8, k.length - over(msg))), a);
    if (over(msg) <= 0) return msg;

    msg = compact(k, a);
    if (over(msg) > 0) {
      k = shorten(k, Math.max(8, k.length - over(msg)));
      msg = compact(k, a);
    }
    if (over(msg) > 0) {
      a = shorten(a, Math.max(8, a.length - over(msg)));
      msg = compact(k, a);
    }
    if (over(msg) > 0) {
      logger.warn(`SMS length is ${gsmLength(msg)} characters; URL is too long. Shorten using EVIDENCE_PUBLIC_BASE_URL.`);
    }
    return msg;
  },
  sessionFailure({ reason }) {
    return fit(`[CRITICAL] WhatsApp Bot Session Disconnected! Reason: ${reason}. Re-authentication (QR scan) required.`);
  },
  unreadablePdf({ group }) {
    return fit(`[WARNING] PDF received in ${group} but text layer was unreadable.`);
  },
  noMatchDebug({ group, file }) {
    return fit(`[DEBUG] PDF in ${group} had no target match: ${file}`);
  },
  processError({ reason }) {
    return fit(`[CRITICAL] wp-notifier process error: ${reason}`);
  },
};

export class SmsNotifier {
  constructor({ accountSid, authToken, from, to }) {
    this.client = twilio(accountSid, authToken);
    this.from = from;
    this.to = to;
    this.queue = Promise.resolve();
  }

  // Messages are queued sequentially; failures do not block the queue.
  send(body) {
    const job = this.queue.then(() => this.#dispatch(body));
    this.queue = job.catch(() => {});
    return job;
  }

  async #dispatch(body) {
    try {
      const msg = await withRetry('Twilio SMS', async () => {
        try {
          return await this.client.messages.create({ from: this.from, to: this.to, body });
        } catch (err) {
          if (err.status && err.status >= 400 && err.status < 500 && err.status !== 429) err.retryable = false;
          throw err;
        }
      });
      logger.info(`SMS dispatched sid=${msg.sid} status=${msg.status} (${gsmLength(body)} characters)`);
      return msg;
    } catch (err) {
      logger.error(`SMS send failed: ${err.message}`, { body });
      throw err;
    }
  }
}
