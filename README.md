# wp-notifier

Bir WhatsApp grubuna düşen PDF'leri izler. PDF'te hedef satırı (ör. "Total Due", "Amount Payable") bulur, tutarı çıkarır, satırı görsel olarak kırpıp S3'e yükler ve linkiyle birlikte SMS atar. WhatsApp oturumu düşerse kendini kurtarmayı dener; kurtaramazsa kritik SMS gönderir.

```
WhatsApp grubu ──> SessionManager ──> processor ──> PdfExtractor ──> StorageService (S3) ──> SmsNotifier (Twilio)
                        │ heartbeat (15 dk) / 3 yeniden bağlanma (30-60-120 sn)
                        └──> başarısızsa [CRITICAL] SMS
```

## Gerekenler

- Node.js 20+ (veya Docker)
- WhatsApp'ı açık bir telefon (QR okutmak için) — bot bu hesap adına grubu okur
- Twilio hesabı ve SMS gönderebilen bir numara
- AWS S3 bucket'ı ve erişim anahtarı

## Kurulum

```bash
npm install
cp .env.example .env    # değerleri doldur
npm run groups          # QR okut, grupları listeler; hedef grubun ID'sini .env'e yaz
npm start               # ilk açılışta QR okutulursa oturum .wwebjs_auth içinde saklanır
```

PDF ayrıştırmayı Twilio/S3/WhatsApp olmadan denemek için:

```bash
node scripts/test-pdf.js fatura.pdf "(?i)toplam\s*tutar"   # crop.png üretir
npm test
```

## Sürekli çalıştırma

**PM2:**
```bash
npm i -g pm2
pm2 start ecosystem.config.cjs && pm2 save && pm2 startup
pm2 logs wp-notifier        # QR gerekirse burada görünür
```

**Docker:**
```bash
docker compose up -d --build
docker compose logs -f      # ilk açılışta QR'ı buradan okut
```

## S3 ayarı

SMS'in tek segmentte (160 karakter) kalması için linkin kısa olması gerekir:

- `EVIDENCE_URL_MODE=public` (varsayılan). Yeni bucket'larda ACL kapalıdır; `bucket-policy.json`'daki bucket adını değiştirip bucket policy olarak ekle ve "Block public access" ayarında policy'ye izin ver. Bu durumda yalnızca `evidence/` altı herkese açık olur.
- Standart S3 linki ~115 karakterdir. Bu yüzden SMS kısa şablona düşer: `[ALERT] Total Due: 1,620.00 USD <link>`. Tam şablonu kullanmak için kısa alan adlı bir CloudFront dağıtımı kurup `EVIDENCE_PUBLIC_BASE_URL` olarak ver.
- `EVIDENCE_URL_MODE=presigned` daha güvenlidir (link süreli olur) ama link ~500 karakter olduğu için SMS birkaç segmente bölünür.

Fatura görselleri link sahibi herkese açık olur. Hassas belgeler için presigned modu düşün.

## Davranış

| Durum | Ne olur |
|---|---|
| Hedef satır bulundu | Kırpılmış PNG S3'e yüklenir, `[ALERT] ...` SMS'i gider |
| Hedef bulunamadı | `data/audit.log`'a yazılır, SMS gitmez (`DEBUG_SMS_ON_NO_MATCH=true` ile gider) |
| Metin katmanı yok (taranmış PDF) | `[WARNING] PDF received in <GRUP> but text layer was unreadable.` |
| Aynı PDF tekrar geldi | MD5 kaydı (`data/processed.json`) sayesinde atlanır |
| Telefondan çıkış / auth_failure | Hemen `[CRITICAL]` SMS'i |
| Bağlantı koptu / heartbeat başarısız | 30, 60, 120 sn arayla 3 deneme; olmazsa `[CRITICAL]` |
| Süreç çöktü | SMS atılır, PM2/Docker yeniden başlatır |

- Türkçe karakterler SMS'te ASCII'ye çevrilir (ş→s, ı→i). Aksi halde SMS UCS-2'ye düşer ve sınır 70 karaktere iner.
- PDF diske yazılmaz, yalnızca bellekte işlenir. Kırpılan görsel de diske yazılmadan doğrudan S3'e gider.
- Tutar, eşleşen satırda anahtar kelimeden sonraki son sayıdır (`1,620.00 USD`, `12.345,67 TL` gibi).

## Uyarı

`whatsapp-web.js` resmi bir WhatsApp API'si değildir ve WhatsApp kullanım şartlarına aykırıdır. Kullanılan numara banlanabilir. Bu yüzden ana numara yerine ayrı bir hat kullanmak daha güvenlidir.
