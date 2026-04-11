#!/usr/bin/env python3
"""
Lobster Code Agent Server
======================
Backend Python che trasforma la UI web in un vero agente di sviluppo.
Gestisce il loop agente: invia messaggi + tool definitions a Ollama,
esegue i tool localmente e restituisce i risultati.

Zero dipendenze esterne - usa solo la standard library di Python.
"""

import difflib
import glob as _glob
import http.server
import json
import os
import shlex
import subprocess
import sys
import tempfile
import threading
import time
import mimetypes
import urllib.request
import urllib.error
from pathlib import Path
from functools import partial
from io import BytesIO
from urllib.parse import parse_qs, urlparse

# ---------------------------------------------------------------------------
# Configurazione
# ---------------------------------------------------------------------------

OLLAMA_BASE = os.environ.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
DEFAULT_MODEL = os.environ.get("CLAW_MODEL", "gemma4:latest")
WORKSPACE_ROOT = os.environ.get("CLAW_WORKSPACE", os.path.expanduser("~"))
MAX_AGENT_TURNS = 10  # massimo numero di turni tool-call consecutivi
SERVER_PORT = int(os.environ.get("CLAW_PORT", "8899"))

# Engine: "ollama" (native /api/chat), "ollama-pro" (Ollama v0.14+ /v1/messages), "claw" (Rust binary)
ENGINE_MODE = os.environ.get("LOBSTER_ENGINE", "auto")  # auto = try ollama-pro first, fallback to ollama
CLAW_BINARY = os.environ.get("CLAW_BINARY", os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "rust", "target", "debug", "claw"))

# Sicurezza: limite dimensione request body (10 MB)
MAX_REQUEST_SIZE = 10 * 1024 * 1024

# Lock globale per stato motore e permessi (thread-safety)
_state_lock = threading.Lock()
# Lock per session memory
_context_lock = threading.Lock()

# ---------------------------------------------------------------------------
# Catalogo Modelli Consigliati
# ---------------------------------------------------------------------------

MODEL_CATALOG = [
    {
        "name": "qwen2.5-coder:14b",
        "display": "Qwen 2.5 Coder 14B",
        "description": "Il migliore per coding. Tool calling nativo, veloce e preciso.",
        "size_gb": 9.0,
        "min_ram_gb": 12,
        "category": "coding",
        "tags": ["coding", "tools"],
        "recommended": True,
        "icon": "🏆"
    },
    {
        "name": "qwen2.5-coder:7b",
        "display": "Qwen 2.5 Coder 7B",
        "description": "Versione leggera di Qwen Coder. Ottimo per PC con meno RAM.",
        "size_gb": 4.7,
        "min_ram_gb": 8,
        "category": "coding",
        "tags": ["coding", "tools", "leggero"],
        "recommended": False,
        "icon": "⚡"
    },
    {
        "name": "deepseek-coder-v2",
        "display": "DeepSeek Coder V2",
        "description": "Eccellente per refactoring e debug. Ragionamento profondo.",
        "size_gb": 8.9,
        "min_ram_gb": 12,
        "category": "coding",
        "tags": ["coding", "ragionamento"],
        "recommended": False,
        "icon": "🧊"
    },
    {
        "name": "mistral:7b",
        "display": "Mistral 7B",
        "description": "Versatile e veloce. Tool calling nativo, ottimo bilanciamento.",
        "size_gb": 4.1,
        "min_ram_gb": 8,
        "category": "generale",
        "tags": ["generale", "tools", "veloce"],
        "recommended": False,
        "icon": "🌊"
    },
    {
        "name": "codellama:13b",
        "display": "Code Llama 13B",
        "description": "Di Meta, specializzato nel coding. Veloce e affidabile.",
        "size_gb": 7.4,
        "min_ram_gb": 10,
        "category": "coding",
        "tags": ["coding", "veloce"],
        "recommended": False,
        "icon": "🦙"
    },
    {
        "name": "gemma4",
        "display": "Gemma 4 12B",
        "description": "Di Google. Ultimo modello, multilingua eccellente, tool calling nativo, 128K contesto.",
        "size_gb": 9.6,
        "min_ram_gb": 12,
        "category": "generale",
        "tags": ["generale", "tools", "multilingua", "128k"],
        "recommended": False,
        "icon": "💎"
    },
]

# Stato download in corso (thread-safe con lock semplice)
_download_status = {}  # model_name -> {"status": "downloading"|"done"|"error", "progress": "..."}
_download_lock = threading.Lock()


def _get_system_ram_gb():
    """Rileva la RAM totale del sistema in GB."""
    try:
        if sys.platform == "darwin":
            result = subprocess.run(
                ["sysctl", "-n", "hw.memsize"],
                capture_output=True, text=True, timeout=5
            )
            return int(result.stdout.strip()) / (1024 ** 3)
        else:
            with open("/proc/meminfo") as f:
                for line in f:
                    if line.startswith("MemTotal"):
                        kb = int(line.split()[1])
                        return kb / (1024 ** 2)
    except Exception:
        pass
    return 0


def _check_ollama_running():
    """Controlla se Ollama è raggiungibile."""
    try:
        req = urllib.request.Request(f"{OLLAMA_BASE}/api/tags", method="GET")
        with urllib.request.urlopen(req, timeout=3) as resp:
            return resp.status == 200
    except Exception:
        return False


def _get_installed_models():
    """Ottieni lista modelli installati da Ollama."""
    try:
        req = urllib.request.Request(f"{OLLAMA_BASE}/api/tags", method="GET")
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
            return [m.get("name", "") for m in data.get("models", [])]
    except Exception:
        return []


def _pull_model_thread(model_name):
    """Scarica un modello in background (thread separato)."""
    with _download_lock:
        _download_status[model_name] = {"status": "downloading", "progress": "Avvio download..."}

    try:
        payload = json.dumps({"name": model_name, "stream": True}).encode("utf-8")
        req = urllib.request.Request(
            f"{OLLAMA_BASE}/api/pull",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=1800) as resp:
            for line in resp:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                    status_text = obj.get("status", "")
                    # Calcola progresso percentuale se disponibile
                    total = obj.get("total", 0)
                    completed = obj.get("completed", 0)
                    if total > 0:
                        pct = int(completed / total * 100)
                        progress = f"{status_text} — {pct}%"
                    else:
                        progress = status_text
                    with _download_lock:
                        _download_status[model_name] = {
                            "status": "downloading",
                            "progress": progress
                        }
                except json.JSONDecodeError:
                    pass

        with _download_lock:
            _download_status[model_name] = {"status": "done", "progress": "Download completato!"}

    except Exception as e:
        with _download_lock:
            _download_status[model_name] = {"status": "error", "progress": f"Errore: {str(e)}"}

# ---------------------------------------------------------------------------
# Project Context: auto-detect dello stack del progetto
# ---------------------------------------------------------------------------

def _detect_project_context(workspace):
    """Scansiona il workspace e rileva stack, dipendenze, struttura."""
    ctx = {
        "stack": [],
        "package_manager": None,
        "frameworks": [],
        "languages": [],
        "entry_points": [],
        "has_git": False,
        "git_branch": None,
        "git_dirty": 0,
        "structure_summary": "",
    }

    ws = Path(workspace)
    if not ws.is_dir():
        return ctx

    # Git
    git_dir = ws / ".git"
    if git_dir.exists():
        ctx["has_git"] = True
        try:
            branch = subprocess.run(
                ["git", "branch", "--show-current"],
                capture_output=True, text=True, timeout=5, cwd=workspace
            )
            ctx["git_branch"] = branch.stdout.strip() or "HEAD"
        except Exception:
            pass
        try:
            status = subprocess.run(
                ["git", "status", "--porcelain"],
                capture_output=True, text=True, timeout=5, cwd=workspace
            )
            ctx["git_dirty"] = len([l for l in status.stdout.strip().split("\n") if l.strip()])
        except Exception:
            pass

    # Detect files presenti
    top_files = set()
    try:
        for item in ws.iterdir():
            if not item.name.startswith("."):
                top_files.add(item.name)
    except Exception:
        pass

    # Node.js / JavaScript
    if "package.json" in top_files:
        ctx["stack"].append("Node.js")
        ctx["languages"].append("JavaScript/TypeScript")
        ctx["package_manager"] = "npm"
        if "yarn.lock" in top_files:
            ctx["package_manager"] = "yarn"
        elif "pnpm-lock.yaml" in top_files:
            ctx["package_manager"] = "pnpm"
        elif "bun.lockb" in top_files:
            ctx["package_manager"] = "bun"
        # Detect frameworks from package.json
        try:
            pj = json.loads((ws / "package.json").read_text())
            deps = {**pj.get("dependencies", {}), **pj.get("devDependencies", {})}
            if "next" in deps:
                ctx["frameworks"].append("Next.js")
            if "react" in deps:
                ctx["frameworks"].append("React")
            if "vue" in deps:
                ctx["frameworks"].append("Vue")
            if "svelte" in deps or "@sveltejs/kit" in deps:
                ctx["frameworks"].append("Svelte")
            if "express" in deps:
                ctx["frameworks"].append("Express")
            if "fastify" in deps:
                ctx["frameworks"].append("Fastify")
            if "nuxt" in deps:
                ctx["frameworks"].append("Nuxt")
            if "angular" in deps or "@angular/core" in deps:
                ctx["frameworks"].append("Angular")
            if "tailwindcss" in deps:
                ctx["frameworks"].append("Tailwind CSS")
            if "vite" in deps:
                ctx["frameworks"].append("Vite")
            ctx["entry_points"].append("package.json")
        except Exception:
            pass

    # Python
    if "requirements.txt" in top_files or "pyproject.toml" in top_files or "setup.py" in top_files or "Pipfile" in top_files:
        ctx["stack"].append("Python")
        ctx["languages"].append("Python")
        if "pyproject.toml" in top_files:
            ctx["entry_points"].append("pyproject.toml")
            ctx["package_manager"] = ctx["package_manager"] or "pip/poetry"
        if "requirements.txt" in top_files:
            ctx["entry_points"].append("requirements.txt")
            ctx["package_manager"] = ctx["package_manager"] or "pip"
        # Detect frameworks
        try:
            if "requirements.txt" in top_files:
                reqs = (ws / "requirements.txt").read_text().lower()
                if "django" in reqs: ctx["frameworks"].append("Django")
                if "flask" in reqs: ctx["frameworks"].append("Flask")
                if "fastapi" in reqs: ctx["frameworks"].append("FastAPI")
        except Exception:
            pass

    # Rust
    if "Cargo.toml" in top_files:
        ctx["stack"].append("Rust")
        ctx["languages"].append("Rust")
        ctx["package_manager"] = ctx["package_manager"] or "cargo"
        ctx["entry_points"].append("Cargo.toml")

    # Go
    if "go.mod" in top_files:
        ctx["stack"].append("Go")
        ctx["languages"].append("Go")
        ctx["entry_points"].append("go.mod")

    # Docker
    if "Dockerfile" in top_files or "docker-compose.yml" in top_files or "docker-compose.yaml" in top_files:
        ctx["stack"].append("Docker")

    # Structure summary (top-level dirs)
    dirs = sorted([f for f in top_files if (ws / f).is_dir()])[:12]
    files = sorted([f for f in top_files if (ws / f).is_file()])[:12]
    ctx["structure_summary"] = f"Cartelle: {', '.join(dirs) if dirs else 'nessuna'}; File: {', '.join(files) if files else 'nessuno'}"

    return ctx


# Cache del project context (ricalcola ogni 60 secondi)
_project_context_cache = {"data": None, "timestamp": 0}


def get_project_context():
    """Ritorna il project context, con cache di 60 secondi."""
    now = time.time()
    if _project_context_cache["data"] and now - _project_context_cache["timestamp"] < 60:
        return _project_context_cache["data"]
    ctx = _detect_project_context(WORKSPACE_ROOT)
    _project_context_cache["data"] = ctx
    _project_context_cache["timestamp"] = now
    return ctx


# ---------------------------------------------------------------------------
# MCP Client — Model Context Protocol (stdlib only)
# ---------------------------------------------------------------------------

import re as _re
import struct as _struct

