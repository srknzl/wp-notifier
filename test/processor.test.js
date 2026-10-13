import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMessageHandler } from '../src/processor.js';
import { PdfExtractor } from '../src/pdf.js';
import { DedupeStore } from '../src/dedupe.js';
import { AuditLog } from '../src/audit.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(join(here, 'fixtures', name)).toString('base64');
const GROUP = '120363000000000000@g.us';

function setup() {
  const dataDir = mkdtempSync(join(tmpdir(), 'wpn-'));
  const sent = [];
  const uploads = [];
  const handler = createMessageHandler({
    config: { whatsapp: { targetGroupId: GROUP }, groupLabel: 'Muhasebe', debugSmsOnNoMatch: false },
    sms: { send: async (body) => sent.push(body) },
    storage: {
      uploadPng: async (png) => {
        uploads.push(png);
        return { key: 'evidence/x.png', url: 'https://e.example.com/evidence/20261013_3f2b8c1e-9a4d-4c2b-8e7f-1a2b3c4d5e6f.png' };
      },
    },
    extractor: new PdfExtractor({ targetRegex: /(total\s*due|amount\s*payable)/i }),
    dedupe: new DedupeStore(dataDir),
    audit: new AuditLog(dataDir),
  });
  return { handler, sent, uploads };
}

const pdfMessage = (file, from = GROUP) => ({
  from,
  hasMedia: true,
  type: 'document',
  _data: { mimetype: 'application/pdf', filename: file },
  downloadMedia: async () => ({ mimetype: 'application/pdf', filename: file, data: fixture(file) }),
});

test('eşleşen PDF: görsel yüklenir ve tek SMS gider; tekrar gelirse atlanır', async () => {
  const { handler, sent, uploads } = setup();
  await handler(pdfMessage('invoice.pdf'));
  await handler(pdfMessage('invoice.pdf'));
  assert.equal(uploads.length, 1);
  assert.equal(sent.length, 1);
  assert.match(sent[0], /^\[ALERT\] PDF Data Extracted: Total Due - Amount: 1,620\.00 USD\. Evidence: https:/);
  assert.equal(uploads[0].subarray(1, 4).toString(), 'PNG');
});

test('başka gruptan gelen mesaj yok sayılır', async () => {
  const { handler, sent } = setup();
  await handler(pdfMessage('invoice.pdf', '905551112233@c.us'));
  assert.equal(sent.length, 0);
});

test('metin katmanı olmayan PDF uyarı SMSi üretir', async () => {
  const { handler, sent, uploads } = setup();
  await handler(pdfMessage('scanned.pdf'));
  assert.equal(uploads.length, 0);
  assert.deepEqual(sent, ['[WARNING] PDF received in Muhasebe but text layer was unreadable.']);
});

test('eşleşme yoksa SMS gitmez', async () => {
  const { handler, sent } = setup();
  await handler(pdfMessage('nomatch.pdf'));
  assert.equal(sent.length, 0);
});
