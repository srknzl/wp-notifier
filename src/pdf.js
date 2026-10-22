import { createCanvas } from '@napi-rs/canvas';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

// Sondaki (?!...) tarih gibi dizileri (15.11.2026, 15/11/2026) tutar sanmayı önler.
const AMOUNT_RE =
  /(?:[$€£₺]\s?|(?:TL|TRY|USD|EUR)\s)?-?(?:\d{1,3}(?:[.,\s']\d{3})+(?!\d)|\d+)(?:[.,]\d{1,2})?(?![.,/-]?\d)(?:\s?(?:TL|TRY|USD|EUR|[$€£₺]))?/g;
// Kuruş hanesi ya da para birimi taşıyan sayı; sayfa no, yüzde, gün sayısı gibi sayılardan ayırır.
const MONEY_RE = /[.,]\d{2}(?!\d)|[$€£₺]|TL|TRY|USD|EUR/;

function pickAmount(text) {
  const found = [...text.matchAll(AMOUNT_RE)].map((m) => m[0].trim()).filter((s) => /\d/.test(s));
  return found.findLast((s) => MONEY_RE.test(s)) ?? found.at(-1) ?? null;
}

export class UnreadablePdfError extends Error {
  constructor() {
    super('PDF metin katmanı okunamadı (taranmış görüntü olabilir)');
    this.name = 'UnreadablePdfError';
  }
}

// Aynı y koordinatındaki metin parçalarını satırlara topla.
function groupLines(items, tolerance = 2) {
  const lines = [];
  for (const item of items) {
    if (!item.str || !item.str.trim()) continue;
    const [, , , , x, y] = item.transform;
    const height = item.height || Math.abs(item.transform[3]) || 10;
    let line = lines.find((l) => Math.abs(l.y - y) <= tolerance);
    if (!line) {
      line = { y, items: [] };
      lines.push(line);
    }
    line.items.push({ str: item.str, x, y, width: item.width, height });
  }
  for (const line of lines) {
    line.items.sort((a, b) => a.x - b.x);
    line.text = line.items.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim();
    line.box = {
      x1: Math.min(...line.items.map((i) => i.x)),
      x2: Math.max(...line.items.map((i) => i.x + i.width)),
      y1: Math.min(...line.items.map((i) => i.y - i.height * 0.25)), // alt çizgi payı
      y2: Math.max(...line.items.map((i) => i.y + i.height)),
    };
  }
  // PDF koordinatında y yukarı doğru artar; yukarıdan aşağı sırala.
  return lines.sort((a, b) => b.y - a.y);
}

export function extractAmount(lineText, matchEnd = 0) {
  return pickAmount(lineText.slice(matchEnd)) ?? pickAmount(lineText);
}

export class PdfExtractor {
  constructor({ targetRegex, renderScale = 3, paddingPx = 20 }) {
    this.targetRegex = targetRegex;
    this.renderScale = renderScale;
    this.paddingPx = paddingPx;
  }

  /**
   * PDF'te hedef satırları bulur, sayfayı yüksek çözünürlükte render edip satırı kırpar.
   * Dönüş: null (eşleşme yok) | match | match[]
   * Metin katmanı yoksa UnreadablePdfError fırlatır.
   */
  async extract(pdfBuffer) {
    const doc = await getDocument({
      data: new Uint8Array(pdfBuffer),
      disableFontFace: true,
      useSystemFonts: false,
      isEvalSupported: false,
      verbosity: 0,
    }).promise;

    try {
      let sawText = false;
      const matches = [];

      for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
        const page = await doc.getPage(pageNumber);
        const content = await page.getTextContent();
        const lines = groupLines(content.items);
        if (lines.length) sawText = true;

        for (const line of lines) {
          const match = line.text.match(this.targetRegex);
          if (!match) continue;
          const amount = extractAmount(line.text, match.index + match[0].length) ?? 'N/A';
          const png = await this.#cropLine(page, line.box);
          matches.push({ keyword: match[0].trim(), amount, lineText: line.text, pageNumber, png });
        }
      }
      if (!sawText) throw new UnreadablePdfError();
      if (!matches.length) return null;
      return matches.length === 1 ? matches[0] : matches;
    } finally {
      await doc.destroy();
    }
  }

  async #cropLine(page, box) {
    const viewport = page.getViewport({ scale: this.renderScale });
    const width = Math.ceil(viewport.width);
    const height = Math.ceil(viewport.height);
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;

    const [ax, ay, bx, by] = viewport.convertToViewportRectangle([box.x1, box.y1, box.x2, box.y2]);
    const pad = Math.min(2, Math.max(0, this.paddingPx));
    const left = Math.max(0, Math.floor(Math.min(ax, bx)) - pad);
    const top = Math.max(0, Math.floor(Math.min(ay, by)) - pad);
    const right = Math.min(width, Math.ceil(Math.max(ax, bx)) + pad);
    const bottom = Math.min(height, Math.ceil(Math.max(ay, by)) + pad);

    const crop = createCanvas(right - left, bottom - top);
    crop.getContext('2d').drawImage(canvas, left, top, right - left, bottom - top, 0, 0, right - left, bottom - top);
    return crop.toBuffer('image/png');
  }
}
