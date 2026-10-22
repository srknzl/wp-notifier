# wp-notifier

Bir WhatsApp grubuna düşen **görselleri (fotoğraf/makbuz/dekont)** ve **PDF'leri** izler. Belgede hedef satırı (ör. "18CA DAİRE 07", "18BA DAİRE 11", "Toplam Tutar") OCR ve metin katmanı ile bulur, tutarı çıkarır, ilgili satırı görsel olarak kırpar ve **doğrudan WhatsApp üzerinden görsel ve özet bilgi olarak** size iletir.

```
WhatsApp grubu ──> SessionManager (Geçmiş Senkronizasyonu & Canlı Dinleme)
                        │
                        ▼
                   processor (Alakasız mesajları anında eler, checkpoint tutar)
                        │
                        ▼
             ImageExtractor (OCR) / PdfExtractor
                        │
                        ▼
             WhatsApp Sohbeti (Kırpılmış görsel & özet) [ÜCRETSİZ]
```

## Öne Çıkan Özellikler

- **Geçmişe Dönük Çalışma (Catch-Up):** Bot her açıldığında kaldığı yerden (`data/checkpoint.json`) itibaren geçmiş mesajları tarar. Bot kapalıyken atılan faturalar/makbuzlar kaçırılmaz.
- **Akıllı Filtreleme:** Düz metin sohbetler, ses kayıtları, çıkartmalar ve hedef daire içermeyen alakasız mesajlar anında atlanır (skip edilir).
- **Çoklu Daire & Eşleşme:** Listede birden fazla daireniz varsa hepsini ayrı ayrı bulup her biri için kırpılmış görsel ve tutar gönderir.
- **Fotoğraf & PDF Desteği:** Hem kamera çekimi/ekran görüntüsü makbuzları (OCR ile) hem de PDF belgelerini okur.

## Hızlı Başlangıç

### macOS
```bash
npm run setup:macos     # Gerekli bağımlılıkları ve OCR motorunu kurar
npm run groups          # Grupları listeler; hedef grubun ID'sini kopyala
npm start               # Botu başlatır

# Bilgisayar her açıldığında arka planda otomatik başlaması için (Launchd):
npm run autostart:macos
```

### Windows
```bash
npm install
pip install -r requirements.txt   # RapidOCR (görsellerin ve makbuzların yüksek doğrulukla okunması için)
npm run groups                    # Grupları listeler; hedef grubun ID'sini kopyala
npm start                         # Botu başlatır

# Bilgisayar her açıldığında arka planda sessiz başlaması için:
npm run autostart:windows
```

## Ayarlar (`.env`)

```env
# whatsapp (ücretsiz, önerilen) veya twilio
NOTIFICATION_CHANNEL=whatsapp

# Bildirimin geleceği numara (ör. 905336305062 veya 'self')
ALERT_DESTINATION_NUMBER=905336305062

# Takip edilecek grup ID'si (npm run groups ile bulunur)
TARGET_GROUP_ID=905052114164-1499518342@g.us
GROUP_LABEL=GÜNEŞHAN SİTESİ

# Belgede aranacak daireler
PDF_TARGET_REGEX=(?i)(18\s*-?\s*CA.*?(?:DA[İIıi]RE|D\b)?[\s\.:]*0?7\b|18\s*-?\s*BA.*?(?:DA[İIıi]RE|D\b)?[\s\.:]*11\b)

# İlk açılışta ne kadar geriye taranacağı (saat cinsinden, varsayılan 168 = 7 gün)
HISTORY_LOOKBACK_HOURS=168
```

## Test Komutları

WhatsApp olmadan tek bir resim veya PDF üzerinde test etmek için:

```bash
# Resim / Fotoğraf testi:
node scripts/test-image.js makbuz.jpg

# PDF testi:
node scripts/test-pdf.js fatura.pdf

# Tüm birim testleri:
npm test
```
