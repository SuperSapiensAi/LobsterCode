// ============================================================
// LOBSTER UTILITY — Project Discovery Service
// Auto-discovers projects from directories
// ============================================================

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { Project, ProjectType, ProjectConfig, ExpectedPort } from '../../shared/types';
import { PROJECT_MARKERS, PROJECT_COLORS } from '../../shared/constants';

interface DirectoryWatcher {
  path: string;
  watching: boolean;
  handle: fs.FSWatcher; // actual watcher handle for cleanup
}

export class ProjectDiscoveryService extends EventEmitter {
  private projects: Map<string, Project> = new Map();
  private watchers: Map<string, DirectoryWatcher> = new Map();
  private colorIndex: number = 0;

  constructor() {
    super();
  }

  /**
   * Scan a single directory for projects (recursive up to maxDepth)
   */
  async scanDirectory(dirPath: string, maxDepth: number = 3): Promise<Project[]> {
    const expandedPath = this.expandPath(dirPath);
    const discovered: Project[] = [];

    try {
      if (!fs.existsSync(expandedPath)) {
        return [];
      }

      await this.scanDirectoryRecursive(expandedPath, discovered, 0, maxDepth);
    } catch (error) {
      console.error(`[ProjectDiscovery] Error scanning ${expandedPath}:`, error);
    }

    return discovered;
  }

