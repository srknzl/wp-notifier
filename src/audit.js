import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export class AuditLog {
  constructor(dataDir) {
    mkdirSync(dataDir, { recursive: true });
    this.file = join(dataDir, 'audit.log');
  }

  record(event, details = {}) {
    appendFileSync(this.file, `${JSON.stringify({ at: new Date().toISOString(), event, ...details })}\n`);
  }
}
