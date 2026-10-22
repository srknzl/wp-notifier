import { createCanvas, loadImage } from '@napi-rs/canvas';
import { createWorker } from 'tesseract.js';
import { extractAmount } from './pdf.js';
import { logger } from './logger.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);

let cachedPythonBin = null;

async function getPythonBin() {
  if (cachedPythonBin) return cachedPythonBin;
  const candidates = process.platform === 'win32' ? ['python', 'python3'] : ['python3', 'python'];
  for (const bin of candidates) {
    try {
      await execFileAsync(bin, ['-c', 'import rapidocr_onnxruntime']);
      cachedPythonBin = bin;
      return bin;
    } catch {}
  }
  logger.warn('RapidOCR (rapidocr_onnxruntime) not found! Run "pip install -r requirements.txt" to accurately parse images.');
  return null;
}

export class ImageExtractor {
  constructor({ targetRegex, paddingPx = 1 } = {}) {
    this.targetRegex = targetRegex;
    this.paddingPx = paddingPx;
    this.worker = null;
    this.workerPromise = null;
  }

  async #getWorker() {
    if (!this.workerPromise) {
      this.workerPromise = (async () => {
        logger.info('Initializing OCR engine (tur+eng)...');
        const worker = await createWorker(['tur', 'eng']);
        this.worker = worker;
        return worker;
      })();
    }
    return this.workerPromise;
  }

  /**
   * Extract row and amount using RapidOCR (ONNX) for low-resolution or complex images.
   */
  async #extractWithRapid(imageBuffer, img) {
    const pyBin = await getPythonBin();
    if (!pyBin) return null;

    const tmpFile = join(tmpdir(), `ocr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`);
    try {
      await writeFile(tmpFile, imageBuffer);
      const { stdout } = await execFileAsync(pyBin, ['scripts/ocr.py', tmpFile], { timeout: 30000 });
      const items = JSON.parse(stdout || '[]');
      if (!items || !items.length) return null;

      const matches = [];
      const matchedCoords = [];

      for (const it of items) {
        if (!this.targetRegex) continue;
        const match = it.text.match(this.targetRegex);
        if (!match) continue;

        const yCenter = (it.box[0][1] + it.box[2][1]) / 2;
        if (matchedCoords.some((y) => Math.abs(y - yCenter) < 15)) continue;
        matchedCoords.push(yCenter);

        // Sort all words in the same horizontal row by x-coordinate
        const rowItems = items
          .filter((other) => {
            const otherY = (other.box[0][1] + other.box[2][1]) / 2;
            return Math.abs(otherY - yCenter) < 14;
          })
          .sort((a, b) => a.box[0][0] - b.box[0][0]);

        const lineText = rowItems.map((r) => r.text).join(' | ');

        // Find the last monetary amount in the row (typically the rightmost table column)
        const moneyItems = rowItems.filter((r) => /\d+[.,]\d{2}|\b\d{3,}\b/i.test(r.text));
        let amount = moneyItems.length ? moneyItems[moneyItems.length - 1].text : null;
        if (amount && /^\d+$/.test(amount) && amount.length >= 4) {
          amount = `${amount.slice(0, -2)},${amount.slice(-2)} TL`;
        } else if (amount && !/TL|TRY|[$€£₺]/i.test(amount)) {
          amount = `${amount} TL`;
        }

        // Crop only the target row tightly without capturing adjacent rows
        const pad = Math.min(1, Math.max(0, this.paddingPx));
        const top = Math.max(0, it.box[0][1] - pad);
        const bottom = Math.min(img.height, it.box[2][1] + pad);
        const height = Math.max(1, bottom - top);

        const canvas = createCanvas(img.width, height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, top, img.width, height, 0, 0, img.width, height);
        const png = canvas.toBuffer('image/png');

        matches.push({
          keyword: match[0].trim(),
          amount: amount || 'Amount shown in image',
          lineText,
          pageNumber: 1,
          png,
        });
      }

      if (!matches.length) return null;
      return matches.length === 1 ? matches[0] : matches;
    } finally {
      unlink(tmpFile).catch(() => {});
    }
  }

  /**
   * Scans image buffer (JPEG/PNG/WEBP) with OCR and crops target rows.
   * Returns: null (no match) | match | match[]
   */
  async extract(imageBuffer) {
    const img = await loadImage(imageBuffer);

    // 1. First try deep-learning based RapidOCR (highly effective on noisy mobile photos)
    try {
      const rapidResult = await this.#extractWithRapid(imageBuffer, img);
      if (rapidResult) {
        return rapidResult;
      }
    } catch (err) {
      // Fallback to Tesseract.js if RapidOCR fails
    }

    // 2. Fallback OCR Engine: Tesseract.js
    const worker = await this.#getWorker();

    let ocrInput = imageBuffer;
    let scale = 1;
    if (img.width < 1800) {
      scale = 2;
      const canvas = createCanvas(img.width * scale, img.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

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

      const yCenter = (line.bbox.y0 + line.bbox.y1) / 2;
      if (matchedCoords.some((y) => Math.abs(y - yCenter) < 15)) continue;
      matchedCoords.push(yCenter);

      const png = this.#cropRow(img, line.bbox);

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
        amount: amount || 'Amount shown in image',
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
    const pad = Math.min(1, Math.max(0, this.paddingPx));
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
