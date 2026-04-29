// ============================================================
// LOBSTER UTILITY — LobsterCode Service (Native Ollama Chat)
// Chat AI integrata con tool-calling per coding assistant.
// Con Permission System, Multi-Session, Snapshots, Git, ProjectDNA
// ============================================================

import { EventEmitter } from 'events';
import { exec, execFile, execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as http from 'http';

// ─── Types ──────────────────────────────────────────────

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: string;
      properties: Record<string, any>;
      required?: string[];
    };
  };
}

export interface ChatStreamEvent {
  type: 'text' | 'tool_start' | 'tool_result' | 'error' | 'done';
  content?: string;
  tool_name?: string;
  tool_args?: any;
  tool_output?: string;
}

export type PermissionMode = 'read-only' | 'workspace-write' | 'full-access';

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  model: string;
  createdAt: number;
}

export interface Snapshot {
  id: number;
  timestamp: string;
  label: string;
  files: Map<string, string | null>;
}

export interface ModifiedFile {
  path: string;
  action: 'create' | 'edit' | 'overwrite';
  timestamp: string;
}

export interface ProjectDNA {
  languages: string[];
  frameworks: string[];
  packageManager: string;
  hasDocker: boolean;
  hasGit: boolean;
  gitBranch: string;
  gitDirty: number;
  structure: { dirs: string[]; files: string[] };
}

export interface GitStatus {
  isRepo: boolean;
  branch: string;
  dirty: number;
  files: { path: string; status: string }[];
}

export interface GitCommit {
  short: string;
  message: string;
  author: string;
  ago: string;
}

export interface PromptTemplate {
  id: string;
  icon: string;
  title: string;
  prompt: string;
  stacks?: string[];
}

export interface LobsterCodeStatus {
  available: boolean;
  models: string[];
  workspace: string;
  model: string;
  permissionMode: PermissionMode;
  sessionCount: number;
  currentSessionId: string | null;
  projectDNA: ProjectDNA | null;
}

// ─── Constants ──────────────────────────────────────────

const PERMISSION_LEVELS: Record<PermissionMode, number> = {
  'read-only': 0,
  'workspace-write': 1,
  'full-access': 2,
};

const TOOL_PERMISSIONS: Record<string, PermissionMode> = {
  read_file: 'read-only',
  list_directory: 'read-only',
  search_files: 'read-only',
  glob_search: 'read-only',
  write_file: 'workspace-write',
  edit_file: 'workspace-write',
  bash: 'workspace-write',
};

const PROTECTED_WRITE_DIRS = ['/System', '/Library', '/usr', '/bin', '/sbin', '/private', '/etc', '/var', '/opt', '/Applications'];

const DANGEROUS_PATTERNS = ['rm -rf /', 'rm -rf /*', 'mkfs', 'dd if=/dev', ':(){', 'shutdown', 'reboot', 'halt', 'chmod -R 777 /'];

// ─── Tool Definitions ───────────────────────────────────

const TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'bash',
      description: 'Esegui un comando shell nel workspace corrente. Usalo per installare pacchetti, eseguire script, compilare, testare.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Il comando shell da eseguire' },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Leggi il contenuto di un file. Restituisce il testo del file con numeri di riga.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Percorso del file da leggere (relativo al workspace)' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Scrivi un file nel workspace. Crea il file se non esiste, sovrascrive se esiste. Crea le directory intermedie.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Percorso del file' },
          content: { type: 'string', description: 'Contenuto completo del file' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description: 'Modifica un file sostituendo una stringa esatta con una nuova. La stringa deve essere unica nel file.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Percorso del file' },
          old_text: { type: 'string', description: 'Testo esatto da sostituire' },
          new_text: { type: 'string', description: 'Nuovo testo' },
        },
        required: ['path', 'old_text', 'new_text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description: 'Elenca file e cartelle in una directory.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Percorso della directory (default: workspace root)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_files',
      description: 'Cerca un pattern (regex) nei file del workspace. Come grep.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Pattern regex da cercare' },
          path: { type: 'string', description: 'Directory dove cercare (default: workspace root)' },
        },
        required: ['pattern'],
      },
    },
  },
];

// ─── Utility Functions ───────────────────────────────────

function resolvePath(workspace: string, filePath: string): string {
  const resolved = path.isAbsolute(filePath) ? path.resolve(filePath) : path.resolve(workspace, filePath);
  // Security: ensure resolved path stays within workspace (prevent path traversal)
  const normalizedWorkspace = path.resolve(workspace) + path.sep;
  const normalizedResolved = path.resolve(resolved);
  if (!normalizedResolved.startsWith(normalizedWorkspace) && normalizedResolved !== path.resolve(workspace)) {
    throw new Error(`ERRORE SICUREZZA: Accesso fuori dal workspace negato: ${filePath}`);
  }
  return normalizedResolved;
}

