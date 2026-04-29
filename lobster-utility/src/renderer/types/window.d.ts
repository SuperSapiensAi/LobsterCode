interface LobsterAPI {
  ports: {
    getAll: () => Promise<import('../../shared/types').PortInfo[]>;
    killProcess: (pid: number) => Promise<boolean>;
    onChanges: (callback: (data: any) => void) => () => void;
  };
  docker: {
    getContainers: () => Promise<import('../../shared/types').DockerContainer[]>;
    getComposeProjects: () => Promise<import('../../shared/types').DockerComposeProject[]>;
    containerAction: (id: string, action: 'start' | 'stop' | 'restart') => Promise<{ success: boolean }>;
    getContainerLogs: (id: string, tail?: number) => Promise<string>;
    startCompose: (projectName: string) => Promise<void>;
    stopCompose: (projectName: string) => Promise<void>;
    onEvents: (callback: (data: any) => void) => () => void;
  };
  projects: {
    getAll: () => Promise<import('../../shared/types').Project[]>;
    getOne: (id: string) => Promise<import('../../shared/types').Project | null>;
    hide: (id: string) => Promise<{ success: boolean }>;
    rescan: () => Promise<{ success: boolean; count: number }>;
    openFolder: (projectPath: string) => Promise<void>;
    openTerminal: (projectPath: string) => Promise<void>;
    openVscode: (projectPath: string) => Promise<void>;
    onUpdates: (callback: (data: any) => void) => () => void;
    // Project Notes (.lobster.md)
    getNotes: (projectId: string) => Promise<{ exists: boolean; content: string }>;
    saveNotes: (projectId: string, content: string) => Promise<{ success: boolean }>;
    generateNotes: (projectId: string) => Promise<{ exists: boolean; content: string; wasGenerated: boolean }>;
    hasNotes: (projectId: string) => Promise<boolean>;
  };
  // Profile (MY-PROFILE.md)
  profile: {
    get: () => Promise<{ exists: boolean; content: string; path: string }>;
    save: (content: string) => Promise<{ success: boolean }>;
    generate: () => Promise<{ exists: boolean; content: string; wasGenerated: boolean; path: string }>;
    getPath: () => Promise<string>;
  };
  notifications: {
    getAll: () => Promise<import('../../shared/types').LobsterNotification[]>;
    markRead: (id: string) => Promise<void>;
    onNew: (callback: (data: any) => void) => () => void;
  };
  resources: {
    get: () => Promise<import('../../shared/types').SystemResources>;
    onUpdates: (callback: (data: any) => void) => () => void;
  };
  shortcuts: {
    create: (projectId: string) => Promise<void>;
    createAll: () => Promise<void>;
    remove: (projectId: string) => Promise<void>;
    getAll: () => Promise<import('../../shared/types').DesktopShortcut[]>;
  };
  uitest: {
    checkStatus: () => Promise<{ available: boolean; message: string }>;
    testProject: (projectId: string) => Promise<any>;
    testUrl: (url: string, projectId?: string) => Promise<any>;
    testAll: () => Promise<any[]>;
    getResults: () => Promise<any[]>;
  };
  advisor: {
    checkStatus: () => Promise<{ available: boolean; models: string[] }>;
    analyzeProject: (projectId: string) => Promise<any>;
    quickTriage: () => Promise<any[]>;
    getSuggestions: () => Promise<any[]>;
    setModel: (model: string) => Promise<{ success: boolean; model: string }>;
    getPreferredModel: () => Promise<string>;
  };
  mnemo: {
    checkAvailability: () => Promise<{ available: boolean; version?: string }>;
    getHealth: () => Promise<any>;
    getStats: () => Promise<any>;
    getSessions: () => Promise<any>;
    getProfiles: () => Promise<any>;
    getConfig: () => Promise<any>;
    updateConfig: (updates: any) => Promise<any>;
    getOverview: () => Promise<any>;
    startServer: () => Promise<any>;
    onHealthUpdate: (callback: (data: any) => void) => () => void;
  };
  code: {
    // Core
    checkStatus: () => Promise<{ available: boolean; model: string; workspace: string; models?: string[]; permissionMode?: string; sessionCount?: number; currentSessionId?: string | null; projectDNA?: any }>;
    chat: (message: string) => Promise<void>;
    clearHistory: () => Promise<void>;
    setModel: (model: string) => Promise<void>;
    switchWorkspace: (workspace: string) => Promise<void>;
    abort: () => Promise<void>;
    // Permissions
    setPermission: (mode: string) => Promise<void>;
    // Sessions
    getSessions: () => Promise<any[]>;
    createSession: () => Promise<any>;
    switchSession: (id: string) => Promise<void>;
    deleteSession: (id: string) => Promise<void>;
    renameSession: (id: string, title: string) => Promise<void>;
    // Git
    getGitStatus: () => Promise<any>;
    getGitLog: () => Promise<any[]>;
    gitCommit: (message: string) => Promise<string>;
    gitDiff: (file?: string) => Promise<string>;
    gitInit: () => Promise<string>;
    // Modified files
    getModifiedFiles: () => Promise<any[]>;
    // Snapshots
    getSnapshots: () => Promise<any[]>;
    rollbackSnapshot: (id: number) => Promise<void>;
    // Session Memory
    getSessionMemory: () => Promise<string>;
    saveSessionMemory: (content: string) => Promise<void>;
    // Prompt Templates & Project DNA
    getPromptTemplates: () => Promise<any[]>;
    detectProjectDNA: () => Promise<any>;
    // Model download
    pullModel: (name: string) => Promise<void>;
    // Events
    onChatEvent: (callback: (data: any) => void) => () => void;
    onPullProgress: (callback: (data: any) => void) => () => void;
  };
  settings: {
    get: () => Promise<import('../../shared/types').AppSettings>;
    update: (settings: Partial<import('../../shared/types').AppSettings>) => Promise<import('../../shared/types').AppSettings>;
    reset: () => Promise<import('../../shared/types').AppSettings>;
  };
  system: {
    openUrl: (url: string) => Promise<void>;
    openPath: (path: string) => Promise<void>;
  };
}

declare global {
  interface Window {
    lobster: LobsterAPI;
  }
}

export {};
