// ============================================================
// LOBSTER UTILITY — LobsterCode Comprehensive React Component
// Chat con sidebar multi-tab: Chat, Git, Mod (modified files),
// Memo (session memory). Support per streaming events, tool calls,
// markdown, snapshots, rollback, git integration.
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useStore } from '../../store';
import {
  Terminal, Send, Loader2, Trash2, ChevronDown, ChevronUp,
  Settings2, FolderOpen, Square, Wrench, Check, Copy,
  AlertTriangle, Plus, MessageSquare, GitBranch, FileEdit,
  BookOpen, Shield, Zap, Eye, Pencil, Clock, RotateCcw,
  Lock, X, RefreshCw
} from 'lucide-react';

// ─── Tipi ──────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: {
    name: string;
    args: Record<string, any>;
    result?: string;
  }[];
  timestamp: Date;
}

interface ChatSession {
  id: string;
  title: string;
  createdAt: Date;
}

interface GitStatus {
  branch: string;
  modified: string[];
  added: string[];
  deleted: string[];
  untracked: string[];
}

interface GitCommit {
  hash: string;
  message: string;
  timestamp: Date;
  author: string;
}

interface ModifiedFile {
  path: string;
  type: 'edit' | 'create';
  timestamp: Date;
}

interface Snapshot {
  id: number;
  label: string;
  fileCount: number;
  timestamp: Date;
}

interface ProjectDNA {
  stack: string[];
}

interface BackendStatus {
  available: boolean;
  models: string[];
  workspace: string;
  model: string;
  permissionMode: 'read' | 'write' | 'full';
  sessionCount: number;
  currentSessionId: string;
  projectDNA?: ProjectDNA;
}

interface ChatEvent {
  type: 'text' | 'tool_start' | 'tool_result' | 'error' | 'done';
  content?: string;
  tool_name?: string;
  tool_args?: Record<string, any>;
  tool_output?: string;
}

type SidebarTab = 'chat' | 'git' | 'mod' | 'memo';

// ─── Component ──────────────────────────────────────────────

