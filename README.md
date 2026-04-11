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

### Core Agent
- **Multi-turn agent loop** — executes up to 10 consecutive tool-calling turns to complete complex tasks autonomously
- **7 native tools** — `bash`, `read_file`, `write_file`, `edit_file`, `list_directory`, `search_files`, `glob_search`
- **Streaming responses** — real-time output via Server-Sent Events with typewriter animation
- **Zero external dependencies** — Python stdlib only (no pip install required)

### Project DNA
Lobster Code automatically scans your project and builds a context profile: stack, languages, frameworks, git status, and project structure. This context is injected into every conversation so the agent always writes code that matches your project. Detects Node.js, Python, Rust, Go, Docker, and frameworks like React, Vue, Next.js, Angular, Express, FastAPI, Django.

### Stack-Aware Prompt Templates
14 pre-built prompt templates that adapt to your detected stack. Working on React? You get component scaffolding suggestions. Python project? Virtual env setup and test commands are ready. Zero configuration needed.

### MCP (Model Context Protocol)
Connect external tools via MCP — databases, GitHub, Slack, browsers, and more. Configure servers in `.lobster/mcp.json`:
```json
{
  "mcp_servers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {"GITHUB_TOKEN": "..."}
    }
  }
}
```
MCP tools appear alongside native tools — Ollama uses them like any other tool. Zero code changes needed.

### Security & Isolation
- **Workspace grant system** — the agent can only access folders you explicitly allow
- **3 permission levels** — read-only, workspace-write, or full-access modes
- **Protected paths** — `/System`, `/Library`, `/usr`, `/bin`, `/etc`, `/var` are always blocked
- **Command filtering** — destructive commands (`rm -rf /`, `sudo rm`, `mkfs`, etc.) are blocked
- **Atomic file writes** — changes use temp files + atomic rename to prevent corruption
- **Snapshot & rollback** — every file change is tracked; undo any modification instantly

### Developer Experience
- **Git integration** — status, log, diff, commit directly from the sidebar
- **Session memory** — persistent context across sessions via `.lobster/context.md`
- **File explorer** — browse, preview with syntax highlighting (30+ languages) in the sidebar
- **Diff preview** — every file modification shows a unified diff before and after
- **Setup wizard** — checks Ollama, verifies RAM, recommends and downloads the best model
- **Chat history** — persistent sessions with auto-generated titles
- **4 sidebar tabs** — Chat, Files, Git, Modified files

## Quick Start

```bash
# 1. Make sure Ollama is running
ollama serve

# 2. Pull a coding model
ollama pull gemma4:latest

# 3. Clone and start
git clone https://github.com/SuperSapiensAi/LobsterCode.git
cd LobsterCode/ui
python3 agent_server.py
```

Open [http://localhost:8899](http://localhost:8899) in your browser. That's it.

## Recommended Models

| Model | Size | Best For | VRAM Needed | Command |
|-------|------|----------|-------------|---------|
| **Gemma 4** | 12B | Default, excellent all-round + tool calling | 8GB+ | `ollama pull gemma4:latest` |
| **Qwen 3** | 8B | Fast reasoning + tool calling | 6GB+ | `ollama pull qwen3:8b` |
| **Qwen 2.5-Coder** | 14B | Best pure coding performance | 10GB+ | `ollama pull qwen2.5-coder:14b` |
| **Qwen 2.5-Coder** | 7B | Lightweight, fast coding | 5GB+ | `ollama pull qwen2.5-coder:7b` |
| **Llama 3.3** | 70B | Most capable, deep reasoning | 40GB+ | `ollama pull llama3.3:70b` |
| **Mistral** | 7B | Versatile, fast, native tool calling | 5GB+ | `ollama pull mistral` |

All listed models support **native tool calling**, required for the agent loop. The setup wizard recommends the best model based on your available RAM.

## Requirements

- **Python 3.8+** (no external packages needed)
- **Ollama 0.20+** running locally on port 11434
- A model with tool calling support pulled in Ollama

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────┐
│  Browser UI  │────▶│  Python Server   │────▶│  Ollama │
│  (agent.html)│◀────│  (agent_server)  │◀────│  (local)│
└─────────────┘     └──────────────────┘     └─────────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        ┌─────┴─────┐ ┌───┴───┐ ┌──────┴──────┐
        │  7 Tools   │ │  DNA  │ │  MCP / Ext  │
        │  Filesystem│ │ Scan  │ │  Tools      │
        │  Bash Shell│ │ Stack │ │  Security   │
        └───────────┘ └───────┘ └─────────────┘
```

The server is a single Python file with zero dependencies. The UI is a single HTML file. The agent loops between the LLM and tool execution (up to 10 turns) until the task is complete. Project DNA provides persistent context. Snapshots protect your files.

## How It Compares

| Feature | Lobster Code | Cursor | Claude Code |
|---------|:---:|:---:|:---:|
| Free | ✅ | ❌ | ❌ |
| Local / Private | ✅ | ❌ | ❌ |
| Open Source | ✅ | ❌ | ❌ |
| No API Key | ✅ | ❌ | ❌ |
| Web UI | ✅ | ❌ | ❌ |
| Project DNA (auto-context) | ✅ | ❌ | ❌ |
| Snapshot Rollback | ✅ | ❌ | ❌ |
| Workspace Isolation | ✅ | ❌ | ❌ |
| MCP / Extensibility | ✅ | ❌ | ✅ |
| Agentic Tools | ✅ | ✅ | ✅ |
| File Editing | ✅ | ✅ | ✅ |
| Terminal Access | ✅ | ✅ | ✅ |

## Configuration

All configuration is via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `CLAW_MODEL` | `gemma4:latest` | Default model |
| `CLAW_WORKSPACE` | `~` | Default workspace path |
| `CLAW_PORT` | `8899` | Server port |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Ollama server URL |

MCP servers are configured in `.lobster/mcp.json` in your workspace — same format as Claude's MCP config.

## Project Structure

```
LobsterCode/
├── ui/
│   ├── agent_server.py    # Backend server (Python stdlib only)
│   ├── agent.html         # Web UI (single file)
│   ├── landing.html       # Landing page
│   └── start-agent.command # Quick launcher
├── index.html             # GitHub Pages (lobstercode.net)
├── CNAME                  # Custom domain config
├── LICENSE                # MIT
└── README.md
```

## Contributing

Contributions are welcome! This project is in active development.

## License

[MIT](./LICENSE) — use it however you want.

---

**Built by [SuperSapiens AI](https://github.com/SuperSapiensAi)**
