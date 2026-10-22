# wp-notifier

An intelligent notification bot that monitors a WhatsApp group in real-time and retroactively for **images (receipts, invoices, screenshots)** and **PDF documents**.

It searches documents and images for target apartment or line patterns (e.g. `"18CA DAİRE 07"`, `"18BA DAİRE 11"`, or `"Total Due"`) using local deep-learning OCR (RapidOCR ONNX) and PDF text-layer extraction, parses monetary amounts, tightly crops the matching line, and **sends cropped images with detailed summaries directly to your WhatsApp chat** (or via Twilio SMS).

```
WhatsApp Group ──> SessionManager (History Catch-Up & Live Listening)
                         │
                         ▼
                    processor (Filters noise, maintains checkpoint)
                         │
                         ▼
              ImageExtractor (RapidOCR ONNX) / PdfExtractor
                         │
                         ▼
              WhatsApp Chat (Cropped image & amount summary) [FREE]
```

---

## Key Features

- **100% Free & Self-Contained:** Direct WhatsApp delivery requires no Twilio account or AWS S3 bucket.
- **High-Accuracy Deep OCR (RapidOCR ONNX):** Powered by lightweight ONNX runtime; accurately reads low-contrast, noisy, or rotated mobile camera shots and tabular receipts locally on CPU with near-zero latency.
- **Tight Row Cropping:** Milimeter-accurate single-line crop without capturing irrelevant adjacent rows.
- **History Catch-Up:** Restores state from `data/checkpoint.json` on restart and replays missed messages received while offline.
- **Deduplication:** MD5 hash store (`data/processed.json`) prevents duplicate alerts if the same document is re-shared.
- **Fast Noise Filtering:** Non-document messages (stickers, audio notes, plain text chats) are discarded immediately without overhead.
- **Multi-Match Support:** If a single document contains multiple matching units/rows, separate cropped alerts and amount summaries are dispatched for each.

---

## Quick Start

### macOS Setup

```bash
# 1. Run the automated setup script:
npm run setup:macos

# 2. List joined groups to find your TARGET_GROUP_ID:
npm run groups

# 3. Configure .env and launch the bot:
npm start

# Enable automatic startup on login (Launchd):
npm run autostart:macos
```

### Windows Setup

```bash
# 1. Install dependencies:
npm install
pip install -r requirements.txt

# 2. List joined groups to find your TARGET_GROUP_ID:
npm run groups

# 3. Configure .env and launch the bot:
npm start

# Enable automatic startup on login (Startup folder):
npm run autostart:windows
```

---

## Configuration (`.env`)

Configure bot behavior via environment variables in `.env`:

| Variable | Default | Description |
| :--- | :--- | :--- |
| `NOTIFICATION_CHANNEL` | `whatsapp` | `whatsapp` (free, direct chat) or `twilio` (SMS + S3 evidence link). |
| `ALERT_DESTINATION_NUMBER` | `self` | Recipient phone number (e.g. `05336305062` or `'self'` for own chat). |
| `TARGET_GROUP_ID` | - | Target WhatsApp group ID (obtained via `npm run groups`). |
| `GROUP_LABEL` | `WhatsApp group` | Human-readable label displayed in notification headers. |
| `PDF_TARGET_REGEX` | - | Regular expression matching target units or amount lines. |
| `HISTORY_LOOKBACK_HOURS`| `168` | Fallback lookback window in hours when no checkpoint exists (168 = 7 days). |
| `ENABLE_DEDUPE` | `true` | Prevents re-processing identical files. |
| `DEBUG_SMS_ON_NO_MATCH` | `false` | Whether to send debug notification when no target is found in document. |
| `RESCAN_ON_STARTUP` | `false` | If `true`, ignores checkpoint and re-scans history from startup lookback window. |

### Example `.env` Configuration

```env
NOTIFICATION_CHANNEL=whatsapp
ALERT_DESTINATION_NUMBER=05336305062

TARGET_GROUP_ID=905052114164-1499518342@g.us
GROUP_LABEL=GÜNEŞHAN SİTESİ

# Match target apartments (e.g. CA07 and BA11; excludes BA07 and CA11)
PDF_TARGET_REGEX=(?i)(18\s*-?\s*CA.*?(?:DA[İIıi]RE|D\b)?[\s\.:]*0?7\b|CA\s*0?7\b|18\s*-?\s*BA.*?(?:DA[İIıi]RE|D\b)?[\s\.:]*11\b|BA\s*11\b)

DEBUG_SMS_ON_NO_MATCH=false
ENABLE_DEDUPE=true
RESCAN_ON_STARTUP=false
DATA_DIR=./data
```

---

## Testing Commands

Test OCR and document parsing on local files without connecting to WhatsApp:

```bash
# Test image/receipt OCR extraction:
node scripts/test-image.js receipt.jpg

# Test PDF extraction and cropping:
node scripts/test-pdf.js invoice.pdf

# Run unit test suite:
npm test
```

---

## Background Service & Automation

### macOS (LaunchAgent)
- **Install:** `npm run autostart:macos`
- **View logs:** `tail -f data/app.log`
- **Uninstall:** `launchctl unload ~/Library/LaunchAgents/com.wpnotifier.bot.plist`

### Windows (Startup VBS)
- **Install:** `npm run autostart:windows`
- **View logs:** `Get-Content -Path data\app.log -Wait`
- **Stop process:** `powershell -ExecutionPolicy Bypass -File scripts/stop.ps1`

### Docker Deployment
```bash
docker compose up -d --build
docker compose logs -f
```

### PM2 Process Manager
```bash
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 logs wp-notifier
```

---

## License

MIT
