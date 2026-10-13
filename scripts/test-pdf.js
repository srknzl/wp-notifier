// Kullanım: node scripts/test-pdf.js fatura.pdf ["(?i)total\s*due"]
// Twilio/S3/WhatsApp olmadan çıkarma ve kırpmayı dener; kırpılan görseli crop.png olarak yazar.
import { readFileSync, writeFileSync } from 'node:fs';
import { PdfExtractor } from '../src/pdf.js';

const [file, pattern = '(total\\s*due|amount\\s*payable)'] = process.argv.slice(2);
if (!file) {
  console.error('Kullanım: node scripts/test-pdf.js <pdf> [regex]');
  process.exit(1);
}
const source = pattern.replace(/^\(\?i\)/, '');
const extractor = new PdfExtractor({ targetRegex: new RegExp(source, 'i') });
const result = await extractor.extract(readFileSync(file));
if (!result) {
  console.log('Eşleşme yok');
} else {
  writeFileSync('crop.png', result.png);
  console.log({ keyword: result.keyword, amount: result.amount, page: result.pageNumber, line: result.lineText });
  console.log('Kırpılan görsel: crop.png');
}
