// ============================================================
// LOBSTER UTILITY — Project Detail View
// Deep view into a single project: ports, containers, health, actions
// ============================================================

import React, { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { useProjects } from '../../hooks/useLobster';
import { useStore } from '../../store';
import type { Project, DockerContainer, PortInfo } from '@shared/types';
import {
  ArrowLeft, Wifi, ExternalLink, FolderOpen, Terminal, Code,
  Play, Square, RotateCcw, Loader2, CheckCircle, XCircle,
  AlertTriangle, Circle, Copy, Globe, FileText, Save, Plus,
  Eye, Edit3
} from 'lucide-react';

// ─── Traffic Light ─────────────────────────────────────────
function TrafficLightBig({ light }: { light: string }) {
  const colorMap: Record<string, string> = {
    green: '#2e8b57',
    yellow: '#e89530',
    red: '#d63a28',
    gray: '#9ca3af',
  };
  const labelMap: Record<string, string> = {
    green: 'Tutto OK',
    yellow: 'Attenzione',
    red: 'Problemi',
    gray: 'Sconosciuto',
  };
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-block rounded-full"
        style={{
          width: 16,
          height: 16,
          backgroundColor: colorMap[light] || colorMap.gray,
          boxShadow: light !== 'gray' ? `0 0 8px ${colorMap[light]}50` : 'none',
        }}
      />
      <span className="text-sm font-medium text-bark-secondary">{labelMap[light] || 'Sconosciuto'}</span>
    </div>
  );
}

