import React, { useMemo, useCallback } from 'react';
import { useProjects, usePorts, useResources } from '../../hooks/useLobster';
import { useStore } from '../../store';
import type { Project, SystemResources, TrafficLight, PortInfo } from '@shared/types';
import {
  Activity, Cpu, HardDrive, MemoryStick, Wifi, WifiOff,
  FolderOpen, Terminal, Code, ExternalLink, MoreHorizontal,
  RefreshCw, AlertTriangle, CheckCircle, XCircle, Circle,
  Loader2, X, Square, Play, User
} from 'lucide-react';

// ─── Traffic Light Icon ────────────────────────────────────
function TrafficLightIcon({ light, size = 12 }: { light: TrafficLight; size?: number }) {
  const colorMap: Record<TrafficLight, string> = {
    green: '#2e8b57',
    yellow: '#e89530',
    red: '#d63a28',
    gray: '#9ca3af',
  };
  return (
    <span
      className="inline-block rounded-full flex-shrink-0"
      style={{
        width: size,
        height: size,
        backgroundColor: colorMap[light],
        boxShadow: light !== 'gray' ? `0 0 6px ${colorMap[light]}40` : 'none',
      }}
    />
  );
}

// ─── System Health Bar ─────────────────────────────────────
function SystemHealthBar({ resources }: { resources: SystemResources | null }) {
  if (!resources) {
    return (
      <div className="card flex items-center gap-3 animate-pulse">
        <Loader2 className="animate-spin text-bark-dim" size={18} />
        <span className="text-bark-secondary text-sm">Caricamento risorse sistema...</span>
      </div>
    );
  }

  const getBarColor = (percent: number) => {
    if (percent < 50) return 'bg-status-green';
    if (percent < 75) return 'bg-status-yellow';
    if (percent < 90) return 'bg-status-red';
    return 'bg-lobster';
  };

  const metrics = [
    {
      icon: <Cpu size={16} />,
      label: 'CPU',
      percent: resources.cpuPercent,
      humanLabel: resources.cpuHumanLabel,
    },
    {
      icon: <MemoryStick size={16} />,
      label: 'RAM',
      percent: resources.memoryPercent,
      humanLabel: resources.memoryHumanLabel,
      detail: `${resources.memoryUsedGB.toFixed(1)}/${resources.memoryTotalGB.toFixed(0)} GB`,
    },
    {
      icon: <HardDrive size={16} />,
      label: 'Disco',
      percent: resources.diskPercent,
      humanLabel: resources.diskHumanLabel,
      detail: `${resources.diskUsedGB.toFixed(0)}/${resources.diskTotalGB.toFixed(0)} GB`,
    },
  ];

  const topConsumers = resources.memoryTopConsumers || [];

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        <Activity size={18} className="text-lobster" />
        <h2 className="text-sm font-semibold text-bark">Salute del Sistema</h2>
      </div>
      <div className="grid grid-cols-3 gap-4 mb-3">
        {metrics.map((m) => (
          <div key={m.label}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-bark-secondary">{m.icon}</span>
              <span className="text-xs font-medium text-bark">{m.label}</span>
              <span className="text-xs text-bark-dim ml-auto">{Math.round(m.percent)}%</span>
            </div>
            <div className="h-2 bg-cream-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${getBarColor(m.percent)}`}
                style={{ width: `${Math.min(100, m.percent)}%` }}
              />
            </div>
            <p className="text-[11px] text-bark-dim mt-1">{m.humanLabel}</p>
            {m.detail && <p className="text-[10px] text-bark-dim">{m.detail}</p>}
          </div>
        ))}
      </div>

      {/* Chi usa la RAM — breakdown visivo */}
      {topConsumers.length > 0 && (
        <div className="pt-3 border-t border-cream-200">
          <p className="text-[11px] font-semibold text-bark mb-2">Chi sta usando la RAM:</p>
          <div className="space-y-1.5">
            {topConsumers.map((consumer, i) => {
              const barWidth = Math.min(100, (consumer.memoryMB / (resources.memoryTotalGB * 1024)) * 100);
              const memLabel = consumer.memoryMB >= 1024
                ? `${(consumer.memoryMB / 1024).toFixed(1)} GB`
                : `${consumer.memoryMB} MB`;
              return (
                <div key={`${consumer.name}-${i}`} className="flex items-center gap-2">
                  <span className="text-[11px] text-bark w-36 truncate font-medium" title={consumer.name}>{consumer.name}</span>
                  <div className="flex-1 h-1.5 bg-cream-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        i === 0 ? 'bg-lobster' : i < 3 ? 'bg-status-yellow' : 'bg-ocean'
                      }`}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-bark-dim w-16 text-right">{memLabel}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Project Card ──────────────────────────────────────────
function ProjectCard({ project, onHide }: { project: Project; onHide: (id: string) => void }) {
  const { showToast, selectProject } = useStore();
  const [containerAction, setContainerAction] = React.useState<'stopping' | 'starting' | null>(null);

  const statusIcons: Record<string, React.ReactNode> = {
    running: <CheckCircle size={14} className="text-status-green" />,
    stopped: <Circle size={14} className="text-status-gray" />,
    partial: <AlertTriangle size={14} className="text-status-yellow" />,
    error: <AlertTriangle size={14} className="text-status-red" />,
    unknown: <Circle size={14} className="text-status-gray" />,
  };

  // Only count truly active ports (LISTEN state) — ignore phantom/expected-but-stopped entries
  const portsCount = project.ports?.filter((p) => p.state === 'LISTEN').length ?? 0;
  const containersCount = project.containers?.length ?? 0;
  const runningContainers = project.containers?.filter((c) => c.state === 'running') ?? [];
  const stoppedContainers = project.containers?.filter((c) => c.state === 'exited' || c.state === 'created' || c.state === 'dead') ?? [];
  const hasRunningContainers = runningContainers.length > 0;
  const hasStoppedContainers = stoppedContainers.length > 0;

  const handleOpenFolder = async () => {
    try {
      await window.lobster?.projects?.openFolder?.(project.path);
    } catch { showToast('Errore aprendo la cartella', 'error'); }
  };

  const handleOpenTerminal = async () => {
    try {
      await window.lobster?.projects?.openTerminal?.(project.path);
    } catch { showToast('Errore aprendo il terminale', 'error'); }
  };

  const handleOpenVSCode = async () => {
    try {
      await window.lobster?.projects?.openVscode?.(project.path);
    } catch { showToast('Errore aprendo VS Code', 'error'); }
  };

  const webUrl = project.ports?.find((p) => p.url && p.state === 'LISTEN')?.url;
  const handleOpenUrl = () => {
    if (webUrl) {
      window.lobster?.system?.openUrl?.(webUrl);
    }
  };

  const handleStopContainers = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (containerAction) return;
    setContainerAction('stopping');
    try {
      for (const container of runningContainers) {
        await window.lobster?.docker?.containerAction?.(container.id, 'stop');
      }
      showToast(`${runningContainers.length} container di ${project.name} fermati`, 'success');
    } catch (error) {
      console.error(`Error stopping containers for ${project.name}:`, error);
      showToast(`Errore fermando i container di ${project.name}`, 'error');
    } finally {
      setTimeout(() => setContainerAction(null), 1500);
    }
  };

  const handleStartContainers = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (containerAction) return;
    setContainerAction('starting');
    try {
      for (const container of stoppedContainers) {
        await window.lobster?.docker?.containerAction?.(container.id, 'start');
      }
      showToast(`${stoppedContainers.length} container di ${project.name} avviati`, 'success');
    } catch (error) {
      console.error(`Error starting containers for ${project.name}:`, error);
      showToast(`Errore avviando i container di ${project.name}`, 'error');
    } finally {
      setTimeout(() => setContainerAction(null), 1500);
    }
  };

  return (
    <div
      className="card group hover:shadow-card-hover cursor-pointer relative"
      onClick={() => selectProject(project.id)}
      role="button"
      tabIndex={0}
      aria-label={`Progetto ${project.name}, stato: ${project.humanStatus || project.status}`}
      onKeyDown={(e) => { if (e.key === 'Enter') selectProject(project.id); }}
    >
      {/* Bottone X per rimuovere dalla dashboard */}
      <button
        onClick={(e) => { e.stopPropagation(); onHide(project.id); }}
        className="absolute top-2 right-2 p-1 rounded-md text-bark-dim opacity-0 group-hover:opacity-100 hover:text-status-red hover:bg-red-50 transition-all"
        title="Rimuovi dalla dashboard"
        aria-label={`Rimuovi ${project.name} dalla dashboard`}
      >
        <X size={14} />
      </button>

      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center text-xl flex-shrink-0"
          style={{ backgroundColor: `${project.color}15`, border: `1px solid ${project.color}30` }}
        >
          {project.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-bark truncate">{project.name}</h3>
            <TrafficLightIcon light={project.trafficLight} />
          </div>
          <p className="text-xs text-bark-secondary truncate">{project.humanStatus}</p>
        </div>
        {statusIcons[project.status] || statusIcons.unknown}
      </div>

      {/* Metrics row */}
      <div className="flex items-center gap-3 mb-3 text-[11px] text-bark-dim">
        {portsCount > 0 && (
          <span className="flex items-center gap-1">
            <Wifi size={12} className="text-ocean" />
            {portsCount} {portsCount === 1 ? 'porta' : 'porte'}
          </span>
        )}
        {containersCount > 0 && (
          <span className="flex items-center gap-1">
            🐳 {containersCount} container
          </span>
        )}
        {project.gitBranch && (
          <span className="truncate">🌿 {project.gitBranch}</span>
        )}
        {project.type !== 'generic' && (
          <span className="ml-auto uppercase tracking-wider font-medium" style={{ color: project.color }}>
            {project.type}
          </span>
        )}
      </div>

      {/* Container control row — Stop/Start buttons */}
      {containersCount > 0 && (
        <div className="flex items-center gap-2 mb-3 px-1">
          {hasRunningContainers && (
            <button
              onClick={handleStopContainers}
              disabled={containerAction !== null}
              className="flex items-center gap-1.5 px-3 h-7 rounded-md text-[11px] font-medium text-status-red bg-red-50 hover:bg-red-100 disabled:opacity-50 transition-colors"
              title={`Ferma ${runningContainers.length} container — libera RAM`}
              aria-label={`Ferma ${runningContainers.length} container di ${project.name}`}
            >
              {containerAction === 'stopping' ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Square size={11} />
              )}
              <span>{containerAction === 'stopping' ? 'Fermando...' : `Stop (${runningContainers.length})`}</span>
            </button>
          )}
          {hasStoppedContainers && (
            <button
              onClick={handleStartContainers}
              disabled={containerAction !== null}
              className="flex items-center gap-1.5 px-3 h-7 rounded-md text-[11px] font-medium text-status-green bg-green-50 hover:bg-green-100 disabled:opacity-50 transition-colors"
              title={`Avvia ${stoppedContainers.length} container`}
              aria-label={`Avvia ${stoppedContainers.length} container di ${project.name}`}
            >
              {containerAction === 'starting' ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Play size={11} />
              )}
              <span>{containerAction === 'starting' ? 'Avviando...' : `Start (${stoppedContainers.length})`}</span>
            </button>
          )}
        </div>
      )}

      {/* Quick actions — visibili sempre, con etichette chiare */}
      <div className="flex items-center gap-1 pt-2 border-t border-cream-200">
        <button
          onClick={handleOpenFolder}
          className="flex items-center gap-1.5 px-2 h-7 rounded-md text-[11px] text-bark-dim hover:text-bark hover:bg-cream-100 transition-colors"
          title="Apri la cartella del progetto nel Finder"
          aria-label={`Apri cartella di ${project.name}`}
        >
          <FolderOpen size={13} />
          <span>Cartella</span>
        </button>
        <button
          onClick={handleOpenTerminal}
          className="flex items-center gap-1.5 px-2 h-7 rounded-md text-[11px] text-bark-dim hover:text-bark hover:bg-cream-100 transition-colors"
          title="Apri il terminale nella cartella del progetto"
          aria-label={`Apri terminale per ${project.name}`}
        >
          <Terminal size={13} />
          <span>Terminale</span>
        </button>
        <button
          onClick={handleOpenVSCode}
          className="flex items-center gap-1.5 px-2 h-7 rounded-md text-[11px] text-bark-dim hover:text-bark hover:bg-cream-100 transition-colors"
          title="Apri il progetto in VS Code"
          aria-label={`Apri ${project.name} in VS Code`}
        >
          <Code size={13} />
          <span>VS Code</span>
        </button>
        {webUrl && (
          <button
            onClick={handleOpenUrl}
            className="flex items-center gap-1.5 px-2 h-7 rounded-md text-[11px] text-bark-dim hover:text-ocean hover:bg-cream-100 transition-colors ml-auto"
            title={`Apri ${webUrl} nel browser`}
            aria-label={`Apri ${project.name} nel browser`}
          >
            <ExternalLink size={13} />
            <span>Apri</span>
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Empty State ───────────────────────────────────────────
function EmptyState({ onRescan }: { onRescan: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <span className="text-6xl mb-4">🦞</span>
      <h2 className="text-xl font-bold text-bark mb-2">Nessun progetto trovato</h2>
      <p className="text-bark-secondary text-sm max-w-md mb-4">
        Lobster Manager cerca automaticamente i tuoi progetti nelle cartelle configurate
        (Desktop, Documents, Code). Aggiungi cartelle nelle Impostazioni o premi il pulsante sotto.
      </p>
      <button
        onClick={onRescan}
        className="btn-primary flex items-center gap-2 text-sm"
      >
        <RefreshCw size={14} />
        Riscansiona Cartelle
      </button>
    </div>
  );
}

// ─── Active Ports Summary ──────────────────────────────────
function ActivePortsSummary({ ports }: { ports: PortInfo[] | null }) {
  if (!ports || ports.length === 0) {
    return (
      <div className="card">
        <div className="flex items-center gap-2 mb-2">
          <WifiOff size={18} className="text-bark-dim" />
          <h2 className="text-sm font-semibold text-bark">Porte Attive</h2>
        </div>
        <p className="text-xs text-bark-dim">Nessuna porta attiva al momento</p>
      </div>
    );
  }

  const displayPorts = ports.slice(0, 6);
  const remaining = ports.length - displayPorts.length;

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        <Wifi size={18} className="text-ocean" />
        <h2 className="text-sm font-semibold text-bark">Porte Attive</h2>
        <span className="text-xs text-bark-dim ml-auto">{ports.length} totali</span>
      </div>
      <div className="space-y-1.5">
        {displayPorts.map((p) => (
          <div key={`${p.port}-${p.pid}`} className="flex items-center gap-2 text-xs">
            <span className="font-mono text-ocean font-semibold w-12 text-right">{p.port}</span>
            <span className="text-bark-secondary truncate flex-1">{p.humanLabel}</span>
            {p.url && (
              <button
                onClick={() => window.lobster?.system?.openUrl?.(p.url!)}
                className="text-ocean hover:text-lobster transition-colors"
                title={`Apri ${p.url}`}
              >
                <ExternalLink size={12} />
              </button>
            )}
          </div>
        ))}
        {remaining > 0 && (
          <p className="text-[11px] text-bark-dim text-center pt-1">+{remaining} altre porte</p>
        )}
      </div>
    </div>
  );
}

// ─── Main Dashboard ────────────────────────────────────────
export function Dashboard() {
  const { data: projects, loading: projectsLoading, refresh: refreshProjects } = useProjects();
  const { data: ports } = usePorts();
  const { data: resources } = useResources();
  const { setActiveView, showToast } = useStore();

  const [isRescanning, setIsRescanning] = React.useState(false);

  const handleRescan = async () => {
    setIsRescanning(true);
    try {
      await window.lobster?.projects?.rescan?.();
      // projects will auto-update via onUpdates subscription
    } catch (error) {
      console.error('Error rescanning projects:', error);
      showToast('Errore durante la scansione', 'error');
    } finally {
      setTimeout(() => setIsRescanning(false), 500);
    }
  };

  const handleHideProject = async (projectId: string) => {
    try {
      await window.lobster?.projects?.hide?.(projectId);
      showToast('Progetto nascosto dalla dashboard', 'info');
    } catch (error) {
      console.error('Error hiding project:', error);
      showToast('Errore nascondendo il progetto', 'error');
    }
  };

  const sortedProjects = useMemo(() => {
    if (!projects) return [];
    return [...projects].sort((a, b) => {
      // Running projects first
      const order: Record<string, number> = { running: 0, partial: 1, error: 2, stopped: 3, unknown: 4 };
      return (order[a.status] ?? 4) - (order[b.status] ?? 4);
    });
  }, [projects]);

  const stats = useMemo(() => {
    if (!projects) return { total: 0, running: 0, stopped: 0, errors: 0 };
    return {
      total: projects.length,
      running: projects.filter((p) => p.status === 'running').length,
      stopped: projects.filter((p) => p.status === 'stopped').length,
      errors: projects.filter((p) => p.status === 'error').length,
    };
  }, [projects]);

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-bark">🏠 Il Mio Mondo</h1>
          <p className="text-sm text-bark-secondary mt-1">
            {stats.total > 0
              ? `${stats.running} attivi su ${stats.total} progetti`
              : 'Panoramica dei tuoi progetti'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveView('profile')}
            className="btn-secondary flex items-center gap-2 text-sm"
            title="Il mio profilo per le AI"
          >
            <User size={14} />
            Il Mio Profilo
          </button>
          <button
            onClick={handleRescan}
            disabled={isRescanning}
            className="btn-secondary flex items-center gap-2 text-sm"
            title="Riscansiona cartelle per nuovi progetti"
          >
            <RefreshCw size={14} className={isRescanning ? 'animate-spin' : ''} />
            {isRescanning ? 'Scansione...' : 'Aggiorna'}
          </button>
        </div>
      </div>

      {/* System health + active ports row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="lg:col-span-2">
          <SystemHealthBar resources={resources} />
        </div>
        <div>
          <ActivePortsSummary ports={ports} />
        </div>
      </div>

      {/* Quick stats */}
      {stats.total > 0 && (
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Totali', value: stats.total, color: 'text-bark', bg: 'bg-cream-100' },
            { label: 'Attivi', value: stats.running, color: 'text-status-green', bg: 'bg-green-50' },
            { label: 'Fermi', value: stats.stopped, color: 'text-bark-dim', bg: 'bg-cream-100' },
            { label: 'Errori', value: stats.errors, color: 'text-status-red', bg: 'bg-red-50' },
          ].map((s) => (
            <div key={s.label} className={`rounded-lg ${s.bg} p-3 text-center`}>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-bark-secondary">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Projects grid */}
      {projectsLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin text-lobster" size={32} />
          <span className="ml-3 text-bark-secondary">Scoprendo i tuoi progetti...</span>
        </div>
      ) : sortedProjects.length === 0 ? (
        <EmptyState onRescan={handleRescan} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sortedProjects.map((project) => (
            <ProjectCard key={project.id} project={project} onHide={handleHideProject} />
          ))}
        </div>
      )}
    </div>
  );
}
