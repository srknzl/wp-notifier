// TARGET_GROUP_ID'yi bulmak için: QR okut, hesabın üye olduğu grupları listeler.
import 'dotenv/config';
import qrcode from 'qrcode-terminal';
import pkg from 'whatsapp-web.js';

const { Client, LocalAuth } = pkg;
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: process.env.SESSION_DATA_PATH || './.wwebjs_auth' }),
  puppeteer: {
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  },
});

client.on('qr', (qr) => qrcode.generate(qr, { small: true }));
client.on('ready', async () => {
  try {
    const groups = await client.pupPage.evaluate(() => {
      try {
        const chatModels = window.require('WAWebCollections').Chat.getModelsArray();
        return chatModels
          .filter((c) => c.isGroup || (c.id && c.id._serialized && c.id._serialized.endsWith('@g.us')))
          .map((c) => ({
            id: c.id?._serialized,
            name: c.name || c.formattedTitle || c.contact?.name || 'İsimsiz Grup',
          }))
          .filter((g) => g.id);
      } catch {
        return [];
      }
    });

    if (groups && groups.length > 0) {
      for (const group of groups) {
        console.log(`${group.id}\t${group.name}`);
      }
    } else {
      const chats = await client.getChats();
      for (const chat of chats.filter((c) => c.isGroup)) {
        console.log(`${chat.id._serialized}\t${chat.name}`);
      }
    }
  } catch (err) {
    console.error('Grup listesi alınırken hata oluştu:', err.message || err);
  } finally {
    await client.destroy();
    process.exit(0);
  }
});
client.initialize();
