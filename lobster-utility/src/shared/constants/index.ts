// ============================================================
// LOBSTER UTILITY — Costanti Condivise
// ============================================================

import type { AppSettings } from '../types';

// --- Default Settings ---
export const DEFAULT_SETTINGS: AppSettings = {
  general: {
    notificationsEnabled: true,
    soundEnabled: true,
    theme: 'auto',
    language: 'it',
    launchAtStartup: false,
    showTrayIcon: true,
    minimizeToTray: false,
  },
  scanning: {
    directories: [
      '~/Desktop',
      '~/Documents',
      '~/Documents/Claude/Projects',
      '~/Code',
      '~/Projects',
      '~/Developer',
      '~/Sites',
      '~/dev',
      '~/Repos',
      '~/repos',
      '~/workspace',
    ],
    autoDiscovery: true,
    pollingIntervalMs: 2000,
    detectDocker: true,
    detectNode: true,
    detectPython: true,
    detectGit: true,
  },
  docker: {
    socketPath: '/var/run/docker.sock',
    enabled: true,
    pollingIntervalMs: 5000,
  },
  ollama: {
    baseUrl: 'http://localhost:11434',
    enabled: true,
    triageModel: 'mistral-small',
    analysisModel: 'qwen3:30b',
    deepModel: 'deepseek-r1:32b',
    fallbackModel: 'mistral:7b',
  },
  ports: {
    hiddenPorts: [],
    pollingIntervalMs: 5000,
    showEphemeralPorts: false,
  },
  notifications: {
    containerStopped: true,
    containerStarted: false,
    projectStopped: true,
    projectStarted: true,
    portFreed: false,
    portOccupied: true,
    highCpu: true,
    highMemory: true,
    highDisk: true,
  },
  mnemo: {
    baseUrl: 'http://127.0.0.1:11435',
    enabled: true,
    autoStart: false,
  },
  desktopShortcuts: {
    enabled: true,
    autoCreate: false,
    targetDirectory: '~/Desktop',
  },
};

// --- Resource Thresholds ---
export const RESOURCE_THRESHOLDS = {
  cpu: {
    green: 30,    // 0-30%
    yellow: 60,   // 30-60%
    orange: 80,   // 60-80%
    red: 90,      // 80-90%
    critical: 95, // 90%+
  },
  memory: {
    green: 50,
    yellow: 70,
    orange: 85,
    red: 92,
    critical: 97,
  },
  disk: {
    green: 60,
    yellow: 75,
    orange: 85,
    red: 92,
    critical: 97,
  },
};

// --- Human Labels for Resource Status ---
export const RESOURCE_LABELS_IT: Record<string, Record<string, string>> = {
  cpu: {
    green: 'Tranquillo, tutto leggero',
    yellow: 'Occupato ma tutto ok',
    orange: 'Lavora parecchio, tieni d\'occhio',
    red: '⚠️ Sotto pressione, le cose potrebbero rallentare',
    critical: '🔴 In sofferenza! Ferma qualcosa',
  },
  memory: {
    green: 'Tranquilla, c\'è spazio',
    yellow: 'Occupata ma ok',
    orange: 'Si sta riempiendo, tieni d\'occhio',
    red: '⚠️ Quasi piena, le cose rallenteranno',
    critical: '🔴 Critico! Il Mac è in sofferenza',
  },
  disk: {
    green: 'Tanto spazio libero',
    yellow: 'Abbastanza spazio',
    orange: 'Si sta riempiendo',
    red: '⚠️ Poco spazio rimasto',
    critical: '🔴 Disco quasi pieno!',
  },
};

