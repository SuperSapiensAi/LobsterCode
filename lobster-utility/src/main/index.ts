// ============================================================
// LOBSTER UTILITY — Electron Main Process
// App initialization, window management, and IPC handlers
// ============================================================

import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  shell,
  Notification,
  nativeImage,
} from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { spawn, execFile, execSync } from 'child_process';
import ProjectDiscoveryService from './services/project-discovery.service';
import NotificationService from './services/notification.service';
import DesktopShortcutService from './services/desktop-shortcut.service';
import { DockerMonitorService } from './services/docker-monitor.service';
import { ResourceMonitorService } from './services/resource-monitor.service';
import { SmartAdvisorService } from './services/smart-advisor.service';
import { UITestAgentService } from './services/ui-test-agent.service';
import { MnemoService } from './services/mnemo.service';
import { LobsterCodeService } from './services/lobstercode.service';
import type {
  IpcChannel,
  Project,
  LobsterNotification,
  AppSettings,
  SystemResources,
  PortInfo,
} from '../shared/types';
import { DEFAULT_SETTINGS } from '../shared/constants';
import { IPC_CHANNELS } from '../shared/types';

// PortScannerService uses CommonJS export
const PortScannerService = require('./services/port-scanner.service');
const ElectronStore = require('electron-store');

// ============================================================
// GLOBAL ERROR HANDLERS — prevent Electron crash on spawn errors
// ============================================================
process.on('uncaughtException', (error) => {
  console.error('[Main] Uncaught Exception:', error.message);
  // Don't crash the app for non-fatal errors like spawn failures
});

process.on('unhandledRejection', (reason) => {
  console.error('[Main] Unhandled Rejection:', reason);
});

// ============================================================
// GLOBAL STATE
// ============================================================

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

// Services — real implementations
const projectDiscovery = new ProjectDiscoveryService();
const notificationService = new NotificationService();
const desktopShortcuts = new DesktopShortcutService();
const portScanner = new PortScannerService();
const dockerMonitor = new DockerMonitorService();
const resourceMonitor = new ResourceMonitorService();
const uiTestAgent = new UITestAgentService();
// SmartAdvisor viene inizializzato con i DEFAULT; dopo il boot leggerà getSettings()
const smartAdvisor = new SmartAdvisorService({
  baseUrl: DEFAULT_SETTINGS.ollama.baseUrl,
  triageModel: DEFAULT_SETTINGS.ollama.triageModel,
  analysisModel: DEFAULT_SETTINGS.ollama.analysisModel,
  deepModel: DEFAULT_SETTINGS.ollama.deepModel,
  fallbackModel: DEFAULT_SETTINGS.ollama.fallbackModel,
});
// MNEMO proxy service — context multiplier per Ollama
const mnemoService = new MnemoService(DEFAULT_SETTINGS.mnemo?.baseUrl || 'http://127.0.0.1:11435');

// LobsterCode service — embedded AI coding assistant
// Inizializzato con defaults; aggiornato con settings reali al boot (vedi app.whenReady)
const lobsterCodeService = new LobsterCodeService({
  baseUrl: DEFAULT_SETTINGS.mnemo?.baseUrl || 'http://127.0.0.1:11435',
  model: 'gemma4:latest',
});

// App settings — persistiti su disco via electron-store (con fallback in-memory)
let settingsStore: any = null;
let inMemorySettings: AppSettings = { ...DEFAULT_SETTINGS };

try {
  settingsStore = new ElectronStore({
    name: 'lobster-settings',
    defaults: DEFAULT_SETTINGS,
  });
  // ── Debug: verifica persistenza reale ──
  // electron-store con defaults riporta sempre tutte le chiavi,
  // quindi usiamo un campo canary __lastSaved per capire se i dati sono reali o defaults
  const canary = settingsStore.get('__lastSaved');
  console.log(`[Settings] electron-store path: ${settingsStore.path}`);
  if (canary) {
    console.log(`[Settings] Impostazioni trovate su disco (ultimo salvataggio: ${canary})`);
  } else {
    console.log('[Settings] Nessun salvataggio precedente trovato — primo avvio o file cancellato');
  }
} catch (err) {
  console.warn('[Settings] electron-store non disponibile, uso fallback in-memory:', err);
}

/** Deep merge: sovrascrive solo i campi passati, preservando il resto */
function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const result = { ...target };
  for (const key of Object.keys(source) as (keyof T)[]) {
    const srcVal = source[key];
    if (
      srcVal && typeof srcVal === 'object' && !Array.isArray(srcVal) &&
      target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])
    ) {
      (result as any)[key] = deepMerge(target[key] as any, srcVal as any);
    } else if (srcVal !== undefined) {
      (result as any)[key] = srcVal;
    }
  }
  return result;
}

function getSettings(): AppSettings {
  try {
    const stored = settingsStore ? (settingsStore.store as Partial<AppSettings>) : inMemorySettings;
    return deepMerge(DEFAULT_SETTINGS, stored);
  } catch (err) {
    console.error('[Settings] Errore lettura settings:', err);
    return { ...DEFAULT_SETTINGS };
  }
}

function updateSettings(updates: Partial<AppSettings>): AppSettings {
  const current = getSettings();
  const merged = deepMerge(current, updates);
  try {
    if (settingsStore) {
      settingsStore.store = merged;
      // Canary per verificare persistenza al prossimo avvio
      settingsStore.set('__lastSaved', new Date().toISOString());
    }
  } catch (err) {
    console.error('[Settings] Errore scrittura su disco:', err);
  }
  inMemorySettings = merged;
  return merged;
}

// ============================================================
// WINDOW CREATION
// ============================================================

function createWindow() {
  const isDev = process.env.NODE_ENV === 'development';

  // Icona app — usa il PNG generato, su macOS il .icns viene dal build
  const iconPath = path.join(__dirname, '../../assets/icons/icon.png');

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    icon: iconPath,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
    backgroundColor: '#faf7f5', // Lobster cream
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: !isDev, // Sandbox abilitato in produzione, disabilitato in dev per compatibilità Vite
    },
  });

  const loadURL = isDev ? 'http://localhost:5199' : `file://${path.join(__dirname, '../../renderer/index.html')}`;

  // Content Security Policy — solo in produzione (Vite dev usa inline scripts)
  if (!isDev) {
    mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self' data:",
          ],
        },
      });
    });
  }

  mainWindow.loadURL(loadURL).catch((err) => {
    console.error('[Main] Failed to load URL:', err);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

// ============================================================
// TRAY SETUP
// ============================================================

function createTray() {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
        }
      },
    },
    {
      label: 'Hide',
      click: () => {
        if (mainWindow) {
          mainWindow.hide();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
      }
    }
  });
}

// ============================================================
// IPC HANDLERS
// ============================================================

