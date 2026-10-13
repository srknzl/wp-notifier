import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Eksik ortam değişkeni: ${name} (.env dosyasını kontrol et)`);
  }
  return value.trim();
}

function optional(name, fallback) {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : fallback;
}

function int(name, fallback) {
  const raw = optional(name, String(fallback));
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) throw new Error(`${name} sayı olmalı, gelen: ${raw}`);
  return n;
}

// PDF_TARGET_REGEX "(?i)..." inline bayrağıyla gelebilir (Python tarzı); JS bunu desteklemez.
function parseRegex(raw) {
  let source = raw;
  let flags = '';
  const inline = source.match(/^\(\?([a-z]+)\)/);
  if (inline) {
    source = source.slice(inline[0].length);
    if (inline[1].includes('i')) flags += 'i';
  }
  return new RegExp(source, flags);
}

export function loadConfig() {
  const urlMode = optional('EVIDENCE_URL_MODE', 'public');
  if (!['public', 'presigned'].includes(urlMode)) {
    throw new Error('EVIDENCE_URL_MODE "public" veya "presigned" olmalı');
  }

  return {
    twilio: {
      accountSid: required('TWILIO_ACCOUNT_SID'),
      authToken: required('TWILIO_AUTH_TOKEN'),
      from: required('TWILIO_FROM_NUMBER'),
      to: required('ALERT_DESTINATION_NUMBER'),
    },
    whatsapp: {
      targetGroupId: required('TARGET_GROUP_ID'),
      sessionDataPath: optional('SESSION_DATA_PATH', './.wwebjs_auth'),
      chromiumPath: optional('PUPPETEER_EXECUTABLE_PATH', undefined),
      heartbeatMinutes: int('HEARTBEAT_INTERVAL_MINUTES', 15),
      heartbeatTimeoutMs: int('HEARTBEAT_TIMEOUT_SECONDS', 30) * 1000,
      reconnectDelaysMs: [30_000, 60_000, 120_000],
    },
    s3: {
      bucket: required('AWS_S3_BUCKET_NAME'),
      region: required('AWS_S3_REGION'),
      // AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY SDK tarafından ortamdan otomatik okunur.
      urlMode,
      acl: optional('AWS_S3_OBJECT_ACL', undefined),
      publicBaseUrl: optional('EVIDENCE_PUBLIC_BASE_URL', undefined),
      presignExpirySeconds: int('EVIDENCE_PRESIGN_EXPIRY_SECONDS', 7 * 24 * 3600),
    },
    pdf: {
      targetRegex: parseRegex(required('PDF_TARGET_REGEX')),
      renderScale: Number(optional('PDF_RENDER_SCALE', '3')),
      paddingPx: int('PDF_CROP_PADDING_PX', 20),
    },
    groupLabel: optional('GROUP_LABEL', 'WhatsApp grubu'),
    dataDir: optional('DATA_DIR', './data'),
    debugSmsOnNoMatch: optional('DEBUG_SMS_ON_NO_MATCH', 'false') === 'true',
  };
}
