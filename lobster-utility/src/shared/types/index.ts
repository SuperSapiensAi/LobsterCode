// ============================================================
// LOBSTER UTILITY — Shared Types
// Tutti i tipi TypeScript condivisi tra main e renderer process
// ============================================================

// --- Project Types ---

export type ProjectType =
  | 'docker-compose' | 'node' | 'python' | 'rust' | 'go'
  | 'java' | 'dotnet' | 'php' | 'ruby' | 'swift' | 'flutter'
  | 'elixir' | 'terraform' | 'cpp' | 'content' | 'generic';
export type ProjectStatus = 'running' | 'stopped' | 'partial' | 'error' | 'unknown';
export type HealthStatus = 'healthy' | 'warning' | 'critical' | 'offline' | 'unknown';
export type TrafficLight = 'green' | 'yellow' | 'red' | 'gray';

export interface Project {
  id: string;
  name: string;
  path: string;
  type: ProjectType;
  icon: string; // emoji
  color: string; // hex color
  status: ProjectStatus;
  health: HealthStatus;
  trafficLight: TrafficLight;
  humanStatus: string; // "Tutto funziona, 8 container attivi"
  ports: PortInfo[];
  containers: DockerContainer[];
  gitBranch?: string;
  lastActivity?: string; // ISO date
  isArchived: boolean;
  config?: ProjectConfig;
}

export interface ProjectConfig {
  name: string;
  description?: string;
  type: ProjectType;
  icon?: string;
  color?: string;
  expectedPorts?: ExpectedPort[];
  dockerComposePath?: string;
  startCommand?: string;
  stopCommand?: string;
  quickCommands?: QuickCommand[];
  healthCheckUrls?: string[];
  watchPaths?: string[];
}

export interface ExpectedPort {
  port: number;
  service: string;
  type: 'external' | 'internal';
  healthCheckUrl?: string;
}

export interface QuickCommand {
  label: string;
  command: string;
  icon?: string;
  dangerous?: boolean;
}

// --- Port Types ---

export interface PortInfo {
  port: number;
  protocol: 'tcp' | 'udp';
  pid: number;
  processName: string;
  projectId?: string;
  projectName?: string;
  state: 'LISTEN' | 'ESTABLISHED' | 'CLOSE_WAIT' | 'TIME_WAIT';
  humanLabel: string; // "API Server di Urban Leaf"
  url?: string; // "http://localhost:8000"
}

export interface PortConflict {
  port: number;
  processes: Array<{
    pid: number;
    processName: string;
    projectId?: string;
    projectName?: string;
  }>;
  humanMessage: string; // "Due progetti vogliono la porta 8080!"
}

export interface PortChangeEvent {
  type: 'port_opened' | 'port_closed' | 'port_conflict';
  port: number;
  timestamp: string;
  details: PortInfo | PortConflict;
  humanMessage: string;
}

// --- Docker Types ---

export type ContainerState = 'running' | 'exited' | 'paused' | 'restarting' | 'dead' | 'created';
export type ContainerHealth = 'healthy' | 'unhealthy' | 'starting' | 'none';

export interface DockerContainer {
  id: string;
  name: string;
  friendlyName: string; // "Database PostgreSQL"
  image: string;
  state: ContainerState;
  health: ContainerHealth;
  status: string; // raw Docker status
  humanStatus: string; // "Il database è attivo e funziona"
  projectId?: string;
  composeProject?: string;
  ports: Array<{ host: number; container: number; protocol: string }>;
  cpuPercent?: number;
  memoryMB?: number;
  memoryLimit?: number;
  createdAt: string;
  startedAt?: string;
  platformWarning?: string; // "Immagine per Intel, gira su ARM"
}

export interface DockerComposeProject {
  name: string;
  projectId?: string;
  containers: DockerContainer[];
  totalContainers: number;
  runningContainers: number;
  health: HealthStatus;
  humanStatus: string; // "8/8 container attivi"
}

export interface DockerEvent {
  type: 'container_start' | 'container_stop' | 'container_crash' | 'health_change' | 'compose_up' | 'compose_down';
  containerId: string;
  containerName: string;
  timestamp: string;
  details: string;
  humanMessage: string;
}

// --- Terminal Types ---

export interface TerminalSession {
  id: string;
  projectId: string;
  projectName: string;
  color: string;
  shell: string; // '/bin/zsh'
  cwd: string;
  isActive: boolean;
  createdAt: string;
  lastCommand?: string;
}

// --- Notification Types ---

export type NotificationPriority = 'urgent' | 'warning' | 'info';
export type NotificationChannel = 'native' | 'in-app' | 'both';

export interface LobsterNotification {
  id: string;
  title: string;
  message: string; // human-readable, no jargon
  priority: NotificationPriority;
  channel: NotificationChannel;
  projectId?: string;
  projectName?: string;
  timestamp: string;
  read: boolean;
  actionLabel?: string; // "Riavvia Database"
  actionType?: string; // "restart_container:urban_leaf_db"
  icon?: string;
}

// --- Resource Types ---

export interface MemoryConsumer {
  name: string;        // "Docker" | "node" | "Google Chrome" | "Electron"
  pid: number;
  memoryMB: number;
  memoryPercent: number;
  humanLabel: string;  // "Docker usa 2.3 GB"
}

export interface SystemResources {
  cpuPercent: number;
  cpuHumanLabel: string; // "Tranquillo"
  memoryUsedGB: number;
  memoryTotalGB: number;
  memoryPercent: number;
  memoryHumanLabel: string; // "Occupata ma ok"
  memoryTopConsumers: MemoryConsumer[]; // Top 8 processi per RAM
  diskUsedGB: number;
  diskTotalGB: number;
  diskPercent: number;
  diskHumanLabel: string; // "Si sta riempiendo"
}

