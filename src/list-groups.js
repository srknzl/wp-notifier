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
  const chats = await client.getChats();
  for (const chat of chats.filter((c) => c.isGroup)) {
    console.log(`${chat.id._serialized}\t${chat.name}`);
  }
  await client.destroy();
  process.exit(0);
});
client.initialize();