function sanitizeShellArg(arg: string): string {
  // Remove any shell metacharacters to prevent injection
  return arg.replace(/[`$\\;"'|&<>(){}!\n\r]/g, '');
}

function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateSnapshotId(): number {
  return Date.now();
}

// ─── Permission & Security Checks ──────────────────────

function checkPermission(toolName: string, currentMode: PermissionMode): string | null {
  const required = TOOL_PERMISSIONS[toolName];
  if (!required) return null;
  const currentLevel = PERMISSION_LEVELS[currentMode];
  const requiredLevel = PERMISSION_LEVELS[required];
  if (currentLevel < requiredLevel) {
    return `🔒 PERMESSO NEGATO: il tool '${toolName}' richiede modalità '${required}', attualmente in '${currentMode}'.`;
  }
  return null;
}

function isProtectedPath(resolvedPath: string): boolean {
  for (const dir of PROTECTED_WRITE_DIRS) {
    if (resolvedPath.startsWith(dir)) return true;
  }
  return false;
}

// ─── Tool Execution ─────────────────────────────────────

async function executeTool(
  name: string,
  args: Record<string, any>,
  workspace: string,
  permissionMode: PermissionMode,
  onSnapshot?: (label: string, filePath?: string) => Promise<void>
): Promise<string> {
  // Block permission-related tool calls
  if (name.toLowerCase().includes('permission') || name.toLowerCase().includes('grant')) {
    return '🔒 BLOCCO SICUREZZA: Non puoi modificare i permessi tramite tool.';
  }

  // Check permission
  const permError = checkPermission(name, permissionMode);
  if (permError) {
    return permError;
  }

  try {
    switch (name) {
      case 'bash': {
        const cmd = args.command || '';
        if (DANGEROUS_PATTERNS.some((d) => cmd.includes(d))) {
          return 'ERRORE: Comando potenzialmente distruttivo bloccato.';
        }
        return new Promise((resolve) => {
          exec(cmd, { cwd: workspace, timeout: 30000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
            let result = '';
            if (stdout) result += stdout;
            if (stderr) result += (result ? '\n' : '') + stderr;
            if (err && !result) result = `Errore: ${err.message}`;
            resolve(result.slice(0, 10000) || '(nessun output)');
          });
        });
      }

      case 'read_file': {
        let filePath: string;
        try {
          filePath = resolvePath(workspace, args.path);
        } catch (e: any) {
          return e.message;
        }
        try {
          await fs.promises.access(filePath);
        } catch {
          return `ERRORE: File non trovato: ${args.path}`;
        }
        const content = await fs.promises.readFile(filePath, 'utf-8');
        const lines = content.split('\n');
        const numbered = lines.map((l, i) => `${i + 1}\t${l}`).join('\n');
        return numbered.slice(0, 20000);
      }

      case 'write_file': {
        let filePath: string;
        try {
          filePath = resolvePath(workspace, args.path);
        } catch (e: any) {
          return e.message;
        }
        if (isProtectedPath(filePath)) {
          return `ERRORE SICUREZZA: Non puoi scrivere in directory protette: ${args.path}`;
        }
        if (onSnapshot) {
          await onSnapshot(`Pre write_file: ${args.path}`, filePath);
        }
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(filePath, args.content, 'utf-8');
        return `File scritto: ${args.path} (${args.content.length} bytes)`;
      }

      case 'edit_file': {
        let filePath: string;
        try {
          filePath = resolvePath(workspace, args.path);
        } catch (e: any) {
          return e.message;
        }
        if (isProtectedPath(filePath)) {
          return `ERRORE SICUREZZA: Non puoi modificare file in directory protette: ${args.path}`;
        }
        if (!fs.existsSync(filePath)) return `ERRORE: File non trovato: ${args.path}`;
        if (onSnapshot) {
          await onSnapshot(`Pre edit_file: ${args.path}`, filePath);
        }
        const content = fs.readFileSync(filePath, 'utf-8');
        if (!content.includes(args.old_text)) {
          return `ERRORE: Testo non trovato nel file. Verifica che old_text sia esatto.`;
        }
        const count = content.split(args.old_text).length - 1;
        if (count > 1) {
          return `ERRORE: old_text trovato ${count} volte. Deve essere unico. Aggiungi più contesto.`;
        }
        const newContent = content.replace(args.old_text, args.new_text);
        fs.writeFileSync(filePath, newContent, 'utf-8');
        return `File modificato: ${args.path}`;
      }

      case 'list_directory': {
        let dirPath: string;
        try {
          dirPath = resolvePath(workspace, args.path || '.');
        } catch (e: any) {
          return e.message;
        }
        try {
          await fs.promises.access(dirPath);
        } catch {
          return `ERRORE: Directory non trovata: ${args.path}`;
        }
        const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
        return entries
          .filter((e) => !e.name.startsWith('.') || e.name === '.env')
          .map((e) => `${e.isDirectory() ? '📁' : '📄'} ${e.name}`)
          .join('\n') || '(directory vuota)';
      }

      case 'search_files': {
        let searchPath: string;
        try {
          searchPath = resolvePath(workspace, args.path || '.');
        } catch (e: any) {
          return e.message;
        }
        const safePattern = sanitizeShellArg(args.pattern || '');
        if (!safePattern) return 'ERRORE: Pattern di ricerca non valido.';
        return new Promise((resolve) => {
          execFile(
            'grep',
            ['-rn', '--include=*.ts', '--include=*.tsx', '--include=*.js', '--include=*.jsx',
             '--include=*.py', '--include=*.rs', '--include=*.go', '--include=*.json',
             '--include=*.md', '--include=*.html', '--include=*.css', '--include=*.toml',
             '--include=*.yaml', '--include=*.yml',
             '-e', safePattern, searchPath],
            { timeout: 10000, maxBuffer: 512 * 1024 },
            (err, stdout) => {
              const lines = (stdout || '').split('\n').slice(0, 50).join('\n');
              resolve(lines.slice(0, 10000) || 'Nessun risultato trovato.');
            }
          );
        });
      }

      default:
        return `Tool sconosciuto: ${name}`;
    }
  } catch (err: any) {
    return `ERRORE nell'esecuzione di ${name}: ${err.message}`;
  }
}

// ─── Git Operations ─────────────────────────────────────

async function getGitStatus(workspace: string): Promise<GitStatus> {
  return new Promise((resolve) => {
    try {
      const isRepo = fs.existsSync(path.join(workspace, '.git'));
      if (!isRepo) {
        resolve({ isRepo: false, branch: '', dirty: 0, files: [] });
        return;
      }

      let branch = '';
      let dirty = 0;
      let files: { path: string; status: string }[] = [];

      exec('git branch --show-current', { cwd: workspace }, (err, stdout) => {
        if (!err) branch = stdout.trim();

        exec('git status --porcelain', { cwd: workspace }, (err, stdout) => {
          if (!err && stdout) {
            const lines = stdout.trim().split('\n').filter(Boolean);
            dirty = lines.length;
            files = lines.map((line) => ({
              path: line.slice(3),
              status: line.slice(0, 2),
            }));
          }

          resolve({ isRepo, branch, dirty, files });
        });
      });
    } catch {
      resolve({ isRepo: false, branch: '', dirty: 0, files: [] });
    }
  });
}

async function getGitLog(workspace: string, count: number = 10): Promise<GitCommit[]> {
  return new Promise((resolve) => {
    const cmd = `git log --oneline -${count} --format="%h|%s|%an|%ar" 2>/dev/null || echo ""`;
    exec(cmd, { cwd: workspace }, (err, stdout) => {
      const commits: GitCommit[] = [];
      if (stdout) {
        stdout.trim().split('\n').forEach((line) => {
          if (line) {
            const [short, message, author, ago] = line.split('|');
            commits.push({ short, message, author, ago });
          }
        });
      }
      resolve(commits);
    });
  });
}

async function gitCommit(workspace: string, message: string): Promise<string> {
  const { execFile } = require('child_process');
  return new Promise((resolve) => {
    // Step 1: git add -A
    execFile('git', ['add', '-A'], { cwd: workspace }, (addErr: any) => {
      if (addErr) {
        resolve(`ERRORE git add: ${addErr.message}`);
        return;
      }
      // Step 2: git commit -m (safe from injection — message passed as array arg)
      execFile('git', ['commit', '-m', message], { cwd: workspace }, (err: any, stdout: string, stderr: string) => {
        if (err) {
          resolve(`ERRORE: ${stderr || err.message}`);
        } else {
          resolve(stdout || 'Commit effettuato');
        }
      });
    });
  });
}

async function gitDiff(workspace: string, file?: string): Promise<string> {
  return new Promise((resolve) => {
    const args = file ? ['diff', '--', file] : ['diff'];
    execFile('git', args, { cwd: workspace }, (err, stdout) => {
      resolve(stdout?.slice(0, 20000) || 'Nessuna differenza');
    });
  });
}

async function gitInit(workspace: string): Promise<string> {
  return new Promise((resolve) => {
    exec('git init', { cwd: workspace }, (err, stdout, stderr) => {
      if (err) {
        resolve(`ERRORE: ${stderr || err.message}`);
      } else {
        resolve(stdout || 'Repository Git inizializzato');
      }
    });
  });
}

// ─── Project DNA Detection ──────────────────────────────

async function detectProjectDNA(workspace: string): Promise<ProjectDNA> {
  return new Promise((resolve) => {
    const dna: ProjectDNA = {
      languages: [],
      frameworks: [],
      packageManager: '',
      hasDocker: false,
      hasGit: fs.existsSync(path.join(workspace, '.git')),
      gitBranch: '',
      gitDirty: 0,
      structure: { dirs: [], files: [] },
    };

    // Detect package manager and frameworks
    if (fs.existsSync(path.join(workspace, 'package.json'))) {
      dna.languages.push('JavaScript/TypeScript');
      dna.packageManager = 'npm';
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(workspace, 'package.json'), 'utf-8'));
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (deps.react) dna.frameworks.push('React');
        if (deps.vue) dna.frameworks.push('Vue');
        if (deps.next) dna.frameworks.push('Next.js');
        if (deps.express) dna.frameworks.push('Express');
        if (deps.fastify) dna.frameworks.push('Fastify');
      } catch {}
    }

    if (fs.existsSync(path.join(workspace, 'pyproject.toml')) || fs.existsSync(path.join(workspace, 'requirements.txt'))) {
      dna.languages.push('Python');
      dna.packageManager = 'pip';
      if (fs.existsSync(path.join(workspace, 'requirements.txt'))) {
        const reqs = fs.readFileSync(path.join(workspace, 'requirements.txt'), 'utf-8');
        if (reqs.includes('django')) dna.frameworks.push('Django');
        if (reqs.includes('flask')) dna.frameworks.push('Flask');
        if (reqs.includes('fastapi')) dna.frameworks.push('FastAPI');
      }
    }

    if (fs.existsSync(path.join(workspace, 'Cargo.toml'))) {
      dna.languages.push('Rust');
      dna.packageManager = 'cargo';
    }

    if (fs.existsSync(path.join(workspace, 'go.mod'))) {
      dna.languages.push('Go');
      dna.packageManager = 'go';
    }

    dna.hasDocker = fs.existsSync(path.join(workspace, 'Dockerfile'));

    // Get git status
    if (dna.hasGit) {
      exec('git branch --show-current && git status --porcelain | wc -l', { cwd: workspace }, (err, stdout) => {
        if (!err) {
          const [branch, dirty] = stdout.trim().split('\n');
          dna.gitBranch = branch || 'main';
          dna.gitDirty = parseInt(dirty, 10) || 0;
        }

        // Get structure
        const entries = fs.readdirSync(workspace, { withFileTypes: true }).slice(0, 20);
        dna.structure.dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
        dna.structure.files = entries.filter((e) => !e.isDirectory()).map((e) => e.name);

        resolve(dna);
      });
    } else {
      const entries = fs.readdirSync(workspace, { withFileTypes: true }).slice(0, 20);
      dna.structure.dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
      dna.structure.files = entries.filter((e) => !e.isDirectory()).map((e) => e.name);
      resolve(dna);
    }
  });
}

