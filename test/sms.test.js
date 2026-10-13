import { test } from 'node:test';
import assert from 'node:assert/strict';
import { templates, toGsmSafe, gsmLength } from '../src/sms.js';
import { extractAmount } from '../src/pdf.js';
import { evidenceKey } from '../src/storage.js';

const url = 'https://pdf-evidence-vault.s3.us-east-1.amazonaws.com/evidence/20261013_3f2b8c1e-9a4d-4c2b-8e7f-1a2b3c4d5e6f.png';

test('Türkçe karakterler GSM-7 güvenli hale gelir', () => {
  assert.equal(toGsmSafe('Ödenecek Tutar ₺1.250,00 şğüçıİ'), 'Odenecek Tutar TL1.250,00 sguciI');
});

test('köşeli parantez GSM-7de iki karakter sayılır, ters tırnak atılır', () => {
  assert.equal(gsmLength('[ALERT] ok'), 12);
  assert.equal(toGsmSafe('a`b'), "a'b");
});

test('kritik ve uyarı SMS 160 karakteri geçmez', () => {
  assert.ok(gsmLength(templates.sessionFailure({ reason: 'x'.repeat(300) })) <= 160);
  assert.ok(gsmLength(templates.sessionFailure({ reason: '[]'.repeat(150) })) <= 160);
  assert.ok(gsmLength(templates.unreadablePdf({ group: 'Muhasebe Grubu' })) <= 160);
});

test('kısa CDN linkiyle tam şablon kullanılır', () => {
  const cdn = 'https://e.example.com/evidence/20261013_3f2b8c1e-9a4d-4c2b-8e7f-1a2b3c4d5e6f.png';
  const msg = templates.targetFound({ keyword: 'Total Due', amount: '1,620.00 USD', url: cdn });
  assert.equal(msg, `[ALERT] PDF Data Extracted: Total Due - Amount: 1,620.00 USD. Evidence: ${cdn}`);
  assert.ok(gsmLength(msg) <= 160);
});

test('uzun S3 linkinde kısa şablona geçilir, URL bozulmaz', () => {
  const msg = templates.targetFound({ keyword: 'Total amount payable including all taxes', amount: '1,620.00 USD', url });
  assert.ok(gsmLength(msg) <= 160, `uzunluk ${gsmLength(msg)}`);
  assert.ok(msg.endsWith(url));
});

test('tutar satırdan çıkarılır', () => {
  assert.equal(extractAmount('Total Due 1,620.00 USD', 9), '1,620.00 USD');
  assert.equal(extractAmount('Genel Toplam: 12.345,67 TL', 13), '12.345,67 TL');
  assert.equal(extractAmount('Amount payable', 14), null);
});

test('kanıt dosya adı evidence/YYYYMMDD_UUID.png biçiminde', () => {
  assert.match(evidenceKey(new Date('2026-10-13T12:00:00Z')), /^evidence\/20261013_[0-9a-f-]{36}\.png$/);
});
