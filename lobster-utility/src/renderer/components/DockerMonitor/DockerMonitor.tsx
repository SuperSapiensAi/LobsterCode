import React, { useState, useMemo, Component, ErrorInfo } from 'react';
import { useDocker, useDockerContainers } from '../../hooks/useLobster';
import { useStore } from '../../store';
import type { DockerContainer, DockerComposeProject, ContainerState } from '@shared/types';
import {
  Play, Square, RotateCcw, RefreshCw, Search, ChevronDown, ChevronRight,
  FileText, Loader2, AlertTriangle, CheckCircle, XCircle, Pause,
  Cpu, MemoryStick, ExternalLink, WifiOff
} from 'lucide-react';

// ─── State Badge ───────────────────────────────────────────
function StateBadge({ state }: { state: ContainerState }) {
  const config: Record<ContainerState, { label: string; className: string; icon: React.ReactNode }> = {
    running: { label: 'Attivo', className: 'status-badge-green', icon: <CheckCircle size={10} /> },
    exited: { label: 'Fermo', className: 'status-badge-gray', icon: <XCircle size={10} /> },
    paused: { label: 'In pausa', className: 'status-badge-yellow', icon: <Pause size={10} /> },
    restarting: { label: 'Riavvio', className: 'status-badge-yellow', icon: <RotateCcw size={10} /> },
    dead: { label: 'Morto', className: 'status-badge-red', icon: <XCircle size={10} /> },
    created: { label: 'Creato', className: 'status-badge-gray', icon: <CheckCircle size={10} /> },
  };
  const c = config[state] || config.created;
  return (
    <span className={`status-badge ${c.className}`}>
      {c.icon} {c.label}
    </span>
  );
}