// ─── System Prompt Builder ──────────────────────────────

function buildSystemPrompt(workspace: string, dna: ProjectDNA | null, sessionMemory: string = ''): string {
  let prompt = `Sei LobsterCode 🦞, un assistente AI per il coding che lavora direttamente sui file del progetto.

WORKSPACE: ${workspace}

REGOLE:
- Rispondi SEMPRE in italiano
- Vai dritto alla soluzione, senza spiegazioni lunghe
- Quando modifichi un file, mostra cosa hai cambiato
- Se devi creare o modificare più file, fallo un file alla volta
- Prima di modificare, leggi sempre il file per capire il contesto
- Priorità: usabilità, robustezza, integrità, sicurezza, ZERO data loss

HAI ACCESSO A QUESTI TOOL:
- bash: eseguire comandi shell
- read_file: leggere file
- write_file: scrivere file
- edit_file: modificare parti di un file
- list_directory: esplorare directory
- search_files: cercare pattern nei file`;

  if (dna) {
    prompt += `

PROJECT DNA:
- Languages: ${dna.languages.join(', ') || 'Unknown'}
- Frameworks: ${dna.frameworks.join(', ') || 'None'}
- Package Manager: ${dna.packageManager || 'None'}
- Docker: ${dna.hasDocker ? 'Yes' : 'No'}
- Git: ${dna.hasGit ? `Yes (${dna.gitBranch}, ${dna.gitDirty} modified)` : 'No'}`;
  }

  if (sessionMemory) {
    prompt += `

SESSION MEMORY (Context from previous sessions):
${sessionMemory.slice(0, 4000)}`;
  }

  return prompt;
}