export function LobsterCode() {
  const { pendingFixPrompt, clearPendingPrompt } = useStore();

  // State - Main
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<BackendStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [inputValue, setInputValue] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [autoFixBadge, setAutoFixBadge] = useState(false);

  // State - Sidebar
  const [activeTab, setActiveTab] = useState<SidebarTab>('chat');
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // State - Git
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [gitLog, setGitLog] = useState<GitCommit[]>([]);
  const [selectedGitFile, setSelectedGitFile] = useState<string | null>(null);
  const [gitDiffContent, setGitDiffContent] = useState<string>('');
  const [commitMessage, setCommitMessage] = useState('');

  // State - Modified files
  const [modifiedFiles, setModifiedFiles] = useState<ModifiedFile[]>([]);

  // State - Session memory
  const [sessionMemory, setSessionMemory] = useState('');

  // State - Snapshots
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [showSnapshots, setShowSnapshots] = useState(false);

  // State - Permissions
  const [showPermissionDialog, setShowPermissionDialog] = useState(false);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const currentMessageIdRef = useRef<string | null>(null);

  // ─── Effects ──────────────────────────────────────────

  // Carica lo stato iniziale
  useEffect(() => {
    const loadStatus = async () => {
      try {
        setStatusLoading(true);
        const raw = await window.lobster?.code?.checkStatus();
        if (!raw) throw new Error('Backend non raggiungibile');
        // Mappa i nomi backend ai nomi brevi del frontend
        const backendToFrontend: Record<string, string> = {
          'read-only': 'read',
          'workspace-write': 'write',
          'full-access': 'full',
        };
        const s: BackendStatus = {
          available: raw.available,
          model: raw.model,
          workspace: raw.workspace,
          models: raw.models || [],
          permissionMode: (backendToFrontend[raw.permissionMode || ''] || raw.permissionMode || 'read') as 'read' | 'write' | 'full',
          sessionCount: raw.sessionCount || 0,
          currentSessionId: raw.currentSessionId || '',
          projectDNA: raw.projectDNA,
        };
        setStatus(s);
        setSelectedModel(s.model);
        setStatusError(null);
        await loadSessions();
        await loadGitStatus();
        await loadModifiedFiles();
        await loadSnapshots();
        await loadSessionMemory();
      } catch (err: any) {
        setStatusError(err.message || 'Errore caricamento stato');
      } finally {
        setStatusLoading(false);
      }
    };

    loadStatus();
  }, []);

  // Setup listener IPC per chat events
  useEffect(() => {
    const handleChatEvent = (chatEvent: ChatEvent) => {
      if (chatEvent.type === 'text' && currentMessageIdRef.current) {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.id === currentMessageIdRef.current && last.role === 'assistant') {
            return prev.map((m, i) =>
              i === prev.length - 1
                ? { ...m, content: m.content + (chatEvent.content || '') }
                : m
            );
          }
          return prev;
        });
      } else if (chatEvent.type === 'tool_start' && chatEvent.tool_name) {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.id === currentMessageIdRef.current && last.role === 'assistant') {
            return prev.map((m, i) =>
              i === prev.length - 1
                ? {
                    ...m,
                    toolCalls: [
                      ...(m.toolCalls || []),
                      {
                        name: chatEvent.tool_name!,
                        args: chatEvent.tool_args || {},
                      },
                    ],
                  }
                : m
            );
          }
          return prev;
        });
      } else if (chatEvent.type === 'tool_result' && chatEvent.tool_name) {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.id === currentMessageIdRef.current && last.toolCalls) {
            return prev.map((m, i) =>
              i === prev.length - 1
                ? {
                    ...m,
                    toolCalls: m.toolCalls?.map((tc) =>
                      tc.name === chatEvent.tool_name && !tc.result
                        ? { ...tc, result: chatEvent.tool_output }
                        : tc
                    ),
                  }
                : m
            );
          }
          return prev;
        });
      } else if (chatEvent.type === 'error') {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.id === currentMessageIdRef.current && last.role === 'assistant') {
            return prev.map((m, i) =>
              i === prev.length - 1
                ? { ...m, content: m.content + `\n⚠️ ${chatEvent.content || 'Errore'}` }
                : m
            );
          }
          return prev;
        });
        setIsGenerating(false);
        currentMessageIdRef.current = null;
      } else if (chatEvent.type === 'done') {
        setIsGenerating(false);
        currentMessageIdRef.current = null;
        loadModifiedFiles();
        loadSnapshots();
      }
    };

    const cleanup = window.lobster?.code?.onChatEvent?.(handleChatEvent);
    return () => {
      if (cleanup) cleanup();
    };
  }, []);

  // Auto-scroll verso il basso
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-send pendingFixPrompt dal Consulente
  useEffect(() => {
    if (pendingFixPrompt && status?.available && !isGenerating) {
      const sendFixPrompt = async () => {
        try {
          // Prima cambia workspace e ATTENDI che sia completato
          await window.lobster?.code?.switchWorkspace(pendingFixPrompt.projectPath);
          // Aggiorna lo stato locale del workspace
          if (status) setStatus({ ...status, workspace: pendingFixPrompt.projectPath });
          // Piccola pausa per permettere al backend di aggiornarsi
          await new Promise((r) => setTimeout(r, 200));
          // Ora invia il prompt
          await handleSendMessage(pendingFixPrompt.prompt);
          setAutoFixBadge(true);
        } catch (err: any) {
          console.error('[LobsterCode] Errore fix da Consulente:', err);
        } finally {
          clearPendingPrompt();
        }
      };
      sendFixPrompt();
    }
  }, [pendingFixPrompt, status?.available, isGenerating]);

  // ─── Loaders ──────────────────────────────────────────

  const loadSessions = useCallback(async () => {
    try {
      const sessions = await window.lobster?.code?.getSessions();
      setChatSessions(sessions || []);
    } catch (err) {
      console.error('Errore caricamento sessioni:', err);
    }
  }, []);

  const loadGitStatus = useCallback(async () => {
    try {
      const status = await window.lobster?.code?.getGitStatus();
      setGitStatus(status);
      const log = await window.lobster?.code?.getGitLog();
      setGitLog(log || []);
    } catch (err) {
      console.error('Errore caricamento git status:', err);
    }
  }, []);

  const loadModifiedFiles = useCallback(async () => {
    try {
      const files = await window.lobster?.code?.getModifiedFiles();
      setModifiedFiles(files || []);
    } catch (err) {
      console.error('Errore caricamento file modificati:', err);
    }
  }, []);

  const loadSnapshots = useCallback(async () => {
    try {
      const snaps = await window.lobster?.code?.getSnapshots();
      setSnapshots(snaps || []);
    } catch (err) {
      console.error('Errore caricamento snapshots:', err);
    }
  }, []);

  const loadSessionMemory = useCallback(async () => {
    try {
      const memory = await window.lobster?.code?.getSessionMemory();
      setSessionMemory(memory || '');
    } catch (err) {
      console.error('Errore caricamento session memory:', err);
    }
  }, []);

  // ─── Handlers ──────────────────────────────────────────

  const handleSendMessage = useCallback(
    async (msgText?: string) => {
      const text = msgText || inputValue.trim();
      if (!text || isGenerating || !status?.available) return;

      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: text,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setInputValue('');

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: '',
        toolCalls: [],
        timestamp: new Date(),
      };

      currentMessageIdRef.current = assistantMsg.id;
      setMessages((prev) => [...prev, assistantMsg]);
      setIsGenerating(true);

      try {
        await window.lobster?.code?.chat(text);
      } catch (err: any) {
        const errMsg: ChatMessage = {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: `Errore: ${err.message || 'Errore sconosciuto'}`,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errMsg]);
        setIsGenerating(false);
        currentMessageIdRef.current = null;
      }
    },
    [inputValue, isGenerating, status?.available]
  );

  const handleClearChat = useCallback(async () => {
    if (messages.length === 0) return;
    if (!window.confirm('Cancellare tutta la conversazione?')) return;

    try {
      await window.lobster?.code?.clearHistory();
      setMessages([]);
      setAutoFixBadge(false);
    } catch (err: any) {
      alert(`Errore: ${err.message}`);
    }
  }, [messages.length]);

  const handleSetModel = useCallback(async (model: string) => {
    try {
      await window.lobster?.code?.setModel(model);
      setSelectedModel(model);
      if (status) setStatus({ ...status, model });
    } catch (err: any) {
      alert(`Errore cambio modello: ${err.message}`);
    }
  }, [status]);

  const handleSwitchWorkspace = useCallback(async () => {
    const path = prompt('Inserisci il percorso della cartella di progetto:');
    if (path) {
      try {
        await window.lobster?.code?.switchWorkspace(path);
        if (status) setStatus({ ...status, workspace: path });
        await loadGitStatus();
      } catch (err: any) {
        alert(`Errore cambio workspace: ${err.message}`);
      }
    }
  }, [status, loadGitStatus]);

  const handleAbort = useCallback(async () => {
    try {
      await window.lobster?.code?.abort?.();
      setIsGenerating(false);
      currentMessageIdRef.current = null;
    } catch (err: any) {
      console.error('Errore abort:', err);
    }
  }, []);

  const handleCreateSession = useCallback(async () => {
    try {
      const result = await window.lobster?.code?.createSession();
      setMessages([]);
      await loadSessions();
    } catch (err: any) {
      alert(`Errore creazione sessione: ${err.message}`);
    }
  }, [loadSessions]);

  const handleSwitchSession = useCallback(
    async (sessionId: string) => {
      try {
        await window.lobster?.code?.switchSession(sessionId);
        setMessages([]);
        await loadSessions();
      } catch (err: any) {
        alert(`Errore cambio sessione: ${err.message}`);
      }
    },
    [loadSessions]
  );

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      if (!window.confirm('Eliminare questa sessione chat?')) return;
      try {
        await window.lobster?.code?.deleteSession(sessionId);
        await loadSessions();
      } catch (err: any) {
        alert(`Errore eliminazione sessione: ${err.message}`);
      }
    },
    [loadSessions]
  );

  const handleRenameSession = useCallback(
    async (sessionId: string, newTitle: string) => {
      if (!newTitle.trim()) return;
      try {
        await window.lobster?.code?.renameSession(sessionId, newTitle);
        await loadSessions();
        setRenamingSessionId(null);
      } catch (err: any) {
        alert(`Errore rename: ${err.message}`);
      }
    },
    [loadSessions]
  );

  const handleGitCommit = useCallback(async () => {
    if (!commitMessage.trim()) return;
    try {
      await window.lobster?.code?.gitCommit(commitMessage);
      setCommitMessage('');
      await loadGitStatus();
    } catch (err: any) {
      alert(`Errore commit: ${err.message}`);
    }
  }, [commitMessage, loadGitStatus]);

  const handleGitInit = useCallback(async () => {
    try {
      await window.lobster?.code?.gitInit();
      await loadGitStatus();
    } catch (err: any) {
      alert(`Errore git init: ${err.message}`);
    }
  }, [loadGitStatus]);

  const handleSelectGitFile = useCallback(async (filePath: string) => {
    try {
      const diff = await window.lobster?.code?.gitDiff(filePath);
      setGitDiffContent(diff);
      setSelectedGitFile(filePath);
    } catch (err: any) {
      console.error('Errore diff:', err);
    }
  }, []);

  const handleSaveSessionMemory = useCallback(async () => {
    try {
      await window.lobster?.code?.saveSessionMemory(sessionMemory);
      alert('Memoria salvata');
    } catch (err: any) {
      alert(`Errore: ${err.message}`);
    }
  }, [sessionMemory]);

  const handleRollbackSnapshot = useCallback(
    async (snapshotId: number) => {
      if (!window.confirm('Annullare tutti i cambiamenti fino a questo snapshot?')) return;
      try {
        await window.lobster?.code?.rollbackSnapshot(snapshotId);
        await loadSnapshots();
        await loadModifiedFiles();
      } catch (err: any) {
        alert(`Errore rollback: ${err.message}`);
      }
    },
    [loadSnapshots, loadModifiedFiles]
  );

  const handleSetPermission = useCallback(async (mode: 'read' | 'write' | 'full') => {
    if (mode === 'full') {
      if (!window.confirm('Abilitare Accesso completo? Questa operazione è irreversibile.')) {
        return;
      }
    }
    // Mappa i nomi brevi del frontend ai nomi backend
    const backendModeMap: Record<string, string> = {
      'read': 'read-only',
      'write': 'workspace-write',
      'full': 'full-access',
    };
    try {
      await window.lobster?.code?.setPermission(backendModeMap[mode] || mode);
      if (status) {
        setStatus({ ...status, permissionMode: mode });
      }
      setShowPermissionDialog(false);
    } catch (err: any) {
      alert(`Errore: ${err.message}`);
    }
  }, [status]);

  // ─── Rendering ──────────────────────────────────────────

  // Loading status
  if (statusLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-cream-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="animate-spin text-lobster" size={32} />
          <span className="text-sm text-bark-secondary">Connessione a LobsterCode...</span>
        </div>
      </div>
    );
  }

  // Status error
  if (statusError || !status?.available) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-cream-50 p-6">
        <AlertTriangle size={48} className="text-status-yellow mb-4" />
        <h2 className="text-lg font-bold text-bark mb-2">LobsterCode non disponibile</h2>
        <p className="text-sm text-bark-secondary text-center max-w-md mb-4">
          {statusError || 'Assicurati che Ollama/MNEMO siano avviati correttamente.'}
        </p>
        <p className="text-xs text-bark-dim text-center">
          Verifica l'host locale e riprova.
        </p>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col bg-cream-50"
      style={{ height: 'calc(100vh - 52px)' }}
    >
      {/* ─── Toolbar ─────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-cream-200 flex-shrink-0">
        <div className="flex items-center gap-3">
          {/* Status indicator */}
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${
              status.available ? 'bg-green-500' : 'bg-red-500'
            }`} />
            <span className="text-xs font-semibold text-bark">LobsterCode</span>
          </div>

          {/* Permission selector */}
          <div className="relative">
            <button
              onClick={() => setShowPermissionDialog(!showPermissionDialog)}
              className="text-xs px-2 py-1 bg-cream-100 border border-cream-200 rounded text-bark hover:bg-cream-200 transition-colors flex items-center gap-1"
            >
              {status.permissionMode === 'read' && <Eye size={12} />}
              {status.permissionMode === 'write' && <Pencil size={12} />}
              {status.permissionMode === 'full' && <Zap size={12} />}
              {status.permissionMode === 'read' && '👁️ Solo lettura'}
              {status.permissionMode === 'write' && '📝 Scrittura'}
              {status.permissionMode === 'full' && '⚡ Completo'}
              <ChevronDown size={12} />
            </button>

            {showPermissionDialog && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-cream-200 rounded shadow-lg z-50 min-w-[200px]">
                <button
                  onClick={() => handleSetPermission('read')}
                  className="w-full text-left px-3 py-2 text-xs text-bark hover:bg-cream-100 border-b border-cream-200 flex items-center gap-2"
                >
                  <Eye size={12} /> 👁️ Solo lettura
                </button>
                <button
                  onClick={() => handleSetPermission('write')}
                  className="w-full text-left px-3 py-2 text-xs text-bark hover:bg-cream-100 border-b border-cream-200 flex items-center gap-2"
                >
                  <Pencil size={12} /> 📝 Scrittura workspace
                </button>
                <button
                  onClick={() => handleSetPermission('full')}
                  className="w-full text-left px-3 py-2 text-xs text-bark hover:bg-cream-100 flex items-center gap-2"
                >
                  <Zap size={12} /> ⚡ Accesso completo
                </button>
              </div>
            )}
          </div>

          {/* Workspace indicator */}
          <div className="flex items-center gap-1 px-2 py-1 bg-cream-100 rounded text-[11px] text-bark-dim font-mono max-w-[200px] truncate">
            <FolderOpen size={12} />
            <span className="truncate">{status.workspace || 'N/A'}</span>
          </div>

          {/* Project DNA */}
          {status.projectDNA?.stack && status.projectDNA.stack.length > 0 && (
            <div className="flex items-center gap-1">
              {status.projectDNA.stack.slice(0, 3).map((tech) => (
                <span key={tech} className="text-[10px] px-1.5 py-0.5 bg-lobster/10 text-lobster rounded font-medium">
                  {tech}
                </span>
              ))}
            </div>
          )}

          {/* Auto-fix badge */}
          {autoFixBadge && (
            <span className="text-[11px] text-lobster bg-white border border-lobster px-2 py-1 rounded-full font-medium">
              Fix automatico inviato
            </span>
          )}
        </div>

        {/* Azioni toolbar */}
        <div className="flex items-center gap-2">
          {/* Model selector */}
          <div className="relative">
            <select
              value={selectedModel}
              onChange={(e) => handleSetModel(e.target.value)}
              className="text-xs px-2 py-1 bg-cream-100 border border-cream-200 rounded text-bark hover:bg-cream-200 transition-colors appearance-none pr-6"
              title="Seleziona modello"
            >
              {status.models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <ChevronDown
              size={12}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-bark-dim"
            />
          </div>

          {/* Workspace switcher */}
          <button
            onClick={handleSwitchWorkspace}
            className="p-1.5 rounded hover:bg-cream-100 transition-colors text-bark-dim hover:text-bark"
            title="Cambia workspace"
          >
            <Settings2 size={14} />
          </button>

          {/* Clear chat */}
          <button
            onClick={handleClearChat}
            disabled={messages.length === 0 || isGenerating}
            className="p-1.5 rounded hover:bg-red-50 transition-colors text-bark-dim hover:text-red-500 disabled:opacity-50"
            title="Cancella chat"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* ─── Main Layout: Sidebar + Content ───────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ─── Sidebar ──────────────────────────────────── */}
        <div className="w-56 bg-cream-100 border-r border-cream-200 flex flex-col overflow-hidden">
          {/* Tab buttons */}
          <div className="flex gap-0 border-b border-cream-200 flex-shrink-0">
            <button
              onClick={() => setActiveTab('chat')}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors border-b-2 ${
                activeTab === 'chat'
                  ? 'bg-white text-bark border-lobster'
                  : 'text-bark-secondary border-transparent hover:bg-cream-200'
              }`}
            >
              Chat
            </button>
            <button
              onClick={() => setActiveTab('git')}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors border-b-2 ${
                activeTab === 'git'
                  ? 'bg-white text-bark border-lobster'
                  : 'text-bark-secondary border-transparent hover:bg-cream-200'
              }`}
            >
              Git
            </button>
            <button
              onClick={() => setActiveTab('mod')}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors border-b-2 relative ${
                activeTab === 'mod'
                  ? 'bg-white text-bark border-lobster'
                  : 'text-bark-secondary border-transparent hover:bg-cream-200'
              }`}
            >
              Mod
              {modifiedFiles.length > 0 && (
                <span className="absolute top-1 right-1 text-[10px] bg-lobster text-white rounded-full w-4 h-4 flex items-center justify-center">
                  {modifiedFiles.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('memo')}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors border-b-2 ${
                activeTab === 'memo'
                  ? 'bg-white text-bark border-lobster'
                  : 'text-bark-secondary border-transparent hover:bg-cream-200'
              }`}
            >
              Memo
            </button>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto">
            {activeTab === 'chat' && (
              <ChatSidebar
                sessions={chatSessions}
                currentSessionId={status.currentSessionId}
                onCreateSession={handleCreateSession}
                onSwitchSession={handleSwitchSession}
                onDeleteSession={handleDeleteSession}
                renamingSessionId={renamingSessionId}
                renameValue={renameValue}
                onRenameStart={(id) => {
                  setRenamingSessionId(id);
                  setRenameValue(chatSessions.find((s) => s.id === id)?.title || '');
                }}
                onRenameCancel={() => setRenamingSessionId(null)}
                onRenameChange={setRenameValue}
                onRenameSave={(id) => handleRenameSession(id, renameValue)}
              />
            )}

            {activeTab === 'git' && (
              <GitSidebar
                gitStatus={gitStatus}
                onSelectFile={handleSelectGitFile}
                selectedFile={selectedGitFile}
                onGitInit={handleGitInit}
                commitMessage={commitMessage}
                onCommitMessageChange={setCommitMessage}
                onCommit={handleGitCommit}
              />
            )}

            {activeTab === 'mod' && (
              <ModSidebar files={modifiedFiles} />
            )}

            {activeTab === 'memo' && (
              <MemoSidebar
                content={sessionMemory}
                onChange={setSessionMemory}
                onSave={handleSaveSessionMemory}
              />
            )}
          </div>
        </div>

        {/* ─── Main Content Area ───────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Content based on active tab */}
          {activeTab === 'chat' && (
            <>
              {/* Snapshots bar */}
              {snapshots.length > 0 && (
                <SnapshotBar
                  snapshots={snapshots}
                  isExpanded={showSnapshots}
                  onToggle={() => setShowSnapshots(!showSnapshots)}
                  onRollback={handleRollbackSnapshot}
                />
              )}

              {/* Messages container */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-cream-50">
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center py-20">
                    <Terminal size={48} className="text-bark-dim mb-4" />
                    <h3 className="text-sm font-semibold text-bark mb-1">Nessun messaggio</h3>
                    <p className="text-xs text-bark-secondary max-w-sm">
                      Inizia a chattare con LobsterCode. Puoi chiedere aiuto con il tuo codice,
                      ricevere suggerimenti, e eseguire fix automatici.
                    </p>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <ChatMessageComponent key={msg.id} message={msg} />
                  ))
                )}

                {isGenerating && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-white border border-cream-200">
                      <Loader2 size={16} className="animate-spin text-lobster" />
                      <span className="text-xs text-bark-secondary">Generando risposta...</span>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Input area */}
              <div className="flex-shrink-0 px-4 py-4 bg-white border-t border-cream-200">
                <div className="flex gap-2">
                  <div className="flex-1 flex flex-col">
                    <textarea
                      ref={inputRef}
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      placeholder="Scrivi un messaggio... (Shift+Enter per nuova riga)"
                      disabled={isGenerating || !status?.available}
                      rows={1}
                      className="flex-1 px-3 py-2 bg-cream-50 border border-cream-200 rounded-lg text-sm text-bark placeholder-bark-dim focus:outline-none focus:ring-2 focus:ring-lobster/30 focus:border-lobster resize-none overflow-hidden min-h-[40px] max-h-[120px] disabled:opacity-50"
                      style={{
                        maxHeight: '120px',
                        minHeight: '40px',
                      }}
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    {isGenerating ? (
                      <button
                        onClick={handleAbort}
                        className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors flex items-center gap-2 text-sm font-medium"
                        title="Interrompi generazione"
                      >
                        <Square size={14} />
                        Stop
                      </button>
                    ) : (
                      <button
                        onClick={() => handleSendMessage()}
                        disabled={!inputValue.trim() || isGenerating || !status?.available}
                        className="px-4 py-2 bg-lobster hover:bg-lobster-dark text-white rounded-lg transition-colors flex items-center gap-2 text-sm font-medium disabled:opacity-50"
                        title="Invia messaggio (Enter)"
                      >
                        <Send size={14} />
                        Invia
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'git' && selectedGitFile && (
            <GitDiffView content={gitDiffContent} filePath={selectedGitFile} />
          )}

          {activeTab === 'git' && !selectedGitFile && (
            <div className="flex items-center justify-center h-full bg-cream-50">
              <p className="text-sm text-bark-secondary">Seleziona un file per visualizzare il diff</p>
            </div>
          )}

          {activeTab === 'mod' && (
            <ModDetailsView files={modifiedFiles} />
          )}

          {activeTab === 'memo' && (
            <div className="flex items-center justify-center h-full bg-cream-50">
              <p className="text-sm text-bark-secondary">Visualizza le note nel sidebar</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────

interface ChatSidebarProps {
  sessions: ChatSession[];
  currentSessionId: string;
  onCreateSession: () => void;
  onSwitchSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  renamingSessionId: string | null;
  renameValue: string;
  onRenameStart: (id: string) => void;
  onRenameCancel: () => void;
  onRenameChange: (value: string) => void;
  onRenameSave: (id: string) => void;
}

function ChatSidebar({
  sessions,
  currentSessionId,
  onCreateSession,
  onSwitchSession,
  onDeleteSession,
  renamingSessionId,
  renameValue,
  onRenameStart,
  onRenameCancel,
  onRenameChange,
  onRenameSave,
}: ChatSidebarProps) {
  return (
    <div className="flex flex-col h-full">
      <button
        onClick={onCreateSession}
        className="m-3 px-3 py-2 bg-lobster text-white rounded-lg text-xs font-medium flex items-center justify-center gap-1 hover:bg-lobster-dark transition-colors"
      >
        <Plus size={14} />
        Nuova Chat
      </button>

      <div className="flex-1 overflow-y-auto space-y-1 px-2">
        {sessions.map((session) => (
          <div
            key={session.id}
            className={`group px-2 py-2 rounded-lg text-xs transition-colors ${
              session.id === currentSessionId
                ? 'bg-lobster/10 border-l-2 border-lobster'
                : 'hover:bg-cream-200'
            }`}
          >
            {renamingSessionId === session.id ? (
              <div className="flex gap-1">
                <input
                  type="text"
                  value={renameValue}
                  onChange={(e) => onRenameChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onRenameSave(session.id);
                    if (e.key === 'Escape') onRenameCancel();
                  }}
                  className="flex-1 px-1 py-0.5 text-xs border border-cream-200 rounded"
                  autoFocus
                />
                <button
                  onClick={() => onRenameSave(session.id)}
                  className="p-0.5 hover:bg-green-100 rounded"
                >
                  <Check size={12} />
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <button
                  onClick={() => onSwitchSession(session.id)}
                  onDoubleClick={() => onRenameStart(session.id)}
                  className="flex-1 text-left text-bark truncate"
                >
                  {session.title}
                </button>
                <button
                  onClick={() => onDeleteSession(session.id)}
                  className="p-0.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-100 rounded"
                >
                  <X size={12} className="text-red-600" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

interface GitSidebarProps {
  gitStatus: any;
  onSelectFile: (path: string) => void;
  selectedFile: string | null;
  onGitInit: () => void;
  commitMessage: string;
  onCommitMessageChange: (msg: string) => void;
  onCommit: () => void;
}

function GitSidebar({
  gitStatus,
  onSelectFile,
  selectedFile,
  onGitInit,
  commitMessage,
  onCommitMessageChange,
  onCommit,
}: GitSidebarProps) {
  if (!gitStatus) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4">
        <AlertTriangle size={32} className="text-status-yellow mb-2" />
        <p className="text-xs text-bark-secondary text-center mb-3">Non è un repository git</p>
        <button
          onClick={onGitInit}
          className="px-3 py-1.5 bg-lobster text-white rounded text-xs font-medium hover:bg-lobster-dark"
        >
          Inizializza Git
        </button>
      </div>
    );
  }

  const allFiles = [
    ...gitStatus.modified?.map((f: string) => ({ path: f, type: 'M' })) || [],
    ...gitStatus.added?.map((f: string) => ({ path: f, type: 'A' })) || [],
    ...gitStatus.deleted?.map((f: string) => ({ path: f, type: 'D' })) || [],
    ...gitStatus.untracked?.map((f: string) => ({ path: f, type: '?' })) || [],
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-cream-200 flex-shrink-0">
        <p className="text-xs font-medium text-bark mb-1">
          <GitBranch size={12} className="inline mr-1" />
          {gitStatus.branch || 'main'}
        </p>
        {allFiles.length > 0 && (
          <p className="text-[10px] text-bark-secondary">{allFiles.length} file modificati</p>
        )}
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        {allFiles.map((file) => (
          <button
            key={file.path}
            onClick={() => onSelectFile(file.path)}
            className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${
              selectedFile === file.path
                ? 'bg-lobster/10 border-l-2 border-lobster'
                : 'hover:bg-cream-200'
            }`}
          >
            <div className="flex items-center gap-1 truncate">
              <span className="text-[10px] font-mono font-bold text-bark-secondary min-w-fit">
                {file.type}
              </span>
              <span className="truncate text-bark">{file.path}</span>
            </div>
          </button>
        ))}
      </div>

      {/* Commit input */}
      {allFiles.length > 0 && (
        <div className="p-3 border-t border-cream-200 flex-shrink-0">
          <textarea
            value={commitMessage}
            onChange={(e) => onCommitMessageChange(e.target.value)}
            placeholder="Messaggio commit..."
            rows={2}
            className="w-full px-2 py-1 text-xs border border-cream-200 rounded resize-none"
          />
          <button
            onClick={onCommit}
            disabled={!commitMessage.trim()}
            className="w-full mt-1 px-2 py-1.5 bg-lobster text-white rounded text-xs font-medium hover:bg-lobster-dark disabled:opacity-50"
          >
            Commit
          </button>
        </div>
      )}
    </div>
  );
}