class McpStdioTransport:
    """Trasporto JSON-RPC su stdio con Content-Length framing."""

    def __init__(self, command: list, env: dict = None):
        self.command = command
        self.env = {**os.environ, **(env or {})}
        self.process = None
        self._req_id = 0
        self._lock = threading.Lock()

    def start(self):
        try:
            self.process = subprocess.Popen(
                self.command,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                env=self.env
            )
        except FileNotFoundError:
            raise RuntimeError(f"MCP server command not found: {self.command[0]}")

    def stop(self):
        if self.process and self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
        self.process = None

    def _write_frame(self, data: dict):
        body = json.dumps(data).encode("utf-8")
        header = f"Content-Length: {len(body)}\r\n\r\n".encode("utf-8")
        self.process.stdin.write(header + body)
        self.process.stdin.flush()

    def _read_frame(self, timeout: float = 60.0) -> dict:
        """Legge un frame JSON-RPC con Content-Length header."""
        import select
        stdout = self.process.stdout

        # Leggi headers fino a \r\n\r\n
        header_buf = b""
        deadline = time.time() + timeout
        while b"\r\n\r\n" not in header_buf:
            if time.time() > deadline:
                raise TimeoutError("MCP: timeout reading response header")
            chunk = stdout.read(1)
            if not chunk:
                stderr_out = ""
                try:
                    stderr_out = self.process.stderr.read(2048).decode(errors="replace")
                except:
                    pass
                raise ConnectionError(f"MCP: server closed connection. stderr: {stderr_out}")
            header_buf += chunk

        # Parse Content-Length
        header_text = header_buf.decode("utf-8")
        match = _re.search(r"Content-Length:\s*(\d+)", header_text, _re.IGNORECASE)
        if not match:
            raise ValueError(f"MCP: missing Content-Length in header: {header_text!r}")
        content_length = int(match.group(1))

        # Leggi body
        body = b""
        while len(body) < content_length:
            remaining = content_length - len(body)
            chunk = stdout.read(remaining)
            if not chunk:
                raise ConnectionError("MCP: connection lost while reading body")
            body += chunk

        return json.loads(body.decode("utf-8"))

    def send_request(self, method: str, params: dict = None) -> dict:
        with self._lock:
            self._req_id += 1
            req = {
                "jsonrpc": "2.0",
                "id": self._req_id,
                "method": method,
            }
            if params is not None:
                req["params"] = params

            self._write_frame(req)

            # Leggi risposte, ignora notifiche (id=None)
            while True:
                resp = self._read_frame()
                if "id" in resp and resp["id"] == self._req_id:
                    if "error" in resp:
                        err = resp["error"]
                        raise RuntimeError(f"MCP error ({err.get('code', '?')}): {err.get('message', 'unknown')}")
                    return resp.get("result", {})
                # Se è una notifica (no id), ignora e continua


class McpClient:
    """Client MCP per un singolo server."""

    def __init__(self, name: str, command: list, args: list = None, env: dict = None, timeout: float = 60.0):
        self.name = name
        self.timeout = timeout
        full_command = [command] + (args or []) if isinstance(command, str) else command + (args or [])
        self.transport = McpStdioTransport(full_command, env)
        self.tools = []  # lista di tool scoperti
        self.connected = False

    def connect(self):
        """Avvia il server e fai handshake."""
        try:
            self.transport.start()
            self.transport.send_request("initialize", {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "lobster-code", "version": "1.1.0"}
            })
            # Notifica initialized
            self.transport._write_frame({"jsonrpc": "2.0", "method": "notifications/initialized"})
            self.connected = True
            sys.stderr.write(f"[mcp] Connected to server: {self.name}\n")
        except Exception as e:
            sys.stderr.write(f"[mcp] Failed to connect to {self.name}: {e}\n")
            self.connected = False
            self.transport.stop()

    def discover_tools(self) -> list:
        """Scopri i tool disponibili sul server (con paginazione)."""
        if not self.connected:
            return []
        all_tools = []
        cursor = None
        try:
            while True:
                params = {}
                if cursor:
                    params["cursor"] = cursor
                result = self.transport.send_request("tools/list", params)
                tools = result.get("tools", [])
                all_tools.extend(tools)
                cursor = result.get("nextCursor")
                if not cursor:
                    break
            self.tools = all_tools
            sys.stderr.write(f"[mcp] Discovered {len(all_tools)} tools from {self.name}\n")
        except Exception as e:
            sys.stderr.write(f"[mcp] Tool discovery failed for {self.name}: {e}\n")
        return self.tools

    def call_tool(self, tool_name: str, arguments: dict = None) -> str:
        """Chiama un tool sul server MCP."""
        if not self.connected:
            return f"Errore: server MCP '{self.name}' non connesso"
        try:
            result = self.transport.send_request("tools/call", {
                "name": tool_name,
                "arguments": arguments or {}
            })
            # Il risultato può essere content[] con text/image
            content = result.get("content", [])
            texts = []
            for item in content:
                if item.get("type") == "text":
                    texts.append(item.get("text", ""))
                elif item.get("type") == "image":
                    texts.append(f"[immagine: {item.get('mimeType', 'unknown')}]")
                else:
                    texts.append(str(item))
            return "\n".join(texts) if texts else "(nessun output)"
        except TimeoutError:
            return f"Errore: timeout chiamando {tool_name} su {self.name}"
        except Exception as e:
            return f"Errore MCP ({self.name}/{tool_name}): {str(e)}"

    def shutdown(self):
        self.connected = False
        self.transport.stop()


def _normalize_mcp_name(s: str) -> str:
    """Normalizza un nome per uso come tool name Ollama."""
    return _re.sub(r"[^a-zA-Z0-9_-]", "_", s).strip("_")


class McpRegistry:
    """Registry globale per tutti i server MCP e i loro tool."""

    def __init__(self):
        self.clients: dict[str, McpClient] = {}
        self._tool_map: dict[str, tuple] = {}  # qualified_name -> (server_name, raw_tool_name)

    def load_config(self):
        """Carica la configurazione MCP da file."""
        config_paths = [
            os.path.join(WORKSPACE_ROOT, ".lobster", "mcp.json"),
            os.path.join(WORKSPACE_ROOT, ".lobster.json"),
            os.path.expanduser("~/.lobster/mcp.json"),
        ]
        for path in config_paths:
            if os.path.isfile(path):
                try:
                    with open(path, "r") as f:
                        config = json.load(f)
                    servers = config.get("mcp_servers", config.get("mcpServers", {}))
                    for name, srv_config in servers.items():
                        cmd = srv_config.get("command", "")
                        args = srv_config.get("args", [])
                        env = srv_config.get("env", {})
                        timeout = srv_config.get("timeout", 60)
                        self.clients[name] = McpClient(name, cmd, args, env, timeout)
                    sys.stderr.write(f"[mcp] Loaded config from {path}: {len(servers)} server(s)\n")
                    return
                except Exception as e:
                    sys.stderr.write(f"[mcp] Error loading config from {path}: {e}\n")
        sys.stderr.write("[mcp] No MCP config found (optional: create .lobster/mcp.json)\n")

    def connect_all(self):
        """Connetti a tutti i server configurati."""
        for name, client in self.clients.items():
            client.connect()
            if client.connected:
                client.discover_tools()
                # Registra tool con nomi qualificati
                for tool in client.tools:
                    raw_name = tool.get("name", "")
                    qualified = f"mcp__{_normalize_mcp_name(name)}__{_normalize_mcp_name(raw_name)}"
                    self._tool_map[qualified] = (name, raw_name)

    def get_ollama_tools(self) -> list:
        """Restituisci i tool MCP in formato Ollama."""
        ollama_tools = []
        for qualified_name, (server_name, raw_name) in self._tool_map.items():
            client = self.clients.get(server_name)
            if not client or not client.connected:
                continue
            # Trova la definizione originale del tool
            tool_def = None
            for t in client.tools:
                if t.get("name") == raw_name:
                    tool_def = t
                    break
            if not tool_def:
                continue

            ollama_tools.append({
                "type": "function",
                "function": {
                    "name": qualified_name,
                    "description": f"[MCP:{server_name}] {tool_def.get('description', raw_name)}",
                    "parameters": tool_def.get("inputSchema", {"type": "object", "properties": {}})
                }
            })
        return ollama_tools

    def is_mcp_tool(self, name: str) -> bool:
        return name in self._tool_map

    def execute_mcp_tool(self, qualified_name: str, arguments: dict) -> str:
        """Esegui un tool MCP dato il nome qualificato."""
        if qualified_name not in self._tool_map:
            return f"Errore: tool MCP '{qualified_name}' non trovato"
        server_name, raw_name = self._tool_map[qualified_name]
        client = self.clients.get(server_name)
        if not client:
            return f"Errore: server MCP '{server_name}' non trovato"
        return client.call_tool(raw_name, arguments)

    def get_status(self) -> dict:
        """Stato di tutti i server per la UI."""
        status = {}
        for name, client in self.clients.items():
            status[name] = {
                "connected": client.connected,
                "tools": len(client.tools),
                "tool_names": [t.get("name", "") for t in client.tools]
            }
        return status

    def shutdown_all(self):
        for client in self.clients.values():
            client.shutdown()


# Inizializza il registry MCP globale
_mcp_registry = McpRegistry()


def _init_mcp():
    """Inizializza MCP servers (chiamata al boot del server)."""
    _mcp_registry.load_config()
    if _mcp_registry.clients:
        _mcp_registry.connect_all()


# ---------------------------------------------------------------------------
# Definizioni Tool per Ollama
# ---------------------------------------------------------------------------

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "bash",
            "description": (
                "Esegui un comando bash nella shell. "
                "Usa per installare pacchetti, eseguire script, compilare codice, "
                "controllare lo stato di file e processi. "
                "Il comando viene eseguito nella directory di lavoro corrente."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {
                        "type": "string",
                        "description": "Il comando bash da eseguire"
                    }
                },
                "required": ["command"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": (
                "Leggi il contenuto di un file di testo. "
                "Restituisce il contenuto completo del file. "
                "Usa percorsi assoluti o relativi alla directory di lavoro."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Percorso del file da leggere"
                    }
                },
                "required": ["path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": (
                "Scrivi contenuto in un file. Crea il file se non esiste, "
                "sovrascrive se esiste. Crea automaticamente le directory intermedie."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Percorso del file da scrivere"
                    },
                    "content": {
                        "type": "string",
                        "description": "Contenuto da scrivere nel file"
                    }
                },
                "required": ["path", "content"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "edit_file",
            "description": (
                "Modifica un file esistente sostituendo una stringa con un'altra. "
                "Utile per modifiche puntuali senza riscrivere l'intero file."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Percorso del file da modificare"
                    },
                    "old_string": {
                        "type": "string",
                        "description": "La stringa da cercare e sostituire"
                    },
                    "new_string": {
                        "type": "string",
                        "description": "La stringa sostitutiva"
                    }
                },
                "required": ["path", "old_string", "new_string"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "list_directory",
            "description": (
                "Elenca file e cartelle in una directory. "
                "Restituisce nomi, dimensioni e tipo (file/directory)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Percorso della directory da elencare"
                    }
                },
                "required": ["path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_files",
            "description": (
                "Cerca un pattern (regex) nei file di una directory. "
                "Simile a grep -rn. Restituisce file, numeri di riga e contenuto."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "pattern": {
                        "type": "string",
                        "description": "Pattern regex da cercare"
                    },
                    "path": {
                        "type": "string",
                        "description": "Directory in cui cercare (default: directory corrente)"
                    },
                    "file_pattern": {
                        "type": "string",
                        "description": "Filtro glob per i file (es. '*.py', '*.ts')"
                    }
                },
                "required": ["pattern"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "glob_search",
            "description": (
                "Trova file per pattern glob (es. '**/*.py', 'src/**/*.ts'). "
                "Utile per trovare file specifici in grandi progetti."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "pattern": {
                        "type": "string",
                        "description": "Pattern glob (es. '**/*.py', 'src/**/*.ts', '*.json')"
                    },
                    "path": {
                        "type": "string",
                        "description": "Directory radice per la ricerca (default: workspace corrente)"
                    }
                },
                "required": ["pattern"]
            }
        }
    }
]