function setupIpcHandlers() {
  // --- PORT OPERATIONS ---

  ipcMain.handle(IPC_CHANNELS.PORTS_GET_ALL, async () => {
    try {
      const rawPorts: PortInfo[] = portScanner.scanOnce();
      const projects = projectDiscovery.getProjects();

      // Build port→project map from enrichment data + expected ports
      const projectPortMap = new Map<number, { id: string; name: string; service: string }>();

      for (const project of projects) {
        for (const ep of (project.config?.expectedPorts || [])) {
          projectPortMap.set(ep.port, { id: project.id, name: project.name, service: ep.service });
        }
        for (const pp of (project.ports || [])) {
          if (pp.projectName && pp.port) {
            projectPortMap.set(pp.port, {
              id: pp.projectId || project.id,
              name: pp.projectName || project.name,
              service: pp.humanLabel || '',
            });
          }
        }
      }

      // CWD reverse-lookup for ports not yet associated
      const unassociatedPorts = rawPorts.filter((p) => !projectPortMap.has(p.port) && p.pid > 0);
      if (unassociatedPorts.length > 0) {
        const cwds = portScanner.getProcessCwds(unassociatedPorts.map((p) => p.pid));
        for (const port of unassociatedPorts) {
          const cwd = cwds.get(port.pid);
          if (!cwd) continue;
          const cwdLower = cwd.toLowerCase();
          for (const project of projects) {
            const projLower = project.path.toLowerCase();
            if (cwdLower.startsWith(projLower) || projLower.startsWith(cwdLower)) {
              projectPortMap.set(port.port, { id: project.id, name: project.name, service: '' });
              break;
            }
          }
        }
      }

      // Porte di servizi di sistema noti (non sono progetti ma non devono apparire come "non associato")
      const SYSTEM_SERVICE_PORTS: Record<number, string> = {
        11434: 'Ollama (Servizio AI)',
        5432: 'PostgreSQL (Database)',
        3306: 'MySQL (Database)',
        27017: 'MongoDB (Database)',
        6379: 'Redis (Cache)',
        5050: 'pgAdmin (Database UI)',
        9000: 'Portainer (Docker UI)',
        8888: 'Jupyter Notebook',
      };

      // Applica filtri dalle impostazioni
      const portSettings = getSettings().ports;
      const hiddenPorts = new Set(portSettings?.hiddenPorts || []);
      const showEphemeral = portSettings?.showEphemeralPorts !== false; // default true

      const filteredPorts = rawPorts.filter((p) => {
        // Filtra porte nascoste dall'utente
        if (hiddenPorts.has(p.port)) return false;
        // Filtra porte effimere (49152-65535) se disabilitato
        if (!showEphemeral && p.port >= 49152) return false;
        return true;
      });

      return filteredPorts.map((p) => {
        const match = projectPortMap.get(p.port);
        if (match) {
          return {
            ...p,
            projectId: match.id,
            projectName: match.name,
            humanLabel: match.service || p.humanLabel,
          };
        }
        // Per servizi di sistema noti, mostra il nome del servizio come "progetto"
        const systemService = SYSTEM_SERVICE_PORTS[p.port];
        if (systemService) {
          return {
            ...p,
            projectName: systemService,
          };
        }
        return p;
      });
    } catch (error) {
      console.error('[IPC] Error getting ports:', error);
      return [];
    }
  });

  ipcMain.handle(IPC_CHANNELS.PORTS_KILL_PROCESS, async (_event, pid: number) => {
    try {
      if (portScanner) {
        await portScanner.killProcess(pid);
        return { success: true };
      }
    } catch (error) {
      console.error('[IPC] Error killing process:', error);
      throw error;
    }
  });

  // --- DOCKER OPERATIONS ---

  ipcMain.handle(IPC_CHANNELS.DOCKER_GET_CONTAINERS, async () => {
    try {
      return await dockerMonitor.getContainers();
    } catch (error) {
      // Docker not connected or not available — return empty, don't crash
      console.warn('[IPC] Docker not available or error getting containers:', (error as Error).message);
      return [];
    }
  });

  ipcMain.handle(IPC_CHANNELS.DOCKER_GET_COMPOSE_PROJECTS, async () => {
    try {
      return await dockerMonitor.getComposeProjects();
    } catch (error) {
      console.warn('[IPC] Docker not available or error getting compose projects:', (error as Error).message);
      return [];
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.DOCKER_CONTAINER_ACTION,
    async (_event, containerId: string, action: string) => {
      try {
        if (dockerMonitor) {
          switch (action) {
            case 'start': await dockerMonitor.startContainer(containerId); break;
            case 'stop': await dockerMonitor.stopContainer(containerId); break;
            case 'restart': await dockerMonitor.restartContainer(containerId); break;
            default: throw new Error(`Unknown action: ${action}`);
          }
          return { success: true };
        }
      } catch (error) {
        console.error('[IPC] Error performing container action:', error);
        throw error;
      }
    }
  );

  ipcMain.handle(IPC_CHANNELS.DOCKER_CONTAINER_LOGS, async (_event, containerId: string, lines?: number) => {
    try {
      return await dockerMonitor.getContainerLogs(containerId, lines);
    } catch (error) {
      console.error('[IPC] Error getting container logs:', error);
      return '';
    }
  });

  // --- DOCKER COMPOSE OPERATIONS ---

  ipcMain.handle('docker:compose-start', async (_event, projectName: string) => {
    try {
      await dockerMonitor.startComposeProject(projectName);
      // Force refresh containers to emit change event
      setTimeout(async () => {
        try {
          const containers = await dockerMonitor.getContainers();
          if (mainWindow) {
            mainWindow.webContents.send(IPC_CHANNELS.DOCKER_EVENTS, containers);
          }
        } catch { /* ignore */ }
      }, 2000);
      return { success: true };
    } catch (error) {
      console.error('[IPC] Error starting compose project:', error);
      throw error;
    }
  });

  ipcMain.handle('docker:compose-stop', async (_event, projectName: string) => {
    try {
      await dockerMonitor.stopComposeProject(projectName);
      // Force refresh containers to emit change event
      setTimeout(async () => {
        try {
          const containers = await dockerMonitor.getContainers();
          if (mainWindow) {
            mainWindow.webContents.send(IPC_CHANNELS.DOCKER_EVENTS, containers);
          }
        } catch { /* ignore */ }
      }, 2000);
      return { success: true };
    } catch (error) {
      console.error('[IPC] Error stopping compose project:', error);
      throw error;
    }
  });

  // --- PROJECT OPERATIONS ---

  ipcMain.handle(IPC_CHANNELS.PROJECTS_GET_ALL, async () => {
    try {
      // Filter out archived/hidden projects
      return projectDiscovery.getProjects().filter((p) => !p.isArchived);
    } catch (error) {
      console.error('[IPC] Error getting projects:', error);
      return [];
    }
  });

  // --- Manual Rescan: re-discovers projects from configured directories ---
  ipcMain.handle(IPC_CHANNELS.PROJECTS_RESCAN, async () => {
    try {
      const settings = getSettings();
      const dirs = settings.scanning?.directories || ['~/Desktop', '~/Documents', '~/Code'];
      console.log('[IPC] Manual rescan triggered for:', dirs);
      await projectDiscovery.scanAll(dirs);
      // Immediately enrich after rescan
      await enrichProjects();
      const projects = projectDiscovery.getProjects().filter((p) => !p.isArchived);
      if (mainWindow) {
        mainWindow.webContents.send(IPC_CHANNELS.PROJECTS_UPDATES, projects);
      }
      return { success: true, count: projects.length };
    } catch (error) {
      console.error('[IPC] Error rescanning projects:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROJECTS_GET_ONE, async (_event, projectId: string) => {
    try {
      return projectDiscovery.getProject(projectId);
    } catch (error) {
      console.error('[IPC] Error getting project:', error);
      return null;
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROJECTS_OPEN_FOLDER, async (_event, projectPath: string) => {
    try {
      await shell.openPath(projectPath);
      return { success: true };
    } catch (error) {
      console.error('[IPC] Error opening folder:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROJECTS_OPEN_TERMINAL, async (_event, projectPath: string) => {
    try {
      spawn('open', ['-a', 'Terminal', projectPath]);
      return { success: true };
    } catch (error) {
      console.error('[IPC] Error opening terminal:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROJECTS_OPEN_VSCODE, async (_event, projectPath: string) => {
    try {
      // VS Code 'code' CLI might not be in PATH when launched from Electron
      // Try known locations on macOS
      const codePaths = [
        '/usr/local/bin/code',
        '/opt/homebrew/bin/code',
        '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code',
      ];
      let codeBin = 'code';
      for (const p of codePaths) {
        try {
          const fs = require('fs');
          if (fs.existsSync(p)) { codeBin = p; break; }
        } catch { /* ignore */ }
      }
      spawn(codeBin, [projectPath], { stdio: 'ignore', detached: true }).unref();
      return { success: true };
    } catch (error) {
      console.error('[IPC] Error opening VS Code:', error);
      // Fallback: try using 'open' command on macOS
      try {
        spawn('open', ['-a', 'Visual Studio Code', projectPath], { stdio: 'ignore' });
        return { success: true };
      } catch {
        throw error;
      }
    }
  });

  // ── Project Notes (.lobster.md) ──

  const NOTES_FILENAME = '.lobster.md';
  const PROFILE_DIR = path.join(app.getPath('home'), 'Documents', 'Lobster');
  const PROFILE_FILE = path.join(PROFILE_DIR, 'MY-PROFILE.md');

  function generateProjectNotesTemplate(project: any): string {
    const now = new Date().toISOString().split('T')[0];
    const portsSection = (project.ports || [])
      .filter((p: any) => p.state === 'LISTEN')
      .map((p: any) => `- **${p.port}** — ${p.humanLabel}`)
      .join('\n') || '_Nessuna porta attiva_';

    const containersSection = (project.containers || [])
      .map((c: any) => `- **${c.friendlyName || c.name}** — ${c.humanStatus} (${c.state})`)
      .join('\n') || '_Nessun container Docker_';

    return `# ${project.name}

> File generato da Lobster Manager il ${now}
> Puoi modificarlo liberamente — Lobster lo leggerà dalla UI.

## Descrizione e Scopo

_Descrivi qui cosa fa questo progetto, a chi serve e quali obiettivi ha._



## Stack e Architettura

- **Tipo progetto:** ${project.type}
- **Percorso:** \`${project.path}\`
${project.gitBranch ? `- **Branch Git:** ${project.gitBranch}` : ''}

### Porte
${portsSection}

### Container Docker
${containersSection}

### Tecnologie
_Elenca qui le tecnologie principali usate nel progetto._



## Note e Diario

_Spazio libero per appunti, idee, problemi aperti, TODO._

### ${now}
- Progetto registrato in Lobster Manager


## Istruzioni per AI

> Questo blocco viene letto dalle AI (Claude, ChatGPT, Copilot, etc.) quando lavorano su questo progetto.
> Scrivi qui le regole, i vincoli e il contesto che un'AI deve sapere.

### Contesto
_Descrivi il contesto del progetto per un'AI che lo vede per la prima volta._

### Regole
_Elenca regole specifiche per questo progetto (es. "non toccare il file X", "usa sempre TypeScript strict")._

### Vincoli
_Vincoli tecnici, di business o di sicurezza._

`;
  }

  function generateProfileTemplate(projects: any[]): string {
    const now = new Date().toISOString().split('T')[0];
    const projectsList = projects
      .filter((p: any) => !p.isArchived)
      .map((p: any) => {
        const status = p.status === 'running' ? '��' : p.status === 'stopped' ? '🔴' : '🟡';
        return `| ${status} | **${p.name}** | ${p.type} | \`${p.path.replace(/^\/Users\/[^/]+/, '~')}\` |`;
      })
      .join('\n');

    return `# Il Mio Profilo — Contesto per AI

> Generato da Lobster Manager il ${now}
> Questo file è pensato per essere condiviso con AI (Claude, ChatGPT, etc.)
> per dare contesto su chi sei e come lavori.

## Chi Sono

_Descrivi qui chi sei, il tuo ruolo e cosa fai._

- **Nome:**
- **Ruolo:**
- **Esperienza:**
- **Come preferisco lavorare:**

## I Miei Progetti Attivi

| Stato | Progetto | Tipo | Percorso |
|-------|----------|------|----------|
${projectsList || '| — | Nessun progetto rilevato | — | — |'}

## Le Mie Regole per le AI

> Queste regole devono essere rispettate da qualsiasi AI che lavora sui miei progetti.

### Stile di Comunicazione
_Come preferisci che le AI comunichino con te._

### Vincoli Generali
_Regole che valgono per TUTTI i progetti._

### Cosa Evitare
_Pattern, pratiche o comportamenti che le AI devono evitare._

## Stack e Strumenti

- **OS:** macOS (Apple Silicon)
- **Editor:**
- **Terminale:**
- **Browser:**
- **Linguaggi principali:**
- **Framework:**
- **Strumenti AI:**

## Note Aggiuntive

_Qualsiasi altra informazione utile per un'AI._

`;
  }

  ipcMain.handle(IPC_CHANNELS.PROJECTS_GET_NOTES, async (_event, projectId: string) => {
    try {
      const project = projectDiscovery.getProject(projectId);
      if (!project) return { exists: false, content: '' };
      const notesPath = path.join(project.path, NOTES_FILENAME);
      if (fs.existsSync(notesPath)) {
        const content = fs.readFileSync(notesPath, 'utf-8');
        return { exists: true, content };
      }
      return { exists: false, content: '' };
    } catch (error) {
      console.error('[IPC] Error reading project notes:', error);
      return { exists: false, content: '' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROJECTS_SAVE_NOTES, async (_event, projectId: string, content: string) => {
    try {
      const project = projectDiscovery.getProject(projectId);
      if (!project) throw new Error('Project not found');
      const notesPath = path.join(project.path, NOTES_FILENAME);
      const tmpPath = notesPath + '.tmp';
      fs.writeFileSync(tmpPath, content, 'utf-8');
      fs.renameSync(tmpPath, notesPath);
      console.log(`[Notes] Saved .lobster.md for "${project.name}" at ${notesPath}`);
      return { success: true };
    } catch (error) {
      console.error('[IPC] Error saving project notes:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROJECTS_GENERATE_NOTES, async (_event, projectId: string) => {
    try {
      const project = projectDiscovery.getProject(projectId);
      if (!project) throw new Error('Project not found');
      const notesPath = path.join(project.path, NOTES_FILENAME);
      // Don't overwrite existing notes
      if (fs.existsSync(notesPath)) {
        const content = fs.readFileSync(notesPath, 'utf-8');
        return { exists: true, content, wasGenerated: false };
      }
      const content = generateProjectNotesTemplate(project);
      const tmpPath = notesPath + '.tmp';
      fs.writeFileSync(tmpPath, content, 'utf-8');
      fs.renameSync(tmpPath, notesPath);
      console.log(`[Notes] Generated .lobster.md for "${project.name}"`);
      return { exists: true, content, wasGenerated: true };
    } catch (error) {
      console.error('[IPC] Error generating project notes:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROJECTS_HAS_NOTES, async (_event, projectId: string) => {
    try {
      const project = projectDiscovery.getProject(projectId);
      if (!project) return false;
      return fs.existsSync(path.join(project.path, NOTES_FILENAME));
    } catch {
      return false;
    }
  });

  // ── Profile (MY-PROFILE.md) ──

  ipcMain.handle(IPC_CHANNELS.PROFILE_GET, async () => {
    try {
      if (fs.existsSync(PROFILE_FILE)) {
        const content = fs.readFileSync(PROFILE_FILE, 'utf-8');
        return { exists: true, content, path: PROFILE_FILE };
      }
      return { exists: false, content: '', path: PROFILE_FILE };
    } catch (error) {
      console.error('[IPC] Error reading profile:', error);
      return { exists: false, content: '', path: PROFILE_FILE };
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROFILE_SAVE, async (_event, content: string) => {
    try {
      // Ensure directory exists
      if (!fs.existsSync(PROFILE_DIR)) {
        fs.mkdirSync(PROFILE_DIR, { recursive: true });
      }
      const tmpPath = PROFILE_FILE + '.tmp';
      fs.writeFileSync(tmpPath, content, 'utf-8');
      fs.renameSync(tmpPath, PROFILE_FILE);
      console.log(`[Profile] Saved MY-PROFILE.md at ${PROFILE_FILE}`);
      return { success: true };
    } catch (error) {
      console.error('[IPC] Error saving profile:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROFILE_GENERATE, async () => {
    try {
      if (fs.existsSync(PROFILE_FILE)) {
        const content = fs.readFileSync(PROFILE_FILE, 'utf-8');
        return { exists: true, content, wasGenerated: false, path: PROFILE_FILE };
      }
      if (!fs.existsSync(PROFILE_DIR)) {
        fs.mkdirSync(PROFILE_DIR, { recursive: true });
      }
      const projects = projectDiscovery.getProjects().filter((p) => !p.isArchived);
      const content = generateProfileTemplate(projects);
      const tmpPath = PROFILE_FILE + '.tmp';
      fs.writeFileSync(tmpPath, content, 'utf-8');
      fs.renameSync(tmpPath, PROFILE_FILE);
      console.log(`[Profile] Generated MY-PROFILE.md with ${projects.length} projects`);
      return { exists: true, content, wasGenerated: true, path: PROFILE_FILE };
    } catch (error) {
      console.error('[IPC] Error generating profile:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROFILE_GET_PATH, async () => {
    return PROFILE_FILE;
  });

  // ── LobsterCode (embedded AI coding assistant via MNEMO) ──
  // --- Core ---
  ipcMain.handle('code:check-status', async () => {
    return lobsterCodeService.checkStatus();
  });

  ipcMain.handle('code:chat', async (_event, message: string) => {
    lobsterCodeService.chat(message, (chatEvent) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('code:chat-event', chatEvent);
      }
    }).catch((err) => {
      console.error('[LobsterCode] Chat error:', err);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('code:chat-event', { type: 'error', content: err.message });
      }
    });
    return { success: true };
  });

  ipcMain.handle('code:clear-history', async () => {
    lobsterCodeService.clearHistory();
    return { success: true };
  });

  ipcMain.handle('code:set-model', async (_event, model: string) => {
    lobsterCodeService.setModel(model);
    return { success: true };
  });

  ipcMain.handle('code:switch-workspace', async (_event, workspace: string) => {
    lobsterCodeService.setWorkspace(workspace);
    return { success: true };
  });

  ipcMain.handle('code:abort', async () => {
    lobsterCodeService.abort();
    return { success: true };
  });

  // --- Permessi ---
  ipcMain.handle('code:set-permission', async (_event, mode: string) => {
    const valid = ['read-only', 'workspace-write', 'full-access'];
    if (!valid.includes(mode)) throw new Error(`Permesso non valido: ${mode}`);
    lobsterCodeService.setPermission(mode as any);
    return { success: true };
  });

  // --- Sessioni ---
  ipcMain.handle('code:get-sessions', async () => {
    return lobsterCodeService.getSessions();
  });

  ipcMain.handle('code:create-session', async () => {
    const id = lobsterCodeService.createSession();
    return { id };
  });

  ipcMain.handle('code:switch-session', async (_event, id: string) => {
    lobsterCodeService.switchSession(id);
    return { success: true };
  });

  ipcMain.handle('code:delete-session', async (_event, id: string) => {
    lobsterCodeService.deleteSession(id);
    return { success: true };
  });

  ipcMain.handle('code:rename-session', async (_event, id: string, title: string) => {
    lobsterCodeService.renameSession(id, title);
    return { success: true };
  });

  // --- Git ---
  ipcMain.handle('code:git-status', async () => {
    return lobsterCodeService.getGitStatus();
  });

  ipcMain.handle('code:git-log', async () => {
    return lobsterCodeService.getGitLog();
  });

  ipcMain.handle('code:git-commit', async (_event, message: string) => {
    return lobsterCodeService.gitCommit(message);
  });

  ipcMain.handle('code:git-diff', async (_event, file?: string) => {
    return lobsterCodeService.gitDiff(file);
  });

  ipcMain.handle('code:git-init', async () => {
    return lobsterCodeService.gitInit();
  });

  // --- File modificati ---
  ipcMain.handle('code:get-modified-files', async () => {
    return lobsterCodeService.getModifiedFiles();
  });

  // --- Snapshot & Rollback ---
  ipcMain.handle('code:get-snapshots', async () => {
    return lobsterCodeService.getSnapshots();
  });

  ipcMain.handle('code:rollback-snapshot', async (_event, id: number) => {
    return lobsterCodeService.rollbackSnapshot(id);
  });

  // --- Session Memory ---
  ipcMain.handle('code:get-session-memory', async () => {
    return lobsterCodeService.getSessionMemory();
  });

  ipcMain.handle('code:save-session-memory', async (_event, content: string) => {
    await lobsterCodeService.saveSessionMemory(content);
    return { success: true };
  });

  // --- Prompt Templates & Project DNA ---
  ipcMain.handle('code:get-prompt-templates', async () => {
    return lobsterCodeService.getPromptTemplates();
  });

  ipcMain.handle('code:detect-project-dna', async () => {
    return lobsterCodeService.detectProjectDNA();
  });

  // --- Model download ---
  ipcMain.handle('code:pull-model', async (_event, modelName: string) => {
    lobsterCodeService.pullModel(modelName, (progress) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('code:pull-progress', { model: modelName, progress });
      }
    }).catch((err) => {
      console.error('[LobsterCode] Pull error:', err);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('code:pull-progress', { model: modelName, progress: -1, error: err.message });
      }
    });
    return { success: true };
  });

  ipcMain.handle('projects:hide', async (_event, projectId: string) => {
    try {
      const success = projectDiscovery.removeProject(projectId);
      if (success && mainWindow) {
        // Notify renderer of updated project list
        const projects = projectDiscovery.getProjects().filter((p) => !p.isArchived);
        mainWindow.webContents.send(IPC_CHANNELS.PROJECTS_UPDATES, projects);
      }
      return { success };
    } catch (error) {
      console.error('[IPC] Error hiding project:', error);
      return { success: false };
    }
  });

  // --- NOTIFICATION OPERATIONS ---

  ipcMain.handle(IPC_CHANNELS.NOTIFICATIONS_GET_ALL, async () => {
    try {
      return notificationService.getHistory();
    } catch (error) {
      console.error('[IPC] Error getting notifications:', error);
      return [];
    }
  });

  ipcMain.handle(IPC_CHANNELS.NOTIFICATIONS_MARK_READ, async (_event, notificationId: string) => {
    try {
      notificationService.markRead(notificationId);
      return { success: true };
    } catch (error) {
      console.error('[IPC] Error marking notification read:', error);
      throw error;
    }
  });

  // --- RESOURCE OPERATIONS ---

  ipcMain.handle(IPC_CHANNELS.RESOURCES_GET, async () => {
    try {
      return resourceMonitor ? await resourceMonitor.getSystemResources() : null;
    } catch (error) {
      console.error('[IPC] Error getting resources:', error);
      return null;
    }
  });

  // --- DESKTOP SHORTCUT OPERATIONS ---

  ipcMain.handle(
    IPC_CHANNELS.SHORTCUTS_CREATE,
    async (_event, projectId: string) => {
      try {
        const project = projectDiscovery.getProject(projectId);
        if (!project) throw new Error('Progetto non trovato');
        const url = project.ports?.[0]?.url || `http://localhost:${project.ports?.[0]?.port || 3000}`;
        return await desktopShortcuts.createShortcut(project.name, project.icon, url);
      } catch (error) {
        console.error('[IPC] Error creating shortcut:', error);
        throw error;
      }
    }
  );

  ipcMain.handle(IPC_CHANNELS.SHORTCUTS_CREATE_ALL, async () => {
    try {
      // Retrieve projects internally — preload sends no arguments
      const projects = projectDiscovery.getProjects().filter((p) => !p.isArchived);
      return await desktopShortcuts.createAllShortcuts(projects);
    } catch (error) {
      console.error('[IPC] Error creating all shortcuts:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.SHORTCUTS_REMOVE, async (_event, projectId: string) => {
    try {
      const project = projectDiscovery.getProject(projectId);
      if (!project) throw new Error('Progetto non trovato');
      return await desktopShortcuts.removeShortcut(project.name, project.icon);
    } catch (error) {
      console.error('[IPC] Error removing shortcut:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.SHORTCUTS_GET_ALL, async () => {
    try {
      return await desktopShortcuts.getShortcuts();
    } catch (error) {
      console.error('[IPC] Error getting shortcuts:', error);
      return [];
    }
  });

  // --- UI TEST AGENT OPERATIONS ---

  ipcMain.handle('uitest:check-status', async () => {
    return await uiTestAgent.checkAvailability();
  });

  ipcMain.handle('uitest:test-project', async (_event, projectId: string) => {
    const project = projectDiscovery.getProject(projectId);
    if (!project) throw new Error('Progetto non trovato');

    // Smart URL finding: try multiple sources
    let url = '';

    // 1. Active ports with URL
    const activePort = project.ports.find((p) => p.url && p.state === 'LISTEN');
    if (activePort?.url) {
      url = activePort.url;
    }

    // 2. Any port with URL
    if (!url) {
      const anyUrl = project.ports.find((p) => p.url);
      if (anyUrl?.url) url = anyUrl.url;
    }

    // 3. Expected ports from config
    if (!url && project.config?.expectedPorts?.length) {
      const ep = project.config.expectedPorts[0];
      url = ep.healthCheckUrl || `http://localhost:${ep.port}`;
    }

    // 4. Any port number
    if (!url && project.ports.length > 0) {
      url = `http://localhost:${project.ports[0].port}`;
    }

    // 5. Scan active system ports for this project path
    if (!url) {
      try {
        const activePorts = portScanner.scanOnce();
        // Try common dev ports
        const devPorts = [3000, 5173, 5174, 8000, 8080, 4200, 5000];
        const found = activePorts.find((p: PortInfo) => devPorts.includes(p.port));
        if (found) {
          url = `http://localhost:${found.port}`;
        }
      } catch { /* ignore */ }
    }

    if (!url) throw new Error('Nessun URL testabile trovato. Avvia un servizio web nel progetto.');
    return await uiTestAgent.quickHealthCheck(url, project);
  });

  ipcMain.handle('uitest:test-url', async (_event, url: string, projectId?: string) => {
    const project = projectId ? projectDiscovery.getProject(projectId) : undefined;
    const fakeProject = project || { id: 'manual', name: 'Test Manuale', path: '', type: 'generic' as const } as any;
    return await uiTestAgent.quickHealthCheck(url, fakeProject);
  });

  ipcMain.handle('uitest:test-all', async () => {
    // First try project-based testing
    const projects = projectDiscovery.getProjects();
    const projectResults = await uiTestAgent.testAllProjects(projects);

    // Also scan active ports directly (the smart approach)
    let portResults: any[] = [];
    try {
      const activePorts = portScanner.scanOnce();
      if (activePorts.length > 0) {
        portResults = await uiTestAgent.testActivePorts(activePorts);
      }
    } catch { /* ignore */ }

    // Merge: project results first, then port results (skip duplicates)
    const seenUrls = new Set(projectResults.map((r: any) => r.url).filter(Boolean));
    const merged = [
      ...projectResults.filter((r: any) => r.status !== 'skipped'), // skip "no URL" results
      ...portResults.filter((r: any) => !seenUrls.has(r.url)),
    ];

    return merged.length > 0 ? merged : projectResults; // fallback to original if nothing found
  });

  ipcMain.handle('uitest:get-results', async () => {
    return uiTestAgent.getResults();
  });

  // --- SMART ADVISOR OPERATIONS ---

  ipcMain.handle('advisor:check-status', async () => {
    try {
      const available = await smartAdvisor.checkAvailability();
      const models = available ? await smartAdvisor.getAvailableModels() : [];
      return { available, models };
    } catch (error) {
      return { available: false, models: [] };
    }
  });

  ipcMain.handle('advisor:analyze-project', async (_event, projectId: string) => {
    const project = projectDiscovery.getProject(projectId);
    if (!project) {
      return {
        projectId,
        projectName: 'Sconosciuto',
        suggestions: [],
        summary: 'Progetto non trovato. Prova ad aggiornare la dashboard.',
        analyzedAt: new Date().toISOString(),
      };
    }
    // analyzeProject handles its own errors gracefully — never throws
    return await smartAdvisor.analyzeProject(project);
  });

  ipcMain.handle('advisor:quick-triage', async () => {
    try {
      const projects = projectDiscovery.getProjects().filter((p) => !p.isArchived);
      let resources: SystemResources | null = null;
      try { resources = await resourceMonitor.getSystemResources(); } catch {}

      // === DETERMINISTIC ALERTS (code-based, NOT AI-dependent) ===
      // These always fire when thresholds are exceeded, regardless of Ollama
      const deterministicAlerts: any[] = [];

      if (resources) {
        // HIGH RAM — always report with specific consumers
        if (resources.memoryPercent >= 70) {
          const consumers = resources.memoryTopConsumers || [];
          const topList = consumers
            .filter((c: any) => c.memoryMB >= 100)
            .slice(0, 5)
            .map((c: any) => {
              const label = c.memoryMB >= 1024
                ? `${(c.memoryMB / 1024).toFixed(1)} GB`
                : `${c.memoryMB} MB`;
              return `${c.name} (${label})`;
            });

          const severity = resources.memoryPercent >= 90 ? 'critical'
            : resources.memoryPercent >= 80 ? 'warning' : 'info';

          deterministicAlerts.push({
            id: `system_ram_${Date.now()}`,
            category: 'performance',
            severity,
            title: `RAM al ${Math.round(resources.memoryPercent)}% — ${resources.memoryUsedGB.toFixed(1)}/${resources.memoryTotalGB.toFixed(0)} GB`,
            description: topList.length > 0
              ? `I processi che consumano più RAM sono: ${topList.join(', ')}. ${
                  severity === 'critical'
                    ? 'Il sistema potrebbe rallentare. Chiudi app non necessarie o ferma container Docker dalla Dashboard.'
                    : severity === 'warning'
                      ? 'Tieni d\'occhio la situazione. Puoi fermare container non necessari dalla Dashboard.'
                      : 'Situazione sotto controllo ma da monitorare.'
                }`
              : `La RAM è al ${Math.round(resources.memoryPercent)}%. Chiudi applicazioni non necessarie per liberare memoria.`,
            actionLabel: 'Vai alla Dashboard',
            actionType: 'go-dashboard',
            timestamp: new Date().toISOString(),
          });
        }

        // HIGH CPU
        if (resources.cpuPercent >= 80) {
          const severity = resources.cpuPercent >= 95 ? 'critical' : 'warning';
          deterministicAlerts.push({
            id: `system_cpu_${Date.now()}`,
            category: 'performance',
            severity,
            title: `CPU al ${Math.round(resources.cpuPercent)}%`,
            description: `Il processore è sotto pressione (${Math.round(resources.cpuPercent)}%). Potrebbe esserci un processo che consuma molto. Controlla Activity Monitor o ferma servizi non necessari.`,
            actionLabel: 'Vai alla Dashboard',
            actionType: 'go-dashboard',
            timestamp: new Date().toISOString(),
          });
        }

        // HIGH DISK
        if (resources.diskPercent >= 90) {
          const severity = resources.diskPercent >= 95 ? 'critical' : 'warning';
          deterministicAlerts.push({
            id: `system_disk_${Date.now()}`,
            category: 'performance',
            severity,
            title: `Disco al ${Math.round(resources.diskPercent)}% — ${resources.diskUsedGB.toFixed(0)}/${resources.diskTotalGB.toFixed(0)} GB`,
            description: `Lo spazio su disco è quasi esaurito. Libera spazio eliminando file non necessari, svuotando il cestino o rimuovendo immagini Docker inutilizzate (docker system prune).`,
            actionLabel: 'Vai alla Dashboard',
            actionType: 'go-dashboard',
            timestamp: new Date().toISOString(),
          });
        }
      }

      // Now try AI-based triage (may fail if Ollama is down)
      let aiSuggestions: any[] = [];
      try {
        aiSuggestions = await smartAdvisor.quickTriage(projects, resources);
      } catch (error: any) {
        console.warn('[IPC] AI triage failed, using deterministic alerts only:', error?.message);
      }

      // Merge: deterministic alerts first, then AI suggestions (deduplicated)
      const result = [...deterministicAlerts];
      for (const ai of aiSuggestions) {
        // Skip AI suggestions that overlap with deterministic ones
        const isDuplicate = deterministicAlerts.some(
          (d) => d.category === ai.category && d.category === 'performance'
            && (d.title.includes('RAM') && ai.title?.toLowerCase().includes('ram')
              || d.title.includes('CPU') && ai.title?.toLowerCase().includes('cpu')
              || d.title.includes('Disco') && ai.title?.toLowerCase().includes('disc'))
        );
        if (!isDuplicate) {
          result.push(ai);
        }
      }

      return result;
    } catch (error: any) {
      console.error('[IPC] Error running triage:', error?.message);
      throw error;
    }
  });

  ipcMain.handle('advisor:get-suggestions', async () => {
    return smartAdvisor.getSuggestions();
  });

  ipcMain.handle('advisor:set-model', async (_event, model: string) => {
    smartAdvisor.setPreferredModel(model);
    return { success: true, model };
  });

  ipcMain.handle('advisor:get-preferred-model', async () => {
    return smartAdvisor.getPreferredModel();
  });

  // --- MNEMO PROXY OPERATIONS ---

  ipcMain.handle('mnemo:check-availability', async () => {
    try {
      return await mnemoService.checkAvailability();
    } catch (error) {
      console.error('[MNEMO] check-availability error:', error);
      return false;
    }
  });

  ipcMain.handle('mnemo:get-health', async () => {
    try {
      return await mnemoService.getHealth();
    } catch (error) {
      console.error('[MNEMO] get-health error:', error);
      return null;
    }
  });

  ipcMain.handle('mnemo:get-stats', async () => {
    try {
      return await mnemoService.getStats();
    } catch (error) {
      console.error('[MNEMO] get-stats error:', error);
      return null;
    }
  });

  ipcMain.handle('mnemo:get-sessions', async () => {
    try {
      return await mnemoService.getSessions();
    } catch (error) {
      console.error('[MNEMO] get-sessions error:', error);
      return [];
    }
  });

  ipcMain.handle('mnemo:get-profiles', async () => {
    try {
      return await mnemoService.getProfiles();
    } catch (error) {
      console.error('[MNEMO] get-profiles error:', error);
      return [];
    }
  });

  ipcMain.handle('mnemo:get-config', async () => {
    try {
      return await mnemoService.getConfig();
    } catch (error) {
      console.error('[MNEMO] get-config error:', error);
      return null;
    }
  });

  ipcMain.handle('mnemo:update-config', async (_event, updates: Record<string, any>) => {
    try {
      return await mnemoService.updateConfig(updates);
    } catch (error) {
      console.error('[MNEMO] update-config error:', error);
      return null;
    }
  });

  ipcMain.handle('mnemo:get-overview', async () => {
    try {
      return await mnemoService.getOverview();
    } catch (error) {
      console.error('[MNEMO] get-overview error:', error);
      return { available: false, health: null, stats: null, sessions: [], profiles: [], config: null };
    }
  });

  ipcMain.handle('mnemo:start-server', async () => {
    try {
      const success = await mnemoService.tryAutoStart();
      return { success, message: success ? 'MNEMO avviato' : 'Avvio fallito' };
    } catch (error: any) {
      console.error('[MNEMO] start-server error:', error);
      return { success: false, message: error.message };
    }
  });

  // --- SETTINGS OPERATIONS ---

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, async () => {
    try {
      return getSettings();
    } catch (error) {
      console.error('[IPC] Error getting settings:', error);
      return DEFAULT_SETTINGS;
    }
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_UPDATE, async (_event, updates: Partial<AppSettings>) => {
    try {
      const oldSettings = getSettings();
      const newSettings = updateSettings(updates);
      console.log('[Settings] Impostazioni aggiornate e salvate su disco');

      // === PROPAGAZIONE AI SERVIZI IN TEMPO REALE ===

      // Port scanner: aggiorna polling interval se cambiato
      if (updates.ports?.pollingIntervalMs !== undefined || updates.scanning?.pollingIntervalMs !== undefined) {
        const newPortInterval = newSettings.ports?.pollingIntervalMs || newSettings.scanning?.pollingIntervalMs || 5000;
        console.log(`[Settings] Riavvio port scanner con intervallo ${newPortInterval}ms`);
        portScanner.stopPolling();
        portScanner.startPolling(newPortInterval);
      }

      // Docker: aggiorna polling interval se cambiato
      if (updates.docker?.pollingIntervalMs !== undefined) {
        const newDockerInterval = newSettings.docker?.pollingIntervalMs || 5000;
        console.log(`[Settings] Riavvio Docker monitor con intervallo ${newDockerInterval}ms`);
        dockerMonitor.stopPolling();
        dockerMonitor.startPolling(newDockerInterval);
      }

      // Docker: aggiorna socket path se cambiato
      if (updates.docker?.socketPath) {
        dockerMonitor.setSocketPath(newSettings.docker.socketPath);
        console.log(`[Settings] Docker socket path aggiornato: ${newSettings.docker.socketPath}`);
      }

      // Docker: abilita/disabilita
      if (updates.docker?.enabled !== undefined) {
        if (newSettings.docker.enabled) {
          console.log('[Settings] Docker abilitato — avvio connessione');
          dockerMonitor.connect().then((ok) => {
            if (ok) dockerMonitor.startPolling(newSettings.docker.pollingIntervalMs || 5000);
          });
        } else {
          console.log('[Settings] Docker disabilitato — fermo polling');
          dockerMonitor.stopPolling();
        }
      }

      // Scanning directories: riscansiona se le cartelle sono cambiate
      if (updates.scanning?.directories) {
        const oldDirs = (oldSettings.scanning?.directories || []).sort().join(',');
        const newDirs = (newSettings.scanning?.directories || []).sort().join(',');
        if (oldDirs !== newDirs) {
          console.log('[Settings] Directory di scansione cambiate — riscansione in corso...');
          projectDiscovery.stopWatching();
          await projectDiscovery.scanAll(newSettings.scanning.directories);
          projectDiscovery.startWatching(newSettings.scanning.directories);
          // Enrich immediatamente
          await enrichProjects();
          const projects = projectDiscovery.getProjects().filter((p: any) => !p.isArchived);
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(IPC_CHANNELS.PROJECTS_UPDATES, projects);
          }
          console.log(`[Settings] Riscansione completata: ${projects.length} progetti trovati`);
        }
      }

      // MNEMO: aggiorna configurazione se cambiata
      if (updates.mnemo) {
        console.log('[Settings] Aggiornamento configurazione MNEMO');
        mnemoService.updateBaseUrl(newSettings.mnemo.baseUrl);
        mnemoService.setAutoStart(newSettings.mnemo.autoStart === true);
        // Anche LobsterCode usa MNEMO come proxy
        lobsterCodeService.setBaseUrl(newSettings.mnemo.baseUrl);
        console.log(`[Settings] LobsterCode baseUrl aggiornato: ${newSettings.mnemo.baseUrl}`);
      }

      // Smart Advisor (Ollama): aggiorna configurazione se cambiata
      if (updates.ollama) {
        console.log('[Settings] Aggiornamento configurazione Ollama');
        smartAdvisor.updateConfig({
          baseUrl: newSettings.ollama.baseUrl,
          triageModel: newSettings.ollama.triageModel,
          analysisModel: newSettings.ollama.analysisModel,
          deepModel: newSettings.ollama.deepModel,
          fallbackModel: newSettings.ollama.fallbackModel,
        });
      }

      // Notifica il renderer che le impostazioni sono cambiate (per aggiornare le viste)
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('settings:changed', newSettings);
      }

      return newSettings;
    } catch (error) {
      console.error('[IPC] Error updating settings:', error);
      throw error;
    }
  });

  ipcMain.handle('settings:reset', async () => {
    try {
      console.warn('[Settings] ⚠️ RESET CHIAMATO — stack:', new Error().stack?.split('\n').slice(0, 3).join(' | '));
      if (settingsStore) settingsStore.clear();
      inMemorySettings = { ...DEFAULT_SETTINGS };
      console.log('[Settings] Impostazioni ripristinate ai valori predefiniti');

      // Propagate reset to all services (same as settings:update)
      portScanner.stopPolling();
      portScanner.startPolling(DEFAULT_SETTINGS.ports?.pollingIntervalMs || 5000);

      dockerMonitor.stopPolling();
      if (DEFAULT_SETTINGS.docker?.enabled !== false) {
        dockerMonitor.startPolling(DEFAULT_SETTINGS.docker?.pollingIntervalMs || 5000);
      }

      mnemoService.updateBaseUrl(DEFAULT_SETTINGS.mnemo?.baseUrl || 'http://127.0.0.1:11435');

      smartAdvisor.updateConfig({
        baseUrl: DEFAULT_SETTINGS.ollama.baseUrl,
        triageModel: DEFAULT_SETTINGS.ollama.triageModel,
        analysisModel: DEFAULT_SETTINGS.ollama.analysisModel,
        deepModel: DEFAULT_SETTINGS.ollama.deepModel,
        fallbackModel: DEFAULT_SETTINGS.ollama.fallbackModel,
      });

      // Rescan default directories
      projectDiscovery.stopWatching();
      await projectDiscovery.scanAll(DEFAULT_SETTINGS.scanning.directories);
      projectDiscovery.startWatching(DEFAULT_SETTINGS.scanning.directories);

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('settings:changed', DEFAULT_SETTINGS);
      }

      return DEFAULT_SETTINGS;
    } catch (error) {
      console.error('[IPC] Error resetting settings:', error);
      inMemorySettings = { ...DEFAULT_SETTINGS };
      return DEFAULT_SETTINGS;
    }
  });

  // --- SYSTEM OPERATIONS ---

  ipcMain.handle(IPC_CHANNELS.SYSTEM_OPEN_URL, async (_event, url: string) => {
    try {
      // Security: only allow http/https URLs
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error(`Protocollo non consentito: ${parsed.protocol}`);
      }
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      console.error('[IPC] Error opening URL:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.SYSTEM_OPEN_PATH, async (_event, filePath: string) => {
    try {
      await shell.openPath(filePath);
      return { success: true };
    } catch (error) {
      console.error('[IPC] Error opening path:', error);
      throw error;
    }
  });
}

// ============================================================
// PROJECT STATUS ENRICHMENT
// ============================================================

/** Traccia lo stato precedente dei progetti per generare notifiche di cambio stato */
let lastProjectStates: Map<string, { status: string; name: string }> = new Map();

/**
 * Enriches discovered projects with live port/Docker/git data.
 * Called periodically and after every port/docker change event.
 *
 * Strategy:
 *  1. Read each project's expectedPorts (from docker-compose, package.json, .env)
 *  2. Check which expected ports are actually active via lsof scan
 *  3. Build PortInfo[] with matched status for the project card
 *  4. Correlate Docker containers by compose project label
 *  5. Determine traffic light status
 *  6. Compare with previous state and generate notifications on status change
 */
async function enrichProjects() {
  const projects = projectDiscovery.getProjects();
  if (projects.length === 0) return;

  // Get fresh port data (all listening ports on the system)
  let activePorts: PortInfo[] = [];
  try {
    activePorts = portScanner.scanOnce();
  } catch { /* ignore */ }

  // Build a fast lookup: port number → PortInfo
  const activePortMap = new Map<number, PortInfo>();
  for (const p of activePorts) {
    activePortMap.set(p.port, p);
  }

  // ── REVERSE-LOOKUP: resolve CWD of each port's process ──
  // This lets us associate ANY port with a project, even without expectedPorts
  const pids = activePorts.filter((p) => p.pid > 0).map((p) => p.pid);
  let pidCwdMap = new Map<number, string>();
  try {
    pidCwdMap = portScanner.getProcessCwds(pids);
  } catch { /* ignore */ }

  // Build: project path → project (normalized, for CWD matching)
  const projectPathMap = new Map<string, typeof projects[0]>();
  for (const project of projects) {
    projectPathMap.set(project.path.toLowerCase(), project);
  }

  // Build: port number → project (via CWD reverse-lookup)
  const cwdPortProjectMap = new Map<number, { id: string; name: string }>();
  for (const port of activePorts) {
    const cwd = pidCwdMap.get(port.pid);
    if (!cwd) continue;
    const cwdLower = cwd.toLowerCase();
    // Check if process CWD is inside (or equal to) a project path
    // Only cwdLower.startsWith(projPath) — NOT the reverse, which would match
    // parent dirs like /Users/user to every project underneath
    for (const [projPath, project] of projectPathMap.entries()) {
      if (cwdLower.startsWith(projPath)) {
        cwdPortProjectMap.set(port.port, { id: project.id, name: project.name });
        break;
      }
    }
  }

  // Get Docker containers (may fail if Docker not available)
  let containers: any[] = [];
  try {
    containers = await dockerMonitor.getContainers();
  } catch { /* Docker not connected — skip */ }

  for (const project of projects) {
    // --- Expected ports from config ---
    const expectedPorts = project.config?.expectedPorts || [];

    // --- Build enriched port list for this project ---
    const projectPorts: PortInfo[] = [];
    let activeCount = 0;

    // 1) Match by expected ports (from config/auto-detection)
    //    IMPORTANT: Only count a port as "active for this project" if:
    //    a) The process owning the port has CWD inside this project, OR
    //    b) A Docker container matched to this project exposes this port, OR
    //    c) No other project claims this port via CWD (shared/common port)
    const matchedPortNumbers = new Set<number>();

    // Pre-compute: which containers belong to this project (for port ownership check)
    const projectNameNorm = project.name.toLowerCase().replace(/[-_\s]/g, '');
    const projectDirNorm = path.basename(project.path).toLowerCase().replace(/[-_\s]/g, '');
    const projectContainers = containers.filter((c: any) => {
      if (c.composeProject) {
        const cn = c.composeProject.toLowerCase().replace(/[-_\s]/g, '');
        if (projectNameNorm.includes(cn) || cn.includes(projectNameNorm)
          || projectDirNorm.includes(cn) || cn.includes(projectDirNorm)
          || project.path.toLowerCase().includes(c.composeProject.toLowerCase())) {
          return true;
        }
      }
      if (c.name) {
        const nn = c.name.toLowerCase().replace(/[-_\s]/g, '');
        if (nn.includes(projectNameNorm) || projectNameNorm.includes(nn)
          || nn.includes(projectDirNorm) || projectDirNorm.includes(nn)) {
          return true;
        }
      }
      return false;
    });

    // Ports exposed by this project's containers
    const containerPortSet = new Set<number>();
    for (const c of projectContainers) {
      if (c.ports && Array.isArray(c.ports)) {
        for (const p of c.ports) {
          if (p.PublicPort) containerPortSet.add(p.PublicPort);
          if (p.hostPort) containerPortSet.add(typeof p.hostPort === 'string' ? parseInt(p.hostPort, 10) : p.hostPort);
        }
      }
    }

    for (const expected of expectedPorts) {
      const activePort = activePortMap.get(expected.port);
      if (activePort) {
        // Verify ownership: does this port actually belong to THIS project?
        const cwdOwner = cwdPortProjectMap.get(expected.port);
        const ownedByCwd = cwdOwner && cwdOwner.id === project.id;
        const ownedByContainer = containerPortSet.has(expected.port);

        // STRICT ownership: a port is active for this project ONLY if:
        // 1) A process with CWD inside this project owns it, OR
        // 2) A Docker container matched to this project exposes it
        // If neither condition is met, the port is NOT counted as active,
        // even if no other project claims it — otherwise random system
        // processes (postgres, redis, etc.) get falsely attributed.
        if (ownedByCwd || ownedByContainer) {
          projectPorts.push({
            ...activePort,
            projectId: project.id,
            projectName: project.name,
            humanLabel: expected.service || activePort.humanLabel,
            url: expected.healthCheckUrl || activePort.url || `http://localhost:${expected.port}`,
          });
          activeCount++;
          matchedPortNumbers.add(expected.port);
        } else {
          // Port is active on the system but NOT proven to belong to this project
          // DO NOT add to projectPorts — only truly owned ports appear in the list
          // This prevents false positives like Urban Leaf showing 3 ports when stopped
        }
      } else {
        // Port not active on the system at all — skip, don't add phantom entries
      }
    }

    // 2) Match by CWD reverse-lookup (catches custom ports like 8899)
    for (const [portNum, match] of cwdPortProjectMap.entries()) {
      if (match.id === project.id && !matchedPortNumbers.has(portNum)) {
        const activePort = activePortMap.get(portNum);
        if (activePort) {
          projectPorts.push({
            ...activePort,
            projectId: project.id,
            projectName: project.name,
          });
          activeCount++;
          matchedPortNumbers.add(portNum);
        }
      }
    }

    project.ports = projectPorts;

    // --- Correlate Docker containers (reuse pre-computed projectContainers) ---
    const matchedContainers = projectContainers;
    project.containers = matchedContainers;

    // DEBUG: log enrichment results for each project (visible in Electron DevTools main process console)
    if (activeCount > 0 || matchedContainers.length > 0) {
      console.log(`[Enrich] ${project.name}: ${activeCount} active ports, ${matchedContainers.length} containers [names: ${matchedContainers.map((c: any) => c.name).join(', ')}]`);
    }

    // --- Determine status ---
    const hasRunningContainers = matchedContainers.some((c: any) => c.state === 'running');
    const hasStoppedContainers = matchedContainers.some((c: any) => c.state === 'exited' || c.state === 'dead');
    const hasUnhealthyContainers = matchedContainers.some((c: any) => c.health === 'unhealthy');
    const hasPorts = activeCount > 0;
    const hasExpectedPorts = expectedPorts.length > 0;

    if (matchedContainers.length > 0) {
      if (hasUnhealthyContainers) {
        project.status = 'error';
        project.health = 'critical';
        project.trafficLight = 'red';
        project.humanStatus = `Qualche container ha problemi`;
      } else if (hasRunningContainers && hasStoppedContainers) {
        project.status = 'partial';
        project.health = 'warning';
        project.trafficLight = 'yellow';
        const running = matchedContainers.filter((c: any) => c.state === 'running').length;
        project.humanStatus = `Parzialmente attivo (${running}/${matchedContainers.length} container)`;
      } else if (hasRunningContainers) {
        project.status = 'running';
        project.health = 'healthy';
        project.trafficLight = 'green';
        const count = matchedContainers.filter((c: any) => c.state === 'running').length;
        project.humanStatus = `Tutto attivo, ${count} container ok`;
        if (hasPorts) {
          project.humanStatus += `, ${activeCount} ${activeCount === 1 ? 'porta' : 'porte'}`;
        }
      } else {
        project.status = 'stopped';
        project.health = 'offline';
        project.trafficLight = 'gray';
        project.humanStatus = 'Tutti i container sono fermi';
      }
    } else if (hasPorts) {
      project.status = 'running';
      project.health = 'healthy';
      project.trafficLight = 'green';
      project.humanStatus = `Attivo — ${activeCount} ${activeCount === 1 ? 'porta' : 'porte'} in ascolto`;
    } else if (hasExpectedPorts) {
      project.status = 'stopped';
      project.health = 'offline';
      project.trafficLight = 'gray';
      project.humanStatus = `Fermo — ${expectedPorts.length} porte attese, nessuna attiva`;
    } else {
      project.status = 'stopped';
      project.health = 'offline';
      project.trafficLight = 'gray';
      project.humanStatus = 'Nessun servizio configurato';
    }

    // --- Git branch detection (async to avoid blocking main thread) ---
    try {
      const gitBranch = await new Promise<string>((resolve) => {
        execFile('git', ['-C', project.path, 'rev-parse', '--abbrev-ref', 'HEAD'],
          { timeout: 2000 },
          (err, stdout) => resolve(err ? '' : (stdout || '').trim()));
      });
      if (gitBranch) {
        project.gitBranch = gitBranch;
      }
    } catch { /* not a git repo or git not available */ }

    // Update in the discovery service
    projectDiscovery.updateProject(project.id, project);
  }

  // ── PROJECT STATUS CHANGE NOTIFICATIONS ──
  // Confronta lo stato attuale con quello precedente per ogni progetto
  const currentProjectStates = new Map<string, { status: string; name: string }>();
  for (const project of projects) {
    currentProjectStates.set(project.id, { status: project.status, name: project.name });
  }

  if (lastProjectStates.size > 0) {
    for (const project of projects) {
      const prev = lastProjectStates.get(project.id);
      if (!prev) continue; // Progetto nuovo, non notificare

      const prevStatus = prev.status;
      const currentStatus = project.status;

      if (prevStatus === currentStatus) continue; // Nessun cambiamento

      // Progetto diventato attivo (running) — era fermo/errore/parziale
      if (currentStatus === 'running' && prevStatus !== 'running') {
        notificationService.notifyIfEnabled('projectStarted', {
          title: `Progetto attivo: ${project.name}`,
          message: project.humanStatus || `${project.name} è ora in esecuzione`,
          priority: 'info',
          projectId: project.id,
          projectName: project.name,
          icon: '🟢',
        });
      }

      // Progetto fermato (stopped/error/offline) — era attivo o parziale
      if (
        (currentStatus === 'stopped' || currentStatus === 'error') &&
        (prevStatus === 'running' || prevStatus === 'partial')
      ) {
        notificationService.notifyIfEnabled('projectStopped', {
          title: `Progetto fermato: ${project.name}`,
          message: project.humanStatus || `${project.name} non è più attivo`,
          priority: 'warning',
          projectId: project.id,
          projectName: project.name,
          icon: '🔴',
        });
      }

      // Progetto in stato parziale (warning) — alcuni container ok, altri no
      if (currentStatus === 'partial' && prevStatus === 'running') {
        notificationService.notifyIfEnabled('projectStopped', {
          title: `Progetto parziale: ${project.name}`,
          message: project.humanStatus || `${project.name} ha qualche servizio fermo`,
          priority: 'warning',
          projectId: project.id,
          projectName: project.name,
          icon: '🟡',
        });
      }
    }
  }

  lastProjectStates = currentProjectStates;

  // Notify renderer of enriched projects
  if (mainWindow) {
    mainWindow.webContents.send(IPC_CHANNELS.PROJECTS_UPDATES, projectDiscovery.getProjects());
  }
}

// ============================================================
// SERVICE EVENT FORWARDING
// ============================================================

function setupServiceEventForwarding() {
  // Project Discovery events
  projectDiscovery.on('projectsChanged', (projects: Project[]) => {
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.PROJECTS_UPDATES, projects);
    }
  });

  // Port Scanner events — con generazione notifiche
  portScanner.on('portsChanged', (data: any) => {
    const addedPorts: PortInfo[] = data.added || [];
    const removedPorts: PortInfo[] = data.removed || [];

    // Genera notifiche per porte nuove/liberate
    for (const port of addedPorts) {
      notificationService.notifyIfEnabled('portOccupied', {
        title: `Porta ${port.port} occupata`,
        message: `${port.processName || 'Un processo'} sta usando la porta ${port.port}`,
        priority: 'info',
        icon: '🔌',
      });
    }
    for (const port of removedPorts) {
      notificationService.notifyIfEnabled('portFreed', {
        title: `Porta ${port.port} liberata`,
        message: `La porta ${port.port} è stata liberata (${port.processName || 'processo sconosciuto'})`,
        priority: 'info',
        icon: '✅',
      });
    }

    // Enrich raw ports with project association before sending to renderer
    const rawPorts: PortInfo[] = data.current || [];
    const projects = projectDiscovery.getProjects();
    const projectPortMap = new Map<number, { id: string; name: string; service: string }>();

    for (const project of projects) {
      for (const ep of (project.config?.expectedPorts || [])) {
        projectPortMap.set(ep.port, { id: project.id, name: project.name, service: ep.service });
      }
      for (const pp of (project.ports || [])) {
        if (pp.projectName && pp.port) {
          projectPortMap.set(pp.port, {
            id: pp.projectId || project.id,
            name: pp.projectName || project.name,
            service: pp.humanLabel || '',
          });
        }
      }
    }

    // CWD reverse-lookup for unassociated ports
    const unassigned = rawPorts.filter((p) => !projectPortMap.has(p.port) && p.pid > 0);
    if (unassigned.length > 0) {
      try {
        const cwds = portScanner.getProcessCwds(unassigned.map((p) => p.pid));
        for (const port of unassigned) {
          const cwd = cwds.get(port.pid);
          if (!cwd) continue;
          const cwdLower = cwd.toLowerCase();
          for (const project of projects) {
            const projLower = project.path.toLowerCase();
            if (cwdLower.startsWith(projLower) || projLower.startsWith(cwdLower)) {
              projectPortMap.set(port.port, { id: project.id, name: project.name, service: '' });
              break;
            }
          }
        }
      } catch { /* ignore */ }
    }

    // Applica filtri impostazioni porte
    const portSettings = getSettings().ports;
    const hiddenPorts = new Set(portSettings?.hiddenPorts || []);
    const showEphemeral = portSettings?.showEphemeralPorts !== false;

    const enrichedPorts = rawPorts
      .filter((p) => {
        if (hiddenPorts.has(p.port)) return false;
        if (!showEphemeral && p.port >= 49152) return false;
        return true;
      })
      .map((p) => {
        const match = projectPortMap.get(p.port);
        if (match) {
          return { ...p, projectId: match.id, projectName: match.name, humanLabel: match.service || p.humanLabel };
        }
        return p;
      });

    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.PORTS_CHANGES, enrichedPorts);
    }
    // Re-enrich projects when ports change
    enrichProjects().catch(() => {});
  });

  // Docker Monitor events — con generazione notifiche
  let lastContainerStates: Map<string, string> = new Map();

  dockerMonitor.on('containersChanged', (containers: any[]) => {
    // Rileva container avviati/fermati confrontando con lo stato precedente
    const currentStates = new Map<string, string>();
    for (const c of containers) {
      currentStates.set(c.id || c.friendlyName, c.state);
    }

    // Confronta con stati precedenti per generare notifiche
    if (lastContainerStates.size > 0) {
      for (const c of containers) {
        const key = c.id || c.friendlyName;
        const prevState = lastContainerStates.get(key);
        const currentState = c.state;

        if (prevState && prevState !== currentState) {
          if (currentState === 'running' && prevState !== 'running') {
            notificationService.notifyIfEnabled('containerStarted', {
              title: `Container avviato: ${c.friendlyName}`,
              message: `Il container ${c.friendlyName} è ora attivo`,
              priority: 'info',
              icon: '🟢',
            });
          } else if (currentState === 'exited' || currentState === 'dead') {
            notificationService.notifyIfEnabled('containerStopped', {
              title: `Container fermato: ${c.friendlyName}`,
              message: `Il container ${c.friendlyName} si è fermato (${c.humanStatus || currentState})`,
              priority: 'warning',
              icon: '🔴',
            });
          }
        }
      }

      // Container rimossi (erano presenti prima, ora no)
      for (const [key, prevState] of lastContainerStates) {
        if (!currentStates.has(key) && prevState === 'running') {
          notificationService.notifyIfEnabled('containerStopped', {
            title: 'Container rimosso',
            message: `Un container precedentemente attivo è stato rimosso`,
            priority: 'warning',
            icon: '🗑️',
          });
        }
      }
    }

    lastContainerStates = currentStates;

    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.DOCKER_EVENTS, containers);
    }
    // Re-enrich projects when containers change
    enrichProjects().catch(() => {});
  });

  // Notification events
  notificationService.on('newNotification', (notification: LobsterNotification) => {
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.NOTIFICATIONS_NEW, notification);
    }
  });

  // Resources events — con notifiche per soglie critiche
  let lastHighCpuNotif = 0;
  let lastHighMemNotif = 0;
  let lastHighDiskNotif = 0;
  const RESOURCE_NOTIF_COOLDOWN = 60_000; // Max 1 notifica risorse ogni 60s

  resourceMonitor.on('resourcesChanged', (resources: any) => {
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.RESOURCES_UPDATES, resources);
    }

    const now = Date.now();

    // CPU alta (>85%)
    if (resources.cpuPercent > 85 && now - lastHighCpuNotif > RESOURCE_NOTIF_COOLDOWN) {
      notificationService.notifyIfEnabled('highCpu', {
        title: 'CPU alta',
        message: `La CPU è al ${resources.cpuPercent}% — ${resources.cpuHumanLabel || 'carico elevato'}`,
        priority: 'warning',
        icon: '🔥',
      });
      lastHighCpuNotif = now;
    }

    // Memoria alta (>90%)
    if (resources.memoryPercent > 90 && now - lastHighMemNotif > RESOURCE_NOTIF_COOLDOWN) {
      notificationService.notifyIfEnabled('highMemory', {
        title: 'Memoria quasi piena',
        message: `La RAM è al ${resources.memoryPercent}% — ${resources.memoryHumanLabel || 'memoria limitata'}`,
        priority: 'warning',
        icon: '💾',
      });
      lastHighMemNotif = now;
    }

    // Disco alto (>95%)
    if (resources.diskPercent > 95 && now - lastHighDiskNotif > RESOURCE_NOTIF_COOLDOWN) {
      notificationService.notifyIfEnabled('highDisk', {
        title: 'Disco quasi pieno',
        message: `Lo spazio disco è al ${resources.diskPercent}%`,
        priority: 'urgent',
        icon: '💿',
      });
      lastHighDiskNotif = now;
    }
  });
}

// ============================================================
// APP LIFECYCLE
// ============================================================

app.on('ready', () => {
  console.log('[Main] App ready');

  // Imposta l'icona del dock su macOS
  if (process.platform === 'darwin' && app.dock) {
    const dockIcon = nativeImage.createFromPath(path.join(__dirname, '../../assets/icons/icon.png'));
    if (!dockIcon.isEmpty()) {
      app.dock.setIcon(dockIcon);
    }
  }

  // Collega le settings al notification service per check granulari
  notificationService.setSettingsGetter(getSettings);

  createWindow();
  createTray();
  setupIpcHandlers();
  setupServiceEventForwarding();

  // Start project discovery
  projectDiscovery
    .scanAll(getSettings().scanning.directories)
    .then(() => {
      projectDiscovery.startWatching(getSettings().scanning.directories);
      console.log(`[Main] Discovered ${projectDiscovery.getProjects().length} projects`);
      // First enrichment after discovery
      setTimeout(() => enrichProjects(), 2000);
    })
    .catch((err) => {
      console.error('[Main] Error during project discovery:', err);
    });

  // Start port scanner polling
  portScanner.startPolling(getSettings().scanning?.pollingIntervalMs || 5000);
  console.log('[Main] Port scanner polling started');

  // Connect Docker and start polling (solo se abilitato nelle impostazioni)
  const appSettings = getSettings();

  // Passa il socket path dalle settings a Docker (non hardcoded)
  if (appSettings.docker.socketPath) {
    dockerMonitor.setSocketPath(appSettings.docker.socketPath);
  }

  if (appSettings.docker.enabled !== false) {
    dockerMonitor
      .connect()
      .then((connected) => {
        if (connected) {
          console.log('[Main] Docker connected successfully');
          dockerMonitor.startPolling(appSettings.docker?.pollingIntervalMs || 5000);
        } else {
          console.warn('[Main] Docker not available — container features disabled');
        }
      })
      .catch((err) => {
        console.warn('[Main] Docker connection failed:', err);
      });
  } else {
    console.log('[Main] Docker disabilitato nelle impostazioni — skip');
  }

  // Aggiorna SmartAdvisor con le settings reali (non i defaults)
  smartAdvisor.updateConfig({
    baseUrl: appSettings.ollama.baseUrl,
    triageModel: appSettings.ollama.triageModel,
    analysisModel: appSettings.ollama.analysisModel,
    deepModel: appSettings.ollama.deepModel,
    fallbackModel: appSettings.ollama.fallbackModel,
  });

  // Aggiorna LobsterCode con le settings reali (baseUrl dal MNEMO proxy)
  if (appSettings.mnemo?.baseUrl) {
    lobsterCodeService.setBaseUrl(appSettings.mnemo.baseUrl);
    console.log(`[Main] LobsterCode aggiornato con baseUrl: ${appSettings.mnemo.baseUrl}`);
  }

  // Aggiorna MNEMO con le settings reali e avvia polling
  if (appSettings.mnemo?.enabled !== false) {
    mnemoService.updateBaseUrl(appSettings.mnemo?.baseUrl || 'http://127.0.0.1:11435');
    mnemoService.setAutoStart(appSettings.mnemo?.autoStart === true);
    mnemoService.startPolling(10000);
    mnemoService.on('availability-changed', (available: boolean) => {
      console.log(`[MNEMO] Disponibilità: ${available ? 'connesso' : 'disconnesso'}`);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('mnemo:availability-changed', available);
      }
    });
    mnemoService.on('health-update', (health: any) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('mnemo:health-update', health);
      }
    });
    console.log('[Main] MNEMO service polling started');
  } else {
    console.log('[Main] MNEMO disabilitato nelle impostazioni — skip');
  }

  // Start resource monitor polling
  resourceMonitor.startPolling(10000);
  console.log('[Main] Resource monitor polling started');

  // Periodic project enrichment (every 15 seconds)
  const enrichmentInterval = setInterval(() => {
    enrichProjects().catch((err) => {
      console.error('[Main] Enrichment error:', err);
    });
  }, 15000);

  // Store interval for cleanup
  (global as any).__enrichmentInterval = enrichmentInterval;
});

app.on('window-all-closed', () => {
  console.log('[Main] All windows closed');

  // Stop services
  projectDiscovery.stopWatching();
  portScanner.stopPolling();
  dockerMonitor.stopPolling();
  resourceMonitor.stopPolling();
  if ((global as any).__enrichmentInterval) {
    clearInterval((global as any).__enrichmentInterval);
  }

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  console.log('[Main] App activated');

  if (mainWindow === null) {
    createWindow();
  } else {
    mainWindow.show();
  }
});

app.on('before-quit', () => {
  console.log('[Main] App quitting');

  // Cleanup
  projectDiscovery.stopWatching();
  portScanner.stopPolling();
  dockerMonitor.stopPolling();
  resourceMonitor.stopPolling();
});

// ============================================================
// EXPORTS
// ============================================================

export { mainWindow, projectDiscovery, notificationService, desktopShortcuts };
