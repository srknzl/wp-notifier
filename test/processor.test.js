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
    config: { channel: 'twilio', enableDedupe: true, whatsapp: { targetGroupId: GROUP }, groupLabel: 'Accounting', debugSmsOnNoMatch: false },
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

function setupWhatsApp() {
  const dataDir = mkdtempSync(join(tmpdir(), 'wpn-wa-'));
  const alerts = [];
  const session = {
    sendAlert: async (data) => {
      alerts.push(data);
    },
  };
  const handler = createMessageHandler({
    config: { channel: 'whatsapp', whatsapp: { targetGroupId: GROUP }, groupLabel: 'Accounting', debugSmsOnNoMatch: false },
    session,
    extractor: new PdfExtractor({ targetRegex: /(total\s*due|amount\s*payable)/i }),
    dedupe: new DedupeStore(dataDir),
    audit: new AuditLog(dataDir),
  });
  return { handler, alerts };
}

const pdfMessage = (file, from = GROUP) => ({
  from,
  hasMedia: true,
  type: 'document',
  _data: { mimetype: 'application/pdf', filename: file },
  downloadMedia: async () => ({ mimetype: 'application/pdf', filename: file, data: fixture(file) }),
});

test('matching PDF: uploads image and sends single alert; duplicate is skipped', async () => {
  const { handler, sent, uploads } = setup();
  await handler(pdfMessage('invoice.pdf'));
  await handler(pdfMessage('invoice.pdf'));
  assert.equal(uploads.length, 1);
  assert.equal(sent.length, 1);
  assert.match(sent[0], /^\[ALERT\] PDF Data Extracted: Total Due - Amount: 1,620\.00 USD\. Evidence: https:/);
  assert.equal(uploads[0].subarray(1, 4).toString(), 'PNG');
});

test('messages from non-target chats are ignored', async () => {
  const { handler, sent } = setup();
  await handler(pdfMessage('invoice.pdf', '905551112233@c.us'));
  assert.equal(sent.length, 0);
});

test('PDF without text layer triggers warning alert', async () => {
  const { handler, sent, uploads } = setup();
  await handler(pdfMessage('scanned.pdf'));
  assert.equal(uploads.length, 0);
  assert.deepEqual(sent, ['[WARNING] PDF received in Accounting but text layer was unreadable.']);
});

test('no alert sent when no target matches in PDF', async () => {
  const { handler, sent } = setup();
  await handler(pdfMessage('nomatch.pdf'));
  assert.equal(sent.length, 0);
});

test('WhatsApp channel: sends direct image and text alert to WhatsApp', async () => {
  const { handler, alerts } = setupWhatsApp();
  await handler(pdfMessage('invoice.pdf'));
  assert.equal(alerts.length, 1);
  assert.match(alerts[0].text, /1,620\.00 USD/);
  assert.match(alerts[0].text, /Total Due/);
  assert.equal(alerts[0].imageBuffer.subarray(1, 4).toString(), 'PNG');
});

test('Image message: finds target row via OCR, crops, and sends alert', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'wpn-img-'));
  const alerts = [];
  const session = { sendAlert: async (data) => alerts.push(data) };

  const fakeImageExtractor = {
    extract: async () => ({
      keyword: 'Total Due',
      amount: '1,250.00 TL',
      lineText: 'Total Due: 1,250.00 TL',
      pageNumber: 1,
      png: Buffer.from('PNG_MOCK'),
    }),
  };

  const handler = createMessageHandler({
    config: { channel: 'whatsapp', whatsapp: { targetGroupId: GROUP }, groupLabel: 'Accounting', debugSmsOnNoMatch: false },
    session,
    imageExtractor: fakeImageExtractor,
    dedupe: new DedupeStore(dataDir),
    audit: new AuditLog(dataDir),
  });

  const imageMsg = {
    from: GROUP,
    hasMedia: true,
    type: 'image',
    _data: { mimetype: 'image/jpeg', filename: 'receipt.jpg' },
    downloadMedia: async () => ({ mimetype: 'image/jpeg', filename: 'receipt.jpg', data: Buffer.from('image_bytes').toString('base64') }),
  };

  await handler(imageMsg);
  await handler(imageMsg);
  // Without dedupe, each received message produces an alert
  assert.equal(alerts.length, 2);
  assert.match(alerts[0].text, /1,250\.00 TL/);
  assert.match(alerts[0].text, /Total Due/);
  assert.equal(alerts[0].imageBuffer.toString(), 'PNG_MOCK');
});