# ---------------------------------------------------------------------------
# Tracking modifiche file
# ---------------------------------------------------------------------------

modified_files = []

# ---------------------------------------------------------------------------
# Workspace Grant — l'utente concede accesso esplicito a cartelle specifiche
# ---------------------------------------------------------------------------

_granted_workspaces = [WORKSPACE_ROOT]  # inizia col workspace root
_workspace_lock = threading.Lock()


def _is_path_in_granted_workspace(resolved_path: str) -> bool:
    """Verifica che un path sia dentro un workspace concesso."""
    rp = os.path.realpath(resolved_path)
    with _workspace_lock:
        for ws in _granted_workspaces:
            ws_real = os.path.realpath(ws)
            if rp == ws_real or rp.startswith(ws_real + "/"):
                return True
    return False


def _get_granted_workspaces() -> list:
    """Ritorna lista workspace concessi."""
    with _workspace_lock:
        return list(_granted_workspaces)


def _grant_workspace(path: str) -> dict:
    """Concedi accesso a una cartella."""
    resolved = os.path.realpath(os.path.expanduser(path))
    if not os.path.isdir(resolved):
        return {"success": False, "error": f"Directory non trovata: {resolved}"}
    # Sicurezza: non concedere accesso a directory di sistema
    if _is_path_protected_write(resolved):
        return {"success": False, "error": f"Non è permesso concedere accesso a directory di sistema: {resolved}"}
    with _workspace_lock:
        if resolved not in _granted_workspaces:
            _granted_workspaces.append(resolved)
    return {"success": True, "path": resolved}


def _revoke_workspace(path: str) -> dict:
    """Revoca accesso a una cartella."""
    resolved = os.path.realpath(os.path.expanduser(path))
    with _workspace_lock:
        if resolved in _granted_workspaces:
            # Non permettere di revocare l'ultimo workspace
            if len(_granted_workspaces) <= 1:
                return {"success": False, "error": "Non puoi revocare l'ultimo workspace"}
            _granted_workspaces.remove(resolved)
            return {"success": True, "path": resolved}
    return {"success": False, "error": "Workspace non trovato"}


# ---------------------------------------------------------------------------
# Snapshot & Rollback: salva lo stato dei file prima di ogni modifica
# ---------------------------------------------------------------------------

_snapshots = []       # lista di snapshot: [{"id": str, "timestamp": float, "label": str, "files": {path: content|None}}]
_snapshot_lock = threading.Lock()
_MAX_SNAPSHOTS = 20


def _create_snapshot(label="auto"):
    """Crea un nuovo snapshot vuoto. I file vengono aggiunti man mano che vengono toccati."""
    snap_id = str(int(time.time() * 1000))
    snap = {
        "id": snap_id,
        "timestamp": time.time(),
        "label": label,
        "files": {}   # path -> contenuto originale (None se il file non esisteva)
    }
    with _snapshot_lock:
        _snapshots.append(snap)
        # Limita il numero di snapshot
        while len(_snapshots) > _MAX_SNAPSHOTS:
            _snapshots.pop(0)
    return snap_id


def _snapshot_save_file(path):
    """Salva lo stato corrente di un file nello snapshot attivo (prima di modificarlo)."""
    with _snapshot_lock:
        if not _snapshots:
            return
        snap = _snapshots[-1]
        # Salva solo la prima volta per ogni file in questo snapshot
        if path in snap["files"]:
            return
        try:
            if os.path.isfile(path):
                with open(path, "r", encoding="utf-8", errors="replace") as f:
                    snap["files"][path] = f.read()
            else:
                snap["files"][path] = None  # file non esisteva
        except Exception:
            snap["files"][path] = None


def _rollback_snapshot(snap_id):
    """Ripristina tutti i file di uno snapshot (lock held per tutta la durata per evitare race)."""
    with _snapshot_lock:
        snap = None
        snap_idx = None
        for i, s in enumerate(_snapshots):
            if s["id"] == snap_id:
                snap = s
                snap_idx = i
                break
        if not snap:
            return {"success": False, "error": "Snapshot non trovato"}

        restored = []
        errors = []
        for path, content in snap["files"].items():
            try:
                if content is None:
                    # Il file non esisteva prima: eliminalo
                    if os.path.isfile(path):
                        os.remove(path)
                        restored.append(f"Eliminato: {path}")
                else:
                    # Ripristina il contenuto originale (scrittura atomica)
                    dir_path = os.path.dirname(path) or "."
                    os.makedirs(dir_path, exist_ok=True)
                    fd, tmp_path = tempfile.mkstemp(dir=dir_path, suffix=".tmp")
                    try:
                        with os.fdopen(fd, "w", encoding="utf-8") as f:
                            f.write(content)
                        os.replace(tmp_path, path)
                        restored.append(f"Ripristinato: {path}")
                    except Exception:
                        try:
                            os.remove(tmp_path)
                        except OSError:
                            pass
                        raise
            except Exception as e:
                errors.append(f"{path}: {str(e)}")

        # Rimuovi snapshot solo se il ripristino è riuscito (anche parzialmente)
        if restored:
            del _snapshots[snap_idx:]

    return {"success": len(errors) == 0, "restored": restored, "errors": errors}


def _get_snapshots_list():
    """Ritorna lista snapshot per la UI."""
    with _snapshot_lock:
        return [
            {
                "id": s["id"],
                "timestamp": s["timestamp"],
                "label": s["label"],
                "file_count": len(s["files"])
            }
            for s in reversed(_snapshots)  # più recente prima
        ]


# ---------------------------------------------------------------------------
# Esecuzione Tool
# ---------------------------------------------------------------------------

def resolve_path(path_str: str) -> str:
    """Risolvi un percorso relativo rispetto al workspace root."""
    p = Path(path_str).expanduser()
    if not p.is_absolute():
        p = Path(WORKSPACE_ROOT) / p
    return str(p.resolve())


# ---------------------------------------------------------------------------
# Sicurezza: protezione file di sistema
# ---------------------------------------------------------------------------

# Directory protette da SCRITTURA (lettura OK, scrittura/modifica bloccata)
PROTECTED_WRITE_DIRS = [
    "/System",
    "/Library",
    "/usr",
    "/bin",
    "/sbin",
    "/private",
    "/etc",
    "/var",
    "/opt",
    "/Applications",
    "/cores",
]

# Directory protette anche da LETTURA (dati sensibili)
PROTECTED_READ_DIRS = [
    "/private/etc/shadow",
    "/private/etc/master.passwd",
]

# File specifici protetti
PROTECTED_FILES = [
    ".ssh/id_rsa",
    ".ssh/id_ed25519",
    ".ssh/id_ecdsa",
    ".gnupg/",
    ".aws/credentials",
    ".env",
    "Keychain",
]

# Comandi bash pericolosi (pattern)
DANGEROUS_BASH_PATTERNS = [
    "rm -rf /",
    "rm -rf /*",
    "rm -rf ~",
    "rm -rf ~/",
    "mkfs",
    "dd if=",
    "> /dev/sd",
    "chmod -R 777 /",
    "chown -R",
    ":(){ :|:& };:",  # fork bomb
    "sudo rm",
    "sudo dd",
    "sudo mkfs",
    "sudo chmod",
    "sudo chown",
    "launchctl",
    "csrutil",
    "nvram",
    "diskutil erase",
    "diskutil partitionDisk",
    "shutdown",
    "reboot",
    "halt",
    "init 0",
    "init 6",
    # Anti-bypass: comandi alternativi di cancellazione massiva
    "find / -delete",
    "find / -exec rm",
    "find ~ -delete",
    "find ~ -exec rm",
    "perl -e",           # blocca script inline perl distruttivi
    "python -c \"import shutil; shutil.rmtree",
    "python3 -c \"import shutil; shutil.rmtree",
    # Anti-escalation: blocca tentativi di cambiare permessi via API locale
    "set-permission",
    "set_permission",
    "full-access",
]

# Comandi che aprono browser/app (bloccati: l'utente non li vuole)
BROWSER_OPEN_PATTERNS = [
    "open ",          # macOS open command
    "open\t",
    "xdg-open",       # Linux
    "start ",         # Windows
    "python -m webbrowser",
    "python3 -m webbrowser",
    "python -m http.server",
    "python3 -m http.server",
    "sensible-browser",
    "gnome-open",
    "kde-open",
    "/usr/bin/open",
]

# Comandi che richiedono cautela ma sono permessi (loggati)
CAUTIOUS_BASH_PATTERNS = [
    "rm -rf",
    "rm -r",
    "sudo",
]

# Permission modes (inspired by Claw Code)
PERMISSION_MODE = os.environ.get("LOBSTER_PERMISSION_MODE", "workspace-write")  # read-only | workspace-write | full-access

TOOL_PERMISSIONS = {
    "bash": "full-access",
    "read_file": "read-only",
    "write_file": "workspace-write",
    "edit_file": "workspace-write",
    "list_directory": "read-only",
    "search_files": "read-only",
    "glob_search": "read-only",
}

PERMISSION_LEVELS = {"read-only": 0, "workspace-write": 1, "full-access": 2}

def _check_permission(tool_name):
    """Check if current permission mode allows this tool. Returns None if OK, error string if blocked."""
    # Tool MCP esterni richiedono full-access (possono fare qualsiasi cosa)
    if _mcp_registry.is_mcp_tool(tool_name):
        required = "full-access"
    else:
        required = TOOL_PERMISSIONS.get(tool_name, "workspace-write")
    if PERMISSION_LEVELS.get(PERMISSION_MODE, 1) < PERMISSION_LEVELS.get(required, 1):
        return (
            f"🔒 PERMESSO NEGATO: il tool '{tool_name}' richiede modalità '{required}', "
            f"ma la modalità corrente è '{PERMISSION_MODE}'.\n"
            f"👉 Clicca sul badge 🔒 nella topbar per cambiare i permessi a '{required}' e riprova."
        )
    return None


def _is_path_protected_write(resolved_path: str) -> bool:
    """Controlla se un percorso è protetto da scrittura."""
    rp = resolved_path.rstrip("/")
    for protected in PROTECTED_WRITE_DIRS:
        if rp == protected or rp.startswith(protected + "/"):
            return True
    return False


def _is_path_protected_read(resolved_path: str) -> bool:
    """Controlla se un percorso è protetto anche da lettura."""
    rp = resolved_path.rstrip("/")
    for protected in PROTECTED_READ_DIRS:
        if rp == protected or rp.startswith(protected + "/"):
            return True
    for pattern in PROTECTED_FILES:
        if pattern in rp:
            return True
    return False


def _is_bash_dangerous(command: str):
    """Controlla se un comando bash è pericoloso. Ritorna motivo o None."""
    cmd_lower = command.lower().strip()
    # Check 1: pattern substring classico
    for pattern in DANGEROUS_BASH_PATTERNS:
        if pattern.lower() in cmd_lower:
            return f"Comando bloccato per sicurezza: contiene '{pattern}'"
    # Check 2: tokenizza con shlex per catturare bypass con spazi/tab extra
    try:
        tokens = shlex.split(command)
        if tokens:
            base_cmd = tokens[0].lower()
            # Blocca comandi distruttivi diretti
            if base_cmd in ("shutdown", "reboot", "halt", "poweroff", "mkfs", "launchctl", "csrutil", "nvram"):
                return f"Comando bloccato per sicurezza: '{base_cmd}'"
            # Blocca rm -rf su path critici
            if base_cmd == "rm" and any(f in tokens for f in ["-rf", "-fr"]):
                rm_targets = [t for t in tokens[1:] if not t.startswith("-")]
                for target in rm_targets:
                    if target in ("/", "/*", "~", "~/", "/System", "/usr", "/bin", "/etc", "/var"):
                        return f"Comando bloccato per sicurezza: rm ricorsivo su '{target}'"
            # Blocca bash -c con comandi pericolosi annidati
            if base_cmd in ("bash", "sh", "zsh") and "-c" in tokens:
                c_idx = tokens.index("-c")
                if c_idx + 1 < len(tokens):
                    nested = tokens[c_idx + 1]
                    nested_danger = _is_bash_dangerous_simple(nested)
                    if nested_danger:
                        return nested_danger
    except ValueError:
        pass  # shlex fallisce su quote non bilanciate — il check substring basta
    return None


