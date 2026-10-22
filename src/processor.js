import { logger } from './logger.js';
import { UnreadablePdfError } from './pdf.js';
import { ImageExtractor } from './image.js';
import { templates } from './sms.js';
import { md5 } from './dedupe.js';

// Handles incoming WhatsApp message: filters group/media (images & PDFs) -> extraction -> alerts.
export function createMessageHandler({ config, session, sms, storage, extractor, pdfExtractor, imageExtractor, dedupe, checkpoint, audit }) {
  const pdfExt = pdfExtractor || extractor;
  const imgExt = imageExtractor || (config?.pdf ? new ImageExtractor(config.pdf) : null);

  return async function handleMessage(msg) {
    const target = config.whatsapp.targetGroupId;
    const isTarget = session?.isTargetChat
      ? session.isTargetChat(msg.from) || (msg.fromMe && session.isTargetChat(msg.to))
      : msg.from === target || (msg.fromMe && msg.to === target);

    if (!isTarget) return;

    // Skip self-generated notification messages to prevent infinite loops
    const textContent = msg._data?.caption || msg.body || '';
    if (
      textContent.startsWith('📋 *[NOTIFICATION]') ||
      textContent.startsWith('📋 *[BİLDİRİM]') ||
      textContent.startsWith('[ALERT]') ||
      textContent.startsWith('⚠️ *[WARNING]') ||
      textContent.startsWith('⚠️ *[UYARI]') ||
      textContent.startsWith('ℹ️ *[INFO]') ||
      textContent.startsWith('ℹ️ *[BİLGİ]')
    ) {
      return;
    }

    // Update checkpoint timestamp on each processed message
    if (checkpoint && msg.timestamp) {
      checkpoint.update(target, { timestamp: msg.timestamp, messageId: msg.id?._serialized });
    }

    // Ignore non-media messages immediately (plain text, stickers, audio, etc.)
    if (!msg.hasMedia) return;

    const mime = msg._data?.mimetype || '';
    const type = msg.type || '';
    const filename = msg._data?.filename || '';
    const isPdfType = type === 'document' && (mime === 'application/pdf' || filename.toLowerCase().endsWith('.pdf'));
    const isImageType = type === 'image' || mime.startsWith('image/') || /\.(jpe?g|png|webp|bmp)$/i.test(filename);

    if (!isPdfType && !isImageType) return;

    let media;
    try {
      media = await msg.downloadMedia();
    } catch (err) {
      logger.error(`Media download error: ${err.message}`);
      return;
    }
    if (!media || !media.data) return;

    const mediaMime = media.mimetype || mime || '';
    const isPdf = mediaMime === 'application/pdf' || isPdfType;
    const isImage = mediaMime.startsWith('image/') || isImageType;

    if (!isPdf && !isImage) return;

    const fileName = media.filename || filename || (isImage ? 'image.jpg' : 'document.pdf');
    let buffer = Buffer.from(media.data, 'base64');
    const hash = md5(buffer);
    if (config?.enableDedupe && dedupe?.has && dedupe.has(hash)) {
      logger.info(`Already processed, skipping: ${fileName} (${hash})`);
      return;
    }
    const mediaTypeLabel = isImage ? 'Image' : 'PDF';
    logger.info(`${mediaTypeLabel} received: ${fileName} (${buffer.length} bytes, ${hash})`);

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
            text: `⚠️ *[WARNING]* Text layer in "${fileName}" from ${config.groupLabel} could not be read.`,
          });
        } else if (sms) {
          await sms.send(templates.unreadablePdf({ group: config.groupLabel }));
        }
        dedupe.add(hash, { fileName, outcome: 'unreadable' });
        return;
      }

      if (!result) {
        audit.record('no_match', { fileName, hash });
        logger.info(`Target not found in: ${fileName}`);
        if (config.debugSmsOnNoMatch) {
          if (session?.sendAlert && config.channel !== 'twilio') {
            await session.sendAlert({
              text: `ℹ️ *[INFO]* Target text not found in "${fileName}" from ${config.groupLabel}.`,
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
        // 1. WhatsApp Channel (Default & Free: sends cropped image and summary directly to WhatsApp)
        if (session?.sendAlert && config.channel !== 'twilio') {
          const caption = [
            `📋 *[NOTIFICATION] Target Amount Found*`,
            `📍 Source: ${config.groupLabel}`,
            `📄 File: ${fileName}`,
            `🏠 Target: *${item.keyword}*`,
            `💰 Amount: *${item.amount}*`,
            item.pageNumber && !isImage ? `📑 Page: ${item.pageNumber}` : null,
            `📝 Line: _"${item.lineText}"_`,
          ]
            .filter(Boolean)
            .join('\n');

          await session.sendAlert({
            text: caption,
            imageBuffer: item.png,
            fileName: `cropped_${hash.slice(0, 8)}_${i + 1}.png`,
          });
          item.png = null;
          audit.record('alert_sent', { fileName, hash, page: item.pageNumber, line: item.lineText, amount: item.amount, channel: 'whatsapp' });
        } else if (storage && sms) {
          // 2. Optional Twilio SMS + AWS S3 Channel
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
