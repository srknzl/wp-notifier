import { EventEmitter } from 'node:events';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import qrcode from 'qrcode-terminal';
import pkg from 'whatsapp-web.js';
import { logger } from './logger.js';
import { sleep, withTimeout } from './retry.js';

const { Client, LocalAuth } = pkg;
const READY_TIMEOUT_MS = 120_000;

/**
 * WhatsApp Web oturumunu yönetir.
 * Olaylar: 'message' (msg), 'critical' (reason)
 */
export class SessionManager extends EventEmitter {
  constructor({ sessionDataPath, chromiumPath, heartbeatMinutes, heartbeatTimeoutMs, reconnectDelaysMs }) {
    super();
    this.sessionDataPath = sessionDataPath;
    this.chromiumPath = chromiumPath;
    this.heartbeatMs = heartbeatMinutes * 60_000;
    this.heartbeatTimeoutMs = heartbeatTimeoutMs;
    this.reconnectDelaysMs = reconnectDelaysMs;
    this.client = null;
    this.ready = false;
    this.everAuthenticated = false;
    this.recovering = false;
    this.alerted = false;
    this.heartbeatTimer = null;
  }

  async start() {
    await this.#initClient();
    this.heartbeatTimer = setInterval(() => this.#heartbeat(), this.heartbeatMs);
  }

  async stop() {
    clearInterval(this.heartbeatTimer);
    await this.#destroyClient();
  }

  #createClient() {
    const client = new Client({
      authStrategy: new LocalAuth({ dataPath: this.sessionDataPath }),
      puppeteer: {
        headless: true,
        executablePath: this.chromiumPath,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      },
    });

    client.on('qr', (qr) => {
      if (this.everAuthenticated) {
        // Oturum daha önce açıktı ve şimdi QR istiyor: cihaz bağlantısı kopmuş.
        this.#critical('Session invalidated, new QR requested');
      }
      logger.info('QR kodu WhatsApp > Bağlı cihazlar ekranından okut:');
      qrcode.generate(qr, { small: true });
    });
    client.on('authenticated', () => {
      this.everAuthenticated = true;
      logger.info('WhatsApp: authenticated');
    });
    client.on('ready', () => {
      this.ready = true;
      this.alerted = false;
      logger.info('WhatsApp: ready');
    });
    client.on('auth_failure', (msg) => {
      this.ready = false;
      logger.error(`WhatsApp: auth_failure ${msg}`);
      this.#critical(`auth_failure: ${msg}`);
    });
    client.on('disconnected', (reason) => {
      this.ready = false;
      logger.warn(`WhatsApp: disconnected (${reason})`);
      if (reason === 'LOGOUT') {
        // Telefondan çıkış yapıldı; yeniden bağlanmak QR gerektirir.
        this.#critical('Logged out from phone (LOGOUT)');
      } else {
        this.#recover(`disconnected: ${reason}`);
      }
    });
    client.on('message', (msg) => this.emit('message', msg));
    return client;
  }

  async #initClient() {
    // Chromium çöktüyse profil kilidi kalır ve yeni tarayıcı açılmaz.
    for (const lock of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
      rmSync(join(this.sessionDataPath, 'session', lock), { force: true });
    }
    this.client = this.#createClient();
    const readyPromise = new Promise((resolve) => this.client.once('ready', resolve));
    await this.client.initialize();
    return readyPromise;
  }

  async #destroyClient() {
    if (!this.client) return;
    const old = this.client;
    this.client = null;
    this.ready = false;
    old.removeAllListeners();
    try {
      await withTimeout(old.destroy(), 30_000, 'client.destroy');
    } catch (err) {
      logger.warn(`Eski istemci kapatılamadı: ${err.message}`);
    }
  }

  async #heartbeat() {
    if (this.recovering || !this.client) return;
    try {
      const state = await withTimeout(this.client.getState(), this.heartbeatTimeoutMs, 'getState');
      if (state !== 'CONNECTED') {
        logger.warn(`Heartbeat: durum ${state}`);
        await this.#recover(`state=${state}`);
      } else {
        logger.info('Heartbeat: CONNECTED');
      }
    } catch (err) {
      logger.warn(`Heartbeat başarısız: ${err.message}`);
      await this.#recover(`heartbeat: ${err.message}`);
    }
  }

  async #recover(reason) {
    if (this.recovering) return;
    this.recovering = true;
    try {
      for (const [i, delay] of this.reconnectDelaysMs.entries()) {
        logger.warn(`Yeniden bağlanma ${i + 1}/${this.reconnectDelaysMs.length}, ${delay / 1000} sn sonra (${reason})`);
        await this.#destroyClient();
        await sleep(delay);
        try {
          await withTimeout(this.#initClient(), READY_TIMEOUT_MS, 'WhatsApp ready');
          const state = await withTimeout(this.client.getState(), this.heartbeatTimeoutMs, 'getState');
          if (state === 'CONNECTED') {
            logger.info('Yeniden bağlanıldı');
            return;
          }
          logger.warn(`Yeniden bağlanma sonrası durum: ${state}`);
        } catch (err) {
          logger.warn(`Yeniden bağlanma denemesi başarısız: ${err.message}`);
        }
      }
      this.#critical(`${reason}; ${this.reconnectDelaysMs.length} reconnect attempts failed`);
    } finally {
      this.recovering = false;
    }
  }

  #critical(reason) {
    // Aynı kesinti için tekrar tekrar SMS atma; 'ready' gelince sıfırlanır.
    if (this.alerted) return;
    this.alerted = true;
    this.emit('critical', reason);
  }
}