  /**
   * Internal recursive scan helper
   */
  private async scanDirectoryRecursive(
    dirPath: string,
    discovered: Project[],
    currentDepth: number,
    maxDepth: number,
  ): Promise<void> {
    if (currentDepth >= maxDepth) return;

    const EXCLUDED = new Set(['node_modules', '.git', '.venv', '__pycache__', 'dist', 'build', '.next', '.nuxt']);

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return; // permission denied or unreadable
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      // Skip hidden directories and common exclusions
      if (entry.name.startsWith('.') || EXCLUDED.has(entry.name)) {
        continue;
      }

      const projectPath = path.join(dirPath, entry.name);
      const project = await this.detectProject(projectPath, entry.name);

      if (project) {
        // Found a project — add it, don't recurse into it
        discovered.push(project);
        this.projects.set(project.id, project);
      } else if (currentDepth < maxDepth - 1) {
        // Not a project — recurse deeper to find nested projects
        await this.scanDirectoryRecursive(projectPath, discovered, currentDepth + 1, maxDepth);
      }
    }
  }

  /**
   * Detect project type and metadata
   */
  private async detectProject(projectPath: string, projectName: string): Promise<Project | null> {
    const projectId = this.generateProjectId(projectPath);
    let projectType: ProjectType = 'generic';
    let icon = '📁';
    let hasSoftwareMarker = false; // Must have a CODE marker to be a software project

    // Check for marker files (supports exact names and glob-like *.ext patterns)
    // These are the definitive signals that a folder is a SOFTWARE project
    for (const [markerKey, marker] of Object.entries(PROJECT_MARKERS)) {
      for (const markerFile of marker.files) {
        if (markerFile.startsWith('*')) {
          // Glob pattern like "*.sln" — check if any file matches the extension
          const ext = markerFile.slice(1); // e.g. ".sln"
          try {
            const entries = fs.readdirSync(projectPath);
            const matchingFile = entries.find((e) => e.endsWith(ext));
            if (matchingFile) {
              projectType = marker.type as ProjectType;
              icon = marker.icon;
              hasSoftwareMarker = true;
              console.log(`[ProjectDiscovery] DETECTED "${projectName}" as ${marker.type} via glob: ${markerFile} → ${matchingFile}`);
              break;
            }
          } catch { /* skip unreadable */ }
        } else if (fs.existsSync(path.join(projectPath, markerFile))) {
          // Extra validation for package.json — must have dependencies, devDependencies, or scripts
          // to be a real Node.js project. A bare package.json (e.g. from Obsidian, Claude Desktop)
          // is not a software project.
          if (markerFile === 'package.json') {
            try {
              const pkgContent = fs.readFileSync(path.join(projectPath, markerFile), 'utf-8');
              const pkg = JSON.parse(pkgContent);
              const hasCode = pkg.dependencies || pkg.devDependencies || pkg.scripts || pkg.main || pkg.module || pkg.bin;
              if (!hasCode) {
                console.log(`[ProjectDiscovery] SKIPPED "${projectName}" — package.json has no code signals`);
                continue; // Skip this marker, try next
              }
            } catch {
              continue; // Invalid JSON — not a real package.json
            }
          }

          // Extra validation for pyproject.toml — can be present in doc/book projects
          // (Sphinx, Jupyter Book, mkdocs). Real Python software has [project] or build config.
          if (markerFile === 'pyproject.toml') {
            try {
              const content = fs.readFileSync(path.join(projectPath, markerFile), 'utf-8');
              const isDocOnly = /\[tool\.(jupyter-?book|sphinx|mkdocs|nbsphinx)\]/i.test(content)
                && !/\[(project|tool\.(poetry|setuptools|hatch|flit|maturin))\]/i.test(content);
              if (isDocOnly) {
                console.log(`[ProjectDiscovery] SKIPPED "${projectName}" — pyproject.toml is doc tooling only`);
                continue;
              }
            } catch { /* pass through */ }
          }

          // Extra validation for environment.yml — conda envs for notebooks aren't software
          if (markerFile === 'environment.yml') {
            try {
              const content = fs.readFileSync(path.join(projectPath, markerFile), 'utf-8');
              const hasOnlyDocDeps = /jupyter|notebook|sphinx|mkdocs|pandoc/i.test(content)
                && !/flask|django|fastapi|uvicorn|celery|sqlalchemy/i.test(content);
              if (hasOnlyDocDeps) {
                console.log(`[ProjectDiscovery] SKIPPED "${projectName}" — environment.yml has only doc deps`);
                continue;
              }
            } catch { /* pass through */ }
          }
          projectType = marker.type as ProjectType;
          icon = marker.icon;
          hasSoftwareMarker = true;
          console.log(`[ProjectDiscovery] DETECTED "${projectName}" as ${marker.type} via marker: ${markerFile}`);
          break;
        }
      }
      if (projectType !== 'generic') break;
    }

    // Try to read .lobster.json config (explicit Lobster project — always a software signal)
    let config: ProjectConfig | undefined;
    try {
      const configPath = path.join(projectPath, '.lobster.json');
      if (fs.existsSync(configPath)) {
        const configData = fs.readFileSync(configPath, 'utf-8');
        config = JSON.parse(configData);
        if (config && config.icon) icon = config.icon;
        if (config && config.type) projectType = config.type;
        hasSoftwareMarker = true;
      }
    } catch (error) {
      console.error(`[ProjectDiscovery] Error reading .lobster.json for ${projectName}:`, error);
    }

    // STRICT: A directory MUST have a software marker file or .lobster.json.
    // .git ALONE is NOT enough — many non-software folders (docs, configs, notes)
    // have git tracking but are NOT development projects.
    // Without a code marker, skip this folder so the scan continues deeper.
    if (!hasSoftwareMarker) {
      console.log(`[ProjectDiscovery] SKIPPED "${projectName}" — no software marker found at ${projectPath}`);
      return null;
    }

    // SECONDARY VALIDATION: Even with a marker, verify this looks like a real
    // software project. Book/doc folders sometimes have setup.py, pyproject.toml,
    // environment.yml, or package.json from tools like Gitbook, Sphinx, Jupyter.
    // A real software project should have at least ONE source code file.
    if (!this.hasSourceCodeFiles(projectPath)) {
      console.log(`[ProjectDiscovery] SKIPPED "${projectName}" — marker found (${projectType}) but NO source code files at ${projectPath}`);
      return null;
    }

    // Auto-detect expected ports from project files
    const expectedPorts = config?.expectedPorts || this.detectExpectedPorts(projectPath, projectType);

    // Merge into config
    if (!config) {
      config = { name: projectName, type: projectType, expectedPorts };
    } else if (!config.expectedPorts || config.expectedPorts.length === 0) {
      config.expectedPorts = expectedPorts;
    }

    // Assign color if not in config
    const color = config?.color || PROJECT_COLORS[this.colorIndex % PROJECT_COLORS.length];
    this.colorIndex++;

    const project: Project = {
      id: projectId,
      name: projectName,
      path: projectPath,
      type: projectType,
      icon,
      color,
      status: 'unknown',
      health: 'unknown',
      trafficLight: 'gray',
      humanStatus: 'Non scansionato',
      ports: [],
      containers: [],
      isArchived: false,
      config,
    };

    return project;
  }

  /**
   * Auto-detect expected ports from project files
   * Reads docker-compose.yml, package.json, .env etc.
   */
  private detectExpectedPorts(projectPath: string, projectType: ProjectType): ExpectedPort[] {
    const ports: ExpectedPort[] = [];

    // --- Docker Compose: extract published ports ---
    if (projectType === 'docker-compose') {
      const composeFiles = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'];
      for (const file of composeFiles) {
        const filePath = path.join(projectPath, file);
        if (!fs.existsSync(filePath)) continue;
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          // Parse ports: lines like "- 8080:80" or "- '3000:3000'" or "- 5432:5432"
          const portMatches = content.matchAll(/["']?(\d{2,5}):(\d{2,5})["']?/g);
          for (const match of portMatches) {
            const hostPort = parseInt(match[1], 10);
            const containerPort = parseInt(match[2], 10);
            if (hostPort > 0 && hostPort <= 65535) {
              // Try to figure out service name from context
              const serviceName = this.guessServiceFromPort(containerPort);
              ports.push({
                port: hostPort,
                service: serviceName,
                type: 'external',
                healthCheckUrl: `http://localhost:${hostPort}`,
              });
            }
          }
        } catch (error) {
          console.error(`[ProjectDiscovery] Error parsing ${file} for ${projectPath}:`, error);
        }
        break; // Only read the first compose file found
      }
    }

    // --- Node.js: detect common dev server ports ---
    if (projectType === 'node') {
      const packageJsonPath = path.join(projectPath, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        try {
          const pkgContent = fs.readFileSync(packageJsonPath, 'utf-8');
          const pkg = JSON.parse(pkgContent);
          const scripts = pkg.scripts || {};
          const allScripts = Object.values(scripts).join(' ');

          // Detect port from --port flags or PORT= env vars
          const portFlags = allScripts.match(/--port[= ](\d{2,5})/g) || [];
          const portEnvs = allScripts.match(/PORT[= ](\d{2,5})/g) || [];
          const portMatches = [...portFlags, ...portEnvs];

          for (const match of portMatches) {
            const portNum = parseInt(match.replace(/[^0-9]/g, ''), 10);
            if (portNum > 0 && portNum <= 65535 && !ports.some((p) => p.port === portNum)) {
              ports.push({
                port: portNum,
                service: 'Dev Server',
                type: 'external',
                healthCheckUrl: `http://localhost:${portNum}`,
              });
            }
          }

          // Check for common frameworks if no explicit ports found
          if (ports.length === 0) {
            const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
            if (deps['next']) {
              ports.push({ port: 3000, service: 'Next.js', type: 'external', healthCheckUrl: 'http://localhost:3000' });
            } else if (deps['vite'] || deps['@vitejs/plugin-react']) {
              ports.push({ port: 5173, service: 'Vite', type: 'external', healthCheckUrl: 'http://localhost:5173' });
            } else if (deps['react-scripts']) {
              ports.push({ port: 3000, service: 'React CRA', type: 'external', healthCheckUrl: 'http://localhost:3000' });
            } else if (deps['express']) {
              ports.push({ port: 3000, service: 'Express', type: 'external', healthCheckUrl: 'http://localhost:3000' });
            } else if (deps['@angular/core']) {
              ports.push({ port: 4200, service: 'Angular', type: 'external', healthCheckUrl: 'http://localhost:4200' });
            }
          }
        } catch (error) {
          console.error(`[ProjectDiscovery] Error parsing package.json for ${projectPath}:`, error);
        }
      }
    }

    // --- Python: detect common ports ---
    if (projectType === 'python') {
      // Check for FastAPI/Flask/Django common ports
      const mainFiles = ['main.py', 'app.py', 'manage.py', 'server.py', 'run.py'];
      for (const file of mainFiles) {
        const filePath = path.join(projectPath, file);
        if (!fs.existsSync(filePath)) continue;
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const portMatch = content.match(/port[= ]*(\d{2,5})/i);
          if (portMatch) {
            const port = parseInt(portMatch[1], 10);
            if (port > 0 && port <= 65535) {
              ports.push({ port, service: 'Python App', type: 'external', healthCheckUrl: `http://localhost:${port}` });
            }
          }
        } catch { /* ignore */ }
      }
      // Default ports if nothing found
      if (ports.length === 0) {
        // Check for framework markers
        const reqPath = path.join(projectPath, 'requirements.txt');
        if (fs.existsSync(reqPath)) {
          try {
            const reqs = fs.readFileSync(reqPath, 'utf-8').toLowerCase();
            if (reqs.includes('fastapi') || reqs.includes('uvicorn')) {
              ports.push({ port: 8000, service: 'FastAPI', type: 'external', healthCheckUrl: 'http://localhost:8000' });
            } else if (reqs.includes('flask')) {
              ports.push({ port: 5000, service: 'Flask', type: 'external', healthCheckUrl: 'http://localhost:5000' });
            } else if (reqs.includes('django')) {
              ports.push({ port: 8000, service: 'Django', type: 'external', healthCheckUrl: 'http://localhost:8000' });
            }
          } catch { /* ignore */ }
        }
      }
    }

    // --- .env file: check for PORT variable ---
    const envPath = path.join(projectPath, '.env');
    if (fs.existsSync(envPath)) {
      try {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        const envPortMatch = envContent.match(/^PORT[= ]*(\d{2,5})/m);
        if (envPortMatch) {
          const port = parseInt(envPortMatch[1], 10);
          if (port > 0 && port <= 65535 && !ports.some((p) => p.port === port)) {
            ports.push({ port, service: 'App Server (da .env)', type: 'external', healthCheckUrl: `http://localhost:${port}` });
          }
        }
      } catch { /* ignore */ }
    }

    return ports;
  }

  /**
   * SECONDARY VALIDATION — verify directory contains actual source code files.
   * Prevents false positives from book/doc folders that happen to have
   * marker files (e.g. setup.py from Sphinx, package.json from Gitbook,
   * pyproject.toml from Jupyter Book, environment.yml from conda).
   *
   * Checks depth 0 and depth 1 (src/, app/, lib/, etc.) for common
   * source code extensions. Also considers docker-compose content,
   * Dockerfile, and config files as valid software signals.
   */
  private hasSourceCodeFiles(projectPath: string): boolean {
    const SOURCE_EXTENSIONS = new Set([
      '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
      '.py', '.pyw',
      '.rs',
      '.go',
      '.java', '.kt', '.kts', '.scala',
      '.cs', '.fs', '.vb',
      '.php',
      '.rb', '.erb',
      '.swift',
      '.dart',
      '.ex', '.exs',
      '.c', '.cpp', '.cc', '.cxx', '.h', '.hpp',
      '.vue', '.svelte',
      '.tf', '.hcl',
      // NOTE: .sh/.bash/.zsh deliberately EXCLUDED — too generic, any folder can have scripts
      '.lua', '.zig', '.nim', '.cr', '.ml', '.hs',
      '.r', '.R', '.jl',
    ]);

    // Files that DON'T count as real source code — they're config/build files
    // that often appear in non-software projects (books, docs, data projects)
    const CONFIG_ONLY_FILES = new Set([
      'conf.py',         // Sphinx documentation config
      'setup.py',        // can be in book/doc projects for Sphinx
      'conftest.py',     // pytest config — alone doesn't mean software
      'fabfile.py',      // Fabric deployment scripts
      'noxfile.py',      // Nox automation
      'tasks.py',        // Invoke tasks
      'manage.py',       // Django — but alone could be empty project
      'tailwind.config.js', 'postcss.config.js', // build config
      'babel.config.js', 'commitlint.config.js',
      '.prettierrc.js', '.eslintrc.js',
    ]);

    // Files that are strong software signals even without source code extensions
    // NOTE: .gitignore is deliberately EXCLUDED — every git repo has it, including
    // books, docs, configs. Same for .dockerignore without Dockerfile.
    const SOFTWARE_FILES = new Set([
      'Dockerfile', 'Containerfile',
      'tsconfig.json', 'vite.config.ts', 'vite.config.js',
      'webpack.config.js', 'rollup.config.js',
      'jest.config.js', 'jest.config.ts',
      '.eslintrc.js', '.eslintrc.json', '.prettierrc',
      'tox.ini', 'pytest.ini', '.flake8',
      'Procfile', 'Vagrantfile',
      'angular.json', 'next.config.js', 'next.config.mjs',
      'nuxt.config.ts', 'svelte.config.js',
      'Makefile.toml', 'build.rs', 'Justfile',
    ]);

    // Directories that indicate software project structure
    const SOFTWARE_DIRS = new Set([
      'src', 'lib', 'app', 'cmd', 'pkg', 'internal',
      'frontend', 'backend', 'api', 'server', 'client',
      'components', 'pages', 'routes', 'controllers', 'models',
      'test', 'tests', '__tests__', 'spec', 'specs',
      'migrations', 'seeders', 'prisma',
    ]);

    try {
      const entries = fs.readdirSync(projectPath, { withFileTypes: true });
      let realSourceCount = 0; // Count of REAL source code files (not config-only)

      for (const entry of entries) {
        if (entry.isFile()) {
          // Check software signal files (Dockerfile, tsconfig, etc.)
          if (SOFTWARE_FILES.has(entry.name)) return true;

          // Check source code extensions
          const ext = path.extname(entry.name).toLowerCase();
          if (SOURCE_EXTENSIONS.has(ext)) {
            // Don't count config-only files as real source code
            if (!CONFIG_ONLY_FILES.has(entry.name)) {
              realSourceCount++;
              // Need at least 2 real source files to confirm software project
              if (realSourceCount >= 2) return true;
            }
          }
        } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
          // Check for software directory names
          if (SOFTWARE_DIRS.has(entry.name)) return true;

          // Also peek one level deeper for source code
          try {
            const subEntries = fs.readdirSync(path.join(projectPath, entry.name), { withFileTypes: true });
            let subSourceCount = 0;
            for (const sub of subEntries) {
              if (sub.isFile()) {
                const subExt = path.extname(sub.name).toLowerCase();
                if (SOURCE_EXTENSIONS.has(subExt) && !CONFIG_ONLY_FILES.has(sub.name)) {
                  subSourceCount++;
                }
                if (SOFTWARE_FILES.has(sub.name)) return true;
              }
            }
            // If a subdirectory has 2+ source files, it's real software
            if (subSourceCount >= 2) return true;
            realSourceCount += subSourceCount;
            if (realSourceCount >= 2) return true;
          } catch { /* skip unreadable subdirs */ }
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Guess service name from Docker container port
   */
  private guessServiceFromPort(containerPort: number): string {
    const knownPorts: Record<number, string> = {
      80: 'Web Server', 443: 'HTTPS', 3000: 'App Server', 3306: 'MySQL',
      5432: 'PostgreSQL', 5433: 'PostgreSQL (alt)', 6379: 'Redis',
      8080: 'Web/Proxy', 8000: 'API Server', 8443: 'HTTPS',
      27017: 'MongoDB', 9200: 'Elasticsearch', 5672: 'RabbitMQ',
      15672: 'RabbitMQ UI', 9000: 'MinIO/PHP', 11434: 'Ollama',
      5050: 'pgAdmin', 8888: 'Jupyter',
    };
    return knownPorts[containerPort] || `Porta ${containerPort}`;
  }

  /**
   * Generate unique ID from project path
   */
  private generateProjectId(projectPath: string): string {
    // Simple approach: use hash of path or slugify the name
    const hash = crypto.createHash('md5').update(projectPath).digest('hex').substring(0, 8);
    return `proj_${hash}`;
  }

  /**
   * Expand ~ to home directory
   */
  private expandPath(dirPath: string): string {
    if (dirPath.startsWith('~')) {
      return dirPath.replace('~', process.env.HOME || '');
    }
    return dirPath;
  }

  /**
   * Scan all configured directories
   */
  async scanAll(directories?: string[]): Promise<void> {
    const dirsToScan = directories || ['~/Desktop', '~/Documents', '~/Code'];
    this.projects.clear();
    this.colorIndex = 0;

    for (const dir of dirsToScan) {
      await this.scanDirectory(dir);
    }

    this.emit('projectsChanged', Array.from(this.projects.values()));
  }

  /**
   * Start watching directories for new projects
   */
  startWatching(directories?: string[]): void {
    const dirsToWatch = directories || ['~/Desktop', '~/Documents', '~/Code'];

    for (const dir of dirsToWatch) {
      const expandedPath = this.expandPath(dir);

      if (!fs.existsSync(expandedPath)) continue;

      try {
        // Simple file system watcher using fs.watch
        // In production, consider using chokidar for better cross-platform support
        const watcher = fs.watch(expandedPath, { recursive: false }, (eventType, filename) => {
          if (eventType === 'rename' && filename) {
            const newPath = path.join(expandedPath, filename);
            if (fs.existsSync(newPath) && fs.statSync(newPath).isDirectory()) {
              // Debounce rapid changes
              setTimeout(() => {
                this.detectProject(newPath, filename).then((project) => {
                  if (project && !this.projects.has(project.id)) {
                    this.projects.set(project.id, project);
                    this.emit('projectsChanged', Array.from(this.projects.values()));
                  }
                });
              }, 500);
            }
          }
        });

        this.watchers.set(expandedPath, { path: expandedPath, watching: true, handle: watcher });
        console.log(`[ProjectDiscovery] Watching ${expandedPath}`);
      } catch (error) {
        console.error(`[ProjectDiscovery] Error watching ${expandedPath}:`, error);
      }
    }
  }

  /**
   * Stop watching directories
   */
  stopWatching(): void {
    for (const watcher of this.watchers.values()) {
      watcher.watching = false;
      try {
        watcher.handle.close();
      } catch (e) {
        // Ignore close errors on already-closed watchers
      }
    }
    this.watchers.clear();
    console.log(`[ProjectDiscovery] Stopped watching all directories`);
  }

  /**
   * Get all discovered projects
   */
  getProjects(): Project[] {
    return Array.from(this.projects.values());
  }

  /**
   * Get a single project by ID
   */
  getProject(id: string): Project | undefined {
    return this.projects.get(id);
  }

  /**
   * Update project metadata
   */
  updateProject(id: string, updates: Partial<Project>): void {
    const project = this.projects.get(id);
    if (project) {
      Object.assign(project, updates);
      this.emit('projectsChanged', Array.from(this.projects.values()));
    }
  }

  /**
   * Hide/remove a project from the dashboard (non-destructive)
   * Sets isArchived=true so it's filtered out from the UI
   */
  hideProject(id: string): boolean {
    const project = this.projects.get(id);
    if (project) {
      project.isArchived = true;
      this.emit('projectsChanged', Array.from(this.projects.values()));
      return true;
    }
    return false;
  }

  /**
   * Remove a project entirely from the tracked list
   */
  removeProject(id: string): boolean {
    const existed = this.projects.delete(id);
    if (existed) {
      this.emit('projectsChanged', Array.from(this.projects.values()));
    }
    return existed;
  }
}

export default ProjectDiscoveryService;
