import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const file = join('node_modules', 'whatsapp-web.js', 'src', 'util', 'Injected', 'Utils.js');
if (existsSync(file)) {
  let content = readFileSync(file, 'utf8');
  if (!content.includes('delete message.__x_id;')) {
    content = content.replace(
      "        // Bot's won't reply if canonicalUrl is set (linking)",
      "        delete message.__x_id;\n\n        // Bot's won't reply if canonicalUrl is set (linking)"
    );
    writeFileSync(file, content, 'utf8');
    console.log('[patch-wwebjs] whatsapp-web.js media patch uygulandı.');
  }
}

