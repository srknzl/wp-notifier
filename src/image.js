import { createCanvas, loadImage } from '@napi-rs/canvas';
import { createWorker } from 'tesseract.js';
import { extractAmount } from './pdf.js';
import { logger } from './logger.js';

export class ImageExtractor {
  constructor({ targetRegex, paddingPx = 30 } = {}) {
    this.targetRegex = targetRegex;
    this.paddingPx = paddingPx;
    this.worker = null;
    this.workerPromise = null;
  }

  async #getWorker() {
    if (!this.workerPromise) {
      this.workerPromise = (async () => {
        logger.info('OCR motoru hazırlanıyor (tur+eng)...');
        const worker = await createWorker(['tur', 'eng']);
        this.worker = worker;
        return worker;
      })();
    }
    return this.workerPromise;
  }

  /**
   * Resim tamponunu (JPEG/PNG/WEBP) OCR ile tarar ve hedef satırları kırpar.
   * Dönüş: null (eşleşme yok) | match | match[]
   */
  async extract(imageBuffer) {
    const worker = await this.#getWorker();
    const ret = await worker.recognize(imageBuffer, {}, { blocks: true });

    const lines =
      ret.data.blocks
        ?.flatMap((b) => b.paragraphs?.flatMap((p) => p.lines) || [])
        ?.map((l) => ({
          text: l.text.trim().replace(/\s+/g, ' '),
          bbox: l.bbox,
        }))
        ?.filter((l) => l.text) || [];

    if (!lines.length) {
      return null;
    }

    const matches = [];
    let img = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.text.match(this.targetRegex);
      if (!match) continue;

      let amount = extractAmount(line.text, match.index + match[0].length);
      let cropBbox = { ...line.bbox };

      // Aynı satırda tutar bulunamadıysa bir alt satırı kontrol et
      if (!amount && i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        const nextAmount = extractAmount(nextLine.text);
        if (nextAmount) {
          amount = nextAmount;
          cropBbox.x0 = Math.min(cropBbox.x0, nextLine.bbox.x0);
          cropBbox.y0 = Math.min(cropBbox.y0, nextLine.bbox.y0);
          cropBbox.x1 = Math.max(cropBbox.x1, nextLine.bbox.x1);
          cropBbox.y1 = Math.max(cropBbox.y1, nextLine.bbox.y1);
        }
      }

      if (!img) {
        img = await loadImage(imageBuffer);
      }
      const png = this.#crop(img, cropBbox);

      matches.push({
        keyword: match[0].trim(),
        amount: amount ?? 'N/A',
        lineText: line.text,
        pageNumber: 1,
        png,
      });
    }

    if (!matches.length) {
      return null;
    }

    return matches.length === 1 ? matches[0] : matches;
  }

  #crop(img, bbox) {
    const pad = this.paddingPx;
    const left = Math.max(0, Math.floor(bbox.x0) - pad);
    const top = Math.max(0, Math.floor(bbox.y0) - pad);
    const right = Math.min(img.width, Math.ceil(bbox.x1) + pad);
    const bottom = Math.min(img.height, Math.ceil(bbox.y1) + pad);
    const width = Math.max(1, right - left);
    const height = Math.max(1, bottom - top);

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, left, top, width, height, 0, 0, width, height);
    return canvas.toBuffer('image/png');
  }

  async close() {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      this.workerPromise = null;
    }
  }
}
