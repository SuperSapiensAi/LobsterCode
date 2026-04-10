#!/bin/bash
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

echo "🦀 Avvio Claw Code UI..."

# Avvia Ollama se non è già in esecuzione
if ! pgrep -x "ollama" > /dev/null; then
    echo "⏳ Avvio Ollama..."
    brew services start ollama
    sleep 3
fi

# Avvia un server web locale nella cartella UI
cd "$(dirname "$0")"

echo "🌐 Avvio server su http://localhost:8899"
echo "   Premi Ctrl+C per chiudere"
echo ""

# Apri il browser dopo 1 secondo
(sleep 1 && open "http://localhost:8899") &

# Avvia il server Python
python3 -m http.server 8899
