import { logger } from './logger.js';
import { UnreadablePdfError } from './pdf.js';
import { templates } from './sms.js';
import { md5 } from './dedupe.js';

// Gelen WhatsApp mesajını işler: grup/PDF filtresi -> çıkarma -> S3 -> SMS.
export function createMessageHandler({ config, sms, storage, extractor, dedupe, audit }) {
  return async function handleMessage(msg) {
    if (msg.from !== config.whatsapp.targetGroupId) return;
    if (!msg.hasMedia || msg.type !== 'document') return;
    if (msg._data?.mimetype && msg._data.mimetype !== 'application/pdf') return;

    const media = await msg.downloadMedia();
    if (!media || media.mimetype !== 'application/pdf') return;

    const fileName = media.filename || msg._data?.filename || 'unnamed.pdf';
    // PDF yalnızca bellekte tutulur; diske yazılmaz, işlem bitince referansı düşer.
    let pdf = Buffer.from(media.data, 'base64');
    const hash = md5(pdf);
    if (dedupe.has(hash)) {
      logger.info(`Zaten işlendi, atlanıyor: ${fileName} (${hash})`);
      return;
    }
    logger.info(`PDF alındı: ${fileName} (${pdf.length} bayt, ${hash})`);

    try {
      let result;
      try {
        result = await extractor.extract(pdf);
      } catch (err) {
        if (!(err instanceof UnreadablePdfError)) throw err;
        audit.record('unreadable_pdf', { fileName, hash });
        await sms.send(templates.unreadablePdf({ group: config.groupLabel }));
        dedupe.add(hash, { fileName, outcome: 'unreadable' });
        return;
      }

      if (!result) {
        audit.record('no_match', { fileName, hash });
        logger.info(`Hedef bulunamadı: ${fileName}`);
        if (config.debugSmsOnNoMatch) await sms.send(templates.noMatchDebug({ group: config.groupLabel, file: fileName }));
        dedupe.add(hash, { fileName, outcome: 'no_match' });
        return;
      }

      const { url, key } = await storage.uploadPng(result.png);
      result.png = null;
      const body = templates.targetFound({ keyword: result.keyword, amount: result.amount, url });
      await sms.send(body);
      audit.record('alert_sent', { fileName, hash, page: result.pageNumber, line: result.lineText, amount: result.amount, key });
      dedupe.add(hash, { fileName, outcome: 'alert_sent', key });
    } finally {
      pdf = null;
    }
  };
}
