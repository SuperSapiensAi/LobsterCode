#!/bin/bash
# Lobster Code — Launcher
cd "$(dirname "$0")/ui"

# Avvia il server solo se non è già in esecuzione
if ! lsof -i :8899 -sTCP:LISTEN >/dev/null 2>&1; then
    python3 agent_server.py &
    sleep 2
fi

# Apri il browser
open "http://localhost:8899"
