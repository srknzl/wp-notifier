import { createCanvas, loadImage } from '@napi-rs/canvas';
import { createWorker } from 'tesseract.js';
import { extractAmount } from './pdf.js';
import { logger } from './logger.js';

export class ImageExtractor {
  constructor({ targetRegex, paddingPx = 8 } = {}) {
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
    const img = await loadImage(imageBuffer);

    // Çözünürlüğü ve font yüksekliğini artırmak için gerektiğinde görseli büyüt
    let ocrInput = imageBuffer;
    let scale = 1;
    if (img.width < 1800) {
      scale = 2;
      const canvas = createCanvas(img.width * scale, img.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Tablolardaki açık renkli (şeftali/krem/gri) satır arka planlarını beyazlat
      // böylece ardışık renkli satırlar OCR tarafından yutulmaz
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] > 160 && d[i + 1] > 140 && d[i + 2] > 120) {
          d[i] = 255;
          d[i + 1] = 255;
          d[i + 2] = 255;
        }
      }
      ctx.putImageData(imgData, 0, 0);
      ocrInput = canvas.toBuffer('image/png');
    }

    const ret = await worker.recognize(ocrInput, {}, { blocks: true });

    const lines =
      ret.data.blocks
        ?.flatMap((b) => b.paragraphs?.flatMap((p) => p.lines) || [])
        ?.map((l) => ({
          text: l.text.trim().replace(/\s+/g, ' '),
          bbox: {
            x0: Math.round(l.bbox.x0 / scale),
            y0: Math.round(l.bbox.y0 / scale),
            x1: Math.round(l.bbox.x1 / scale),
            y1: Math.round(l.bbox.y1 / scale),
          },
        }))
        ?.filter((l) => l.text) || [];

    if (!lines.length) {
      return null;
    }

    const matches = [];
    const matchedCoords = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (!this.targetRegex) continue;
      const match = line.text.match(this.targetRegex);
      if (!match) continue;

      const keyword = match[0].trim();

      // Aynı satırın birden fazla parçalanmış bloğu tarafından tekrar eklenmesini önle
      const yCenter = (line.bbox.y0 + line.bbox.y1) / 2;
      if (matchedCoords.some((y) => Math.abs(y - yCenter) < 15)) continue;
      matchedCoords.push(yCenter);

      // Orijinal görselden tam satır genişliğinde kırp
      const png = this.#cropRow(img, line.bbox);

      // Tutar çıkarma: önce satır metninden, bulunamazsa bir alt satırdan veya kırpılmış görselden
      let amount = extractAmount(line.text);
      if (!amount && i + 1 < lines.length) {
        amount = extractAmount(lines[i + 1].text);
      }
      if (!amount) {
        try {
          const rowRet = await worker.recognize(png);
          amount = extractAmount(rowRet.data.text);
        } catch {}
      }

      matches.push({
        keyword,
        amount: amount || 'Görselde belirtilen tutar',
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

  #cropRow(img, bbox) {
    const pad = this.paddingPx;
    const top = Math.max(0, Math.floor(bbox.y0) - pad);
    const bottom = Math.min(img.height, Math.ceil(bbox.y1) + pad);
    const height = Math.max(1, bottom - top);

    const canvas = createCanvas(img.width, height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, top, img.width, height, 0, 0, img.width, height);
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
