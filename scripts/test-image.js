// Kullanım: node scripts/test-image.js makbuz.jpg ["(?i)(toplam|aidat|tutar)"]
import { readFileSync, writeFileSync } from 'node:fs';
import { ImageExtractor } from '../src/image.js';

const [file, pattern = '(toplam\\s*tutar|odenecek\\s*tutar|odenecek|tutar|aidat|total\\s*due|amount\\s*payable)'] = process.argv.slice(2);
if (!file) {
  console.error('Kullanım: node scripts/test-image.js <resim_dosyasi> [regex]');
  process.exit(1);
}
const source = pattern.replace(/^\(\?i\)/, '');
const extractor = new ImageExtractor({ targetRegex: new RegExp(source, 'i') });
try {
  console.log(`"${file}" OCR ile taranıyor...`);
  const result = await extractor.extract(readFileSync(file));
  if (!result) {
    console.log('Eşleşme bulunamadı.');
  } else {
    writeFileSync('crop.png', result.png);
    console.log({ keyword: result.keyword, amount: result.amount, line: result.lineText });
    console.log('Kırpılan görsel kaydedildi: crop.png');
  }
} finally {
  await extractor.close();
}

