import { logger } from './logger.js';
import { UnreadablePdfError } from './pdf.js';
import { ImageExtractor } from './image.js';
import { templates } from './sms.js';
import { md5 } from './dedupe.js';

// Gelen WhatsApp mesajını işler: grup/medya filtresi (Resim & PDF) -> çıkarma -> bildirim.
export function createMessageHandler({ config, session, sms, storage, extractor, pdfExtractor, imageExtractor, dedupe, checkpoint, audit }) {
  const pdfExt = pdfExtractor || extractor;
  const imgExt = imageExtractor || (config?.pdf ? new ImageExtractor(config.pdf) : null);

  return async function handleMessage(msg) {
    const target = config.whatsapp.targetGroupId;
    const isTarget = msg.from === target || (msg.fromMe && msg.to === target);
    if (!isTarget) return;

    // Her incelenen mesajda checkpoint güncelle (kaldığı yer kaydı)
    if (checkpoint && msg.timestamp) {
      checkpoint.update(target, { timestamp: msg.timestamp, messageId: msg.id?._serialized });
    }

    // Alakasız mesajları (medyasız, düz metin, çıkartma, ses vb.) hemen atla
    if (!msg.hasMedia) return;

    const mime = msg._data?.mimetype || '';
    const type = msg.type || '';
    const filename = msg._data?.filename || '';
    const isPdfType = type === 'document' && (mime === 'application/pdf' || filename.toLowerCase().endsWith('.pdf'));
    const isImageType = type === 'image' || mime.startsWith('image/') || /\.(jpe?g|png|webp|bmp)$/i.test(filename);

    if (!isPdfType && !isImageType) return;

    const media = await msg.downloadMedia();
    if (!media || !media.data) return;

    const mediaMime = media.mimetype || mime || '';
    const isPdf = mediaMime === 'application/pdf' || isPdfType;
    const isImage = mediaMime.startsWith('image/') || isImageType;

    if (!isPdf && !isImage) return;

    const fileName = media.filename || filename || (isImage ? 'gorsel.jpg' : 'belge.pdf');
    let buffer = Buffer.from(media.data, 'base64');
    const hash = md5(buffer);
    if (dedupe.has(hash)) {
      logger.info(`Zaten işlendi, atlanıyor: ${fileName} (${hash})`);
      return;
    }
    const mediaTypeLabel = isImage ? 'Görsel/Resim' : 'PDF';
    logger.info(`${mediaTypeLabel} alındı: ${fileName} (${buffer.length} bayt, ${hash})`);

    try {
      let result;
      try {
        if (isImage && imgExt) {
          result = await imgExt.extract(buffer);
        } else if (pdfExt) {
          result = await pdfExt.extract(buffer);
        }
      } catch (err) {
        if (!(err instanceof UnreadablePdfError)) throw err;
        audit.record('unreadable_media', { fileName, hash });
        if (session?.sendAlert && config.channel !== 'twilio') {
          await session.sendAlert({
            text: `⚠️ *[UYARI]* ${config.groupLabel} sohbetine gelen "${fileName}" dosyasının metin katmanı okunamadı.`,
          });
        } else if (sms) {
          await sms.send(templates.unreadablePdf({ group: config.groupLabel }));
        }
        dedupe.add(hash, { fileName, outcome: 'unreadable' });
        return;
      }

      if (!result) {
        audit.record('no_match', { fileName, hash });
        logger.info(`Hedef bulunamadı: ${fileName}`);
        if (config.debugSmsOnNoMatch) {
          if (session?.sendAlert && config.channel !== 'twilio') {
            await session.sendAlert({
              text: `ℹ️ *[BİLGİ]* ${config.groupLabel} sohbetindeki "${fileName}" dosyasında aranan daire/hedef metin bulunamadı.`,
            });
          } else if (sms) {
            await sms.send(templates.noMatchDebug({ group: config.groupLabel, file: fileName }));
          }
        }
        dedupe.add(hash, { fileName, outcome: 'no_match' });
        return;
      }

      const matches = Array.isArray(result) ? result : [result];

      for (let i = 0; i < matches.length; i++) {
        const item = matches[i];
        // 1. WhatsApp Kanalı (Varsayılan ve ücretsiz: görseli ve özeti doğrudan WhatsApp'a atar)
        if (session?.sendAlert && config.channel !== 'twilio') {
          const caption = [
            `📋 *[BİLDİRİM] Daire Aidat/Fatura Tutarı Bulundu*`,
            `📍 Kaynak: ${config.groupLabel}`,
            `📄 Dosya: ${fileName}`,
            `🏠 Eşleşen Daire: *${item.keyword}*`,
            `💰 Tutar: *${item.amount}*`,
            item.pageNumber && !isImage ? `📑 Sayfa: ${item.pageNumber}` : null,
            `📝 Satır: _"${item.lineText}"_`,
          ]
            .filter(Boolean)
            .join('\n');

          await session.sendAlert({
            text: caption,
            imageBuffer: item.png,
            fileName: `kirpilmis_${hash.slice(0, 8)}_${i + 1}.png`,
          });
          item.png = null;
          audit.record('alert_sent', { fileName, hash, page: item.pageNumber, line: item.lineText, amount: item.amount, channel: 'whatsapp' });
        } else if (storage && sms) {
          // 2. Twilio SMS + S3 Kanalı (İsteğe bağlı yöntem)
          const { url, key } = await storage.uploadPng(item.png);
          item.png = null;
          const body = templates.targetFound({ keyword: item.keyword, amount: item.amount, url });
          await sms.send(body);
          audit.record('alert_sent', { fileName, hash, page: item.pageNumber, line: item.lineText, amount: item.amount, key });
        }
      }

      dedupe.add(hash, { fileName, outcome: 'alert_sent', matchCount: matches.length });
    } finally {
      buffer = null;
    }
  };
}
