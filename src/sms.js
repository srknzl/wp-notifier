import twilio from 'twilio';
import { logger } from './logger.js';
import { withRetry } from './retry.js';

const SMS_LIMIT = 160;

// Türkçe karakterler GSM-7 dışında kalır ve SMS'i UCS-2'ye (70 karakter sınırı) düşürür.
// 160 karakterlik tek segmenti korumak için ASCII'ye çeviriyoruz.
const TRANSLIT = { ç: 'c', Ç: 'C', ğ: 'g', Ğ: 'G', ı: 'i', İ: 'I', ö: 'o', Ö: 'O', ş: 's', Ş: 'S', ü: 'u', Ü: 'U', '₺': 'TL', '€': 'EUR' };

// GSM-7'de [ ] { } \ ^ ~ | kaçış karakteriyle gider ve iki karakter yer tutar; ` hiç yoktur.
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
  // URL kısaltılmaz (kırık link olur). Bütçe aşılırsa sırayla: anahtar kelime kısaltılır,
  // kısa şablona geçilir, tutar kısaltılır.
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
      // URL tek başına bütçeyi aşıyor; link bütün gider (2 segment).
      logger.warn(`SMS ${gsmLength(msg)} karakter; URL çok uzun. EVIDENCE_PUBLIC_BASE_URL ile kısalt.`);
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

  // Mesajlar sırayla gönderilir; biri başarısız olsa bile kuyruk durmaz.
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
          // 4xx (geçersiz numara vb.) tekrar denemekle düzelmez; 429 hariç.
          if (err.status && err.status >= 400 && err.status < 500 && err.status !== 429) err.retryable = false;
          throw err;
        }
      });
      logger.info(`SMS gönderildi sid=${msg.sid} status=${msg.status} (${gsmLength(body)} karakter)`);
      return msg;
    } catch (err) {
      logger.error(`SMS gönderilemedi: ${err.message}`, { body });
      throw err;
    }
  }
}
