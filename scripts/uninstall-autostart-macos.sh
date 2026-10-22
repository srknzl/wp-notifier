#!/usr/bin/env bash
set -e

PLIST_FILE="$HOME/Library/LaunchAgents/com.wpnotifier.bot.plist"

if [ -f "$PLIST_FILE" ]; then
    launchctl unload "$PLIST_FILE" 2>/dev/null || true
    rm -f "$PLIST_FILE"
    echo "✅ wp-notifier macOS LaunchAgent kaldırıldı."
else
    echo "ℹ️  LaunchAgent dosyası bulunamadı, zaten kaldırılmış."
fi
