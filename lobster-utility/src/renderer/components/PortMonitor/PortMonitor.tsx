import React, { useState, useMemo } from 'react';
import { usePorts } from '../../hooks/useLobster';
import { useStore } from '../../store';
import type { PortInfo } from '@shared/types';
import {
  Wifi, WifiOff, Search, ExternalLink, Skull, RefreshCw,
  Filter, ArrowUpDown, Loader2, AlertTriangle, Copy, Check
} from 'lucide-react';

type SortField = 'port' | 'process' | 'project';
type SortDir = 'asc' | 'desc';

// ─── Kill Confirmation Modal ───────────────────────────────
function KillConfirmModal({
  port,
  onConfirm,
  onCancel,
}: {
  port: PortInfo;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      role="dialog"
      aria-modal="true"
      aria-label={`Conferma terminazione processo ${port.processName} sulla porta ${port.port}`}
      onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}
    >
      <div className="bg-white rounded-card shadow-lg p-6 max-w-sm mx-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center">
            <Skull size={20} className="text-status-red" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-bark">Terminare il processo?</h3>
            <p className="text-xs text-bark-secondary">Questa azione non si può annullare</p>
          </div>
        </div>
        <div className="bg-cream-50 rounded-lg p-3 mb-4 text-xs space-y-1">
          <p><span className="font-medium text-bark">Porta:</span> {port.port}</p>
          <p><span className="font-medium text-bark">Processo:</span> {port.processName}</p>
          <p><span className="font-medium text-bark">PID:</span> {port.pid}</p>
          {port.humanLabel && (
            <p><span className="font-medium text-bark">Servizio:</span> {port.humanLabel}</p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="btn-secondary flex-1 text-sm"
            autoFocus
          >
            Annulla
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2 bg-status-red text-white rounded-lg font-medium text-sm hover:bg-lobster-dark transition-colors"
          >
            Termina
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Port Row ──────────────────────────────────────────────
function PortRow({
  port,
  onKill,
}: {
  port: PortInfo;
  onKill: (p: PortInfo) => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopyUrl = () => {
    if (port.url) {
      navigator.clipboard.writeText(port.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <tr className="border-b border-cream-200 hover:bg-cream-50 transition-colors group">
      <td className="py-3 px-4">
        <span className="font-mono text-sm font-bold text-ocean">{port.port}</span>
      </td>
      <td className="py-3 px-4">
        <div>
          <p className="text-sm text-bark">{port.humanLabel}</p>
          <p className="text-[11px] text-bark-dim">{port.processName} (PID: {port.pid})</p>
        </div>
      </td>
      <td className="py-3 px-4">
        {port.projectName ? (
          <span className="status-badge status-badge-green">{port.projectName}</span>
        ) : (
          <span className="text-xs text-bark-dim italic">Non associato</span>
        )}
      </td>
      <td className="py-3 px-4">
        <span className={`status-badge ${
          port.state === 'LISTEN' ? 'status-badge-green' : 'status-badge-yellow'
        }`}>
          {port.state}
        </span>
      </td>
      <td className="py-3 px-4">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {port.url && (
            <>
              <button
                onClick={() => window.lobster?.system?.openUrl?.(port.url!)}
                className="p-1.5 rounded-md text-ocean hover:bg-cream-100 transition-colors"
                title={`Apri ${port.url}`}
              >
                <ExternalLink size={14} />
              </button>
              <button
                onClick={handleCopyUrl}
                className="p-1.5 rounded-md text-bark-dim hover:bg-cream-100 transition-colors"
                title="Copia URL"
              >
                {copied ? <Check size={14} className="text-status-green" /> : <Copy size={14} />}
              </button>
            </>
          )}
          <button
            onClick={() => onKill(port)}
            className="p-1.5 rounded-md text-bark-dim hover:text-status-red hover:bg-red-50 transition-colors"
            title="Termina processo"
          >
            <Skull size={14} />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Empty State ───────────────────────────────────────────
function EmptyPortsState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <WifiOff size={48} className="text-bark-dim mb-4" />
      <h2 className="text-lg font-bold text-bark mb-2">Nessuna porta attiva</h2>
      <p className="text-bark-secondary text-sm max-w-md">
        Al momento non ci sono servizi in ascolto. Avvia un progetto e le porte compariranno qui automaticamente.
      </p>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────
export function PortMonitor() {
  const { data: ports, loading, refresh } = usePorts();
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('port');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [killTarget, setKillTarget] = useState<PortInfo | null>(null);

  const filteredPorts = useMemo(() => {
    if (!ports) return [];
    let filtered = [...ports];

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.port.toString().includes(q) ||
          p.processName.toLowerCase().includes(q) ||
          p.humanLabel.toLowerCase().includes(q) ||
          (p.projectName?.toLowerCase().includes(q) ?? false)
      );
    }

    // Sort
    filtered.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'port':
          cmp = a.port - b.port;
          break;
        case 'process':
          cmp = a.processName.localeCompare(b.processName);
          break;
        case 'project':
          cmp = (a.projectName ?? '').localeCompare(b.projectName ?? '');
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return filtered;
  }, [ports, search, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const { showToast } = useStore();

  const handleKill = async () => {
    if (!killTarget) return;
    try {
      await window.lobster?.ports?.killProcess?.(killTarget.pid);
      showToast(`Processo ${killTarget.processName} (PID ${killTarget.pid}) terminato`, 'success');
      setKillTarget(null);
      refresh();
    } catch (err) {
      showToast(`Errore terminando il processo PID ${killTarget.pid}`, 'error');
      setKillTarget(null);
    }
  };

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-bark">🔌 Porte</h1>
          <p className="text-sm text-bark-secondary mt-1">
            {ports ? `${ports.length} porte in ascolto` : 'Monitoraggio porte attive'}
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

      {/* Search bar */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-bark-dim" />
        <input
          type="text"
          placeholder="Cerca per porta, processo o progetto..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-cream-300 rounded-lg text-sm text-bark placeholder:text-bark-dim focus:outline-none focus:ring-2 focus:ring-lobster/20 focus:border-lobster transition-colors"
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin text-lobster" size={32} />
          <span className="ml-3 text-bark-secondary">Scansione porte...</span>
        </div>
      ) : !filteredPorts.length ? (
        search ? (
          <div className="text-center py-12">
            <Search size={32} className="text-bark-dim mx-auto mb-3" />
            <p className="text-bark-secondary text-sm">Nessun risultato per "{search}"</p>
          </div>
        ) : (
          <EmptyPortsState />
        )
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-cream-200 bg-cream-50">
                <th
                  className="text-left text-xs font-semibold text-bark-secondary py-3 px-4 cursor-pointer hover:text-bark transition-colors"
                  onClick={() => handleSort('port')}
                >
                  <span className="flex items-center gap-1">
                    Porta <ArrowUpDown size={12} />
                  </span>
                </th>
                <th
                  className="text-left text-xs font-semibold text-bark-secondary py-3 px-4 cursor-pointer hover:text-bark transition-colors"
                  onClick={() => handleSort('process')}
                >
                  <span className="flex items-center gap-1">
                    Servizio <ArrowUpDown size={12} />
                  </span>
                </th>
                <th
                  className="text-left text-xs font-semibold text-bark-secondary py-3 px-4 cursor-pointer hover:text-bark transition-colors"
                  onClick={() => handleSort('project')}
                >
                  <span className="flex items-center gap-1">
                    Progetto <ArrowUpDown size={12} />
                  </span>
                </th>
                <th className="text-left text-xs font-semibold text-bark-secondary py-3 px-4">Stato</th>
                <th className="text-left text-xs font-semibold text-bark-secondary py-3 px-4 w-28">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {filteredPorts.map((port) => (
                <PortRow
                  key={`${port.port}-${port.pid}`}
                  port={port}
                  onKill={setKillTarget}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Kill confirmation modal */}
      {killTarget && (
        <KillConfirmModal
          port={killTarget}
          onConfirm={handleKill}
          onCancel={() => setKillTarget(null)}
        />
      )}
    </div>
  );
}