export interface ProjectResources {
  projectId: string;
  projectName: string;
  cpuPercent: number;
  memoryMB: number;
  containers: Array<{ name: string; cpuPercent: number; memoryMB: number }>;
}

// --- Desktop Shortcut Types ---

export interface DesktopShortcut {
  projectId: string;
  projectName: string;
  icon: string;
  url: string; // "http://localhost:8000"
  label: string; // "Urban Leaf API"
  shortcutPath: string; // path del .webloc o .app sul Desktop
}

// --- Settings Types ---

export interface AppSettings {
  general: {
    notificationsEnabled: boolean;
    soundEnabled: boolean;
    theme: 'auto' | 'light' | 'dark';
    language: 'it' | 'en';
    launchAtStartup: boolean;
    showTrayIcon: boolean;
    minimizeToTray: boolean;
  };
  scanning: {
    directories: string[];
    autoDiscovery: boolean;
    pollingIntervalMs: number;
    detectDocker: boolean;
    detectNode: boolean;
    detectPython: boolean;
    detectGit: boolean;
  };
  docker: {
    socketPath: string;
    enabled: boolean;
    pollingIntervalMs: number;
  };
  ollama: {
    baseUrl: string;
    enabled: boolean;
    triageModel: string;
    analysisModel: string;
    deepModel: string;
    fallbackModel: string;
  };
  ports: {
    hiddenPorts: number[];         // Porte da nascondere nel monitor
    pollingIntervalMs: number;
    showEphemeralPorts: boolean;   // Mostra porte effimere (49152-65535)
  };
  notifications: {
    containerStopped: boolean;     // Notifica quando un container si ferma
    containerStarted: boolean;     // Notifica quando un container parte
    projectStopped: boolean;       // Notifica quando un progetto diventa inattivo
    projectStarted: boolean;       // Notifica quando un progetto diventa attivo
    portFreed: boolean;            // Notifica quando una porta si libera
    portOccupied: boolean;         // Notifica quando una nuova porta è occupata
    highCpu: boolean;              // Notifica CPU alta
    highMemory: boolean;           // Notifica RAM alta
    highDisk: boolean;             // Notifica disco quasi pieno
  };
  mnemo: {
    baseUrl: string;                // URL base del proxy MNEMO (default: http://127.0.0.1:11435)
    enabled: boolean;               // Abilita integrazione MNEMO
    autoStart: boolean;             // Tenta avvio automatico se non raggiungibile
  };
  desktopShortcuts: {
    enabled: boolean;
    autoCreate: boolean;
    targetDirectory: string;
  };
}

// --- IPC Channel Types ---

export const IPC_CHANNELS = {
  // Port Scanner
  PORTS_GET_ALL: 'ports:get-all',
  PORTS_SUBSCRIBE: 'ports:subscribe',
  PORTS_KILL_PROCESS: 'ports:kill-process',
  PORTS_CHANGES: 'ports:changes',

  // Docker
  DOCKER_GET_CONTAINERS: 'docker:get-containers',
  DOCKER_GET_COMPOSE_PROJECTS: 'docker:get-compose-projects',
  DOCKER_CONTAINER_ACTION: 'docker:container-action',
  DOCKER_CONTAINER_LOGS: 'docker:container-logs',
  DOCKER_SUBSCRIBE: 'docker:subscribe',
  DOCKER_EVENTS: 'docker:events',

  // Projects
  PROJECTS_GET_ALL: 'projects:get-all',
  PROJECTS_GET_ONE: 'projects:get-one',
  PROJECTS_SUBSCRIBE: 'projects:subscribe',
  PROJECTS_UPDATES: 'projects:updates',
  PROJECTS_OPEN_FOLDER: 'projects:open-folder',
  PROJECTS_OPEN_TERMINAL: 'projects:open-terminal',
  PROJECTS_OPEN_VSCODE: 'projects:open-vscode',
  PROJECTS_RESCAN: 'projects:rescan',
  PROJECTS_GET_NOTES: 'projects:get-notes',
  PROJECTS_SAVE_NOTES: 'projects:save-notes',
  PROJECTS_GENERATE_NOTES: 'projects:generate-notes',
  PROJECTS_HAS_NOTES: 'projects:has-notes',

  // Profile
  PROFILE_GET: 'profile:get',
  PROFILE_SAVE: 'profile:save',
  PROFILE_GENERATE: 'profile:generate',
  PROFILE_GET_PATH: 'profile:get-path',

  // Notifications
  NOTIFICATIONS_GET_ALL: 'notifications:get-all',
  NOTIFICATIONS_MARK_READ: 'notifications:mark-read',
  NOTIFICATIONS_NEW: 'notifications:new',

  // Resources
  RESOURCES_GET: 'resources:get',
  RESOURCES_SUBSCRIBE: 'resources:subscribe',
  RESOURCES_UPDATES: 'resources:updates',

  // Desktop Shortcuts
  SHORTCUTS_CREATE: 'shortcuts:create',
  SHORTCUTS_CREATE_ALL: 'shortcuts:create-all',
  SHORTCUTS_REMOVE: 'shortcuts:remove',
  SHORTCUTS_GET_ALL: 'shortcuts:get-all',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',

  // System
  SYSTEM_OPEN_URL: 'system:open-url',
  SYSTEM_OPEN_PATH: 'system:open-path',
} as const;

export type IpcChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS];
