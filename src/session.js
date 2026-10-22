import { EventEmitter } from 'node:events';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import qrcode from 'qrcode-terminal';
import pkg from 'whatsapp-web.js';
import { logger } from './logger.js';
import { sleep, withTimeout } from './retry.js';

const { Client, LocalAuth, MessageMedia } = pkg;
const READY_TIMEOUT_MS = 120_000;

/**
 * WhatsApp Web oturumunu yönetir.
 * Olaylar: 'ready', 'message' (msg), 'critical' (reason)
 */
export class SessionManager extends EventEmitter {
  constructor({ sessionDataPath, chromiumPath, heartbeatMinutes, heartbeatTimeoutMs, reconnectDelaysMs, alertDestination, targetGroupId }) {
    super();
    this.sessionDataPath = sessionDataPath;
    this.chromiumPath = chromiumPath;
    this.heartbeatMs = heartbeatMinutes * 60_000;
    this.heartbeatTimeoutMs = heartbeatTimeoutMs;
    this.reconnectDelaysMs = reconnectDelaysMs;
    this.alertDestination = alertDestination;
    this.targetGroupId = targetGroupId;
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

  getDestinationChatId() {
    if (!this.client || !this.ready) return null;
    const dest = this.alertDestination;
    if (!dest || dest === 'self' || dest === 'me') {
      return this.client.info?.wid?._serialized;
    }
    const digits = dest.replace(/\D/g, '');
    if (!digits) return this.client.info?.wid?._serialized;
    const clean = digits.length === 11 && digits.startsWith('05')
      ? `9${digits}`
      : digits.length === 10 && digits.startsWith('5')
        ? `90${digits}`
        : digits;
    return `${clean}@c.us`;
  }

  /**
   * Doğrudan hedef WhatsApp sohbetine görsel ve metin bildirimi gönderir.
   */
  async sendAlert({ text, imageBuffer, fileName = 'fatura.png' }) {
    if (!this.client || !this.ready) {
      throw new Error('WhatsApp istemcisi hazır değil');
    }
    const targetChat = this.getDestinationChatId();
    if (!targetChat) {
      throw new Error('Hedef WhatsApp sohbeti belirlenemedi');
    }

    if (imageBuffer) {
      const media = new MessageMedia('image/png', imageBuffer.toString('base64'), fileName);
      return await this.client.sendMessage(targetChat, media, { caption: text });
    }
    return await this.client.sendMessage(targetChat, text);
  }

  /**
   * Hedef sohbetteki geçmiş mesajları geriye dönük tarar; alakasızları eler,
   * yalnızca resim ve doküman/PDF içeren adayları sırayla işleyiciye iletir.
   */
  async syncHistory({ targetChatId, sinceTimestamp = 0, onMessage }) {
    if (!this.client || !this.ready) {
      throw new Error('WhatsApp istemcisi hazır değil');
    }
    const sinceText = sinceTimestamp > 0 ? new Date(sinceTimestamp * 1000).toLocaleString('tr-TR') : 'tüm geçmiş';
    logger.info(`Geçmiş mesajlar taranıyor: ${targetChatId} (Başlangıç: ${sinceText})`);

    const msgList = await this.client.pupPage.evaluate(async (chatId, minT) => {
      const chat = await window.WWebJS.getChat(chatId, { getAsModel: false });
      if (!chat || !chat.msgs) return [];

      try {
        const loader = window.require('WAWebChatLoadMessages');
        if (loader?.loadEarlierMsgs) {
          for (let i = 0; i < 5; i++) {
            const models = chat.msgs.getModelsArray();
            const earliest = models[0];
            if (earliest && minT > 0 && earliest.t <= minT) break;
            const loaded = await loader.loadEarlierMsgs({ chat });
            if (!loaded || !loaded.length) break;
          }
        }
      } catch {}

      const all = chat.msgs.getModelsArray();
      const candidates = all
        .filter((m) => {
          if (m.isNotification) return false;
          if (minT > 0 && m.t <= minT) return false;
          // Alakasız mesajları (metin, ses, çıkartma) hemen ele; sadece resim/döküman al
          const isDocOrImg = m.type === 'image' || m.type === 'document' || m.hasMedia;
          return isDocOrImg;
        })
        .sort((a, b) => (a.t > b.t ? 1 : -1));

      return candidates.map((m) => ({ id: m.id?._serialized, t: m.t }));
    }, targetChatId, sinceTimestamp);

    if (!msgList || !msgList.length) {
      logger.info('İncelenecek yeni geçmiş medya mesajı bulunamadı.');
      return;
    }

    logger.info(`Geçmişten işlenecek ${msgList.length} adet medya mesajı bulundu, sırayla inceleniyor...`);

    for (const item of msgList) {
      if (!item.id) continue;
      try {
        const msg = await this.client.getMessageById(item.id);
        if (msg) {
          await onMessage(msg);
        }
      } catch (err) {
        logger.warn(`Geçmiş mesaj işlenemedi (${item.id}): ${err.message}`);
      }
    }
    logger.info('Geçmiş mesaj taraması tamamlandı.');
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
      logger.info(`WhatsApp: ready (Bağlı numara: ${client.info?.wid?.user})`);
      this.emit('ready');
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
    client.on('message_create', (msg) => {
      // Kullanıcı testi kendi telefonundan hedef sohbete PDF göndererek yapıyorsa da yakala
      if (msg.fromMe && (msg.to === this.targetGroupId || msg.to === this.getDestinationChatId())) {
        this.emit('message', msg);
      }
    });
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
    // Aynı kesinti için tekrar tekrar bildirim atma; 'ready' gelince sıfırlanır.
    if (this.alerted) return;
    this.alerted = true;
    this.emit('critical', reason);
  }
}