// ─── Prompt Templates ───────────────────────────────────

function getPromptTemplates(dna: ProjectDNA | null): PromptTemplate[] {
  const templates: PromptTemplate[] = [
    {
      id: 'explore',
      icon: '📂',
      title: 'Esplora progetto',
      prompt: 'Esplora la struttura del progetto e raccontami cosa vedi',
      stacks: [],
    },
    {
      id: 'find-bugs',
      icon: '🐛',
      title: 'Trova bug',
      prompt: 'Analizza il codice e identifica potenziali bug o problemi',
      stacks: [],
    },
    {
      id: 'readme',
      icon: '📝',
      title: 'Genera README',
      prompt: 'Crea un README.md completo per il progetto',
      stacks: [],
    },
    {
      id: 'tests',
      icon: '🧪',
      title: 'Scrivi test',
      prompt: 'Scrivi test unitari per il codice principale',
      stacks: [],
    },
    {
      id: 'refactor',
      icon: '🔄',
      title: 'Refactora',
      prompt: 'Refactorizza il codice per migliorare qualità e leggibilità',
      stacks: [],
    },
    {
      id: 'audit-deps',
      icon: '📦',
      title: 'Audit dipendenze',
      prompt: 'Verifica le dipendenze per aggiornamenti e vulnerabilità',
      stacks: ['JavaScript/TypeScript', 'Python'],
    },
    {
      id: 'new-component',
      icon: '🎨',
      title: 'Nuovo componente',
      prompt: 'Crea un nuovo componente React/Vue seguendo le best practices',
      stacks: ['React', 'Vue'],
    },
    {
      id: 'venv',
      icon: '🐍',
      title: 'Setup venv',
      prompt: 'Configura virtual environment Python e installa dipendenze',
      stacks: ['Python'],
    },
    {
      id: 'cargo-check',
      icon: '🦀',
      title: 'Cargo check',
      prompt: 'Esegui cargo check e risolvi eventuali errori',
      stacks: ['Rust'],
    },
    {
      id: 'changelog',
      icon: '📋',
      title: 'Genera changelog',
      prompt: 'Crea un CHANGELOG basato su commit Git',
      stacks: [],
    },
    {
      id: 'optimize-docker',
      icon: '🐳',
      title: 'Ottimizza Docker',
      prompt: 'Analizza e ottimizza il Dockerfile',
      stacks: ['Docker'],
    },
    {
      id: 'dockerize',
      icon: '🐳',
      title: 'Dockerizza',
      prompt: 'Crea un Dockerfile per il progetto',
      stacks: [],
    },
  ];

  // Filter by stacks if dna available
  if (!dna) return templates;

  return templates.filter((t) => {
    if (!t.stacks || t.stacks.length === 0) return true;
    return t.stacks.some((stack: string) => [...dna.languages, ...dna.frameworks].includes(stack));
  });
}