// ─── Container Row ─────────────────────────────────────────
function ContainerRow({ container, onRefresh }: { container: DockerContainer; onRefresh?: () => void }) {
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<string>('');
  const [logsLoading, setLogsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const { showToast } = useStore();

  const handleAction = async (action: 'start' | 'stop' | 'restart') => {
    setActionLoading(action);
    try {
      await window.lobster?.docker?.containerAction?.(container.id, action);
      await new Promise((r) => setTimeout(r, 1000));
      onRefresh?.();
      showToast(`Container ${container.friendlyName || container.name}: ${action} completato`, 'success');
    } catch (error) {
      console.error(`Errore ${action} container:`, error);
      showToast(`Errore ${action} container ${container.name}`, 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleViewLogs = async () => {
    if (showLogs) {
      setShowLogs(false);
      return;
    }
    setLogsLoading(true);
    try {
      const result = await window.lobster?.docker?.getContainerLogs?.(container.id);
      setLogs(result || 'Nessun log disponibile');
      setShowLogs(true);
    } catch {
      setLogs('Errore nel recupero dei log');
      setShowLogs(true);
    } finally {
      setLogsLoading(false);
    }
  };

  return (
    <div className="border-b border-cream-200 last:border-0">
      <div className="flex items-center gap-3 py-3 px-4 hover:bg-cream-50 transition-colors">
        {/* Name + image */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-bark truncate">{container.friendlyName}</p>
            <StateBadge state={container.state} />
          </div>
          <p className="text-[11px] text-bark-dim truncate">{container.image}</p>
          {container.platformWarning && (
            <p className="text-[11px] text-status-yellow flex items-center gap-1 mt-0.5">
              <AlertTriangle size={10} /> {container.platformWarning}
            </p>
          )}
        </div>

        {/* Resource usage */}
        {container.state === 'running' && (
          <div className="flex items-center gap-3 text-[11px] text-bark-dim">
            {container.cpuPercent != null && (
              <span className="flex items-center gap-1">
                <Cpu size={11} /> {container.cpuPercent.toFixed(1)}%
              </span>
            )}
            {container.memoryMB != null && (
              <span className="flex items-center gap-1">
                <MemoryStick size={11} /> {container.memoryMB.toFixed(0)} MB
              </span>
            )}
          </div>
        )}

        {/* Ports */}
        {container.ports.length > 0 && (
          <div className="flex items-center gap-1">
            {container.ports.slice(0, 3).map((p) => (
              <button
                key={`${p.host}-${p.container}`}
                onClick={() => window.lobster?.system?.openUrl?.(`http://localhost:${p.host}`)}
                className="text-[10px] font-mono bg-cream-100 text-ocean px-1.5 py-0.5 rounded hover:bg-ocean hover:text-white transition-colors"
                title={`Apri localhost:${p.host}`}
              >
                {p.host}
              </button>
            ))}
            {container.ports.length > 3 && (
              <span className="text-[10px] text-bark-dim">+{container.ports.length - 3}</span>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1">
          {actionLoading ? (
            <span className="p-1.5 text-lobster">
              <Loader2 size={14} className="animate-spin" />
            </span>
          ) : container.state === 'running' ? (
            <>
              <button
                onClick={() => handleAction('stop')}
                className="p-1.5 rounded-md text-bark-dim hover:text-status-red hover:bg-red-50 transition-colors"
                title="Ferma"
              >
                <Square size={14} />
              </button>
              <button
                onClick={() => handleAction('restart')}
                className="p-1.5 rounded-md text-bark-dim hover:text-ocean hover:bg-cream-100 transition-colors"
                title="Riavvia"
              >
                <RotateCcw size={14} />
              </button>
            </>
          ) : (
            <button
              onClick={() => handleAction('start')}
              className="p-1.5 rounded-md text-bark-dim hover:text-status-green hover:bg-green-50 transition-colors"
              title="Avvia"
            >
              <Play size={14} />
            </button>
          )}
          <button
            onClick={handleViewLogs}
            className={`p-1.5 rounded-md transition-colors ${
              showLogs
                ? 'text-lobster bg-lobster-dim'
                : 'text-bark-dim hover:text-bark hover:bg-cream-100'
            }`}
            title="Log"
          >
            {logsLoading ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
          </button>
        </div>
      </div>

      {/* Logs panel */}
      {showLogs && (
        <div className="px-4 pb-3">
          <pre className="bg-sidebar text-cream-50 text-[11px] font-mono p-3 rounded-lg max-h-48 overflow-auto leading-relaxed">
            {logs}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── Compose Project Group ─────────────────────────────────
function ComposeProjectGroup({ project, onRefresh }: { project: DockerComposeProject; onRefresh?: () => void }) {
  const [expanded, setExpanded] = useState(true);
  const [composeLoading, setComposeLoading] = useState(false);

  const healthIcon = () => {
    switch (project.health) {
      case 'healthy': return <CheckCircle size={14} className="text-status-green" />;
      case 'warning': return <AlertTriangle size={14} className="text-status-yellow" />;
      case 'critical': return <AlertTriangle size={14} className="text-status-red" />;
      default: return <XCircle size={14} className="text-status-gray" />;
    }
  };

  const { showToast } = useStore();

  const handleComposeAction = async (action: 'up' | 'down') => {
    setComposeLoading(true);
    try {
      if (action === 'up') {
        await window.lobster?.docker?.startCompose?.(project.name);
      } else {
        await window.lobster?.docker?.stopCompose?.(project.name);
      }
      await new Promise((r) => setTimeout(r, 1500));
      onRefresh?.();
      showToast(`${project.name}: ${action === 'up' ? 'avviato' : 'fermato'}`, 'success');
    } catch (error) {
      console.error(`Errore compose ${action}:`, error);
      showToast(`Errore ${action} per ${project.name}`, 'error');
    } finally {
      setComposeLoading(false);
    }
  };

  return (
    <div className="card p-0 overflow-hidden">
      {/* Project header */}
      <div
        className="flex items-center gap-3 px-4 py-3 bg-cream-50 cursor-pointer hover:bg-cream-100 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <span className="text-xl">🐳</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-bark">{project.name}</h3>
            {healthIcon()}
          </div>
          <p className="text-xs text-bark-secondary">{project.humanStatus}</p>
        </div>
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {composeLoading ? (
            <span className="px-3 py-1.5 text-xs text-lobster">
              <Loader2 size={14} className="animate-spin" />
            </span>
          ) : project.runningContainers < project.totalContainers ? (
            <button
              onClick={() => handleComposeAction('up')}
              disabled={composeLoading}
              className="px-3 py-1.5 text-xs rounded-md bg-status-green text-white hover:bg-green-700 transition-colors font-medium disabled:opacity-50"
            >
              Avvia tutto
            </button>
          ) : (
            <button
              onClick={() => handleComposeAction('down')}
              disabled={composeLoading}
              className="px-3 py-1.5 text-xs rounded-md bg-cream-200 text-bark hover:bg-cream-300 transition-colors font-medium disabled:opacity-50"
            >
              Ferma tutto
            </button>
          )}
        </div>
      </div>

      {/* Containers list */}
      {expanded && (
        <div>
          {project.containers.map((container) => (
            <ContainerRow key={container.id} container={container} onRefresh={onRefresh} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Docker Not Available ──────────────────────────────────
function DockerNotAvailable() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <span className="text-6xl mb-4">🐳</span>
      <h2 className="text-lg font-bold text-bark mb-2">Docker non disponibile</h2>
      <p className="text-bark-secondary text-sm max-w-md">
        Docker Desktop non sembra attivo. Avvialo e questa pagina si aggiornerà automaticamente.
      </p>
    </div>
  );
}

// ─── Error Boundary ───────────────────────────────────────
class DockerErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean; errorMsg: string }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, errorMsg: '' };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorMsg: error.message };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[DockerMonitor] Render crash:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 text-center">
          <h1 className="text-2xl font-bold text-bark mb-4">🐳 Docker</h1>
          <div className="card border-l-4 border-l-status-yellow p-6">
            <AlertTriangle size={32} className="text-status-yellow mx-auto mb-3" />
            <h2 className="text-lg font-bold text-bark mb-2">Errore di visualizzazione</h2>
            <p className="text-sm text-bark-secondary mb-4">
              Si è verificato un errore nel rendering della pagina Docker.
            </p>
            <button
              onClick={() => this.setState({ hasError: false, errorMsg: '' })}
              className="btn-primary text-sm"
            >
              Riprova
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Main Component ────────────────────────────────────────
function DockerMonitorInner() {
  const { data: composeProjects, loading, error, refresh } = useDocker();
  const { data: allContainers } = useDockerContainers();
  const [search, setSearch] = useState('');

  // Containers not in any compose project
  const orphanContainers = useMemo(() => {
    if (!allContainers || !composeProjects) return [];
    const composeIds = new Set(
      composeProjects.flatMap((cp) => cp.containers.map((c) => c.id))
    );
    return allContainers.filter((c) => !composeIds.has(c.id));
  }, [allContainers, composeProjects]);

  const filteredProjects = useMemo(() => {
    if (!composeProjects) return [];
    if (!search.trim()) return composeProjects;
    const q = search.toLowerCase();
    return composeProjects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.containers.some(
          (c) =>
            c.friendlyName.toLowerCase().includes(q) ||
            c.image.toLowerCase().includes(q)
        )
    );
  }, [composeProjects, search]);

  const filteredOrphans = useMemo(() => {
    if (!search.trim()) return orphanContainers;
    const q = search.toLowerCase();
    return orphanContainers.filter(
      (c) =>
        c.friendlyName.toLowerCase().includes(q) ||
        c.image.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q)
    );
  }, [orphanContainers, search]);

  const totalContainers = allContainers?.length ?? 0;
  const runningContainers = allContainers?.filter((c) => c.state === 'running').length ?? 0;

  if (error) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-bark mb-4">🐳 Docker</h1>
        <DockerNotAvailable />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-bark">🐳 Docker</h1>
          <p className="text-sm text-bark-secondary mt-1">
            {totalContainers > 0
              ? `${runningContainers}/${totalContainers} container attivi`
              : 'Monitoraggio container Docker'}
          </p>
        </div>
        <button
          onClick={refresh}
          className="btn-secondary flex items-center gap-2 text-sm"
        >
          <RefreshCw size={14} />
          Aggiorna
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-bark-dim" />
        <input
          type="text"
          placeholder="Cerca container o progetto..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-cream-300 rounded-lg text-sm text-bark placeholder:text-bark-dim focus:outline-none focus:ring-2 focus:ring-lobster/20 focus:border-lobster transition-colors"
        />
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin text-lobster" size={32} />
          <span className="ml-3 text-bark-secondary">Connessione a Docker...</span>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Compose projects */}
          {filteredProjects.map((project) => (
            <ComposeProjectGroup key={project.name} project={project} onRefresh={refresh} />
          ))}

          {/* Orphan containers */}
          {filteredOrphans.length > 0 && (
            <div className="card p-0 overflow-hidden">
              <div className="px-4 py-3 bg-cream-50 border-b border-cream-200">
                <h3 className="text-sm font-semibold text-bark">📦 Container indipendenti</h3>
                <p className="text-xs text-bark-secondary">Container non associati a docker-compose</p>
              </div>
              {filteredOrphans.map((container) => (
                <ContainerRow key={container.id} container={container} onRefresh={refresh} />
              ))}
            </div>
          )}

          {/* Empty */}
          {filteredProjects.length === 0 && filteredOrphans.length === 0 && !search && (
            <DockerNotAvailable />
          )}

          {filteredProjects.length === 0 && filteredOrphans.length === 0 && search && (
            <div className="text-center py-12">
              <Search size={32} className="text-bark-dim mx-auto mb-3" />
              <p className="text-bark-secondary text-sm">Nessun risultato per "{search}"</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Esporta con Error Boundary per proteggere il resto dell'app
export function DockerMonitor() {
  return (
    <DockerErrorBoundary>
      <DockerMonitorInner />
    </DockerErrorBoundary>
  );
}
