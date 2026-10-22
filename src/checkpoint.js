import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Persists the last processed message timestamp (checkpoint) per target chat.
export class CheckpointStore {
  constructor(dataDir) {
    mkdirSync(dataDir, { recursive: true });
    this.file = join(dataDir, 'checkpoint.json');
    this.data = existsSync(this.file) ? JSON.parse(readFileSync(this.file, 'utf8')) : {};
  }

  getLastTimestamp(targetId) {
    return this.data[targetId]?.lastTimestamp || 0;
  }

  update(targetId, { timestamp, messageId }) {
    if (!timestamp) return;
    const current = this.data[targetId] || {};
    if (!current.lastTimestamp || timestamp >= current.lastTimestamp) {
      this.data[targetId] = {
        lastTimestamp: timestamp,
        lastMessageId: messageId || current.lastMessageId,
        updatedAt: new Date().toISOString(),
      };
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.data, null, 2));
      renameSync(tmp, this.file);
    }
  }
}
