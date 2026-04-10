# 🦞 Lobster Code

**The open-source AI coding agent that runs entirely on your machine.**

Like Cursor and Claude Code — but free, local, and private. Powered by [Ollama](https://ollama.com).

<p align="center">
  <img src="assets/claw-hero.jpeg" alt="Lobster Code" width="300" />
</p>

## What is Lobster Code?

Lobster Code is a local AI coding agent with a web UI. It connects to Ollama running on your machine — no API keys, no cloud, no subscriptions. Your code never leaves your computer.

It gives you the same agentic coding experience as Cursor or Claude Code: the AI reads your files, writes code, runs commands, and iterates — all through a clean browser interface.

## Features

- **Three execution engines** — Ollama Native, Ollama Pro (OpenAI-compatible), and Claw (Rust binary)
- **7 native tools** — `bash`, `read_file`, `write_file`, `edit_file`, `list_directory`, `search_files`, `glob_search`
- **Workspace grant system** — the agent can only access folders you explicitly allow
- **Permission levels** — read-only, workspace-write, or full-access modes
- **Snapshot & rollback** — every file change is tracked; undo any modification instantly
- **Git integration** — status, diff, commit directly from the sidebar
- **Session memory** — persistent context across conversations via `.lobster/context.md`
- **Zero external dependencies** — Python stdlib only (no pip install required)
- **Built-in security** — protected system paths, dangerous command blocking, sanitized error output

## Quick Start

```bash
# 1. Make sure Ollama is running
ollama serve

# 2. Pull a coding model
ollama pull qwen2.5-coder:14b

# 3. Clone and start
git clone https://github.com/SuperSapiensAi/LobsterCode.git
cd LobsterCode/ui
python3 agent_server.py
```

Open [http://localhost:3456](http://localhost:3456) in your browser. That's it.

## Requirements

- **Python 3.8+** (no external packages needed)
- **Ollama** running locally on port 11434
- A coding model pulled in Ollama (recommended: `qwen2.5-coder:14b`)

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────┐
│  Browser UI  │────▶│  Python Server   │────▶│  Ollama │
│  (agent.html)│◀────│  (agent_server)  │◀────│  (local)│
└─────────────┘     └──────────────────┘     └─────────┘
                           │
                    ┌──────┴──────┐
                    │  7 Tools    │
                    │  Filesystem │
                    │  Bash Shell │
                    └─────────────┘
```

The server is a single Python file with zero dependencies. The UI is a single HTML file. The agent loops between the LLM and tool execution until the task is complete.

## How It Compares

| Feature | Lobster Code | Cursor | Claude Code |
|---------|:---:|:---:|:---:|
| Free | ✅ | ❌ | ❌ |
| Local/Private | ✅ | ❌ | ❌ |
| Open Source | ✅ | ❌ | ❌ |
| No API Key | ✅ | ❌ | ❌ |
| Web UI | ✅ | ❌ | ❌ |
| Agentic Tools | ✅ | ✅ | ✅ |
| File Editing | ✅ | ✅ | ✅ |
| Terminal Access | ✅ | ✅ | ✅ |

## Project Structure

```
LobsterCode/
├── ui/
│   ├── agent_server.py    # Backend server (Python stdlib only)
│   ├── agent.html         # Web UI (single file)
│   └── landing.html       # Landing page
├── rust/                  # Claw engine (Rust binary, optional)
├── LICENSE                # MIT
└── README.md
```

## Security

Lobster Code takes security seriously:

- **Workspace isolation** — the agent can only access folders you explicitly grant
- **Protected paths** — `/System`, `/Library`, `/usr`, `/bin`, `/etc`, `/var` are always blocked
- **Command filtering** — destructive commands (`rm -rf /`, `sudo rm`, `mkfs`, etc.) are blocked
- **Atomic file writes** — changes use temp files + atomic rename to prevent corruption
- **Snapshot system** — every modification is tracked for instant rollback

## Contributing

Contributions are welcome! This project is in active development.

## License

[MIT](./LICENSE) — use it however you want.

---

**Built by [SuperSapiens AI](https://github.com/SuperSapiensAi)**
Based on [Claw Code](https://github.com/ultraworkers/claw-code) by UltraWorkers.
