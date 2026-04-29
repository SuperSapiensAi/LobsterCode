#!/bin/bash
# ============================================================
# LOBSTER MANAGER — Build & Package Script
# Builds renderer, generates .icns icon, packages .app
# ============================================================

set -e
cd "$(dirname "$0")"

echo ""
echo "=== LOBSTER MANAGER — Build Script ==="
echo ""

# ---- Step 1: Install/verify dependencies ----
echo "[1/5] Verifica dipendenze npm..."
if [ ! -d "node_modules" ]; then
  echo "  -> Installazione dipendenze..."
  npm install
else
  echo "  -> node_modules presente, skip install"
fi

# ---- Step 2: Build renderer (Vite/React) ----
echo ""
echo "[2/5] Build del renderer (React + Vite)..."
npx vite build
echo "  -> dist/renderer/ creato"

# ---- Step 3: Build main process (TypeScript) ----
echo ""
echo "[3/5] Build del main process (TypeScript)..."
npx tsc -p tsconfig.main.json
echo "  -> dist/main/ aggiornato"

# ---- Step 4: Generate .icns icon ----
echo ""
echo "[4/5] Generazione icona .icns..."
ICONSET_DIR="assets/icons/icon.iconset"
ICNS_FILE="assets/icons/icon.icns"

if [ -d "$ICONSET_DIR" ]; then
  iconutil --convert icns "$ICONSET_DIR" --output "$ICNS_FILE"
  echo "  -> $ICNS_FILE creato"
else
  echo "  -> ATTENZIONE: $ICONSET_DIR non trovato, skip icona"
fi

# ---- Step 5: Package with electron-builder ----
echo ""
echo "[5/5] Pacchettizzazione app con electron-builder..."
npx electron-builder --mac --config.mac.identity=null 2>&1
echo ""

# ---- Post-build: find and copy .app ----
APP_PATH=$(find out -name "*.app" -maxdepth 3 2>/dev/null | head -1)

if [ -n "$APP_PATH" ]; then
  echo "=== BUILD COMPLETATO ==="
  echo ""
  echo "App trovata: $APP_PATH"
  echo ""

  # Copy to Applications
  APP_NAME=$(basename "$APP_PATH")
  if [ -d "/Applications/$APP_NAME" ]; then
    echo "Rimuovo versione precedente da /Applications..."
    rm -rf "/Applications/$APP_NAME"
  fi
  cp -R "$APP_PATH" /Applications/
  echo "App copiata in /Applications/$APP_NAME"

  # Create Desktop alias
  DESKTOP_ALIAS="$HOME/Desktop/$APP_NAME"
  if [ -e "$DESKTOP_ALIAS" ] || [ -L "$DESKTOP_ALIAS" ]; then
    rm -f "$DESKTOP_ALIAS"
  fi
  ln -s "/Applications/$APP_NAME" "$DESKTOP_ALIAS"
  echo "Alias creato sul Desktop: $DESKTOP_ALIAS"

  echo ""
  echo "Prova a cliccare l'icona sul Desktop!"
else
  echo "ERRORE: Nessun .app trovato nella cartella out/"
  echo "Controlla gli errori sopra."
fi

echo ""
echo "=== FINE ==="