interface ModSidebarProps {
  files: ModifiedFile[];
}

function ModSidebar({ files }: ModSidebarProps) {
  return (
    <div className="flex flex-col h-full overflow-y-auto px-2 py-2 space-y-1">
      {files.length === 0 ? (
        <div className="flex items-center justify-center h-full text-center">
          <p className="text-xs text-bark-secondary">Nessun file modificato</p>
        </div>
      ) : (
        files.map((file) => (
          <div key={file.path} className="px-2 py-2 bg-white rounded border border-cream-200 text-xs">
            <div className="flex items-center gap-1 mb-1">
              {file.type === 'edit' ? (
                <Pencil size={12} className="text-bark-dim" />
              ) : (
                <FileEdit size={12} className="text-bark-dim" />
              )}
              <span className="font-medium text-bark truncate">{file.path}</span>
            </div>
            <p className="text-[10px] text-bark-dim">
              {file.timestamp.toLocaleTimeString('it-IT')}
            </p>
          </div>
        ))
      )}
    </div>
  );
}

interface MemoSidebarProps {
  content: string;
  onChange: (value: string) => void;
  onSave: () => void;
}

function MemoSidebar({ content, onChange, onSave }: MemoSidebarProps) {
  return (
    <div className="flex flex-col h-full p-3 gap-2">
      <p className="text-xs text-bark-secondary">
        Note e contesto che l'agente ricorda tra le sessioni
      </p>
      <textarea
        value={content}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 px-2 py-2 text-xs border border-cream-200 rounded resize-none focus:outline-none focus:ring-2 focus:ring-lobster/30"
        placeholder="Scrivi note..."
      />
      <button
        onClick={onSave}
        className="px-3 py-1.5 bg-lobster text-white rounded text-xs font-medium hover:bg-lobster-dark"
      >
        Salva
      </button>
    </div>
  );
}

