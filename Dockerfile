# wp-notifier için Chromium tabanlı Docker imajı
FROM node:22-bookworm-slim

# Chromium ve gerekli sistem bağımlılıklarının kurulumu
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-liberation fonts-noto-color-emoji ca-certificates python3 python3-pip \
 && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_DOWNLOAD=1 \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production

WORKDIR /app
COPY package*.json requirements.txt ./
RUN npm ci --omit=dev && pip install --break-system-packages -r requirements.txt
COPY src ./src
COPY scripts ./scripts

# Güvenlik için kök olmayan (non-root) kullanıcı
RUN useradd -m bot && mkdir -p /app/data /app/.wwebjs_auth && chown -R bot /app
USER bot

CMD ["node", "src/index.js"]