// ─── Service Class ──────────────────────────────────────

export class LobsterCodeService extends EventEmitter {
  private baseUrl: string;
  private model: string;
  private workspace: string;
  private permissionMode: PermissionMode = 'read-only';

  // Sessions
  private sessions: ChatSession[] = [];
  private currentSessionId: string | null = null;

  // Modified files tracking
  private modifiedFiles: ModifiedFile[] = [];

  // Snapshots
  private snapshots: Snapshot[] = [];

  // Project DNA cache
  private projectDNA: ProjectDNA | null = null;
  private projectDNACacheTime: number = 0;

  // Generation state
  private isGenerating: boolean = false;
  private activeRequest: http.ClientRequest | null = null;

  constructor(options?: {
    baseUrl?: string;
    model?: string;
    workspace?: string;
    permissionMode?: PermissionMode;
  }) {
    super();
    this.baseUrl = options?.baseUrl || 'http://localhost:11434';
    this.model = options?.model || 'gemma4:latest';
    this.workspace = options?.workspace || os.homedir();
    this.permissionMode = options?.permissionMode || 'read-only';

    // Create initial session
    this.currentSessionId = this.createSession();
  }

  // ─── Permission Management ──────────────────────────

  setPermission(mode: PermissionMode): void {
    this.permissionMode = mode;
  }

  getPermission(): PermissionMode {
    return this.permissionMode;
  }

  // ─── Session Management ─────────────────────────────

  createSession(): string {
    const id = generateSessionId();
    const session: ChatSession = {
      id,
      title: 'New Session',
      messages: [],
      model: this.model,
      createdAt: Date.now(),
    };
    this.sessions.push(session);
    return id;
  }

  switchSession(id: string): void {
    const session = this.sessions.find((s) => s.id === id);
    if (!session) throw new Error(`Session not found: ${id}`);
    this.currentSessionId = id;
  }

  deleteSession(id: string): void {
    this.sessions = this.sessions.filter((s) => s.id !== id);
    if (this.currentSessionId === id) {
      this.currentSessionId = this.sessions[0]?.id || null;
      if (!this.currentSessionId) {
        this.currentSessionId = this.createSession();
      }
    }
  }

