#!/usr/bin/env python3
"""Test minimale: Ollama supporta tool calling?"""
import json, urllib.request

OLLAMA = "http://127.0.0.1:11434"

# Test con OGNI modello installato
try:
    res = urllib.request.urlopen(f"{OLLAMA}/api/tags", timeout=5)
    models = [m["name"] for m in json.loads(res.read()).get("models", [])]
    print(f"Modelli: {models}\n")
except Exception as e:
    print(f"Ollama non raggiungibile: {e}")
    exit(1)

for model in models:
    print(f"--- {model} ---")
    payload = json.dumps({
        "model": model,
        "messages": [{"role": "user", "content": "scrivi ciao in un file test.txt"}],
        "tools": [{
            "type": "function",
            "function": {
                "name": "write_file",
                "description": "Scrivi un file",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string"},
                        "content": {"type": "string"}
                    },
                    "required": ["path", "content"]
                }
            }
        }],
        "stream": False
    }).encode()

    try:
        req = urllib.request.Request(
            f"{OLLAMA}/api/chat", data=payload,
            headers={"Content-Type": "application/json"}, method="POST"
        )
        resp = urllib.request.urlopen(req, timeout=120)
        result = json.loads(resp.read())
        msg = result.get("message", {})
        tc = msg.get("tool_calls", [])
        if tc:
            print(f"  ✅ TOOL CALL: {json.dumps(tc, indent=2)}")
        else:
            text = msg.get("content", "")[:150]
            print(f"  ❌ Solo testo: {text}...")
    except Exception as e:
        print(f"  ❌ Errore: {e}")
    print()
