#!/usr/bin/env bash
set -e

# ========================================================
# wp-notifier - macOS LaunchAgent (Background Autostart)
# ========================================================

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_BIN="$(command -v node)"

if [ -z "$NODE_BIN" ]; then
    echo "❌ Node.js not found."
    exit 1
fi

PLIST_DIR="$HOME/Library/LaunchAgents"
PLIST_FILE="$PLIST_DIR/com.wpnotifier.bot.plist"

mkdir -p "$PLIST_DIR"
mkdir -p "$REPO_DIR/data"

echo "📝 Creating LaunchAgent: $PLIST_FILE"

cat <<EOF > "$PLIST_FILE"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.wpnotifier.bot</string>
    <key>ProgramArguments</key>
    <array>
        <string>$NODE_BIN</string>
        <string>$REPO_DIR/src/index.js</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$REPO_DIR</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$REPO_DIR/data/app.log</string>
    <key>StandardErrorPath</key>
    <string>$REPO_DIR/data/err.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:$PATH</string>
    </dict>
</dict>
</plist>
EOF

# Unload previous instance if present and load new one
launchctl unload "$PLIST_FILE" 2>/dev/null || true
launchctl load "$PLIST_FILE"

echo "✅ wp-notifier macOS LaunchAgent installed and started in background!"
echo "📄 View logs: tail -f data/app.log"
echo "🛑 Stop service: launchctl unload $PLIST_FILE"