  getSessions(): ChatSession[] {
    return [...this.sessions];
  }

  renameSession(id: string, title: string): void {
    const session = this.sessions.find((s) => s.id === id);
    if (session) session.title = title;
  }

  private getCurrentSession(): ChatSession {
    if (!this.currentSessionId) {
      this.currentSessionId = this.createSession();
    }
    const session = this.sessions.find((s) => s.id === this.currentSessionId);
    if (!session) throw new Error('No active session');
    return session;
  }

  private get chatHistory(): ChatMessage[] {
    return this.getCurrentSession().messages;
  }

  // ─── Modified Files Tracking ────────────────────────

  getModifiedFiles(): ModifiedFile[] {
    return [...this.modifiedFiles];
  }

  // ─── Snapshot Management ────────────────────────────

  createSnapshot(label: string): number {
    const id = generateSnapshotId();
    const snapshot: Snapshot = {
      id,
      timestamp: new Date().toISOString(),
      label,
      files: new Map(),
    };
    this.snapshots.push(snapshot);
    if (this.snapshots.length > 20) {
      this.snapshots.shift();
    }
    return id;
  }

  async snapshotSaveFile(snapId: number, filePath: string): Promise<void> {
    const snapshot = this.snapshots.find((s) => s.id === snapId);
    if (!snapshot) return;

    const resolved = resolvePath(this.workspace, filePath);
    const exists = fs.existsSync(resolved);
    if (exists) {
      const content = fs.readFileSync(resolved, 'utf-8');
      snapshot.files.set(filePath, content);
    } else {
      snapshot.files.set(filePath, null);
    }
  }

  getSnapshots(): { id: number; timestamp: string; label: string; fileCount: number }[] {
    return this.snapshots.map((s) => ({
      id: s.id,
      timestamp: s.timestamp,
      label: s.label,
      fileCount: s.files.size,
    }));
  }

  rollbackSnapshot(snapId: number): { restored: number; deleted: number } {
    const snapshot = this.snapshots.find((s) => s.id === snapId);
    if (!snapshot) return { restored: 0, deleted: 0 };

    let restored = 0;
    let deleted = 0;

    for (const [filePath, content] of snapshot.files.entries()) {
      const resolved = resolvePath(this.workspace, filePath);
      try {
        const dir = path.dirname(resolved);
        if (content === null) {
          if (fs.existsSync(resolved)) {
            fs.unlinkSync(resolved);
            deleted++;
          }
        } else {
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          const tmpPath = resolved + '.tmp';
          fs.writeFileSync(tmpPath, content, 'utf-8');
          fs.renameSync(tmpPath, resolved);
          restored++;
        }
      } catch (err) {
        console.error(`Rollback error for ${filePath}:`, err);
      }
    }

    return { restored, deleted };
  }

  // ─── Git Operations ─────────────────────────────────

  async getGitStatus(): Promise<GitStatus> {
    return getGitStatus(this.workspace);
  }

  async getGitLog(count?: number): Promise<GitCommit[]> {
    return getGitLog(this.workspace, count || 10);
  }

  async gitCommit(message: string): Promise<string> {
    return gitCommit(this.workspace, message);
  }

  async gitDiff(file?: string): Promise<string> {
    return gitDiff(this.workspace, file);
  }

  async gitInit(): Promise<string> {
    return gitInit(this.workspace);
  }

  // ─── Project DNA ────────────────────────────────────

  async detectProjectDNA(force: boolean = false): Promise<ProjectDNA> {
    const now = Date.now();
    if (!force && this.projectDNA && now - this.projectDNACacheTime < 60000) {
      return this.projectDNA;
    }

    this.projectDNA = await detectProjectDNA(this.workspace);
    this.projectDNACacheTime = now;
    return this.projectDNA;
  }

  // ─── Prompt Templates ───────────────────────────────

  getPromptTemplates(): PromptTemplate[] {
    return getPromptTemplates(this.projectDNA);
  }

  // ─── Session Memory ─────────────────────────────────

  async getSessionMemory(): Promise<string> {
    try {
      const memPath = path.join(this.workspace, '.lobster', 'context.md');
      if (fs.existsSync(memPath)) {
        return fs.readFileSync(memPath, 'utf-8');
      }
    } catch {}
    return '';
  }

  async saveSessionMemory(content: string): Promise<void> {
    try {
      const memDir = path.join(this.workspace, '.lobster');
      if (!fs.existsSync(memDir)) fs.mkdirSync(memDir, { recursive: true });
      const memPath = path.join(memDir, 'context.md');
      fs.writeFileSync(memPath, content, 'utf-8');
    } catch (err) {
      console.error('Error saving session memory:', err);
    }
  }

