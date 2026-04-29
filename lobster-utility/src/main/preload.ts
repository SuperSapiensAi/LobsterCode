import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('lobster', {
  // Ports
  ports: {
    getAll: () => ipcRenderer.invoke('ports:get-all'),
    killProcess: (pid: number) => ipcRenderer.invoke('ports:kill-process', pid),
    onChanges: (callback: Function) => {
      const handler = (_: any, data: any) => callback(data);
      ipcRenderer.on('ports:changes', handler);
      return () => ipcRenderer.removeListener('ports:changes', handler);
    },
  },
  // Docker
  docker: {
    getContainers: () => ipcRenderer.invoke('docker:get-containers'),
    getComposeProjects: () => ipcRenderer.invoke('docker:get-compose-projects'),
    containerAction: (id: string, action: string) => ipcRenderer.invoke('docker:container-action', id, action),
    getContainerLogs: (id: string, tail?: number) => ipcRenderer.invoke('docker:container-logs', id, tail),
    startCompose: (projectName: string) => ipcRenderer.invoke('docker:compose-start', projectName),
    stopCompose: (projectName: string) => ipcRenderer.invoke('docker:compose-stop', projectName),
    onEvents: (callback: Function) => {
      const handler = (_: any, data: any) => callback(data);
      ipcRenderer.on('docker:events', handler);
      return () => ipcRenderer.removeListener('docker:events', handler);
    },
  },
  // Projects
  projects: {
    getAll: () => ipcRenderer.invoke('projects:get-all'),
    getOne: (id: string) => ipcRenderer.invoke('projects:get-one', id),
    hide: (id: string) => ipcRenderer.invoke('projects:hide', id),
    rescan: () => ipcRenderer.invoke('projects:rescan'),
    openFolder: (projectPath: string) => ipcRenderer.invoke('projects:open-folder', projectPath),
    openTerminal: (projectPath: string) => ipcRenderer.invoke('projects:open-terminal', projectPath),
    openVscode: (projectPath: string) => ipcRenderer.invoke('projects:open-vscode', projectPath),
    onUpdates: (callback: Function) => {
      const handler = (_: any, data: any) => callback(data);
      ipcRenderer.on('projects:updates', handler);
      return () => ipcRenderer.removeListener('projects:updates', handler);
    },
    // Project Notes (.lobster.md)
    getNotes: (projectId: string) => ipcRenderer.invoke('projects:get-notes', projectId),
    saveNotes: (projectId: string, content: string) => ipcRenderer.invoke('projects:save-notes', projectId, content),
    generateNotes: (projectId: string) => ipcRenderer.invoke('projects:generate-notes', projectId),
    hasNotes: (projectId: string) => ipcRenderer.invoke('projects:has-notes', projectId),
  },
  // Profile
  profile: {
    get: () => ipcRenderer.invoke('profile:get'),
    save: (content: string) => ipcRenderer.invoke('profile:save', content),
    generate: () => ipcRenderer.invoke('profile:generate'),
    getPath: () => ipcRenderer.invoke('profile:get-path'),
  },
  // Notifications
  notifications: {
    getAll: () => ipcRenderer.invoke('notifications:get-all'),
    markRead: (id: string) => ipcRenderer.invoke('notifications:mark-read', id),
    onNew: (callback: Function) => {
      const handler = (_: any, data: any) => callback(data);
      ipcRenderer.on('notifications:new', handler);
      return () => ipcRenderer.removeListener('notifications:new', handler);
    },
  },
  // Resources
  resources: {
    get: () => ipcRenderer.invoke('resources:get'),
    onUpdates: (callback: Function) => {
      const handler = (_: any, data: any) => callback(data);
      ipcRenderer.on('resources:updates', handler);
      return () => ipcRenderer.removeListener('resources:updates', handler);
    },
  },
  // Desktop Shortcuts
  shortcuts: {
    create: (projectId: string) => ipcRenderer.invoke('shortcuts:create', projectId),
    createAll: () => ipcRenderer.invoke('shortcuts:create-all'),
    remove: (projectId: string) => ipcRenderer.invoke('shortcuts:remove', projectId),
    getAll: () => ipcRenderer.invoke('shortcuts:get-all'),
  },
  // UI Test Agent
  uitest: {
    checkStatus: () => ipcRenderer.invoke('uitest:check-status'),
    testProject: (projectId: string) => ipcRenderer.invoke('uitest:test-project', projectId),
    testUrl: (url: string, projectId?: string) => ipcRenderer.invoke('uitest:test-url', url, projectId),
    testAll: () => ipcRenderer.invoke('uitest:test-all'),
    getResults: () => ipcRenderer.invoke('uitest:get-results'),
  },
  // Smart Advisor
  advisor: {
    checkStatus: () => ipcRenderer.invoke('advisor:check-status'),
    analyzeProject: (projectId: string) => ipcRenderer.invoke('advisor:analyze-project', projectId),
    quickTriage: () => ipcRenderer.invoke('advisor:quick-triage'),
    getSuggestions: () => ipcRenderer.invoke('advisor:get-suggestions'),
    setModel: (model: string) => ipcRenderer.invoke('advisor:set-model', model),
    getPreferredModel: () => ipcRenderer.invoke('advisor:get-preferred-model'),
  },
  // MNEMO Proxy
  mnemo: {
    checkAvailability: () => ipcRenderer.invoke('mnemo:check-availability'),
    getHealth: () => ipcRenderer.invoke('mnemo:get-health'),
    getStats: () => ipcRenderer.invoke('mnemo:get-stats'),
    getSessions: () => ipcRenderer.invoke('mnemo:get-sessions'),
    getProfiles: () => ipcRenderer.invoke('mnemo:get-profiles'),
    getConfig: () => ipcRenderer.invoke('mnemo:get-config'),
    updateConfig: (updates: any) => ipcRenderer.invoke('mnemo:update-config', updates),
    getOverview: () => ipcRenderer.invoke('mnemo:get-overview'),
    startServer: () => ipcRenderer.invoke('mnemo:start-server'),
    onHealthUpdate: (callback: Function) => {
      const handler = (_: any, data: any) => callback(data);
      ipcRenderer.on('mnemo:health-update', handler);
      return () => ipcRenderer.removeListener('mnemo:health-update', handler);
    },
  },
  // LobsterCode — native AI coding chat con tutte le feature
  code: {
    // Core
    checkStatus: () => ipcRenderer.invoke('code:check-status'),
    chat: (message: string) => ipcRenderer.invoke('code:chat', message),
    clearHistory: () => ipcRenderer.invoke('code:clear-history'),
    setModel: (model: string) => ipcRenderer.invoke('code:set-model', model),
    switchWorkspace: (workspace: string) => ipcRenderer.invoke('code:switch-workspace', workspace),
    abort: () => ipcRenderer.invoke('code:abort'),
    // Permessi
    setPermission: (mode: string) => ipcRenderer.invoke('code:set-permission', mode),
    // Sessioni
    getSessions: () => ipcRenderer.invoke('code:get-sessions'),
    createSession: () => ipcRenderer.invoke('code:create-session'),
    switchSession: (id: string) => ipcRenderer.invoke('code:switch-session', id),
    deleteSession: (id: string) => ipcRenderer.invoke('code:delete-session', id),
    renameSession: (id: string, title: string) => ipcRenderer.invoke('code:rename-session', id, title),
    // Git
    getGitStatus: () => ipcRenderer.invoke('code:git-status'),
    getGitLog: () => ipcRenderer.invoke('code:git-log'),
    gitCommit: (message: string) => ipcRenderer.invoke('code:git-commit', message),
    gitDiff: (file?: string) => ipcRenderer.invoke('code:git-diff', file),
    gitInit: () => ipcRenderer.invoke('code:git-init'),
    // File modificati
    getModifiedFiles: () => ipcRenderer.invoke('code:get-modified-files'),
    // Snapshot & Rollback
    getSnapshots: () => ipcRenderer.invoke('code:get-snapshots'),
    rollbackSnapshot: (id: number) => ipcRenderer.invoke('code:rollback-snapshot', id),
    // Session Memory
    getSessionMemory: () => ipcRenderer.invoke('code:get-session-memory'),
    saveSessionMemory: (content: string) => ipcRenderer.invoke('code:save-session-memory', content),
    // Prompt Templates & Project DNA
    getPromptTemplates: () => ipcRenderer.invoke('code:get-prompt-templates'),
    detectProjectDNA: () => ipcRenderer.invoke('code:detect-project-dna'),
    // Model download
    pullModel: (name: string) => ipcRenderer.invoke('code:pull-model', name),
    // Events
    onChatEvent: (callback: Function) => {
      const handler = (_: any, data: any) => callback(data);
      ipcRenderer.on('code:chat-event', handler);
      return () => ipcRenderer.removeListener('code:chat-event', handler);
    },
    onPullProgress: (callback: Function) => {
      const handler = (_: any, data: any) => callback(data);
      ipcRenderer.on('code:pull-progress', handler);
      return () => ipcRenderer.removeListener('code:pull-progress', handler);
    },
  },
  // Settings
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (settings: any) => ipcRenderer.invoke('settings:update', settings),
    reset: () => ipcRenderer.invoke('settings:reset'),
  },
  // System
  system: {
    openUrl: (url: string) => ipcRenderer.invoke('system:open-url', url),
    openPath: (path: string) => ipcRenderer.invoke('system:open-path', path),
  },
});