def _is_bash_dangerous_simple(command: str):
    """Check semplice substring-only (per comandi annidati)."""
    cmd_lower = command.lower().strip()
    for pattern in DANGEROUS_BASH_PATTERNS:
        if pattern.lower() in cmd_lower:
            return f"Comando bloccato per sicurezza: contiene '{pattern}'"
    return None


def _bash_warning(command: str):
    """Ritorna un warning se il comando richiede cautela (ma viene eseguito)."""
    cmd_lower = command.lower().strip()
    for pattern in CAUTIOUS_BASH_PATTERNS:
        if pattern.lower() in cmd_lower:
            return f"[ATTENZIONE: comando con '{pattern}' eseguito]"
    return None


def execute_tool(name: str, arguments: dict) -> str:
    """Esegui un tool e restituisci il risultato come stringa."""
    # Anti-escalation: il modello NON può cambiare i propri permessi via tool call
    if name in ("set_permission", "set-permission", "grant_workspace", "revoke_workspace"):
        return "🛡️ BLOCCATO: il cambio permessi può essere fatto solo dall'utente tramite la UI."

    # Check permissions
    perm_error = _check_permission(name)
    if perm_error:
        return perm_error

    try:
        if name == "bash":
            return _run_bash(arguments.get("command", ""))
        elif name == "read_file":
            return _run_read_file(arguments.get("path", ""))
        elif name == "write_file":
            return _run_write_file(
                arguments.get("path", ""),
                arguments.get("content", "")
            )
        elif name == "edit_file":
            return _run_edit_file(
                arguments.get("path", ""),
                arguments.get("old_string", ""),
                arguments.get("new_string", "")
            )
        elif name == "list_directory":
            return _run_list_directory(arguments.get("path", "."))
        elif name == "search_files":
            return _run_search_files(
                arguments.get("pattern", ""),
                arguments.get("path", "."),
                arguments.get("file_pattern", "")
            )
        elif name == "glob_search":
            return _run_glob_search(
                arguments.get("pattern", ""),
                arguments.get("path", ".")
            )
        elif _mcp_registry.is_mcp_tool(name):
            return _mcp_registry.execute_mcp_tool(name, arguments)
        else:
            return f"Errore: tool sconosciuto '{name}'"
    except Exception as e:
        sys.stderr.write(f"[tool-error] {name}: {e}\n")
        return f"Errore nell'esecuzione di {name}: operazione non completata"


def _is_browser_open(command: str):
    """Controlla se un comando tenta di aprire browser/app. Ritorna motivo o None."""
    cmd_lower = command.lower().strip()
    # Blocca anche pipe verso open: "echo x | open" oppure "&& open"
    for pattern in BROWSER_OPEN_PATTERNS:
        if cmd_lower.startswith(pattern) or f"&& {pattern}" in cmd_lower or f"; {pattern}" in cmd_lower or f"| {pattern}" in cmd_lower:
            return f"Comando bloccato: non è permesso aprire applicazioni/browser ('{pattern.strip()}'). I file creati sono già visibili nella UI."
    return None


def _run_bash(command: str) -> str:
    if not command.strip():
        return "Errore: comando vuoto"

    # Sicurezza: blocca comandi pericolosi
    danger = _is_bash_dangerous(command)
    if danger:
        return f"🛡️ BLOCCATO: {danger}\nQuesto comando potrebbe danneggiare il sistema."

    # Blocca comandi che aprono browser/app
    browser = _is_browser_open(command)
    if browser:
        return f"🚫 {browser}"

    try:
        result = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True,
            timeout=120,
            cwd=WORKSPACE_ROOT
        )
        output = ""

        # Aggiungi warning se comando richiede cautela
        warning = _bash_warning(command)
        if warning:
            output += warning + "\n"

        if result.stdout:
            output += result.stdout
        if result.stderr:
            output += ("\n" if output else "") + f"[stderr] {result.stderr}"
        if result.returncode != 0:
            output += f"\n[exit code: {result.returncode}]"
        return output[:50000] if output else "(nessun output)"
    except subprocess.TimeoutExpired:
        return "Errore: il comando ha superato il timeout di 120 secondi"


def _run_read_file(path: str) -> str:
    resolved = resolve_path(path)

    # Sicurezza: blocca lettura file sensibili
    if _is_path_protected_read(resolved):
        return f"🛡️ BLOCCATO: non è permesso leggere file sensibili ({resolved})"

    try:
        # Lettura a chunk per evitare OOM su file enormi
        max_chars = 100000
        chunks = []
        total = 0
        with open(resolved, "r", encoding="utf-8", errors="replace") as f:
            while total < max_chars:
                chunk = f.read(min(8192, max_chars - total))
                if not chunk:
                    break
                chunks.append(chunk)
                total += len(chunk)
            # Controlla se c'è ancora contenuto (file più grande del limite)
            extra = f.read(1)
        content = "".join(chunks)
        if extra:
            content += f"\n\n[...troncato a {max_chars} caratteri]"
        return content if content else "(file vuoto)"
    except FileNotFoundError:
        return f"Errore: file non trovato: {resolved}"
    except IsADirectoryError:
        return f"Errore: '{resolved}' è una directory, usa list_directory"
    except PermissionError:
        return f"Errore: permessi insufficienti per leggere {resolved}"