// --- Project Type Detection ---
// Detect projects for ALL programming languages and frameworks
export const PROJECT_MARKERS: Record<string, { files: string[]; type: string; icon: string }> = {
  'docker-compose': {
    files: ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'],
    type: 'docker-compose',
    icon: '🐳',
  },
  node: {
    files: ['package.json'],
    type: 'node',
    icon: '📦',
  },
  python: {
    files: ['requirements.txt', 'pyproject.toml', 'setup.py', 'Pipfile', 'poetry.lock', 'environment.yml'],
    type: 'python',
    icon: '🐍',
  },
  rust: {
    files: ['Cargo.toml'],
    type: 'rust',
    icon: '🦀',
  },
  go: {
    files: ['go.mod', 'go.sum'],
    type: 'go',
    icon: '🐹',
  },
  java: {
    files: ['pom.xml', 'build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts'],
    type: 'java',
    icon: '☕',
  },
  dotnet: {
    files: ['*.sln', '*.csproj', '*.fsproj', 'global.json', 'Directory.Build.props'],
    type: 'dotnet',
    icon: '🟣',
  },
  php: {
    files: ['composer.json', 'artisan', 'wp-config.php'],
    type: 'php',
    icon: '🐘',
  },
  ruby: {
    files: ['Gemfile', 'Rakefile', 'config.ru'],
    type: 'ruby',
    icon: '💎',
  },
  swift: {
    files: ['Package.swift', '*.xcodeproj', '*.xcworkspace'],
    type: 'swift',
    icon: '🍎',
  },
  flutter: {
    files: ['pubspec.yaml'],
    type: 'flutter',
    icon: '🐦',
  },
  elixir: {
    files: ['mix.exs'],
    type: 'elixir',
    icon: '💧',
  },
  terraform: {
    files: ['main.tf', 'terraform.tf'],
    type: 'terraform',
    icon: '🏗️',
  },
  cpp: {
    files: ['CMakeLists.txt', 'meson.build', 'configure.ac'],
    type: 'cpp',
    icon: '⚙️',
  },
};

// --- Lobster Brand Colors (from LobsterCode brand identity) ---
export const LOBSTER_BRAND = {
  // Primary accent — IL rosso Lobster
  primary: '#d63a28',
  primaryLight: '#e95a45',
  primaryDim: 'rgba(214, 58, 40, 0.08)',
  primaryGlow: 'rgba(214, 58, 40, 0.15)',

  // Secondary accents (dal brand LobsterCode)
  ocean: '#2a8fb5',
  coral: '#e87554',
  sand: '#c4a35a',
  purple: '#8b5cf6',

  // Backgrounds — Light theme (warm cream come LobsterCode)
  bgPrimary: '#faf7f5',
  bgSecondary: '#f0ebe8',
  bgTertiary: '#e8e0dc',
  bgInput: '#ffffff',

  // Backgrounds — Dark theme (sidebar LobsterCode)
  bgDark: '#1c1214',
  bgDarkHover: '#2a1e1c',
  bgDarkActive: '#3a2520',

  // Text
  textPrimary: '#2a1a17',
  textSecondary: '#7a6560',
  textDim: '#b0a09a',
  textOnDark: '#f0e6e3',
  textOnDarkDim: '#7a6560',

  // Borders
  border: '#e0d5d0',
  borderDark: '#3a2822',

  // Status colors
  success: '#2e8b57',
  successLight: '#10b981',
  warning: '#e89530',
  warningLight: '#f59e0b',
  error: '#d63a28',
  errorLight: '#fc8181',
  info: '#2a8fb5',

  // Special
  toolBg: '#fff8f6',
  toolBorder: '#f0d8d2',
  codeBg: '#2a1a17',
};

// --- Project Color Palette (auto-assigned to projects) ---
export const PROJECT_COLORS = [
  '#48BB78', // green
  '#4299E1', // blue
  '#ED8936', // orange
  '#9F7AEA', // purple
  '#F56565', // red
  '#38B2AC', // teal
  '#ED64A6', // pink
  '#ECC94B', // yellow
  '#667EEA', // indigo
  '#FC8181', // light red
  '#68D391', // light green
  '#63B3ED', // light blue
];

// --- Common Port Labels ---
export const WELL_KNOWN_PORTS: Record<number, string> = {
  80: 'Web Server (HTTP)',
  443: 'Web Server (HTTPS)',
  3000: 'Dev Server (React/Next.js)',
  3001: 'Dev Server (alternativo)',
  4200: 'Angular Dev Server',
  5000: 'Flask/Python API',
  5173: 'Vite Dev Server',
  5174: 'Vite Dev Server (alternativo)',
  5432: 'PostgreSQL Database',
  6379: 'Redis Cache',
  8000: 'FastAPI / Django',
  8001: 'API Documentation (Swagger)',
  8080: 'Web Server / Proxy',
  8443: 'HTTPS alternativo',
  8888: 'Jupyter Notebook',
  9000: 'PHP / Portainer',
  11434: 'Ollama AI Server',
  27017: 'MongoDB',
  3306: 'MySQL',
  5050: 'pgAdmin',
  8899: 'LobsterCode Agent',
};
