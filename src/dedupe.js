import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const md5 = (buffer) => createHash('md5').update(buffer).digest('hex');

// İşlenen PDF'lerin MD5'leri; WhatsApp mesajı yeniden yayınlarsa çift SMS gitmesin.
export class DedupeStore {
  constructor(dataDir) {
    mkdirSync(dataDir, { recursive: true });
    this.file = join(dataDir, 'processed.json');
    this.entries = existsSync(this.file) ? JSON.parse(readFileSync(this.file, 'utf8')) : {};
  }

  has(hash) {
    return Object.hasOwn(this.entries, hash);
  }

  add(hash, info) {
    this.entries[hash] = { ...info, at: new Date().toISOString() };
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.entries, null, 2));
    renameSync(tmp, this.file);
  }
}