def _run_write_file(path: str, content: str) -> str:
    resolved = resolve_path(path)

    # Sicurezza: blocca scrittura in directory di sistema
    if _is_path_protected_write(resolved):
        return f"🛡️ BLOCCATO: non è permesso scrivere in directory di sistema ({resolved})"

    # Sicurezza: in modalità workspace-write, la scrittura è consentita SOLO dentro workspace concessi
    if PERMISSION_MODE == "workspace-write" and not _is_path_in_granted_workspace(resolved):
        return (
            f"🔒 BLOCCATO: in modalità 'workspace-write' puoi scrivere solo dentro i workspace concessi.\n"
            f"Path richiesto: {resolved}\n"
            f"Workspace concessi: {', '.join(_get_granted_workspaces())}\n"
            f"👉 Concedi accesso alla cartella dalla sidebar Files, oppure passa a 'full-access'."
        )

    # Snapshot: salva stato precedente prima di sovrascrivere
    _snapshot_save_file(resolved)

    try:
        # Leggi contenuto precedente per generare diff
        old_content = ""
        is_new = True
        if os.path.isfile(resolved):
            is_new = False
            try:
                with open(resolved, "r", encoding="utf-8", errors="replace") as f:
                    old_content = f.read()
            except Exception:
                pass

        dir_path = os.path.dirname(resolved) or "."
        os.makedirs(dir_path, exist_ok=True)
        # Scrittura atomica: tempfile + os.replace per evitare data loss su disco pieno
        fd, tmp_path = tempfile.mkstemp(dir=dir_path, suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                f.write(content)
            os.replace(tmp_path, resolved)
        except Exception:
            try:
                os.remove(tmp_path)
            except OSError:
                pass
            raise

        # Track modification
        modified_files.append({
            "path": resolved,
            "action": "create" if is_new else "overwrite",
            "timestamp": time.time()
        })

        # Genera diff
        result = f"{'Creato' if is_new else 'Sovrascritto'}: {resolved} ({len(content)} caratteri)"
        if not is_new and old_content != content:
            diff_lines = list(difflib.unified_diff(
                old_content.splitlines(keepends=True),
                content.splitlines(keepends=True),
                fromfile=f"a/{os.path.basename(resolved)}",
                tofile=f"b/{os.path.basename(resolved)}",
                n=3
            ))
            if diff_lines:
                diff_text = "".join(diff_lines[:100])  # limita a 100 righe
                result += f"\n\n--- DIFF ---\n{diff_text}"
                if len(diff_lines) > 100:
                    result += f"\n... ({len(diff_lines) - 100} righe diff omesse)"
        return result
    except PermissionError:
        return f"Errore: permessi insufficienti per scrivere {resolved}"


def _run_edit_file(path: str, old_string: str, new_string: str) -> str:
    resolved = resolve_path(path)

    # Sicurezza: blocca modifica file di sistema
    if _is_path_protected_write(resolved):
        return f"🛡️ BLOCCATO: non è permesso modificare file di sistema ({resolved})"

    # Sicurezza: in modalità workspace-write, la modifica è consentita SOLO dentro workspace concessi
    if PERMISSION_MODE == "workspace-write" and not _is_path_in_granted_workspace(resolved):
        return (
            f"🔒 BLOCCATO: in modalità 'workspace-write' puoi modificare solo file dentro i workspace concessi.\n"
            f"Path richiesto: {resolved}\n"
            f"Workspace concessi: {', '.join(_get_granted_workspaces())}\n"
            f"👉 Concedi accesso alla cartella dalla sidebar Files, oppure passa a 'full-access'."
        )

    # Snapshot: salva stato precedente prima di modificare
    _snapshot_save_file(resolved)

    try:
        with open(resolved, "r", encoding="utf-8") as f:
            content = f.read()
    except FileNotFoundError:
        return f"Errore: file non trovato: {resolved}"

    count = content.count(old_string)
    if count == 0:
        return f"Errore: stringa non trovata nel file {resolved}"

    new_content = content.replace(old_string, new_string, 1)
    # Scrittura atomica
    dir_path = os.path.dirname(resolved) or "."
    fd, tmp_path = tempfile.mkstemp(dir=dir_path, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(new_content)
        os.replace(tmp_path, resolved)
    except Exception:
        try:
            os.remove(tmp_path)
        except OSError:
            pass
        raise

    # Track modification
    modified_files.append({
        "path": resolved,
        "action": "edit",
        "timestamp": time.time()
    })

    # Genera diff
    diff_lines = list(difflib.unified_diff(
        content.splitlines(keepends=True),
        new_content.splitlines(keepends=True),
        fromfile=f"a/{os.path.basename(resolved)}",
        tofile=f"b/{os.path.basename(resolved)}",
        n=3
    ))
    result = f"File modificato: {resolved} ({count} occorrenza/e trovata/e, prima sostituita)"
    if diff_lines:
        diff_text = "".join(diff_lines[:60])
        result += f"\n\n--- DIFF ---\n{diff_text}"
    return result


def _run_list_directory(path: str) -> str:
    resolved = resolve_path(path)
    if _is_path_protected_read(resolved):
        return f"🛡️ BLOCCATO: non è permesso elencare directory sensibili ({resolved})"
    try:
        entries = []
        for entry in sorted(os.listdir(resolved)):
            full_path = os.path.join(resolved, entry)
            if os.path.isdir(full_path):
                entries.append(f"  [DIR]  {entry}/")
            else:
                try:
                    size = os.path.getsize(full_path)
                    if size < 1024:
                        size_str = f"{size} B"
                    elif size < 1048576:
                        size_str = f"{size / 1024:.1f} KB"
                    else:
                        size_str = f"{size / 1048576:.1f} MB"
                    entries.append(f"  [FILE] {entry} ({size_str})")
                except OSError:
                    entries.append(f"  [FILE] {entry}")
        return f"Contenuto di {resolved}:\n" + "\n".join(entries) if entries else f"{resolved} è vuota"
    except FileNotFoundError:
        return f"Errore: directory non trovata: {resolved}"
    except NotADirectoryError:
        return f"Errore: '{resolved}' non è una directory"


def _run_search_files(pattern: str, path: str, file_pattern: str) -> str:
    resolved = resolve_path(path)
    cmd = ["grep", "-rn", "--color=never"]
    if file_pattern:
        cmd.extend(["--include", file_pattern])
    cmd.extend([pattern, resolved])

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30
        )
        output = result.stdout
        if len(output) > 50000:
            output = output[:50000] + "\n[...risultati troncati]"
        return output if output else f"Nessun risultato trovato per '{pattern}' in {resolved}"
    except subprocess.TimeoutExpired:
        return "Errore: ricerca interrotta (timeout)"


def _run_glob_search(pattern: str, path: str) -> str:
    """Cerca file tramite pattern glob."""
    resolved = resolve_path(path)
    if _is_path_protected_read(resolved):
        return f"🛡️ BLOCCATO: non è permesso cercare in directory sensibili ({resolved})"
    full_pattern = os.path.join(resolved, pattern)
    try:
        matches = sorted(_glob.glob(full_pattern, recursive=True))[:200]
        if not matches:
            return f"Nessun file trovato per il pattern '{pattern}' in {resolved}"
        # Make paths relative to resolved for readability
        results = []
        for m in matches:
            rel = os.path.relpath(m, resolved)
            is_dir = os.path.isdir(m)
            results.append(f"  {'[DIR] ' if is_dir else ''}{rel}")
        return f"Trovati {len(matches)} risultati per '{pattern}':\n" + "\n".join(results)
    except Exception as e:
        return f"Errore nella ricerca glob: {str(e)}"


# ---------------------------------------------------------------------------
# Agent Loop — comunicazione con Ollama
# ---------------------------------------------------------------------------

def call_ollama_streaming(model: str, messages: list, use_tools: bool = True):
    """
    Chiama Ollama /api/chat in streaming.
    Yield tuples: ("text", str) | ("tool_call", dict) | ("done", dict)
    """
    payload = {
        "model": model,
        "messages": messages,
        "stream": True,
    }
    if use_tools:
        # Combina tool nativi + tool MCP
        all_tools = TOOLS + _mcp_registry.get_ollama_tools()
        payload["tools"] = all_tools

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{OLLAMA_BASE}/api/chat",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            buffer = b""
            for chunk in iter(lambda: resp.read(4096), b""):
                buffer += chunk
                while b"\n" in buffer:
                    line, buffer = buffer.split(b"\n", 1)
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        obj = json.loads(line)
                    except json.JSONDecodeError:
                        continue

                    msg = obj.get("message", {})

                    # Tool calls
                    if msg.get("tool_calls"):
                        for tc in msg["tool_calls"]:
                            fn = tc.get("function", {})
                            yield ("tool_call", {
                                "name": fn.get("name", ""),
                                "arguments": fn.get("arguments", {})
                            })

                    # Testo
                    content = msg.get("content", "")
                    if content:
                        yield ("text", content)

                    # Fine
                    if obj.get("done", False):
                        yield ("done", obj)
                        return

    except urllib.error.URLError as e:
        yield ("text", f"\n\n❌ Errore di connessione a Ollama: {e}")
        yield ("done", {})


def call_ollama_pro_streaming(model: str, messages: list, use_tools: bool = True):
    """
    Chiama Ollama via Messages API (/v1/messages) in streaming SSE.
    Disponibile da Ollama v0.14+. Fornisce tool calling nativo senza fallback.
    Yield tuples: ("text", str) | ("tool_call", dict) | ("done", dict)
    """
    # Convert messages to /v1/messages format
    pro_messages = []
    system_content = ""
    for msg in messages:
        role = msg.get("role", "")
        if role == "system":
            system_content = msg.get("content", "")
            continue
        elif role == "user":
            pro_messages.append({"role": "user", "content": msg.get("content", "")})
        elif role == "assistant":
            content_blocks = []
            text = msg.get("content", "")
            if text:
                content_blocks.append({"type": "text", "text": text})
            # Add tool_use blocks if present
            for tc in msg.get("tool_calls", []):
                fn = tc.get("function", {})
                content_blocks.append({
                    "type": "tool_use",
                    "id": f"toolu_{int(time.time()*1000)}_{fn.get('name','')}",
                    "name": fn.get("name", ""),
                    "input": fn.get("arguments", {})
                })
            if content_blocks:
                pro_messages.append({"role": "assistant", "content": content_blocks})
        elif role == "tool":
            # Convert tool result to /v1/messages format
            pro_messages.append({
                "role": "user",
                "content": [{
                    "type": "tool_result",
                    "tool_use_id": f"toolu_result_{int(time.time()*1000)}",
                    "content": msg.get("content", "")
                }]
            })

    # Build /v1/messages-format tools
    pro_tools = []
    if use_tools:
        for t in TOOLS:
            fn = t.get("function", {})
            pro_tools.append({
                "name": fn.get("name", ""),
                "description": fn.get("description", ""),
                "input_schema": fn.get("parameters", {})
            })

    payload = {
        "model": model,
        "max_tokens": 4096,
        "messages": pro_messages,
        "stream": True,
    }
    if system_content:
        payload["system"] = system_content
    if pro_tools:
        payload["tools"] = pro_tools

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{OLLAMA_BASE}/v1/messages",
        data=data,
        headers={
            "Content-Type": "application/json",
            "anthropic-version": "2023-06-01",
        },
        method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            buffer = ""
            current_tool_name = ""
            current_tool_id = ""
            current_tool_json = ""

            for raw_chunk in iter(lambda: resp.read(4096), b""):
                buffer += raw_chunk.decode("utf-8", errors="replace")

                while "\n" in buffer:
                    line, buffer = buffer.split("\n", 1)
                    line = line.strip()

                    if not line or line.startswith(":"):
                        continue

                    if line.startswith("event:"):
                        continue

                    if line.startswith("data: "):
                        json_str = line[6:]
                        if json_str.strip() == "[DONE]":
                            yield ("done", {})
                            return

                        try:
                            event = json.loads(json_str)
                        except json.JSONDecodeError:
                            continue

                        event_type = event.get("type", "")

                        if event_type == "content_block_start":
                            block = event.get("content_block", {})
                            if block.get("type") == "tool_use":
                                current_tool_name = block.get("name", "")
                                current_tool_id = block.get("id", "")
                                current_tool_json = ""

                        elif event_type == "content_block_delta":
                            delta = event.get("delta", {})
                            delta_type = delta.get("type", "")

                            if delta_type == "text_delta":
                                text = delta.get("text", "")
                                if text:
                                    yield ("text", text)

                            elif delta_type == "input_json_delta":
                                current_tool_json += delta.get("partial_json", "")

                        elif event_type == "content_block_stop":
                            if current_tool_name:
                                try:
                                    args = json.loads(current_tool_json) if current_tool_json else {}
                                except json.JSONDecodeError:
                                    args = {}
                                yield ("tool_call", {
                                    "name": current_tool_name,
                                    "arguments": args,
                                    "id": current_tool_id
                                })
                                current_tool_name = ""
                                current_tool_id = ""
                                current_tool_json = ""

                        elif event_type == "message_stop":
                            yield ("done", {})
                            return

                    # Also handle NDJSON format (Ollama might use this instead of SSE)
                    elif line.startswith("{"):
                        try:
                            event = json.loads(line)
                            event_type = event.get("type", "")

                            # Same handling as above for NDJSON
                            if event_type == "content_block_start":
                                block = event.get("content_block", {})
                                if block.get("type") == "tool_use":
                                    current_tool_name = block.get("name", "")
                                    current_tool_id = block.get("id", "")
                                    current_tool_json = ""
                            elif event_type == "content_block_delta":
                                delta = event.get("delta", {})
                                if delta.get("type") == "text_delta":
                                    text = delta.get("text", "")
                                    if text:
                                        yield ("text", text)
                                elif delta.get("type") == "input_json_delta":
                                    current_tool_json += delta.get("partial_json", "")
                            elif event_type == "content_block_stop":
                                if current_tool_name:
                                    try:
                                        args = json.loads(current_tool_json) if current_tool_json else {}
                                    except json.JSONDecodeError:
                                        args = {}
                                    yield ("tool_call", {
                                        "name": current_tool_name,
                                        "arguments": args,
                                        "id": current_tool_id
                                    })
                                    current_tool_name = ""
                                    current_tool_id = ""
                                    current_tool_json = ""
                            elif event_type == "message_stop":
                                yield ("done", {})
                                return
                        except json.JSONDecodeError:
                            continue

    except urllib.error.HTTPError as e:
        if e.code == 404:
            # Ollama Pro API not available on this Ollama version
            yield ("text", "\n\n⚠️ Ollama Pro non disponibile. Aggiorna Ollama a v0.14+ o usa il motore nativo.")
        else:
            yield ("text", f"\n\n❌ Errore Ollama Pro: {e.code} {e.reason}")
        yield ("done", {})
    except urllib.error.URLError as e:
        yield ("text", f"\n\n❌ Errore connessione: {e}")
        yield ("done", {})


def call_claw_subprocess(model: str, messages: list, use_tools: bool = True):
    """
    Usa il binario Claw Code come motore. Offre permission system, MCP, LSP, plugin system.
    Yield tuples: ("text", str) | ("tool_call", dict) | ("done", dict)
    """
    if not os.path.isfile(CLAW_BINARY):
        yield ("text", f"⚠️ Binario claw non trovato: {CLAW_BINARY}\nCompila con: cd rust && cargo build --workspace")
        yield ("done", {})
        return

    # Get the last user message
    user_msg = ""
    for m in reversed(messages):
        if m.get("role") == "user":
            user_msg = m.get("content", "")
            break

    if not user_msg:
        yield ("text", "Nessun messaggio utente trovato.")
        yield ("done", {})
        return

    try:
        env = os.environ.copy()
        env["OPENAI_BASE_URL"] = f"{OLLAMA_BASE}/v1"
        env.pop("OPENAI_API_KEY", None)  # Ollama non richiede API key

        proc = subprocess.Popen(
            [CLAW_BINARY, "--model", model, "--output-format", "json",
             "--permission-mode", "workspace-write",
             "prompt", user_msg],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            cwd=WORKSPACE_ROOT,
            env=env,
        )

        for line in proc.stdout:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                msg_type = obj.get("type", "")
                if msg_type == "assistant":
                    text = obj.get("message", "")
                    if text:
                        yield ("text", text)
                elif msg_type == "tool_use":
                    yield ("tool_call", {
                        "name": obj.get("name", ""),
                        "arguments": obj.get("input", {})
                    })
                elif msg_type == "result":
                    text = obj.get("result", "")
                    if text:
                        yield ("text", f"\n📎 {text}")
            except json.JSONDecodeError:
                # Raw text output
                yield ("text", line)

        proc.wait(timeout=300)
        yield ("done", {})

    except FileNotFoundError:
        yield ("text", f"⚠️ Binario claw non trovato: {CLAW_BINARY}")
        yield ("done", {})
    except subprocess.TimeoutExpired:
        proc.kill()
        yield ("text", "\n❌ Timeout: il processo claw ha impiegato troppo tempo.")
        yield ("done", {})
    except Exception as e:
        yield ("text", f"\n❌ Errore claw: {str(e)}")
        yield ("done", {})


def _detect_best_engine():
    """Motore fisso: solo Ollama nativo (unico affidabile con tool calling)."""
    global ENGINE_MODE
    ENGINE_MODE = "ollama"
    return "ollama"

_active_engine = None  # Cache

def get_active_engine():
    global _active_engine
    if _active_engine is None:
        _active_engine = _detect_best_engine()
    return _active_engine


import re as _re


TOOL_NAMES = {t["function"]["name"] for t in TOOLS}


def _extract_text_tool_calls(text: str) -> list:
    """
    Fallback: estrai tool call scritti come JSON nel testo.
    Molti modelli locali non supportano il tool calling nativo e scrivono
    il JSON direttamente nel testo. Questa funzione li intercetta.
    Formati supportati:
      {"name": "bash", "arguments": {"command": "ls"}}
      ```json\n{"name": "bash", ...}\n```
    Usa un parser a conteggio parentesi per gestire JSON annidato.
    """
    found = []

    def _find_json_objects(s: str) -> list:
        """Trova tutti i blocchi JSON top-level bilanciati nel testo."""
        objects = []
        i = 0
        while i < len(s):
            if s[i] == '{':
                depth = 0
                start = i
                in_string = False
                escape_next = False
                while i < len(s):
                    c = s[i]
                    if escape_next:
                        escape_next = False
                    elif c == '\\' and in_string:
                        escape_next = True
                    elif c == '"' and not escape_next:
                        in_string = not in_string
                    elif not in_string:
                        if c == '{':
                            depth += 1
                        elif c == '}':
                            depth -= 1
                            if depth == 0:
                                objects.append(s[start:i+1])
                                break
                    i += 1
            i += 1
        return objects

    def _try_parse_tool_call(raw: str) -> dict:
        """Prova a parsare un blocco JSON come tool call."""
        try:
            obj = json.loads(raw)
            if isinstance(obj, dict) and obj.get("name") in TOOL_NAMES and "arguments" in obj:
                return {"name": obj["name"], "arguments": obj["arguments"]}
        except (json.JSONDecodeError, ValueError):
            pass
        return None

    # Pattern 1: blocchi ```json ... ``` o ``` ... ``` (priorità alta, meno ambiguo)
    code_blocks = _re.findall(r'```(?:json)?\s*(.*?)\s*```', text, _re.DOTALL)
    for block in code_blocks:
        for raw in _find_json_objects(block):
            tc = _try_parse_tool_call(raw)
            if tc and not any(f["name"] == tc["name"] and f["arguments"] == tc["arguments"] for f in found):
                found.append(tc)

    # Pattern 2: JSON inline nel testo (cerca tutti i { ... } bilanciati)
    for raw in _find_json_objects(text):
        tc = _try_parse_tool_call(raw)
        if tc and not any(f["name"] == tc["name"] and f["arguments"] == tc["arguments"] for f in found):
            found.append(tc)

    return found


def _looks_like_final_response(text: str) -> bool:
    """
    Euristica: se il testo sembra una risposta finale rivolta all'utente
    (non un tentativo di usare tool), ritorna True per evitare che il
    fallback text-tool-call lo catturi e il loop continui all'infinito.

    Strategia: contiamo i "segnali tool" vs i "segnali finale" e decidiamo
    in base al rapporto, non in base a singoli match fragili.
    """
    t = text.lower().strip()
    if not t:
        return True

    # ---- Segnali che indicano tool call intenzionale ----
    # Se il testo è SOLO un blocco JSON (magari con ```), è quasi certamente un tool call
    stripped = _re.sub(r'```(?:json)?\s*', '', t).strip().rstrip('`').strip()
    if stripped.startswith('{') and stripped.endswith('}') and len(stripped) < 2000:
        return False

    # Conta quanti tool call validi sono stati trovati
    tool_name_matches = sum(1 for name in TOOL_NAMES if f'"name": "{name}"' in t or f'"name":"{name}"' in t)

    # ---- Segnali che indicano risposta finale ----
    final_score = 0

    # Testo molto lungo con poco JSON → probabilmente spiega
    non_json_text = _re.sub(r'\{[^}]*\}', '', t)
    if len(non_json_text) > 300:
        final_score += 2

    # Frasi di chiusura (raggruppate per forza del segnale)
    strong_final = [
        "ho completato", "ho finito", "tutto fatto", "missione compiuta",
        "operazione completata", "ho terminato", "i've finished", "i've created",
        "completato con successo", "completa con successo",
    ]
    medium_final = [
        "ecco il risultato", "ecco cosa ho fatto", "fammi sapere", "let me know",
        "dimmi se", "se hai bisogno", "anything else", "is there anything",
        "posso aiutarti", "qualcos'altro", "buon lavoro", "happy coding",
        "in sintesi", "in summary", "riepilog", "riassumendo",
    ]
    weak_final = [
        "ho creato", "ho scritto", "è pronto", "sono pronto",
        "il file è stato", "è stato creato", "here is", "here's",
        "puoi trovare", "ora puoi", "adesso puoi",
    ]

    for phrase in strong_final:
        if phrase in t:
            final_score += 3
    for phrase in medium_final:
        if phrase in t:
            final_score += 2
    for phrase in weak_final:
        if phrase in t:
            final_score += 1

    # ---- Decisione ----
    # Se ci sono tool call espliciti, servono segnali finali molto forti
    if tool_name_matches > 0:
        return final_score >= 5  # servono almeno 2 segnali forti
    # Se non ci sono tool call nel testo, qualsiasi segnale basta
    return final_score >= 1


def run_agent_loop(model: str, messages: list, stream_callback):
    """
    Esegui l'agent loop completo.
    stream_callback(event_type, data) viene chiamato per ogni evento.
    event_type: "text" | "tool_start" | "tool_result" | "done" | "error"
    """
    # Crea snapshot all'inizio di ogni richiesta utente
    last_user_msg = ""
    for m in reversed(messages):
        if m.get("role") == "user":
            last_user_msg = m.get("content", "")[:60]
            break
    _create_snapshot(last_user_msg or "richiesta utente")

    turns = 0

    while turns < MAX_AGENT_TURNS:
        turns += 1
        collected_text = ""
        tool_calls = []
        got_tool_call = False

        engine = get_active_engine()
        if engine == "claw":
            # Claw handles its own agent loop
            for event_type, data in call_claw_subprocess(model, messages):
                stream_callback(event_type, data)
            return messages
        elif engine == "ollama-pro":
            stream_fn = call_ollama_pro_streaming
        else:
            stream_fn = call_ollama_streaming

        for event_type, data in stream_fn(model, messages):
            if event_type == "text":
                collected_text += data
                stream_callback("text", data)
            elif event_type == "tool_call":
                got_tool_call = True
                tool_calls.append(data)
            elif event_type == "done":
                pass

        # Fallback: se il modello non ha usato tool nativi,
        # cerca tool call scritti come JSON nel testo.
        # MA: solo se non sembra una risposta finale (il modello sta
        # parlando all'utente, non sta cercando di usare tool).
        if not got_tool_call and collected_text:
            text_tool_calls = _extract_text_tool_calls(collected_text)
            if text_tool_calls and not _looks_like_final_response(collected_text):
                got_tool_call = True
                tool_calls = text_tool_calls

        if not got_tool_call:
            # Nessun tool call — la risposta è completa
            if collected_text:
                messages.append({"role": "assistant", "content": collected_text})
            stream_callback("done", {})
            return messages

        # Aggiungi il messaggio assistant con i tool calls
        assistant_msg = {"role": "assistant", "content": collected_text or ""}
        # Ricostruisci il formato corretto con tool_call_id per correlazione
        assistant_msg["tool_calls"] = [
            {
                "id": f"call_{turns}_{i}",
                "function": {"name": tc["name"], "arguments": tc["arguments"]}
            }
            for i, tc in enumerate(tool_calls)
        ]
        messages.append(assistant_msg)

        # Esegui ogni tool call con error handling individuale
        for i, tc in enumerate(tool_calls):
            tool_name = tc["name"]
            tool_args = tc["arguments"]
            call_id = f"call_{turns}_{i}"

            # Notifica UI che stiamo eseguendo un tool
            stream_callback("tool_start", {
                "name": tool_name,
                "arguments": tool_args
            })

            # Esegui il tool con protezione errori
            try:
                result = execute_tool(tool_name, tool_args)
            except Exception as e:
                result = f"ERRORE nell'esecuzione di {tool_name}: {e}"

            # Notifica UI del risultato
            stream_callback("tool_result", {
                "name": tool_name,
                "result": result[:5000]  # limita per la UI
            })

            # Aggiungi il risultato ai messaggi con tool_call_id
            messages.append({
                "role": "tool",
                "tool_call_id": call_id,
                "content": result
            })

    stream_callback("error", "Raggiunto il limite massimo di turni agente")
    stream_callback("done", {})
    return messages


# ---------------------------------------------------------------------------
# HTTP Server
# ---------------------------------------------------------------------------

class AgentHandler(http.server.SimpleHTTPRequestHandler):
    """Handler HTTP che gestisce sia file statici che l'API agente."""

    def __init__(self, *args, directory=None, **kwargs):
        super().__init__(*args, directory=directory, **kwargs)

    def end_headers(self):
        """Disabilita cache per file HTML/JS/CSS per evitare versioni stale."""
        path = self.path or ""
        if path.endswith(('.html', '.js', '.css')) or path == "/" or path.startswith("/api/"):
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")
        super().end_headers()

    def _read_json_body(self, max_size=MAX_REQUEST_SIZE):
        """Leggi e parsa il body JSON con limite di dimensione. Ritorna (dict, None) o (None, error_sent)."""
        content_length = int(self.headers.get("Content-Length", 0))
        if content_length > max_size:
            self.send_error(413, "Request body troppo grande")
            return None
        if content_length < 0:
            self.send_error(400, "Content-Length non valido")
            return None
        body = self.rfile.read(content_length)
        try:
            return json.loads(body)
        except json.JSONDecodeError:
            self.send_error(400, "JSON non valido")
            return None

    def do_POST(self):
        if self.path == "/api/chat":
            self._handle_agent_chat()
        elif self.path == "/api/tags":
            self._proxy_to_ollama("/api/tags")
        elif self.path == "/api/pull-model":
            self._handle_pull_model()
        elif self.path == "/api/git-commit":
            self._handle_git_commit()
        elif self.path == "/api/rollback":
            self._handle_rollback()
        elif self.path == "/api/set-engine":
            self._handle_set_engine()
        elif self.path == "/api/set-permission":
            self._handle_set_permission()
        elif self.path == "/api/grant-workspace":
            self._handle_grant_workspace()
        elif self.path == "/api/revoke-workspace":
            self._handle_revoke_workspace()
        else:
            self.send_error(404, "Endpoint non trovato")

    def do_GET(self):
        parsed_url = urlparse(self.path)
        path_component = parsed_url.path
        query_params = parse_qs(parsed_url.query)

        if path_component == "/" or path_component == "/index.html":
            # Sia root che index.html → agente
            self.path = "/agent.html"
            super().do_GET()
        elif path_component == "/landing" or path_component == "/landing.html":
            # Landing page
            self.path = "/landing.html"
            super().do_GET()
        elif path_component == "/api/tags":
            self._proxy_to_ollama("/api/tags")
        elif path_component == "/api/workspace":
            self._handle_workspace_info()
        elif path_component == "/api/files":
            self._handle_list_files(query_params)
        elif path_component == "/api/file-content":
            self._handle_file_content(query_params)
        elif path_component == "/api/modified-files":
            self._handle_modified_files()
        elif path_component == "/api/setup-status":
            self._handle_setup_status()
        elif path_component == "/api/model-catalog":
            self._handle_model_catalog()
        elif path_component == "/api/download-status":
            self._handle_download_status(query_params)
        elif path_component == "/api/project-context":
            self._handle_project_context()
        elif path_component == "/api/mcp-status":
            self._handle_mcp_status()
        elif path_component == "/api/git-status":
            self._handle_git_status()
        elif path_component == "/api/git-log":
            self._handle_git_log()
        elif path_component == "/api/snapshots":
            self._handle_snapshots()
        elif path_component == "/api/session-memory":
            self._handle_session_memory()
        elif path_component == "/api/prompt-templates":
            self._handle_prompt_templates()
        elif path_component == "/api/granted-workspaces":
            self._handle_granted_workspaces()
        else:
            super().do_GET()

    def _handle_workspace_info(self):
        info = json.dumps({
            "workspace": WORKSPACE_ROOT,
            "path": WORKSPACE_ROOT,
            "model": DEFAULT_MODEL,
            "ollama_base": OLLAMA_BASE,
            "engine": get_active_engine(),
            "permission_mode": PERMISSION_MODE,
            "claw_available": os.path.isfile(CLAW_BINARY),
            "engines_available": {
                "ollama": True,
                "ollama-pro": get_active_engine() == "ollama-pro" or ENGINE_MODE == "ollama-pro",
                "claw": os.path.isfile(CLAW_BINARY)
            }
        })
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(info.encode())

    def _handle_set_engine(self):
        """Cambia il motore di esecuzione."""
        request = self._read_json_body()
        if request is None:
            return

        global _active_engine, ENGINE_MODE
        new_engine = request.get("engine", "")
        if new_engine not in ("ollama", "ollama-pro", "claw", "auto"):
            self.send_error(400, "Engine non valido. Usa: ollama, ollama-pro, claw, auto")
            return

        with _state_lock:
            if new_engine == "auto":
                _active_engine = None
                ENGINE_MODE = "auto"
                engine = get_active_engine()
            else:
                _active_engine = new_engine
                ENGINE_MODE = new_engine
                engine = new_engine

        response = json.dumps({"engine": engine, "success": True})
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(response.encode())

    def _handle_set_permission(self):
        """Cambia la modalità di permesso."""
        request = self._read_json_body()
        if request is None:
            return

        global PERMISSION_MODE
        new_mode = request.get("mode", "")
        if new_mode not in ("read-only", "workspace-write", "full-access"):
            self.send_error(400, "Modalità non valida. Usa: read-only, workspace-write, full-access")
            return

        with _state_lock:
            PERMISSION_MODE = new_mode
        response = json.dumps({"permission_mode": new_mode, "success": True})
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(response.encode())

    def _handle_list_files(self, query_params):
        """Browse a directory and list its contents (solo dentro workspace concessi)."""
        path = query_params.get("path", [""])[0] or "."
        resolved = resolve_path(path)

        # Verifica che il path sia in un workspace concesso
        if not _is_path_in_granted_workspace(resolved):
            self.send_error(403, "Accesso negato: questa directory non è in un workspace concesso")
            return

        try:
            if not os.path.isdir(resolved):
                self.send_error(404, "Directory non trovata")
                return

            entries = []
            for entry_name in os.listdir(resolved):
                full_path = os.path.join(resolved, entry_name)
                if os.path.isdir(full_path):
                    entries.append({
                        "name": entry_name,
                        "type": "directory"
                    })
                else:
                    try:
                        size = os.path.getsize(full_path)
                        entries.append({
                            "name": entry_name,
                            "type": "file",
                            "size": size
                        })
                    except OSError:
                        entries.append({
                            "name": entry_name,
                            "type": "file",
                            "size": 0
                        })

            # Sort: directories first, then files, both alphabetically
            directories = sorted([e for e in entries if e["type"] == "directory"], key=lambda x: x["name"])
            files = sorted([e for e in entries if e["type"] == "file"], key=lambda x: x["name"])
            sorted_entries = directories + files

            response = json.dumps({
                "path": resolved,
                "entries": sorted_entries
            })
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(response.encode())
        except PermissionError:
            self.send_error(403, "Permessi insufficienti")
        except Exception as e:
            sys.stderr.write(f"[list-files-error] {e}\n")
            self.send_error(500, "Errore interno nel listare i file")

    def _handle_file_content(self, query_params):
        """Read a file's content (solo dentro workspace concessi)."""
        path = query_params.get("path", [""])[0]
        if not path:
            self.send_error(400, "Parametro 'path' obbligatorio")
            return

        resolved = resolve_path(path)

        # Verifica che il file sia in un workspace concesso
        if not _is_path_in_granted_workspace(resolved):
            self.send_error(403, "Accesso negato: questo file non è in un workspace concesso")
            return

        try:
            if os.path.isdir(resolved):
                self.send_error(400, "Path è una directory, non un file")
                return

            if not os.path.isfile(resolved):
                self.send_error(404, "File non trovato")
                return

            # Check if binary file
            try:
                with open(resolved, "rb") as f:
                    header = f.read(512)
                    # Simple heuristic: if there are too many null bytes, it's binary
                    if header.count(b'\x00') > 0:
                        response = json.dumps({"error": "binary file"})
                        self.send_response(200)
                        self.send_header("Content-Type", "application/json")
                        self.send_header("Access-Control-Allow-Origin", "*")
                        self.end_headers()
                        self.wfile.write(response.encode())
                        return
            except Exception:
                pass

            # Read file content
            with open(resolved, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()

            # Limit to 100KB
            if len(content) > 102400:
                content = content[:102400]

            # Detect language from extension
            _, ext = os.path.splitext(resolved)
            language = "text"
            if ext:
                ext_lower = ext.lower()
                ext_to_lang = {
                    ".py": "python",
                    ".js": "javascript",
                    ".ts": "typescript",
                    ".jsx": "jsx",
                    ".tsx": "tsx",
                    ".java": "java",
                    ".c": "c",
                    ".cpp": "cpp",
                    ".cc": "cpp",
                    ".cxx": "cpp",
                    ".h": "c",
                    ".hpp": "cpp",
                    ".cs": "csharp",
                    ".rs": "rust",
                    ".go": "go",
                    ".rb": "ruby",
                    ".php": "php",
                    ".swift": "swift",
                    ".kt": "kotlin",
                    ".scala": "scala",
                    ".sh": "bash",
                    ".bash": "bash",
                    ".zsh": "zsh",
                    ".fish": "fish",
                    ".sql": "sql",
                    ".html": "html",
                    ".htm": "html",
                    ".xml": "xml",
                    ".json": "json",
                    ".yaml": "yaml",
                    ".yml": "yaml",
                    ".toml": "toml",
                    ".css": "css",
                    ".scss": "scss",
                    ".less": "less",
                    ".md": "markdown",
                    ".rst": "rst",
                    ".tex": "latex",
                }
                language = ext_to_lang.get(ext_lower, "text")

            response = json.dumps({
                "path": resolved,
                "content": content,
                "language": language
            })
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(response.encode())
        except PermissionError:
            self.send_error(403, "Permessi insufficienti")
        except Exception as e:
            sys.stderr.write(f"[file-content-error] {e}\n")
            self.send_error(500, "Errore interno nella lettura del file")

    def _handle_modified_files(self):
        """Return the list of modified files."""
        response = json.dumps(modified_files)
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(response.encode())

    def _handle_setup_status(self):
        """Stato del sistema: Ollama, RAM, modelli installati, modello consigliato."""
        ollama_ok = _check_ollama_running()
        ram_gb = _get_system_ram_gb()
        installed = _get_installed_models() if ollama_ok else []

        # Trova il modello consigliato in base alla RAM
        recommended = None
        for m in sorted(MODEL_CATALOG, key=lambda x: x["size_gb"], reverse=True):
            if ram_gb >= m["min_ram_gb"]:
                recommended = m["name"]
                break
        if not recommended and MODEL_CATALOG:
            recommended = MODEL_CATALOG[-1]["name"]  # il più leggero

        response = json.dumps({
            "ollama_running": ollama_ok,
            "ram_gb": round(ram_gb, 1),
            "installed_models": installed,
            "recommended_model": recommended,
            "has_models": len(installed) > 0,
            "ready": ollama_ok and len(installed) > 0
        })
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(response.encode())

    def _handle_model_catalog(self):
        """Catalogo modelli con stato installazione."""
        installed = _get_installed_models()
        catalog = []
        for m in MODEL_CATALOG:
            entry = dict(m)
            # Controlla se installato (match parziale per tag versione)
            entry["installed"] = any(
                m["name"] in inst or inst.startswith(m["name"].split(":")[0])
                for inst in installed
            )
            # Controlla se in download
            with _download_lock:
                dl = _download_status.get(m["name"])
            if dl:
                entry["download_status"] = dl["status"]
                entry["download_progress"] = dl["progress"]
            catalog.append(entry)

        response = json.dumps(catalog)
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(response.encode())

    def _handle_pull_model(self):
        """Avvia download di un modello in background."""
        request = self._read_json_body()
        if request is None:
            return

        model_name = request.get("model", "")
        if not model_name:
            self.send_error(400, "Campo 'model' richiesto")
            return

        # Controlla se già in download
        with _download_lock:
            if model_name in _download_status and _download_status[model_name]["status"] == "downloading":
                response = json.dumps({"status": "already_downloading"})
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(response.encode())
                return

        # Avvia download in thread separato
        t = threading.Thread(target=_pull_model_thread, args=(model_name,), daemon=True)
        t.start()

        response = json.dumps({"status": "started", "model": model_name})
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(response.encode())

    def _handle_download_status(self, query_params):
        """Stato download di un modello specifico o di tutti."""
        model = query_params.get("model", [""])[0]
        with _download_lock:
            if model:
                dl = _download_status.get(model, {"status": "none", "progress": ""})
                response = json.dumps(dl)
            else:
                response = json.dumps(_download_status)
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(response.encode())

    def _handle_mcp_status(self):
        """Ritorna stato dei server MCP."""
        status = _mcp_registry.get_status()
        response = json.dumps({"servers": status, "total_tools": sum(s["tools"] for s in status.values())})
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(response.encode())

    def _handle_project_context(self):
        """Ritorna contesto del progetto auto-rilevato."""
        ctx = get_project_context()
        response = json.dumps(ctx)
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(response.encode())

    def _handle_git_status(self):
        """Ritorna stato git del workspace."""
        try:
            # Check if inside a git repo (funziona anche in sottodirectory)
            is_repo = subprocess.run(
                ["git", "rev-parse", "--is-inside-work-tree"],
                capture_output=True, text=True, timeout=5, cwd=WORKSPACE_ROOT
            )
            if is_repo.returncode != 0:
                response = json.dumps({"is_repo": False})
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(response.encode())
                return

            branch = subprocess.run(
                ["git", "branch", "--show-current"],
                capture_output=True, text=True, timeout=5, cwd=WORKSPACE_ROOT
            ).stdout.strip()

            status = subprocess.run(
                ["git", "status", "--porcelain"],
                capture_output=True, text=True, timeout=5, cwd=WORKSPACE_ROOT
            ).stdout.strip()

            files = []
            for line in status.split("\n"):
                line = line.strip()
                if not line:
                    continue
                status_code = line[:2].strip()
                filename = line[3:]
                status_label = {"M": "modified", "A": "added", "D": "deleted",
                                "??": "untracked", "R": "renamed"}.get(status_code, status_code)
                files.append({"file": filename, "status": status_label, "code": status_code})

            response = json.dumps({
                "is_repo": True,
                "branch": branch or "HEAD",
                "dirty": len(files),
                "files": files[:50]
            })
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(response.encode())
        except Exception as e:
            sys.stderr.write(f"[git-status-error] {e}\n")
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": "Errore nel leggere lo stato git"}).encode())

    def _handle_git_log(self):
        """Ritorna gli ultimi commit."""
        try:
            result = subprocess.run(
                ["git", "log", "--oneline", "-20", "--format=%H|%h|%s|%an|%ar"],
                capture_output=True, text=True, timeout=5, cwd=WORKSPACE_ROOT
            )
            commits = []
            for line in result.stdout.strip().split("\n"):
                if "|" not in line:
                    continue
                parts = line.split("|", 4)
                if len(parts) >= 5:
                    commits.append({
                        "hash": parts[0], "short": parts[1],
                        "message": parts[2], "author": parts[3], "ago": parts[4]
                    })
            response = json.dumps({"commits": commits})
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(response.encode())
        except Exception as e:
            sys.stderr.write(f"[git-log-error] {e}\n")
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": "Errore nel leggere il log git"}).encode())

    def _handle_git_commit(self):
        """Esegui git add + commit."""
        request = self._read_json_body()
        if request is None:
            return

        message = request.get("message", "Lobster Code: auto-commit")
        try:
            # git add -A
            subprocess.run(["git", "add", "-A"],
                           capture_output=True, text=True, timeout=10, cwd=WORKSPACE_ROOT)
            # git commit
            result = subprocess.run(
                ["git", "commit", "-m", message],
                capture_output=True, text=True, timeout=10, cwd=WORKSPACE_ROOT
            )
            response = json.dumps({
                "success": result.returncode == 0,
                "output": result.stdout + result.stderr
            })
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(response.encode())
        except Exception as e:
            sys.stderr.write(f"[git-commit-error] {e}\n")
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": "Errore nel commit git"}).encode())

    def _handle_snapshots(self):
        """Lista snapshot disponibili."""
        snaps = _get_snapshots_list()
        response = json.dumps(snaps)
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(response.encode())

    def _handle_rollback(self):
        """Rollback a uno snapshot specifico."""
        request = self._read_json_body()
        if request is None:
            return

        snap_id = request.get("snapshot_id", "")
        if not snap_id:
            self.send_error(400, "Campo 'snapshot_id' richiesto")
            return

        result = _rollback_snapshot(snap_id)
        response = json.dumps(result)
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(response.encode())

    def _handle_session_memory(self):
        """Leggi/scrivi session memory (.lobster/context.md)."""
        mem_path = os.path.join(WORKSPACE_ROOT, ".lobster", "context.md")
        try:
            with _context_lock:
                if os.path.isfile(mem_path):
                    with open(mem_path, "r", encoding="utf-8") as f:
                        content = f.read()
                else:
                    content = ""
            response = json.dumps({"content": content, "path": mem_path})
        except Exception as e:
            response = json.dumps({"content": "", "error": "Impossibile leggere session memory"})
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(response.encode())

    def _handle_prompt_templates(self):
        """Ritorna prompt templates basati sullo stack rilevato."""
        ctx = get_project_context()
        templates = []

        # Templates universali (sempre presenti)
        templates.append({
            "icon": "📂", "label": "Esplora progetto",
            "prompt": "Esplora la struttura di questo progetto e dimmi cosa contiene, che stack usa, e suggerisci miglioramenti."
        })
        templates.append({
            "icon": "🐛", "label": "Trova bug",
            "prompt": "Analizza il codice in questo progetto e trova potenziali bug, errori logici o problemi di sicurezza."
        })
        templates.append({
            "icon": "📝", "label": "Genera README",
            "prompt": "Crea un README.md completo per questo progetto con installazione, uso, struttura e contribuzione."
        })
        templates.append({
            "icon": "🧪", "label": "Scrivi test",
            "prompt": "Analizza il codice e scrivi test automatici per le funzioni principali."
        })

        # Templates basati sullo stack
        stacks = set(ctx.get("stack", []))
        frameworks = set(ctx.get("frameworks", []))

        if "Node.js" in stacks:
            templates.append({
                "icon": "📦", "label": "Audit dipendenze",
                "prompt": "Controlla le dipendenze in package.json: cerca vulnerabilità note, dipendenze outdated e suggerisci aggiornamenti."
            })
        if "React" in frameworks or "Next.js" in frameworks or "Vue" in frameworks:
            templates.append({
                "icon": "🎨", "label": "Nuovo componente",
                "prompt": "Crea un nuovo componente riutilizzabile. Chiedimi che componente vuoi e lo creo con props tipizzate e stili."
            })
        if "Python" in stacks:
            templates.append({
                "icon": "🐍", "label": "Setup venv",
                "prompt": "Crea un virtual environment Python, installa le dipendenze e verifica che tutto funzioni."
            })
        if "Rust" in stacks:
            templates.append({
                "icon": "🦀", "label": "Cargo check",
                "prompt": "Esegui cargo check, cargo clippy e cargo test. Riporta errori e suggerisci fix."
            })
        if ctx.get("has_git"):
            templates.append({
                "icon": "📋", "label": "Genera changelog",
                "prompt": "Analizza i commit git recenti e genera un CHANGELOG.md formattato per l'ultimo release."
            })
        if "Docker" in stacks:
            templates.append({
                "icon": "🐳", "label": "Ottimizza Docker",
                "prompt": "Analizza il Dockerfile e suggerisci ottimizzazioni per dimensione dell'immagine, caching e sicurezza."
            })

        # Sempre
        templates.append({
            "icon": "🔄", "label": "Refactora",
            "prompt": "Analizza il codice e suggerisci refactoring per migliorare leggibilità, performance e manutenibilità. Poi esegui le modifiche."
        })
        templates.append({
            "icon": "🐳", "label": "Dockerizza",
            "prompt": "Crea un Dockerfile e docker-compose.yml per questo progetto con best practices."
        })

        response = json.dumps(templates)
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(response.encode())

    def _handle_granted_workspaces(self):
        """Lista workspace concessi."""
        workspaces = _get_granted_workspaces()
        items = []
        for ws in workspaces:
            try:
                name = os.path.basename(ws) or ws
                items.append({"path": ws, "name": name})
            except Exception:
                items.append({"path": ws, "name": ws})
        response = json.dumps({"workspaces": items})
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(response.encode())

    def _handle_grant_workspace(self):
        """Concedi accesso a una cartella."""
        request = self._read_json_body()
        if request is None:
            return
        path = request.get("path", "")
        if not path:
            self.send_error(400, "Campo 'path' richiesto")
            return
        result = _grant_workspace(path)
        response = json.dumps(result)
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(response.encode())

    def _handle_revoke_workspace(self):
        """Revoca accesso a una cartella."""
        request = self._read_json_body()
        if request is None:
            return
        path = request.get("path", "")
        if not path:
            self.send_error(400, "Campo 'path' richiesto")
            return
        result = _revoke_workspace(path)
        response = json.dumps(result)
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(response.encode())

    def _proxy_to_ollama(self, path):
        try:
            req = urllib.request.Request(f"{OLLAMA_BASE}{path}")
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = resp.read()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(data)
        except Exception as e:
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())

    def _handle_agent_chat(self):
        request = self._read_json_body()
        if request is None:
            return

        model = request.get("model", DEFAULT_MODEL)
        messages = request.get("messages", [])

        # Aggiungi system prompt se non presente
        if not messages or messages[0].get("role") != "system":
            # Inietta contesto progetto
            ctx = get_project_context()
            project_info = ""
            if ctx.get("stack"):
                project_info += f"\n\nCONTESTO PROGETTO (auto-rilevato):\n"
                project_info += f"- Stack: {', '.join(ctx['stack'])}\n"
                if ctx.get("languages"):
                    project_info += f"- Linguaggi: {', '.join(ctx['languages'])}\n"
                if ctx.get("frameworks"):
                    project_info += f"- Framework: {', '.join(ctx['frameworks'])}\n"
                if ctx.get("package_manager"):
                    project_info += f"- Package manager: {ctx['package_manager']}\n"
                if ctx.get("has_git"):
                    project_info += f"- Git: branch '{ctx.get('git_branch', '?')}'"
                    if ctx.get("git_dirty"):
                        project_info += f" ({ctx['git_dirty']} file modificati)"
                    project_info += "\n"
                if ctx.get("structure_summary"):
                    project_info += f"- Struttura: {ctx['structure_summary']}\n"
                project_info += "Usa queste informazioni per dare risposte coerenti con lo stack del progetto.\n"

            system_msg = {
                "role": "system",
                "content": (
                    f"Sei Lobster Code, un agente di sviluppo AI con accesso COMPLETO al computer dell'utente.\n"
                    f"Directory di lavoro: {WORKSPACE_ROOT}\n"
                    f"{project_info}\n"
                    f"HAI ACCESSO AI SEGUENTI TOOL — USALI SEMPRE:\n"
                    f"- bash(command): esegui QUALSIASI comando nella shell (ls, cat, mkdir, npm, pip, git, ecc.)\n"
                    f"- read_file(path): leggi il contenuto di qualsiasi file\n"
                    f"- write_file(path, content): crea o sovrascrivi un file\n"
                    f"- edit_file(path, old_text, new_text): modifica un file esistente\n"
                    f"- list_directory(path): elenca file e cartelle in una directory\n"
                    f"- search_files(pattern, path): cerca testo nei file\n"
                    f"- glob_search(pattern, path): trova file per pattern glob (es. '**/*.py')\n\n"
                    f"METODO DI LAVORO:\n"
                    f"1. Per task complessi (creare un progetto, refactoring, ecc.), prima ELENCA brevemente gli step che farai (es. '1. Creo struttura cartelle 2. Scrivo componenti 3. Aggiungo stili'), poi esegui.\n"
                    f"2. Per task semplici (leggere un file, eseguire un comando), esegui direttamente.\n"
                    f"3. Quando hai FINITO, scrivi un riepilogo breve e FERMATI. Non aggiungere extra.\n\n"
                    f"REGOLE FONDAMENTALI:\n"
                    f"1. Tu SEI un agente con accesso ai workspace concessi dall'utente. NON dire MAI che non puoi accedere ai file.\n"
                    f"2. Quando l'utente chiede di fare qualcosa, FALLO usando i tool. Non spiegare — ESEGUI.\n"
                    f"3. Rispondi SEMPRE con azioni concrete, MAI con spiegazioni teoriche.\n"
                    f"4. Se non sei sicuro di un percorso, usa list_directory per esplorare prima.\n"
                    f"5. Quando hai finito, scrivi un breve riepilogo e FERMATI. Non aggiungere azioni extra.\n\n"
                    f"LIMITI DI SICUREZZA (non aggirabili):\n"
                    f"- Puoi accedere SOLO ai workspace che l'utente ha esplicitamente concesso\n"
                    f"- Non puoi scrivere in /System, /Library, /usr, /bin, /sbin, /etc, /var, /Applications\n"
                    f"- Non puoi eseguire comandi distruttivi (rm -rf /, sudo rm, mkfs, dd, shutdown, reboot)\n"
                    f"- Non puoi leggere chiavi SSH, credenziali AWS, keychain\n\n"
                    f"DIVIETI ASSOLUTI:\n"
                    f"- NON usare 'open' per aprire file/URL nel browser.\n"
                    f"- NON lanciare server HTTP.\n"
                    f"- NON aprire applicazioni esterne.\n"
                    f"- Fai SOLO quello che l'utente ha chiesto.\n\n"
                    f"MOTORE: {get_active_engine()}\n"
                    f"Questa sessione utilizza il motore {get_active_engine()} di Lobster Code, basato sull'architettura Claw Code.\n\n"
                    f"Rispondi in italiano se l'utente scrive in italiano."
                )
            }

            # Inietta session memory se esiste
            mem_path = os.path.join(WORKSPACE_ROOT, ".lobster", "context.md")
            if os.path.isfile(mem_path):
                try:
                    with open(mem_path, "r", encoding="utf-8") as f:
                        mem_content = f.read()[:4000]
                    if mem_content.strip():
                        system_msg["content"] += (
                            f"\n\nMEMORIA DI SESSIONE (da .lobster/context.md):\n"
                            f"{mem_content}\n"
                            f"Usa queste informazioni per dare risposte coerenti con le sessioni precedenti."
                        )
                except Exception:
                    pass

            messages.insert(0, system_msg)

        # Setup streaming response
        self.send_response(200)
        self.send_header("Content-Type", "application/x-ndjson")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Transfer-Encoding", "chunked")
        self.end_headers()

        def stream_callback(event_type, data):
            try:
                event = {"type": event_type}
                if event_type == "text":
                    event["content"] = data
                elif event_type in ("tool_start", "tool_result"):
                    event.update(data)
                elif event_type == "error":
                    event["message"] = data

                line = json.dumps(event, ensure_ascii=False) + "\n"
                chunk = f"{len(line.encode()):x}\r\n{line}\r\n"
                self.wfile.write(chunk.encode())
                self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                pass

        try:
            run_agent_loop(model, messages, stream_callback)
            # Invia chunk finale
            end_chunk = "0\r\n\r\n"
            self.wfile.write(end_chunk.encode())
            self.wfile.flush()
        except Exception as e:
            stream_callback("error", str(e))
            stream_callback("done", {})

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def log_message(self, format, *args):
        # Log più pulito
        sys.stderr.write(f"[agent] {args[0]}\n")


def main():
    ui_dir = os.path.dirname(os.path.abspath(__file__))

    # Inizializza MCP servers (se configurati)
    _init_mcp()
    mcp_status = _mcp_registry.get_status()
    mcp_tool_count = sum(s["tools"] for s in mcp_status.values())

    handler = partial(AgentHandler, directory=ui_dir)

    server = http.server.HTTPServer(("0.0.0.0", SERVER_PORT), handler)
    mcp_line = ""
    if mcp_status:
        mcp_names = [f"{n} ({s['tools']} tools)" for n, s in mcp_status.items() if s["connected"]]
        mcp_line = f"\n  MCP:        {', '.join(mcp_names)}" if mcp_names else "\n  MCP:        nessun server connesso"
    print(f"""
🦞 Lobster Code Agent Server v1.1
══════════════════════════════════════
  Server:     http://localhost:{SERVER_PORT}
  Ollama:     {OLLAMA_BASE}
  Modello:    {DEFAULT_MODEL}
  Workspace:  {WORKSPACE_ROOT}
  Permessi:   {PERMISSION_MODE}
══════════════════════════════════════
  Tool nativi: bash, read_file, write_file, edit_file,
               list_directory, search_files, glob_search{mcp_line}
  Tool totali: {7 + mcp_tool_count}
══════════════════════════════════════
  Premi Ctrl+C per chiudere
""")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        _mcp_registry.shutdown_all()
        print("\n👋 Server arrestato")
        server.server_close()


if __name__ == "__main__":
    main()
