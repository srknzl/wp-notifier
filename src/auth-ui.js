import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { spawn, exec } from 'node:child_process';
import { existsSync } from 'node:fs';
import { logger } from './logger.js';

const require = createRequire(import.meta.url);
const QRCode = require('qrcode-terminal/vendor/QRCode');

/**
 * Converts text into a crisp SVG QR Code using qrcode-terminal's bundled matrix generator.
 */
export function qrToSvg(text, margin = 4, cellSize = 8) {
  const qr = new QRCode(-1, 2);
  qr.addData(text);
  qr.make();
  const modules = qr.modules;
  const count = modules.length;
  const size = (count + margin * 2) * cellSize;
  let path = '';
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (modules[r][c]) {
        const x = (c + margin) * cellSize;
        const y = (r + margin) * cellSize;
        path += `M${x},${y}h${cellSize}v${cellSize}h-${cellSize}z `;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="280" height="280">
    <rect width="100%" height="100%" fill="#ffffff" rx="12"/>
    <path d="${path.trim()}" fill="#111b21"/>
  </svg>`;
}

/**
 * Dispatches a non-blocking desktop notification across Windows, macOS, and Linux.
 */
export function notifyDesktop({ title = 'wp-notifier', message = 'WhatsApp login required' } = {}) {
  try {
    if (process.platform === 'win32') {
      const cleanTitle = title.replace(/'/g, '');
      const cleanMsg = message.replace(/'/g, '');
      const psCmd = `& { $ws = New-Object -ComObject Wscript.Shell; $ws.Popup('${cleanMsg}', 7, '${cleanTitle}', 64) }`;
      const child = spawn('powershell', ['-NoProfile', '-Command', psCmd], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      child.unref();
    } else if (process.platform === 'darwin') {
      const cleanTitle = title.replace(/"/g, '\\"');
      const cleanMsg = message.replace(/"/g, '\\"');
      const script = `display notification "${cleanMsg}" with title "${cleanTitle}"`;
      const child = spawn('osascript', ['-e', script], { detached: true, stdio: 'ignore' });
      child.unref();
    } else if (process.platform === 'linux') {
      const child = spawn('notify-send', [title, message], { detached: true, stdio: 'ignore' });
      child.unref();
    }
  } catch (err) {
    logger.warn(`Could not dispatch desktop notification: ${err.message}`);
  }
}

/**
 * Spawns a dedicated browser or standalone application window.
 */
export function openLoginWindow(url) {
  try {
    if (process.platform === 'win32') {
      const edgePaths = [
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      ];
      const chromePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      ];
      const targetBin = edgePaths.concat(chromePaths).find((p) => existsSync(p));

      if (targetBin) {
        const child = spawn(targetBin, [`--app=${url}`, '--window-size=480,720'], {
          detached: true,
          stdio: 'ignore',
        });
        child.unref();
        return;
      }
      exec(`start "" "${url}"`);
    } else if (process.platform === 'darwin') {
      exec(`open "${url}"`);
    } else {
      exec(`xdg-open "${url}"`);
    }
  } catch (err) {
    logger.warn(`Could not open browser window: ${err.message}`);
  }
}

function renderHtml(initialSvg, initialStatus = 'Waiting for scan...') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>wp-notifier &bull; WhatsApp Login</title>
  <style>
    :root {
      --bg: #f0f2f5;
      --card-bg: #ffffff;
      --text: #111b21;
      --text-muted: #667781;
      --brand: #00a884;
      --brand-hover: #008f6f;
      --badge-bg: #e7fce8;
      --badge-text: #0b8043;
      --border: #e9edef;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0c1317;
        --card-bg: #111b21;
        --text: #e9edef;
        --text-muted: #8696a0;
        --badge-bg: #0b3323;
        --badge-text: #25d366;
        --border: #222e35;
      }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 16px;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 16px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08);
      max-width: 420px;
      width: 100%;
      padding: 28px 24px;
      text-align: center;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      margin-bottom: 12px;
    }
    .logo {
      width: 32px;
      height: 32px;
      fill: var(--brand);
    }
    h1 {
      font-size: 20px;
      font-weight: 600;
    }
    .subtitle {
      font-size: 13px;
      color: var(--text-muted);
      margin-bottom: 20px;
      line-height: 1.4;
    }
    .qr-box {
      background: #ffffff;
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 14px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 12px rgba(0,0,0,0.04);
      margin-bottom: 20px;
      min-width: 280px;
      min-height: 280px;
    }
    .qr-box svg {
      display: block;
      max-width: 100%;
      height: auto;
    }
    .steps {
      text-align: left;
      font-size: 13px;
      color: var(--text-muted);
      background: var(--bg);
      border-radius: 12px;
      padding: 14px 16px;
      margin-bottom: 18px;
      line-height: 1.6;
    }
    .steps ol {
      padding-left: 20px;
    }
    .steps strong {
      color: var(--text);
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: 500;
      background: var(--badge-bg);
      color: var(--badge-text);
      transition: all 0.3s ease;
    }
    .pulse {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: currentColor;
      animation: pulse 1.5s infinite;
    }
    @keyframes pulse {
      0% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.3; transform: scale(0.8); }
      100% { opacity: 1; transform: scale(1); }
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <svg class="logo" viewBox="0 0 24 24">
        <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2M12.05 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.15 12.04 20.15C10.56 20.15 9.11 19.76 7.85 19L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 15 3.8 13.47 3.8 11.91C3.81 7.37 7.5 3.67 12.05 3.67Z"/>
      </svg>
      <h1>Link WhatsApp</h1>
    </div>
    <div class="subtitle">Scan the QR code to keep wp-notifier connected to your WhatsApp.</div>

    <div class="qr-box" id="qr-box">
      ${initialSvg}
    </div>

    <div class="steps">
      <ol>
        <li>Open <strong>WhatsApp</strong> on your phone</li>
        <li>Tap <strong>Settings</strong> or <strong>Menu &vellip;</strong> &rarr; <strong>Linked Devices</strong></li>
        <li>Tap <strong>Link a Device</strong> and point your camera here</li>
      </ol>
    </div>

    <div class="status-badge" id="status-badge">
      <span class="pulse" id="pulse-dot"></span>
      <span id="status-text">${initialStatus}</span>
    </div>
  </div>

  <script>
    const evt = new EventSource('/events');
    const qrBox = document.getElementById('qr-box');
    const statusText = document.getElementById('status-text');
    const pulseDot = document.getElementById('pulse-dot');
    const badge = document.getElementById('status-badge');

    evt.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'qr' && data.svg) {
          qrBox.innerHTML = data.svg;
          statusText.innerText = 'Waiting for scan...';
        } else if (data.type === 'authenticated') {
          statusText.innerText = 'Authenticated! Loading session...';
        } else if (data.type === 'ready') {
          statusText.innerText = 'Connected successfully!';
          pulseDot.style.display = 'none';
          badge.style.background = '#e7fce8';
          badge.style.color = '#0b8043';
          setTimeout(() => {
            window.close();
          }, 2500);
        }
      } catch (err) {}
    };
  </script>
</body>
</html>`;
}

/**
 * Manages the web/desktop UI server for displaying QR codes during initial setup or re-authentication.
 */
export class AuthUIManager {
  constructor({ port = 3456 } = {}) {
    this.port = port;
    this.server = null;
    this.activePort = null;
    this.clients = new Set();
    this.currentSvg = '';
    this.state = 'idle'; // idle | waiting | authenticated | ready
    this.windowOpened = false;
  }

  startServer() {
    if (this.server) return Promise.resolve(this.activePort);

    return new Promise((resolve, reject) => {
      const server = createServer((req, res) => {
        if (req.url === '/events') {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          });
          res.write(`data: ${JSON.stringify({ type: this.state, svg: this.currentSvg })}\n\n`);
          this.clients.add(res);
          req.on('close', () => this.clients.delete(res));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderHtml(this.currentSvg, this.state === 'authenticated' ? 'Authenticated! Loading...' : 'Waiting for scan...'));
      });

      server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          // If 3456 is in use, fallback to any available port
          server.listen(0, '127.0.0.1');
        } else {
          reject(err);
        }
      });

      server.listen(this.port, '127.0.0.1', () => {
        this.activePort = server.address().port;
        this.server = server;
        resolve(this.activePort);
      });
    });
  }

  broadcast(payload) {
    const data = `data: ${JSON.stringify(payload)}\n\n`;
    for (const client of this.clients) {
      try {
        client.write(data);
      } catch {
        this.clients.delete(client);
      }
    }
  }

  async showQr(qrString) {
    try {
      this.currentSvg = qrToSvg(qrString);
      this.state = 'waiting';

      const port = await this.startServer();
      const url = `http://127.0.0.1:${port}`;

      this.broadcast({ type: 'qr', svg: this.currentSvg });

      if (!this.windowOpened) {
        this.windowOpened = true;
        logger.info(`Opening WhatsApp login window: ${url}`);
        openLoginWindow(url);
        notifyDesktop({
          title: 'wp-notifier',
          message: 'WhatsApp authentication required. Please scan the QR code in the opened window.',
        });
      }
    } catch (err) {
      logger.warn(`Could not render QR code window: ${err.message}`);
    }
  }

  notifyAuthenticated() {
    this.state = 'authenticated';
    this.broadcast({ type: 'authenticated' });
  }

  notifyReady(info) {
    this.state = 'ready';
    this.broadcast({ type: 'ready', user: info?.wid?.user });

    // Cleanly stop the server after 4 seconds to give the browser time to display success and close
    setTimeout(() => {
      this.stop();
    }, 4000);
  }

  stop() {
    this.windowOpened = false;
    this.state = 'idle';
    for (const client of this.clients) {
      try {
        client.end();
      } catch {}
    }
    this.clients.clear();
    if (this.server) {
      this.server.close();
      this.server = null;
      this.activePort = null;
    }
  }
}