// ─── SnapshotBar ───────────────────────────────────────────

interface SnapshotBarProps {
  snapshots: Snapshot[];
  isExpanded: boolean;
  onToggle: () => void;
  onRollback: (id: number) => void;
}

function SnapshotBar({ snapshots, isExpanded, onToggle, onRollback }: SnapshotBarProps) {
  return (
    <div className="flex-shrink-0 bg-white border-b border-cream-200">
      <button
        onClick={onToggle}
        className="w-full px-4 py-2 flex items-center gap-2 hover:bg-cream-50 transition-colors border-b border-cream-200"
      >
        <span className="text-sm font-medium text-bark">
          📸 {snapshots.length} snapshot{snapshots.length !== 1 ? 's' : ''}
        </span>
        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {isExpanded && (
        <div className="px-4 py-3 space-y-2">
          {snapshots.map((snap) => (
            <div key={snap.id} className="flex items-center justify-between p-2 bg-cream-50 rounded text-xs">
              <div>
                <p className="font-medium text-bark">{snap.label}</p>
                <p className="text-bark-dim text-[10px]">
                  {snap.fileCount} file — {snap.timestamp.toLocaleTimeString('it-IT')}
                </p>
              </div>
              <button
                onClick={() => onRollback(snap.id)}
                className="px-2 py-1 text-red-600 hover:bg-red-50 rounded text-xs font-medium"
              >
                Annulla
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── GitDiffView ───────────────────────────────────────────

interface GitDiffViewProps {
  content: string;
  filePath: string;
}

function GitDiffView({ content, filePath }: GitDiffViewProps) {
  return (
    <div className="flex flex-col h-full bg-cream-50">
      <div className="px-4 py-3 bg-white border-b border-cream-200 flex-shrink-0">
        <p className="text-sm font-medium text-bark">{filePath}</p>
      </div>
      <pre className="flex-1 overflow-auto px-4 py-3 text-xs font-mono whitespace-pre-wrap break-words">
        <code className="text-bark-dim">{content || 'Nessun diff'}</code>
      </pre>
    </div>
  );
}

// ─── ModDetailsView ────────────────────────────────────────

interface ModDetailsViewProps {
  files: ModifiedFile[];
}

function ModDetailsView({ files }: ModDetailsViewProps) {
  if (files.length === 0) {
    return (
      <div className="flex items-center justify-center h-full bg-cream-50">
        <div className="text-center">
          <FileEdit size={48} className="text-bark-dim mb-3 mx-auto" />
          <p className="text-sm text-bark-secondary">Nessun file modificato in questa sessione</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 bg-cream-50 space-y-3">
      {files.map((file) => (
        <div key={file.path} className="p-4 bg-white rounded-lg border border-cream-200">
          <div className="flex items-start gap-3">
            <div className="mt-1">
              {file.type === 'edit' ? (
                <Pencil size={16} className="text-bark-dim" />
              ) : (
                <FileEdit size={16} className="text-bark-dim" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-bark break-all">{file.path}</p>
              <p className="text-xs text-bark-secondary mt-1">
                {file.type === 'edit' ? '✏️ Modificato' : '📝 Creato'} — {file.timestamp.toLocaleString('it-IT')}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── ChatMessageComponent ──────────────────────────────────

interface ChatMessageComponentProps {
  message: ChatMessage;
}

function ChatMessageComponent({ message }: ChatMessageComponentProps) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-xs px-4 py-3 bg-lobster text-white rounded-lg">
          <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
          <p className="text-xs text-lobster-light mt-1">
            {message.timestamp.toLocaleTimeString('it-IT', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-2xl px-4 py-3 bg-white border border-cream-200 rounded-lg">
        <MarkdownContent content={message.content} />

        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-3 space-y-2">
            {message.toolCalls.map((tc, i) => (
              <ToolCallCard key={i} toolCall={tc} />
            ))}
          </div>
        )}

        <p className="text-xs text-bark-dim mt-2">
          {message.timestamp.toLocaleTimeString('it-IT', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      </div>
    </div>
  );
}

// ─── MarkdownContent ───────────────────────────────────────

interface MarkdownContentProps {
  content: string;
}

function MarkdownContent({ content }: MarkdownContentProps) {
  const parts = content.split(/(\`\`\`[\s\S]*?\`\`\`|\*\*.*?\*\*)/);

  return (
    <div className="text-sm text-bark leading-relaxed space-y-2">
      {parts.map((part, i) => {
        if (!part) return null;

        if (part.startsWith('```')) {
          const code = part.slice(3, -3).trim();
          return (
            <pre
              key={i}
              className="bg-sidebar text-ocean-light px-3 py-2 rounded text-xs font-mono overflow-x-auto border border-cream-200"
            >
              <code>{code}</code>
            </pre>
          );
        }

        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <strong key={i} className="font-semibold text-bark">
              {part.slice(2, -2)}
            </strong>
          );
        }

        return (
          <span key={i} className="block">
            {part}
          </span>
        );
      })}
    </div>
  );
}

// ─── ToolCallCard ─────────────────────────────────────────

interface ToolCall {
  name: string;
  args: Record<string, any>;
  result?: string;
}

interface ToolCallCardProps {
  toolCall: ToolCall;
}

function ToolCallCard({ toolCall }: ToolCallCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copiedResult, setCopiedResult] = useState(false);

  const handleCopyResult = () => {
    if (toolCall.result) {
      navigator.clipboard.writeText(toolCall.result);
      setCopiedResult(true);
      setTimeout(() => setCopiedResult(false), 2000);
    }
  };

  return (
    <div className="bg-cream-50 border border-cream-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3 py-2 flex items-center justify-between hover:bg-cream-100 transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Wrench size={14} className="text-orange-600 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-bark truncate">
              {toolCall.name}
            </p>
            <p className="text-[10px] text-bark-dim truncate">
              {JSON.stringify(toolCall.args).slice(0, 60)}...
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {toolCall.result && (
            <Check size={14} className="text-green-600" />
          )}
          {isExpanded ? (
            <ChevronUp size={14} className="text-bark-dim" />
          ) : (
            <ChevronDown size={14} className="text-bark-dim" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="px-3 py-2 bg-white border-t border-cream-200 space-y-2">
          <div>
            <p className="text-xs font-semibold text-bark-secondary mb-1">Parametri:</p>
            <pre className="text-[10px] bg-cream-50 p-2 rounded border border-cream-200 font-mono overflow-x-auto text-bark-dim">
              {JSON.stringify(toolCall.args, null, 2)}
            </pre>
          </div>

          {toolCall.result && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-bark-secondary">Risultato:</p>
                <button
                  onClick={handleCopyResult}
                  className="flex items-center gap-1 text-xs text-bark-dim hover:text-bark transition-colors"
                >
                  {copiedResult ? (
                    <>
                      <Check size={12} />
                      Copiato
                    </>
                  ) : (
                    <>
                      <Copy size={12} />
                      Copia
                    </>
                  )}
                </button>
              </div>
              <pre className="text-[10px] bg-cream-50 p-2 rounded border border-cream-200 font-mono overflow-x-auto max-h-40 text-bark-dim whitespace-pre-wrap word-break">
                {toolCall.result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
