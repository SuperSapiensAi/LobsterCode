#!/bin/bash
# ============================================================
#  Lobster Code Agent — Avvio rapido
# ============================================================
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "  🦞 Lobster Code Agent"
echo "  ════════════════════════════════════════"
echo ""

# 1. Avvia Ollama se non è in esecuzione
if ! pgrep -x "ollama" > /dev/null 2>&1; then
    echo "  ⏳ Avvio Ollama..."
    ollama serve &>/dev/null &
    sleep 3
    echo "  ✅ Ollama avviato"
else
    echo "  ✅ Ollama già in esecuzione"
fi

# 2. Controlla che il modello sia disponibile
MODEL="${CLAW_MODEL:-qwen2.5-coder:14b}"
echo "  📦 Modello: $MODEL"

if ! ollama list 2>/dev/null | grep -q "$MODEL"; then
    echo "  ⏳ Scaricamento modello $MODEL..."
    ollama pull "$MODEL"
fi

# 3. Chiudi eventuale server precedente sulla stessa porta
PORT="${CLAW_PORT:-8899}"
lsof -ti ":$PORT" 2>/dev/null | xargs kill -9 2>/dev/null
sleep 1

# 4. Imposta il workspace (default: cartella utente)
export CLAW_WORKSPACE="${CLAW_WORKSPACE:-$HOME}"
export CLAW_MODEL="$MODEL"
export CLAW_PORT="$PORT"

echo "  📁 Workspace: $CLAW_WORKSPACE"
echo "  🌐 Server: http://localhost:$PORT"
echo "  ════════════════════════════════════════"
echo ""
echo "  Premi Ctrl+C per chiudere"
echo ""

# 5. Apri il browser dopo 2 secondi
(sleep 2 && open "http://localhost:$PORT/agent.html") &

# 6. Avvia l'agent server
cd "$SCRIPT_DIR"
python3 agent_server.py
