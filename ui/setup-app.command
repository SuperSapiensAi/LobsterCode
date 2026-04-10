#\!/bin/bash
# Setup Lobster Code — genera icona e prepara l'app
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$SCRIPT_DIR/Lobster Code.app"
RESOURCES="$APP_DIR/Contents/Resources"

echo "🦞 Setup Lobster Code..."

# 1. Genera .icns dall'iconset
if [ -d "$RESOURCES/LobsterCode.iconset" ] && [ \! -f "$RESOURCES/AppIcon.icns" ]; then
    echo "  🎨 Generazione icona..."
    iconutil -c icns "$RESOURCES/LobsterCode.iconset" -o "$RESOURCES/AppIcon.icns"
    rm -rf "$RESOURCES/LobsterCode.iconset"
    echo "  ✅ Icona creata"
else
    echo "  ✅ Icona già presente"
fi

# 2. Copia l'app sul Desktop (opzionale)
DESKTOP="$HOME/Desktop"
if [ -d "$APP_DIR" ]; then
    cp -R "$APP_DIR" "$DESKTOP/Lobster Code.app"
    echo "  ✅ App copiata sul Desktop"
fi

# 3. Rimuovi quarantine flag
xattr -cr "$DESKTOP/Lobster Code.app" 2>/dev/null

echo ""
echo "  🦞 Lobster Code pronta\!"
echo "  Doppio click su 'Lobster Code.app' sul Desktop per avviare."
echo ""
