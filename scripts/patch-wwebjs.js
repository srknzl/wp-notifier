import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// 1. Patch Utils.js
const utilsFile = join('node_modules', 'whatsapp-web.js', 'src', 'util', 'Injected', 'Utils.js');
if (existsSync(utilsFile)) {
  let content = readFileSync(utilsFile, 'utf8');
  let changed = false;

  // Media send fix
  if (!content.includes('delete message.__x_id;')) {
    content = content.replace(
      "        // Bot's won't reply if canonicalUrl is set (linking)",
      "        delete message.__x_id;\n\n        // Bot's won't reply if canonicalUrl is set (linking)"
    );
    changed = true;
  }

  // Ensure msg.id._serialized is always present in getMessageModel
  if (!content.includes('msg.id._serialized = message.id?._serialized')) {
    content = content.replace(
      "window.WWebJS.getMessageModel = (message) => {\n        const msg = message.serialize();",
      "window.WWebJS.getMessageModel = (message) => {\n        const msg = message.serialize();\n        if (msg.id && !msg.id._serialized) {\n            msg.id._serialized = message.id?._serialized || (typeof message.id?.toString === 'function' ? message.id.toString() : message.id?.$1) || (typeof msg.id.toString === 'function' ? msg.id.toString() : msg.id.$1);\n        }"
    );
    changed = true;
  }

  if (changed) {
    writeFileSync(utilsFile, content, 'utf8');
    console.log('[patch-wwebjs] Utils.js patched.');
  }
}

// 2. Patch Message.js
const msgFile = join('node_modules', 'whatsapp-web.js', 'src', 'structures', 'Message.js');
if (existsSync(msgFile)) {
  let content = readFileSync(msgFile, 'utf8');
  let changed = false;

  // Fix downloadMedia mimetype
  if (!content.includes('mimetype: msg.mimetype,')) {
    content = content.replace(
      '                        type: msg.type,\n                        signal: new AbortController().signal,',
      '                        type: msg.type,\n                        mimetype: msg.mimetype,\n                        signal: new AbortController().signal,'
    );
    changed = true;
  }

  // Fix this.id._serialized fallback in _patch
  if (!content.includes('this.id._serialized = this.id.$1')) {
    content = content.replace(
      '        this.id = data.id;\n\n        /**',
      '        this.id = data.id;\n        if (this.id && !this.id._serialized) {\n            this.id._serialized = this.id.$1 || (typeof this.id.toString === \'function\' ? this.id.toString() : undefined);\n        }\n\n        /**'
    );
    changed = true;
  }

  if (changed) {
    writeFileSync(msgFile, content, 'utf8');
    console.log('[patch-wwebjs] Message.js patched.');
  }
}
