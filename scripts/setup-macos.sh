#!/usr/bin/env bash
set -e

# ========================================================
# wp-notifier - macOS Kurulum ve Hazırlık Betiği
# ========================================================

echo "🚀 wp-notifier macOS kurulumu başlıyor..."

# 1. Node.js Kontrolü
if ! command -v node >/dev/null 2>&1; then
    echo "❌ Node.js bulunamadı. Lütfen Node.js (>=20) yükleyin: brew install node"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d 'v' -f 2 | cut -d '.' -f 1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "⚠️  Node.js sürümünüz ($NODE_VERSION) 20'den küçük. Node.js 20 veya üstü önerilir."
fi
echo "✅ Node.js: $(node -v)"

# 2. Python3 ve RapidOCR Kontrolü (Opsiyonel / Yüksek Doğruluklu OCR)
if command -v python3 >/dev/null 2>&1; then
    echo "✅ Python3: $(python3 --version)"
    echo "📦 RapidOCR paketi kontrol ediliyor..."
    if python3 -c "import rapidocr_onnxruntime" >/dev/null 2>&1; then
        echo "✅ rapidocr-onnxruntime zaten yüklü."
    else
        echo "⬇️  rapidocr-onnxruntime yükleniyor (düşük kaliteli görseller için)..."
        python3 -m pip install rapidocr-onnxruntime || echo "⚠️  pip yüklemesi atlandı, dahili Tesseract kullanılacak."
    fi
else
    echo "ℹ️  Python3 bulunamadı. Bot dahili Tesseract.js OCR motoru ile çalışacak."
fi

# 3. Bağımlılıkların Kurulumu
echo "📦 Node.js paketleri yükleniyor..."
npm install

# 4. .env Dosyası Kontrolü
if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        cp .env.example .env
        echo "ℹ️  .env.example dosyasından .env oluşturuldu. Lütfen .env dosyasını kontrol edin."
    fi
fi

# 5. Dizinler
mkdir -p data

echo ""
echo "🎉 Kurulum tamamlandı!"
echo ""
echo "Kullanım:"
echo "  - Botu başlatmak için:         npm start"
echo "  - Testleri çalıştırmak için:    npm test"
echo "  - Otomatik başlatma (Launchd): ./scripts/setup-autostart-macos.sh"
echo ""
