#!/usr/bin/env python3
"""Test diretto: Ollama supporta tool calling con il tuo modello?"""
import json
import urllib.request

OLLAMA = "http://127.0.0.1:11434"

def test_native_api():
    """Test 1: /api/chat con tools (Ollama nativo)"""
    print("=" * 50)
    print("TEST 1: /api/chat (Ollama nativo)")
    print("=" * 50)
    payload = {
        "model": "qwen2.5-coder:14b",
        "messages": [
            {"role": "system", "content": "Sei un agente. Usa SEMPRE i tool disponibili. Non spiegare, esegui."},
            {"role": "user", "content": "crea un file chiamato test.txt con scritto hello world"}
        ],
        "tools": [
            {
                "type": "function",
                "function": {
                    "name": "write_file",
                    "description": "Scrivi contenuto in un file",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "path": {"type": "string", "description": "Path del file"},
                            "content": {"type": "string", "description": "Contenuto del file"}
                        },
                        "required": ["path", "content"]
                    }
                }
            }
        ],
        "stream": False
    }
    try:
        req = urllib.request.Request(
            f"{OLLAMA}/api/chat",
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read())
            msg = result.get("message", {})
            print(f"  Role: {msg.get('role')}")
            print(f"  Content: {msg.get('content', '(vuoto)')[:200]}")
            print(f"  Tool calls: {json.dumps(msg.get('tool_calls', []), indent=2)}")
            if msg.get("tool_calls"):
                print("  ✅ TOOL CALLING FUNZIONA!")
            else:
                print("  ❌ Nessun tool call — il modello risponde solo con testo")
    except Exception as e:
        print(f"  ❌ Errore: {e}")

def test_openai_api():
    """Test 2: /v1/chat/completions (OpenAI-compatible)"""
    print("\n" + "=" * 50)
    print("TEST 2: /v1/chat/completions (OpenAI-compat)")
    print("=" * 50)
    payload = {
        "model": "qwen2.5-coder:14b",
        "messages": [
            {"role": "system", "content": "Sei un agente. Usa SEMPRE i tool disponibili. Non spiegare, esegui."},
            {"role": "user", "content": "crea un file chiamato test.txt con scritto hello world"}
        ],
        "tools": [
            {
                "type": "function",
                "function": {
                    "name": "write_file",
                    "description": "Scrivi contenuto in un file",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "path": {"type": "string", "description": "Path del file"},
                            "content": {"type": "string", "description": "Contenuto del file"}
                        },
                        "required": ["path", "content"]
                    }
                }
            }
        ],
        "stream": False
    }
    try:
        req = urllib.request.Request(
            f"{OLLAMA}/v1/chat/completions",
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json", "Authorization": "Bearer ollama"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read())
            choice = result.get("choices", [{}])[0]
            msg = choice.get("message", {})
            print(f"  Role: {msg.get('role')}")
            print(f"  Content: {msg.get('content', '(vuoto)')[:200]}")
            print(f"  Tool calls: {json.dumps(msg.get('tool_calls', []), indent=2)}")
            finish = choice.get("finish_reason")
            print(f"  Finish reason: {finish}")
            if msg.get("tool_calls"):
                print("  ✅ TOOL CALLING FUNZIONA!")
            else:
                print("  ❌ Nessun tool call — il modello risponde solo con testo")
    except Exception as e:
        print(f"  ❌ Errore: {e}")

def test_ollama_version():
    """Check versione Ollama"""
    print("=" * 50)
    print("VERSIONE OLLAMA")
    print("=" * 50)
    try:
        req = urllib.request.Request(f"{OLLAMA}/api/version")
        with urllib.request.urlopen(req, timeout=5) as resp:
            result = json.loads(resp.read())
            print(f"  Versione: {result.get('version', 'sconosciuta')}")
    except Exception as e:
        print(f"  ❌ Errore: {e}")

def test_models():
    """Lista modelli disponibili"""
    print("\n" + "=" * 50)
    print("MODELLI DISPONIBILI")
    print("=" * 50)
    try:
        req = urllib.request.Request(f"{OLLAMA}/api/tags")
        with urllib.request.urlopen(req, timeout=5) as resp:
            result = json.loads(resp.read())
            for m in result.get("models", []):
                name = m.get("name", "?")
                size = m.get("size", 0) / (1024**3)
                print(f"  - {name} ({size:.1f} GB)")
    except Exception as e:
        print(f"  ❌ Errore: {e}")

if __name__ == "__main__":
    test_ollama_version()
    test_models()
    test_native_api()
    test_openai_api()
    print("\n" + "=" * 50)
    print("Se entrambi i test mostrano ❌, il problema è Ollama/modello.")
    print("Se almeno uno mostra ✅, il problema è nel server Lobster Code.")
    print("=" * 50)
