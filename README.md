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
- **Three execution engines** — Ollama Native, Ollama Pro (OpenAI-compatible), and Claw (Rust binary)
- **7 native tools** — `bash`, `read_file`, `write_file`, `edit_file`, `list_directory`, `search_files`, `glob_search`
- **Zero external dependencies** — Python stdlib only (no pip install required)

### Project DNA
Lobster Code automatically scans your project and builds a persistent DNA profile: stack, languages, frameworks, coding conventions (indentation, naming style, linter, formatter, TypeScript strict mode), test framework, CSS approach, API style, project structure, and entry points. This context is injected into every conversation so the agent always writes code that matches your project's style. The DNA is saved to `.lobster/project-dna.json` and auto-updates when your project changes.

### Smart Routing (Multi-Model Orchestration)
Route simple tasks (file reads, git status, quick questions) to a small fast model, and complex tasks (refactoring, new features, debugging) to a large powerful model — automatically. Saves GPU resources and speeds up simple interactions by 3-5x. Configurable via environment variables or the DNA tab toggle.

### Workflow Recipes
Pre-built and custom workflow recipes you can run with one click. Ships with 5 built-in recipes: Setup Next.js + Tailwind, Setup Python API (FastAPI), Add Tests, Migrate JS → TypeScript, Add Docker. Create your own recipes as JSON files in `.lobster/recipes/`. Recipes support variables, multi-step execution, and community sharing.

### Security & Isolation
- **Workspace grant system** — the agent can only access folders you explicitly allow
- **Permission levels** — read-only, workspace-write, or full-access modes
- **Protected paths** — `/System`, `/Library`, `/usr`, `/bin`, `/etc`, `/var` are always blocked
- **Command filtering** — destructive commands (`rm -rf /`, `sudo rm`, `mkfs`, etc.) are blocked
- **Atomic file writes** — changes use temp files + atomic rename to prevent corruption
- **Snapshot & rollback** — every file change is tracked; undo any modification instantly

### Developer Experience
- **Git integration** — status, diff, commit directly from the sidebar
- **Session memory** — persistent context across conversations via `.lobster/context.md`
- **File explorer** — browse, preview, and navigate project files in the sidebar
- **Keyboard shortcuts** — Ctrl/Cmd+Enter to send, Escape to close modals

## Quick Start

```bash
# 1. Make sure Ollama is running
ollama serve

# 2. Pull a coding model (see recommended models below)
ollama pull devstral

# 3. Clone and start
git clone https://github.com/SuperSapiensAi/LobsterCode.git
cd LobsterCode/ui
python3 agent_server.py
```

Open [http://localhost:8899](http://localhost:8899) in your browser. That's it.

## Recommended Models

| Model | Size | Best For | VRAM Needed | Command |
|-------|------|----------|-------------|---------|
| **Devstral** | 24B | Agentic coding, SWE-bench champion | 16GB+ | `ollama pull devstral` |
| **Qwen3-Coder** | 30B | Top coding agent performance | 20GB+ | `ollama pull qwen3-coder` |
| **Gemma 4** | 27B | All-round reasoning + coding | 18GB+ | `ollama pull gemma4` |
| **Qwen 2.5-Coder** | 32B | HumanEval 92.7%, great for code gen | 24GB+ | `ollama pull qwen2.5-coder:32b` |
| **Qwen 2.5-Coder** | 14B | Good balance of speed and quality | 10GB+ | `ollama pull qwen2.5-coder:14b` |
| **Gemma 4** | 12B | Fast, good for Smart Routing (small) | 8GB+ | `ollama pull gemma4:12b` |
| **Qwen 2.5-Coder** | 3B | Ultra-fast for simple tasks | 4GB+ | `ollama pull qwen2.5-coder:3b` |

**Smart Routing tip:** Set a small model (3B-12B) for simple tasks and a large model (24B-32B) for complex tasks. Enable Smart Routing in the DNA tab to auto-switch between them.

```bash
# Example: Smart Routing with Devstral + Gemma 4 12B
LOBSTER_MULTI_MODEL=true \
LOBSTER_LARGE_MODEL=devstral \
LOBSTER_SMALL_MODEL=gemma4:12b \
python3 agent_server.py
```

## Requirements

- **Python 3.8+** (no external packages needed)
- **Ollama** running locally on port 11434
- A coding model pulled in Ollama

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
        │  7 Tools   │ │  DNA  │ │  Recipes    │
        │  Filesystem│ │ Scan  │ │  Engine     │
        │  Bash Shell│ │ Cache │ │  5 built-in │
        └───────────┘ └───────┘ └─────────────┘
```

The server is a single Python file with zero dependencies. The UI is a single HTML file. The agent loops between the LLM and tool execution until the task is complete. Project DNA provides persistent context. Smart Routing picks the right model. Recipes automate common workflows.

## How It Compares

| Feature | Lobster Code | Cursor | Claude Code |
|---------|:---:|:---:|:---:|
| Free | ✅ | ❌ | ❌ |
| Local / Private | ✅ | ❌ | ❌ |
| Open Source | ✅ | ❌ | ❌ |
| No API Key | ✅ | ❌ | ❌ |
| Web UI | ✅ | ❌ | ❌ |
| Project DNA (auto-context) | ✅ | ❌ | ❌ |
| Smart Model Routing | ✅ | ❌ | ❌ |
| Workflow Recipes | ✅ | ❌ | ❌ |
| Workspace Isolation | ✅ | ❌ | ❌ |
| Snapshot Rollback | ✅ | ❌ | ❌ |
| Agentic Tools | ✅ | ✅ | ✅ |
| File Editing | ✅ | ✅ | ✅ |
| Terminal Access | ✅ | ✅ | ✅ |

## Configuration

All configuration is via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `CLAW_MODEL` | `qwen2.5-coder:14b` | Default model |
| `CLAW_WORKSPACE` | `~` | Default workspace path |
| `CLAW_PORT` | `8899` | Server port |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Ollama server URL |
| `LOBSTER_ENGINE` | `auto` | Engine: `ollama`, `ollama-pro`, `claw`, `auto` |
| `LOBSTER_MULTI_MODEL` | `false` | Enable Smart Routing |
| `LOBSTER_SMALL_MODEL` | `qwen2.5-coder:3b` | Model for simple tasks |
| `LOBSTER_LARGE_MODEL` | (same as CLAW_MODEL) | Model for complex tasks |

## Project Structure

```
LobsterCode/
├── ui/
│   ├── agent_server.py    # Backend server (Python stdlib only)
│   ├── agent.html         # Web UI (single file)
│   ├── landing.html       # Landing page
│   └── recipes/           # Built-in workflow recipes
├── rust/                  # Claw engine (Rust binary, optional)
├── LICENSE                # MIT
└── README.md
```

## Contributing

Contributions are welcome! This project is in active development. You can contribute recipes by adding JSON files to `ui/recipes/`.

## License

[MIT](./LICENSE) — use it however you want.

---

**Built by [SuperSapiens AI](https://github.com/SuperSapiensAi)**
Based on [Claw Code](https://github.com/ultraworkers/claw-code) by UltraWorkers.
