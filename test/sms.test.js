import { test } from 'node:test';
import assert from 'node:assert/strict';
import { templates, toGsmSafe, gsmLength } from '../src/sms.js';
import { extractAmount } from '../src/pdf.js';
import { evidenceKey } from '../src/storage.js';

const url = 'https://pdf-evidence-vault.s3.us-east-1.amazonaws.com/evidence/20261013_3f2b8c1e-9a4d-4c2b-8e7f-1a2b3c4d5e6f.png';

test('Turkish and non-ASCII characters become GSM-7 safe', () => {
  assert.equal(toGsmSafe('Ödenecek Tutar ₺1.250,00 şğüçıİ'), 'Odenecek Tutar TL1.250,00 sguciI');
});

test('brackets count as 2 chars in GSM-7, backticks are replaced', () => {
  assert.equal(gsmLength('[ALERT] ok'), 12);
  assert.equal(toGsmSafe('a`b'), "a'b");
});

test('critical and warning SMS fit within 160 characters', () => {
  assert.ok(gsmLength(templates.sessionFailure({ reason: 'x'.repeat(300) })) <= 160);
  assert.ok(gsmLength(templates.sessionFailure({ reason: '[]'.repeat(150) })) <= 160);
  assert.ok(gsmLength(templates.unreadablePdf({ group: 'Accounting' })) <= 160);
});

test('short CDN link uses full alert template', () => {
  const cdn = 'https://e.example.com/evidence/20261013_3f2b8c1e-9a4d-4c2b-8e7f-1a2b3c4d5e6f.png';
  const msg = templates.targetFound({ keyword: 'Total Due', amount: '1,620.00 USD', url: cdn });
  assert.equal(msg, `[ALERT] PDF Data Extracted: Total Due - Amount: 1,620.00 USD. Evidence: ${cdn}`);
  assert.ok(gsmLength(msg) <= 160);
});

test('long S3 link falls back to compact template without corrupting URL', () => {
  const msg = templates.targetFound({ keyword: 'Total amount payable including all taxes', amount: '1,620.00 USD', url });
  assert.ok(gsmLength(msg) <= 160, `length ${gsmLength(msg)}`);
  assert.ok(msg.endsWith(url));
});

test('amount is extracted from line text', () => {
  assert.equal(extractAmount('Total Due 1,620.00 USD', 9), '1,620.00 USD');
  assert.equal(extractAmount('Grand Total: 12,345.67 USD', 13), '12,345.67 USD');
  assert.equal(extractAmount('Amount payable', 14), null);
});

test('amounts without thousands separators are not split', () => {
  assert.equal(extractAmount('Total Due 1620.00', 9), '1620.00');
  assert.equal(extractAmount('Total Due 12500', 9), '12500');
  assert.equal(extractAmount('Total Due 1620,5 TL', 9), '1620,5 TL');
});

test('dates, percentages, and page numbers are not mistaken for amounts', () => {
  assert.equal(extractAmount('Total Due: $1,620.00 Due Date: 15/11/2026', 9), '$1,620.00');
  assert.equal(extractAmount('Total Due 1.620,00 TL Due 15.11.2026', 9), '1.620,00 TL');
  assert.equal(extractAmount('Total Due 1,180.00 (incl. VAT 18%)', 9), '1,180.00');
  assert.equal(extractAmount('Total Due 1,620.00 Page 1 of 2', 9), '1,620.00');
});

test('evidence filename follows evidence/YYYYMMDD_UUID.png pattern', () => {
  assert.match(evidenceKey(new Date('2026-10-13T12:00:00Z')), /^evidence\/20261013_[0-9a-f-]{36}\.png$/);
});
