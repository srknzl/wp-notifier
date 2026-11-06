import { test } from 'node:test';
import assert from 'node:assert/strict';
import { qrToSvg, AuthUIManager } from '../src/auth-ui.js';

test('qrToSvg: produces valid, well-formed SVG string', () => {
  const svg = qrToSvg('1@sample-qr-content-12345');
  assert.ok(svg.includes('<svg xmlns="http://www.w3.org/2000/svg"'));
  assert.ok(svg.includes('viewBox="0 0 '));
  assert.ok(svg.includes('<path d="M'));
  assert.ok(svg.includes('</svg>'));
});

test('AuthUIManager: starts HTTP server, serves login page and SSE events', async () => {
  const ui = new AuthUIManager({ port: 3499 });
  const port = await ui.startServer();
  assert.equal(typeof port, 'number');
  assert.ok(port > 0);

  // 1. Check root HTML page
  const res = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  const html = await res.text();
  assert.ok(html.includes('Link WhatsApp'));
  assert.ok(html.includes('EventSource'));

  // 2. Test state transitions and broadcasting
  ui.state = 'waiting';
  ui.currentSvg = qrToSvg('test-qr');
  ui.broadcast({ type: 'qr', svg: ui.currentSvg });
  ui.notifyAuthenticated();
  assert.equal(ui.state, 'authenticated');

  ui.notifyReady({ wid: { user: '905551234567' } });
  assert.equal(ui.state, 'ready');

  // Stop server
  ui.stop();
  assert.equal(ui.server, null);
});

