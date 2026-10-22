import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// 1. Utils.js dosyasını yamala
const utilsFile = join('node_modules', 'whatsapp-web.js', 'src', 'util', 'Injected', 'Utils.js');
if (existsSync(utilsFile)) {
  let content = readFileSync(utilsFile, 'utf8');
  let changed = false;

  // Medya gönderimi düzeltmesi
  if (!content.includes('delete message.__x_id;')) {
    content = content.replace(
      "        // Bot's won't reply if canonicalUrl is set (linking)",
      "        delete message.__x_id;\n\n        // Bot's won't reply if canonicalUrl is set (linking)"
    );
    changed = true;
  }

  // getMessageModel fonksiyonunda msg.id._serialized alanının daima bulunmasını sağla
  if (!content.includes('msg.id._serialized = message.id?._serialized')) {
    content = content.replace(
      "window.WWebJS.getMessageModel = (message) => {\n        const msg = message.serialize();",
      "window.WWebJS.getMessageModel = (message) => {\n        const msg = message.serialize();\n        if (msg.id && !msg.id._serialized) {\n            msg.id._serialized = message.id?._serialized || (typeof message.id?.toString === 'function' ? message.id.toString() : message.id?.$1) || (typeof msg.id.toString === 'function' ? msg.id.toString() : msg.id.$1);\n        }"
    );
    changed = true;
  }

  if (changed) {
    writeFileSync(utilsFile, content, 'utf8');
    console.log('[patch-wwebjs] Utils.js yamalandı.');
  }
}

// 2. Message.js dosyasını yamala
const msgFile = join('node_modules', 'whatsapp-web.js', 'src', 'structures', 'Message.js');
if (existsSync(msgFile)) {
  let content = readFileSync(msgFile, 'utf8');
  let changed = false;

  // downloadMedia mimetype düzeltmesi
  if (!content.includes('mimetype: msg.mimetype,')) {
    content = content.replace(
      '                        type: msg.type,\n                        signal: new AbortController().signal,',
      '                        type: msg.type,\n                        mimetype: msg.mimetype,\n                        signal: new AbortController().signal,'
    );
    changed = true;
  }

  // _patch fonksiyonunda this.id._serialized yedeği düzeltmesi
  if (!content.includes('this.id._serialized = this.id.$1')) {
    content = content.replace(
      '        this.id = data.id;\n\n        /**',
      '        this.id = data.id;\n        if (this.id && !this.id._serialized) {\n            this.id._serialized = this.id.$1 || (typeof this.id.toString === \'function\' ? this.id.toString() : undefined);\n        }\n\n        /**'
    );
    changed = true;
  }

  if (changed) {
    writeFileSync(msgFile, content, 'utf8');
    console.log('[patch-wwebjs] Message.js yamalandı.');
  }
}
