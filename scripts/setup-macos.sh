#!/usr/bin/env bash
set -e

# ========================================================
# wp-notifier - macOS Setup and Preparation Script
# ========================================================

echo "🚀 Starting wp-notifier macOS setup..."

# 1. Node.js Check
if ! command -v node >/dev/null 2>&1; then
    echo "❌ Node.js not found. Please install Node.js (>=20): brew install node"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d 'v' -f 2 | cut -d '.' -f 1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "⚠️  Node.js version ($NODE_VERSION) is lower than 20. Node.js 20 or higher is recommended."
fi
echo "✅ Node.js: $(node -v)"

# 2. Python3 and RapidOCR Check (Required)
echo "🔍 Checking Python3 and RapidOCR..."
if ! command -v python3 >/dev/null 2>&1; then
    echo "❌ Python3 not found!"
    echo "   Python3 and RapidOCR are required to parse receipts and images accurately."
    echo "   Please install via Homebrew: brew install python3"
    exit 1
fi
echo "✅ Python3: $(python3 --version)"

# RapidOCR Installation
if python3 -c "import rapidocr_onnxruntime" >/dev/null 2>&1; then
    echo "✅ rapidocr-onnxruntime is already installed."
else
    echo "⬇️  Installing rapidocr-onnxruntime..."
    python3 -m pip install -r requirements.txt || python3 -m pip install rapidocr-onnxruntime
fi

# Verification
if ! python3 -c "import rapidocr_onnxruntime" >/dev/null 2>&1; then
    echo "❌ Failed to install rapidocr-onnxruntime!"
    echo "   Please install manually: pip3 install rapidocr-onnxruntime"
    exit 1
fi
echo "✅ RapidOCR (ONNX) verified successfully."

# 3. Install Node.js Dependencies
echo "📦 Installing Node.js packages..."
npm install

# 4. Check .env File
if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        cp .env.example .env
        echo "ℹ️  Created .env from .env.example. Please review and configure .env."
    fi
fi

# 5. Directories
mkdir -p data

echo ""
echo "🎉 Setup completed successfully!"
echo ""
echo "Usage:"
echo "  - Start bot:             npm start"
echo "  - Run tests:             npm test"
echo "  - Enable autostart:      npm run autostart:macos"
echo ""
