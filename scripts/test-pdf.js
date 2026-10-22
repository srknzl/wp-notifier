// Usage: node scripts/test-pdf.js invoice.pdf ["(?i)total\s*due"]
// Tests PDF extraction and line cropping locally without WhatsApp/Twilio/S3; writes crop.png.
import { readFileSync, writeFileSync } from 'node:fs';
import { PdfExtractor } from '../src/pdf.js';

const [file, pattern = '(total\\s*due|amount\\s*payable)'] = process.argv.slice(2);
if (!file) {
  console.error('Usage: node scripts/test-pdf.js <pdf_file> [regex]');
  process.exit(1);
}
const source = pattern.replace(/^\(\?i\)/, '');
const extractor = new PdfExtractor({ targetRegex: new RegExp(source, 'i') });
const result = await extractor.extract(readFileSync(file));
if (!result) {
  console.log('No match found.');
} else {
  writeFileSync('crop.png', result.png);
  console.log({ keyword: result.keyword, amount: result.amount, page: result.pageNumber, line: result.lineText });
  console.log('Cropped image saved: crop.png');
}