// ─── Container Row ─────────────────────────────────────────
function ContainerRow({ container, onAction }: {
  container: DockerContainer;
  onAction: (id: string, action: 'start' | 'stop' | 'restart') => void;
}) {
  const stateIcons: Record<string, React.ReactNode> = {
    running: <CheckCircle size={14} className="text-status-green" />,
    exited: <XCircle size={14} className="text-status-red" />,
    created: <Circle size={14} className="text-bark-dim" />,
    dead: <XCircle size={14} className="text-status-red" />,
    paused: <AlertTriangle size={14} className="text-status-yellow" />,
  };

  const stateLabels: Record<string, string> = {
    running: 'Attivo',
    exited: 'Fermo',
    created: 'Creato',
    dead: 'Morto',
    paused: 'In pausa',
  };

  const isRunning = container.state === 'running';
  const isStopped = container.state === 'exited' || container.state === 'created' || container.state === 'dead';

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-cream-50 hover:bg-cream-100 transition-colors">
      <span className="text-lg flex-shrink-0">🐳</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {stateIcons[container.state] || stateIcons.created}
          <span className="text-sm font-medium text-bark truncate">{container.friendlyName || container.name}</span>
        </div>
        <p className="text-[11px] text-bark-dim truncate mt-0.5">{container.humanStatus}</p>
        {container.ports.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {container.ports.map((p, i) => (
              <span key={i} className="text-[10px] font-mono bg-ocean/10 text-ocean px-1.5 py-0.5 rounded">
                {p.host}:{p.container}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <span className="text-[10px] text-bark-dim mr-1">{stateLabels[container.state] || container.state}</span>
        {isRunning && (
          <button
            onClick={() => onAction(container.id, 'stop')}
            className="p-1.5 rounded-md text-status-red hover:bg-red-50 transition-colors"
            title="Ferma container"
          >
            <Square size={12} />
          </button>
        )}
        {isStopped && (
          <button
            onClick={() => onAction(container.id, 'start')}
            className="p-1.5 rounded-md text-status-green hover:bg-green-50 transition-colors"
            title="Avvia container"
          >
            <Play size={12} />
          </button>
        )}
        {isRunning && (
          <button
            onClick={() => onAction(container.id, 'restart')}
            className="p-1.5 rounded-md text-ocean hover:bg-blue-50 transition-colors"
            title="Riavvia container"
          >
            <RotateCcw size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Port Row ──────────────────────────────────────────────
function PortRow({ port }: { port: PortInfo }) {
  const isActive = port.state === 'LISTEN';
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-cream-50 hover:bg-cream-100 transition-colors">
      <Wifi size={14} className={isActive ? 'text-ocean' : 'text-bark-dim'} />
      <span className="font-mono text-sm font-semibold text-ocean w-14 text-right">{port.port}</span>
      <div className="flex-1 min-w-0">
        <span className="text-sm text-bark truncate block">{port.humanLabel}</span>
        <span className="text-[10px] text-bark-dim">{port.processName} (PID {port.pid})</span>
      </div>
      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
        isActive ? 'bg-green-50 text-status-green' : 'bg-cream-200 text-bark-dim'
      }`}>
        {isActive ? 'ATTIVA' : port.state}
      </span>
      {port.url && (
        <button
          onClick={() => window.lobster?.system?.openUrl?.(port.url!)}
          className="p-1.5 rounded-md text-ocean hover:bg-blue-50 transition-colors"
          title={`Apri ${port.url}`}
        >
          <ExternalLink size={13} />
        </button>
      )}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────
export function ProjectDetail() {
  const { selectedProjectId, setActiveView, showToast } = useStore();
  const { data: projects } = useProjects();
  const [containerAction, setContainerAction] = React.useState<string | null>(null);

  // Notes state
  const [notesContent, setNotesContent] = useState('');
  const [notesExists, setNotesExists] = useState(false);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesEditing, setNotesEditing] = useState(false);
  const [notesDirty, setNotesDirty] = useState(false);

  // Refs to track current values for auto-save on unmount (avoids stale closures)
  const notesDirtyRef = useRef(false);
  const notesContentRef = useRef('');
  const selectedProjectIdRef = useRef(selectedProjectId);
  notesDirtyRef.current = notesDirty;
  notesContentRef.current = notesContent;
  selectedProjectIdRef.current = selectedProjectId;

  // Auto-save dirty notes when component unmounts (prevents data loss on navigation)
  useEffect(() => {
    return () => {
      if (notesDirtyRef.current && selectedProjectIdRef.current && notesContentRef.current) {
        // Fire-and-forget: save before unmount so edits are never lost
        window.lobster?.projects?.saveNotes?.(selectedProjectIdRef.current, notesContentRef.current)
          .catch((err: any) => console.error('[ProjectDetail] Auto-save notes on unmount failed:', err));
      }
    };
  }, []);

  const project = useMemo(() => {
    if (!projects || !selectedProjectId) return null;
    return projects.find((p) => p.id === selectedProjectId) || null;
  }, [projects, selectedProjectId]);

  // Load notes when project changes
  useEffect(() => {
    if (!selectedProjectId) return;
    setNotesLoading(true);
    setNotesEditing(false);
    setNotesDirty(false);
    window.lobster?.projects?.getNotes?.(selectedProjectId)
      .then((result: any) => {
        setNotesExists(result?.exists || false);
        setNotesContent(result?.content || '');
      })
      .catch(() => {
        setNotesExists(false);
        setNotesContent('');
      })
      .finally(() => setNotesLoading(false));
  }, [selectedProjectId]);

  const goBack = useCallback(() => {
    setActiveView('dashboard');
  }, [setActiveView]);

  const handleContainerAction = useCallback(async (containerId: string, action: 'start' | 'stop' | 'restart') => {
    if (containerAction) return;
    setContainerAction(containerId);
    try {
      await window.lobster?.docker?.containerAction?.(containerId, action);
      showToast(`Container ${action === 'stop' ? 'fermato' : action === 'start' ? 'avviato' : 'riavviato'}`, 'success');
    } catch (error) {
      console.error(`Error ${action} container:`, error);
      showToast(`Errore durante ${action}`, 'error');
    } finally {
      setTimeout(() => setContainerAction(null), 1000);
    }
  }, [containerAction, showToast]);

  const handleOpenFolder = useCallback(async () => {
    if (!project) return;
    try {
      await window.lobster?.projects?.openFolder?.(project.path);
    } catch { showToast('Errore aprendo la cartella', 'error'); }
  }, [project, showToast]);

  const handleOpenTerminal = useCallback(async () => {
    if (!project) return;
    try {
      await window.lobster?.projects?.openTerminal?.(project.path);
    } catch { showToast('Errore aprendo il terminale', 'error'); }
  }, [project, showToast]);

  const handleOpenVSCode = useCallback(async () => {
    if (!project) return;
    try {
      await window.lobster?.projects?.openVscode?.(project.path);
    } catch { showToast('Errore aprendo VS Code', 'error'); }
  }, [project, showToast]);

  const handleCopyPath = useCallback(() => {
    if (!project) return;
    navigator.clipboard.writeText(project.path).then(() => {
      showToast('Percorso copiato', 'success');
    }).catch(() => {
      showToast('Errore copiando il percorso', 'error');
    });
  }, [project, showToast]);

  // Notes handlers
  const handleGenerateNotes = useCallback(async () => {
    if (!selectedProjectId) return;
    setNotesLoading(true);
    try {
      const result = await window.lobster?.projects?.generateNotes?.(selectedProjectId);
      if (result) {
        setNotesExists(true);
        setNotesContent(result.content);
        setNotesEditing(true);
        showToast(result.wasGenerated ? 'File .lobster.md creato!' : 'File .lobster.md già esistente', 'success');
      }
    } catch (error) {
      showToast('Errore generando le note', 'error');
    } finally {
      setNotesLoading(false);
    }
  }, [selectedProjectId, showToast]);

  const handleSaveNotes = useCallback(async () => {
    if (!selectedProjectId || !notesContent) return;
    setNotesSaving(true);
    try {
      await window.lobster?.projects?.saveNotes?.(selectedProjectId, notesContent);
      setNotesDirty(false);
      showToast('Note salvate', 'success');
    } catch {
      showToast('Errore salvando le note', 'error');
    } finally {
      setNotesSaving(false);
    }
  }, [selectedProjectId, notesContent, showToast]);

  // Separate active vs inactive ports
  const activePorts = useMemo(() => project?.ports?.filter((p) => p.state === 'LISTEN') || [], [project]);
  const inactivePorts = useMemo(() => project?.ports?.filter((p) => p.state !== 'LISTEN') || [], [project]);

  // Separate running vs stopped containers
  const runningContainers = useMemo(() => project?.containers?.filter((c) => c.state === 'running') || [], [project]);
  const stoppedContainers = useMemo(() => project?.containers?.filter((c) => c.state !== 'running') || [], [project]);

  const webUrl = useMemo(() => {
    return project?.ports?.find((p) => p.url && p.state === 'LISTEN')?.url;
  }, [project]);

  // Not found state
  if (!project) {
    return (
      <div className="p-6 max-w-[1000px] mx-auto">
        <button onClick={goBack} className="flex items-center gap-2 text-bark-secondary hover:text-bark transition-colors mb-6">
          <ArrowLeft size={18} />
          <span className="text-sm">Torna alla Dashboard</span>
        </button>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <span className="text-5xl mb-4">🔍</span>
          <h2 className="text-xl font-bold text-bark mb-2">Progetto non trovato</h2>
          <p className="text-bark-secondary text-sm">Il progetto selezionato non esiste più o è stato rimosso.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1000px] mx-auto">
      {/* Back button */}
      <button onClick={goBack} className="flex items-center gap-2 text-bark-secondary hover:text-bark transition-colors mb-4">
        <ArrowLeft size={18} />
        <span className="text-sm">Torna alla Dashboard</span>
      </button>

      {/* ─── Project Header ──────────────────────────────── */}
      <div className="card mb-6">
        <div className="flex items-start gap-4">
          <div
            className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
            style={{ backgroundColor: `${project.color}15`, border: `2px solid ${project.color}40` }}
          >
            {project.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-xl font-bold text-bark truncate">{project.name}</h1>
              <TrafficLightBig light={project.trafficLight} />
            </div>
            <p className="text-sm text-bark-secondary mb-2">{project.humanStatus}</p>
            <div className="flex flex-wrap items-center gap-3 text-xs text-bark-dim">
              {project.type !== 'generic' && (
                <span className="uppercase tracking-wider font-semibold px-2 py-0.5 rounded" style={{ color: project.color, backgroundColor: `${project.color}10` }}>
                  {project.type}
                </span>
              )}
              {project.gitBranch && (
                <span className="flex items-center gap-1">🌿 {project.gitBranch}</span>
              )}
              <span className="flex items-center gap-1 text-bark-dim truncate max-w-xs" title={project.path}>
                📁 {project.path.replace(/^\/Users\/[^/]+/, '~')}
              </span>
            </div>
          </div>
        </div>

        {/* Quick Actions Bar */}
        <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-cream-200">
          <button onClick={handleOpenFolder} className="btn-secondary flex items-center gap-1.5 text-xs px-3 py-1.5">
            <FolderOpen size={14} /> Cartella
          </button>
          <button onClick={handleOpenTerminal} className="btn-secondary flex items-center gap-1.5 text-xs px-3 py-1.5">
            <Terminal size={14} /> Terminale
          </button>
          <button onClick={handleOpenVSCode} className="btn-secondary flex items-center gap-1.5 text-xs px-3 py-1.5">
            <Code size={14} /> VS Code
          </button>
          <button onClick={handleCopyPath} className="btn-secondary flex items-center gap-1.5 text-xs px-3 py-1.5">
            <Copy size={14} /> Copia Percorso
          </button>
          {webUrl && (
            <button
              onClick={() => window.lobster?.system?.openUrl?.(webUrl)}
              className="btn-primary flex items-center gap-1.5 text-xs px-3 py-1.5 ml-auto"
            >
              <Globe size={14} /> Apri nel Browser
            </button>
          )}
        </div>
      </div>

      {/* ─── Content Grid ────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* ─── Porte Attive ──────────────────────────────── */}
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <Wifi size={18} className="text-ocean" />
            <h2 className="text-sm font-semibold text-bark">Porte</h2>
            <span className="text-xs text-bark-dim ml-auto">
              {activePorts.length} attiv{activePorts.length === 1 ? 'a' : 'e'}
              {inactivePorts.length > 0 && ` · ${inactivePorts.length} inattiv${inactivePorts.length === 1 ? 'a' : 'e'}`}
            </span>
          </div>

          {activePorts.length === 0 && inactivePorts.length === 0 ? (
            <p className="text-xs text-bark-dim py-4 text-center">Nessuna porta associata a questo progetto</p>
          ) : (
            <div className="space-y-1.5">
              {activePorts.map((p) => (
                <PortRow key={`${p.port}-${p.pid}`} port={p} />
              ))}
              {inactivePorts.length > 0 && activePorts.length > 0 && (
                <div className="border-t border-cream-200 my-2" />
              )}
              {inactivePorts.map((p) => (
                <PortRow key={`${p.port}-${p.pid}-inactive`} port={p} />
              ))}
            </div>
          )}
        </div>

        {/* ─── Container Docker ──────────────────────────── */}
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">🐳</span>
            <h2 className="text-sm font-semibold text-bark">Container</h2>
            <span className="text-xs text-bark-dim ml-auto">
              {runningContainers.length} attiv{runningContainers.length === 1 ? 'o' : 'i'}
              {stoppedContainers.length > 0 && ` · ${stoppedContainers.length} ferm${stoppedContainers.length === 1 ? 'o' : 'i'}`}
            </span>
          </div>

          {(project.containers?.length ?? 0) === 0 ? (
            <p className="text-xs text-bark-dim py-4 text-center">Nessun container Docker per questo progetto</p>
          ) : (
            <div className="space-y-1.5">
              {runningContainers.map((c) => (
                <ContainerRow key={c.id} container={c} onAction={handleContainerAction} />
              ))}
              {stoppedContainers.length > 0 && runningContainers.length > 0 && (
                <div className="border-t border-cream-200 my-2" />
              )}
              {stoppedContainers.map((c) => (
                <ContainerRow key={c.id} container={c} onAction={handleContainerAction} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ─── Note Progetto (.lobster.md) ─────────────────── */}
      <div className="card mt-4">
        <div className="flex items-center gap-2 mb-3">
          <FileText size={18} className="text-lobster" />
          <h2 className="text-sm font-semibold text-bark">Note Progetto</h2>
          <span className="text-[10px] text-bark-dim font-mono">.lobster.md</span>
          <div className="flex items-center gap-1 ml-auto">
            {notesExists && !notesEditing && (
              <button
                onClick={() => setNotesEditing(true)}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-bark-dim hover:text-bark hover:bg-cream-100 transition-colors"
              >
                <Edit3 size={12} /> Modifica
              </button>
            )}
            {notesEditing && (
              <>
                <button
                  onClick={() => { setNotesEditing(false); setNotesDirty(false); }}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-bark-dim hover:text-bark hover:bg-cream-100 transition-colors"
                >
                  <Eye size={12} /> Anteprima
                </button>
                <button
                  onClick={handleSaveNotes}
                  disabled={notesSaving || !notesDirty}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-white bg-lobster hover:bg-lobster-light disabled:opacity-50 transition-colors"
                >
                  {notesSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                  {notesSaving ? 'Salvo...' : 'Salva'}
                </button>
              </>
            )}
          </div>
        </div>

        {notesLoading ? (
          <div className="flex items-center gap-2 py-6 justify-center">
            <Loader2 size={16} className="animate-spin text-bark-dim" />
            <span className="text-xs text-bark-dim">Caricamento note...</span>
          </div>
        ) : !notesExists ? (
          <div className="flex flex-col items-center py-6 text-center">
            <FileText size={32} className="text-bark-dim mb-2 opacity-40" />
            <p className="text-xs text-bark-dim mb-3">
              Nessun file .lobster.md per questo progetto.
              Creane uno per documentare scopo, stack, note e istruzioni per AI.
            </p>
            <button
              onClick={handleGenerateNotes}
              className="btn-primary flex items-center gap-1.5 text-xs px-4 py-2"
            >
              <Plus size={14} /> Crea .lobster.md
            </button>
          </div>
        ) : notesEditing ? (
          <textarea
            value={notesContent}
            onChange={(e) => { setNotesContent(e.target.value); setNotesDirty(true); }}
            className="w-full h-80 bg-cream-50 border border-cream-200 rounded-lg p-3 text-sm text-bark font-mono resize-y focus:outline-none focus:ring-2 focus:ring-lobster/30 focus:border-lobster/50"
            placeholder="Scrivi le tue note qui..."
            spellCheck={false}
          />
        ) : (
          <div
            className="prose prose-sm max-w-none text-bark bg-cream-50 rounded-lg p-4 max-h-80 overflow-y-auto cursor-pointer hover:bg-cream-100 transition-colors"
            onClick={() => setNotesEditing(true)}
            title="Clicca per modificare"
          >
            <pre className="whitespace-pre-wrap text-xs font-mono text-bark-secondary leading-relaxed">{notesContent}</pre>
          </div>
        )}
      </div>

      {/* ─── Configurazione Progetto ─────────────────────── */}
      {project.config && (
        <div className="card mt-4">
          <h2 className="text-sm font-semibold text-bark mb-3">Configurazione</h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
            {project.config.name && (
              <div>
                <span className="text-bark-dim">Nome:</span>
                <span className="ml-2 text-bark font-medium">{project.config.name}</span>
              </div>
            )}
            {project.config.type && (
              <div>
                <span className="text-bark-dim">Tipo:</span>
                <span className="ml-2 text-bark font-medium">{project.config.type}</span>
              </div>
            )}
            {project.config.description && (
              <div className="col-span-2">
                <span className="text-bark-dim">Descrizione:</span>
                <span className="ml-2 text-bark">{project.config.description}</span>
              </div>
            )}
            {project.config.expectedPorts && project.config.expectedPorts.length > 0 && (
              <div className="col-span-2">
                <span className="text-bark-dim">Porte previste:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {project.config.expectedPorts.map((ep) => (
                    <span key={ep.port} className="font-mono bg-ocean/10 text-ocean px-2 py-0.5 rounded text-[10px]">
                      {ep.port} ({ep.service})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