  // ─── Model Download ─────────────────────────────────

  async pullModel(modelName: string, onProgress: (progress: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      fetch(`${this.baseUrl}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName, stream: true }),
      })
        .then((res) => {
          if (!res.body) throw new Error('No response body');
          const reader = res.body.getReader();
          const decoder = new TextDecoder();

          const readChunk = async () => {
            try {
              const { done, value } = await reader.read();
              if (done) {
                resolve();
                return;
              }

              const text = decoder.decode(value);
              const lines = text.split('\n').filter(Boolean);
              for (const line of lines) {
                try {
                  const data = JSON.parse(line);
                  if (data.total && data.completed) {
                    onProgress(Math.round((data.completed / data.total) * 100));
                  }
                } catch {}
              }

              readChunk();
            } catch (err) {
              reject(err);
            }
          };

          readChunk();
        })
        .catch(reject);
    });
  }

  // ─── Status Check ───────────────────────────────────

  async checkStatus(): Promise<LobsterCodeStatus> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`);
      if (!res.ok) throw new Error('Ollama non raggiungibile');
      const data = (await res.json()) as any;
      const models = (data.models || []).map((m: any) => m.name);

      // Auto-select: se il modello configurato non è installato, usa il primo disponibile
      if (models.length > 0 && !models.some((m: string) => m === this.model || m.startsWith(this.model.split(':')[0]))) {
        // Preferisci modelli con "code" o "gemma" nel nome, altrimenti il primo
        const preferred = models.find((m: string) => /code|gemma|qwen/i.test(m));
        this.model = preferred || models[0];
        console.log(`[LobsterCode] Modello auto-selezionato: ${this.model}`);
      }

      const dna = await this.detectProjectDNA();

      return {
        available: true,
        models,
        workspace: this.workspace,
        model: this.model,
        permissionMode: this.permissionMode,
        sessionCount: this.sessions.length,
        currentSessionId: this.currentSessionId,
        projectDNA: dna,
      };
    } catch {
      return {
        available: false,
        models: [],
        workspace: this.workspace,
        model: this.model,
        permissionMode: this.permissionMode,
        sessionCount: this.sessions.length,
        currentSessionId: this.currentSessionId,
        projectDNA: null,
      };
    }
  }

  // ─── Chat Agent Loop ────────────────────────────────

