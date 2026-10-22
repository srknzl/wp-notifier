# wp-notifier

WhatsApp gruplarına düşen **görselleri (fotoğraf, ekran görüntüsü, makbuz, dekont)** ve **PDF belgelerini** gerçek zamanlı ve geçmişe dönük olarak izleyen akıllı bildirim botu.

Belgede veya görselde belirlediğiniz hedef satırı (örneğin `"18CA DAİRE 07"`, `"18BA DAİRE 11"`, `"Toplam Tutar"`) yerel yapay zeka/OCR (RapidOCR ONNX) ve metin katmanı ayrıştırıcıları ile bulur; tutarı tespit eder, ilgili satırı milimetrik olarak kırpar ve **doğrudan WhatsApp üzerinden görsel ve özet bilgi olarak** size iletir.

```
WhatsApp Grubu ──> SessionManager (Geçmiş Senkronizasyonu & Canlı Dinleme)
                         │
                         ▼
                    processor (Alakasız mesajları anında eler, checkpoint tutar)
                         │
                         ▼
              ImageExtractor (RapidOCR ONNX) / PdfExtractor
                         │
                         ▼
              WhatsApp Sohbeti (Kırpılmış görsel & özet) [ÜCRETSİZ]
```

---

## Öne Çıkan Özellikler

- **Ücretsiz & Bağımsız:** Twilio veya AWS S3 gerektirmez; bildirimler doğrudan kendi WhatsApp hesabınıza iletilir.
- **Yüksek Doğruluklu OCR (RapidOCR ONNX):** Düşük çözünürlüklü, yamuk veya karmaşık mobil ekran görüntülerindeki tabloları bile CPU üzerinde neredeyse sıfır gecikmeyle hatasız okur.
- **Hassas Tek Satır Kırpma:** Komşu satırları ve gereksiz alanları dahil etmeden yalnızca aranan daireye/satıra odaklanan temiz kırpma yapar.
- **Geçmişe Dönük Çalışma (Catch-Up):** Bot her açıldığında kaldığı son zaman damgasından (`data/checkpoint.json`) itibaren geriye dönük tarama yapar. Bot kapalıyken paylaşılan fatura ve makbuzlar asla kaçırılmaz.
- **Tekilleştirme (Deduplication):** MD5 özet tabanlı tekilleştirme (`data/processed.json`) sayesinde aynı dosya grupta tekrar paylaşılsa dahi mükerrer bildirim gönderilmez.
- **Akıllı Filtreleme:** Düz metin sohbetler, ses kayıtları, çıkartmalar ve hedef anahtar kelimeleri içermeyen tüm mesajlar milisaniyeler içinde elenir.
- **Çoklu Eşleşme Desteği:** Belgede birden fazla daireniz veya satırınız varsa hepsini ayrı ayrı tespit edip her biri için bağımsız kırpılmış görsel ve tutar özeti gönderir.

---

## Hızlı Başlangıç

### macOS Kurulumu

```bash
# 1. Gerekli bağımlılıkları ve OCR motorunu kurun:
npm run setup:macos

# 2. Takip etmek istediğiniz grubun ID'sini öğrenin:
npm run groups

# 3. .env dosyasını düzenleyin ve botu başlatın:
npm start

# Bilgisayar her açıldığında arka planda otomatik çalışması için (Launchd):
npm run autostart:macos
```

### Windows Kurulumu

```bash
# 1. Bağımlılıkları yükleyin:
npm install
pip install -r requirements.txt

# 2. Takip etmek istediğiniz grubun ID'sini öğrenin:
npm run groups

# 3. .env dosyasını düzenleyin ve botu başlatın:
npm start

# Bilgisayar her açıldığında arka planda sessizce çalışması için:
npm run autostart:windows
```

---

## Yapılandırma (`.env`)

Proje kök dizininde yer alan `.env` dosyası üzerinden tüm davranışlar özelleştirilebilir:

| Değişken | Varsayılan | Açıklama |
| :--- | :--- | :--- |
| `NOTIFICATION_CHANNEL` | `whatsapp` | `whatsapp` (ücretsiz, doğrudan sohbet) veya `twilio` (SMS + S3 linki). |
| `ALERT_DESTINATION_NUMBER` | `self` | Bildirimin gideceği telefon numarası (ör. `05336305062` ya da doğrudan kendi sohbetiniz için `self`). |
| `TARGET_GROUP_ID` | - | İzlenecek WhatsApp grubunun ID'si (`npm run groups` çıktısından kopyalanır). |
| `GROUP_LABEL` | `WhatsApp grubu` | Bildirim başlığında gösterilecek açıklayıcı grup adı (ör. `GÜNEŞHAN SİTESİ`). |
| `PDF_TARGET_REGEX` | - | Belgede veya görselde aranacak satır kuralları (Düzenli ifade / Regex). |
| `HISTORY_LOOKBACK_HOURS`| `168` | Checkpoint bulunmadığında ilk açılışta kaç saat geriye taranacağı (168 = 7 gün). |
| `ENABLE_DEDUPE` | `true` | Aynı dosyanın mükerrer işlenmesini önleme kilidi. |
| `DEBUG_SMS_ON_NO_MATCH` | `false` | Hedef satır bulunamadığında da bilgilendirme mesajı gönderilip gönderilmeyeceği. |
| `RESCAN_ON_STARTUP` | `false` | `true` yapılırsa her açılışta checkpoint sıfırlanıp tüm geçmiş baştan taranır. |

### Örnek `.env` İçeriği

```env
NOTIFICATION_CHANNEL=whatsapp
ALERT_DESTINATION_NUMBER=05336305062

TARGET_GROUP_ID=905052114164-1499518342@g.us
GROUP_LABEL=GÜNEŞHAN SİTESİ

# Yalnızca CA 07 ve BA 11 dairelerini eşleştirir (BA07 ve CA11 eşleşmez)
PDF_TARGET_REGEX=(?i)(18\s*-?\s*CA.*?(?:DA[İIıi]RE|D\b)?[\s\.:]*0?7\b|CA\s*0?7\b|18\s*-?\s*BA.*?(?:DA[İIıi]RE|D\b)?[\s\.:]*11\b|BA\s*11\b)

DEBUG_SMS_ON_NO_MATCH=false
ENABLE_DEDUPE=true
RESCAN_ON_STARTUP=false
DATA_DIR=./data
```

---

## Test Komutları

WhatsApp bağlantısına ihtiyaç duymadan yerel dosyalar üzerinde test yapmak için:

```bash
# Görsel / Fotoğraf / Ekran Görüntüsü testi:
node scripts/test-image.js makbuz.jpg

# PDF belgesi testi:
node scripts/test-pdf.js fatura.pdf

# Birim testleri çalıştırma (15 test):
npm test
```

---

## Arka Planda Çalıştırma & Otomasyon

### macOS (LaunchAgent)
- **Kurulum:** `npm run autostart:macos`
- **Logları izleme:** `tail -f data/app.log`
- **Durdurma:** `launchctl unload ~/Library/LaunchAgents/com.wpnotifier.bot.plist`

### Windows (Startup VBS)
- **Kurulum:** `npm run autostart:windows`
- **Logları izleme:** `Get-Content -Path data\app.log -Wait`
- **Durdurma:** `powershell -ExecutionPolicy Bypass -File scripts/stop.ps1`

### Docker ile Çalıştırma
```bash
docker compose up -d --build
docker compose logs -f
```

### PM2 ile Çalıştırma
```bash
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 logs wp-notifier
```

---

## Lisans

MIT