  async chat(
    userMessage: string,
    onEvent: (event: ChatStreamEvent) => void
  ): Promise<void> {
    if (this.isGenerating) {
      onEvent({ type: 'error', content: 'Generazione già in corso' });
      return;
    }

    this.isGenerating = true;

    try {
      const session = this.getCurrentSession();

      // Auto-title from first message
      if (session.messages.length === 0) {
        session.title = userMessage.slice(0, 50) || 'New Session';
      }

      // Add user message
      session.messages.push({ role: 'user', content: userMessage });

      // Get session memory
      const sessionMemory = await this.getSessionMemory();

      // Build system prompt
      const systemPrompt = buildSystemPrompt(this.workspace, this.projectDNA, sessionMemory);

      let turns = 0;
      const MAX_TURNS = 10;

      while (turns < MAX_TURNS) {
        turns++;

        const messages = [
          { role: 'system', content: systemPrompt },
          ...session.messages,
        ];

        // Streaming via Node.js http (compatibile con Electron)
        const streamResult = await new Promise<{ content: string; tool_calls?: any[] }>((resolve, reject) => {
          const url = new URL(`${this.baseUrl}/api/chat`);
          const postData = JSON.stringify({
            model: this.model,
            messages,
            tools: TOOLS,
            stream: true,
            options: { num_ctx: 8192 },
          });

          const req = http.request(
            {
              hostname: url.hostname,
              port: url.port || 11434,
              path: url.pathname,
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
              },
            },
            (res) => {
              // Clear active request reference when response starts
              // (will be fully cleared in abort or on end)
              if (res.statusCode !== 200) {
                let errBody = '';
                res.on('data', (chunk) => { errBody += chunk; });
                res.on('end', () => {
                  reject(new Error(`Errore Ollama: ${res.statusCode} ${errBody}`));
                });
                return;
              }

              let buffer = '';
              let fullContent = '';
              let toolCalls: any[] = [];

              res.setEncoding('utf-8');

              res.on('data', (chunk: string) => {
                buffer += chunk;
                const lines = buffer.split('\n');
                // L'ultimo elemento potrebbe essere incompleto
                buffer = lines.pop() || '';

                for (const line of lines) {
                  if (!line.trim()) continue;
                  try {
                    const parsed = JSON.parse(line);

                    if (parsed.message?.content && !parsed.done) {
                      fullContent += parsed.message.content;
                      onEvent({ type: 'text', content: parsed.message.content });
                    }

                    if (parsed.message?.tool_calls) {
                      toolCalls = parsed.message.tool_calls;
                    }

                    if (parsed.done) {
                      // Anche il chunk finale può avere contenuto o tool_calls
                      if (parsed.message?.content) {
                        fullContent += parsed.message.content;
                        onEvent({ type: 'text', content: parsed.message.content });
                      }
                      if (parsed.message?.tool_calls) {
                        toolCalls = parsed.message.tool_calls;
                      }
                    }
                  } catch {
                    // Skip malformed JSON
                  }
                }
              });

              res.on('end', () => {
                // Processa eventuale ultimo buffer
                if (buffer.trim()) {
                  try {
                    const parsed = JSON.parse(buffer);
                    if (parsed.message?.content) {
                      fullContent += parsed.message.content;
                      onEvent({ type: 'text', content: parsed.message.content });
                    }
                    if (parsed.message?.tool_calls) {
                      toolCalls = parsed.message.tool_calls;
                    }
                  } catch {}
                }
                resolve({
                  content: fullContent,
                  tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
                });
              });

              res.on('error', (err) => {
                reject(err);
              });
            }
          );

          // Save reference for abort()
          this.activeRequest = req;

          req.on('error', (err) => {
            this.activeRequest = null;
            if ((err as any).code === 'ECONNRESET' || req.destroyed) {
              // Abort was called — resolve gracefully
              resolve({ content: '', tool_calls: [] });
              return;
            }
            reject(new Error(`Connessione a Ollama fallita: ${err.message}`));
          });

          req.setTimeout(120000, () => {
            this.activeRequest = null;
            req.destroy();
            reject(new Error('Timeout: Ollama non ha risposto entro 120 secondi'));
          });

          req.write(postData);
          req.end();
        });

        const assistantMsg = streamResult;

        if (!assistantMsg.content && !assistantMsg.tool_calls) {
          onEvent({ type: 'error', content: 'Risposta vuota da Ollama' });
          break;
        }

        session.messages.push({
          role: 'assistant',
          content: assistantMsg.content || '',
          tool_calls: assistantMsg.tool_calls,
        });

        if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
          break;
        }

        for (const toolCall of assistantMsg.tool_calls) {
          const fnName = toolCall.function?.name;
          let fnArgs: Record<string, any> = {};

          try {
            fnArgs = typeof toolCall.function?.arguments === 'string'
              ? JSON.parse(toolCall.function.arguments)
              : toolCall.function?.arguments || {};
          } catch {
            fnArgs = {};
          }

          onEvent({ type: 'tool_start', tool_name: fnName, tool_args: fnArgs });

          // Create snapshot before write operations
          let snapId: number | null = null;
          if ((fnName === 'write_file' || fnName === 'edit_file') && this.permissionMode !== 'read-only') {
            snapId = this.createSnapshot(`Pre ${fnName}: ${fnArgs.path}`);
            if (fnName === 'write_file' || fnName === 'edit_file') {
              await this.snapshotSaveFile(snapId, fnArgs.path);
            }
          }

          // Snapshot already created above — no need for onSnapshot callback
          const result = await executeTool(
            fnName,
            fnArgs,
            this.workspace,
            this.permissionMode
          );

          // Track modified files
          if ((fnName === 'write_file' || fnName === 'edit_file') && !result.includes('ERRORE')) {
            this.modifiedFiles.push({
              path: fnArgs.path,
              action: fnName === 'write_file' ? 'overwrite' : 'edit',
              timestamp: new Date().toISOString(),
            });
          }

          onEvent({ type: 'tool_result', tool_name: fnName, tool_output: result });

          session.messages.push({
            role: 'tool',
            content: result,
            name: fnName,
          });
        }
      }

      onEvent({ type: 'done' });
    } catch (err: any) {
      onEvent({ type: 'error', content: err.message || 'Errore sconosciuto' });
    } finally {
      this.isGenerating = false;
      this.activeRequest = null;
    }
  }

  // ─── Utility Methods ────────────────────────────────

  clearHistory(): void {
    const session = this.getCurrentSession();
    session.messages = [];
  }

  setModel(model: string): void {
    this.model = model;
  }

  setWorkspace(workspace: string): void {
    this.workspace = workspace;
    this.projectDNA = null;
    this.projectDNACacheTime = 0;
  }

  setBaseUrl(url: string): void {
    this.baseUrl = url;
  }

  abort(): void {
    this.isGenerating = false;
    // Destroy the active HTTP request to stop Ollama streaming
    if (this.activeRequest) {
      this.activeRequest.destroy();
      this.activeRequest = null;
      console.log('[LobsterCode] Abort: HTTP request destroyed');
    }
  }

  getHistory(): ChatMessage[] {
    return [...this.chatHistory];
  }
}
