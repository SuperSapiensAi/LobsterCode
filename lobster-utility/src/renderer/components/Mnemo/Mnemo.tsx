// ============================================================
// LOBSTER UTILITY — MNEMO Dashboard
// Dashboard completa per monitorare e configurare il proxy MNEMO.
// Mostra: health, stats, sessioni, profili, configurazione.
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';

// --- Types (mirror del service) ---

interface MnemoHealth {
  status: string;
  version: string;
  phase: string;
  uptime_seconds: number;
  ollama: {
    connected: boolean;
    base_url: string;
    models_available: string[];
  };
  proxy: { host: string; port: number; compression_enabled: boolean };
  requests_total: number;
  requests_failed: number;
  avg_latency_ms: number;
}

interface MnemoStats {
  uptime_seconds: number;
  requests: {
    total: number; chat: number; generate: number;
    passthrough: number; failed: number; active: number;
  };
  latency: { avg_ms: number; p95_ms: number; max_ms: number; samples: number };
  throughput: { bytes_received: number; bytes_sent: number; requests_per_minute: number };
  compression: {
    enabled: boolean; level: number; tokens_original: number;
    tokens_compressed: number; ratio: number; compressions_applied: number;
  };
}

interface MnemoSession {
  fingerprint: string; model: string; request_count: number;
  total_tokens_in: number; total_tokens_out: number;
  compressions_applied: number; peak_message_count: number;
  created_at: number; last_seen: number;
}

interface MnemoProfile {
  name: string; context_window: number; parameter_size: string;
  family: string; good_for_summary: boolean; optimal_budget_ratio: number;
}

interface MnemoConfig {
  proxy: { host: string; port: number; ollama_port: number };
  compression: {
    enabled: boolean; level: number; token_budget_ratio: number;
    protect_last_n: number; max_tool_lines: number;
    max_code_block_lines: number;
  };
}

interface Overview {
  available: boolean;
  health: MnemoHealth | null;
  stats: MnemoStats | null;
  sessions: MnemoSession[];
  profiles: MnemoProfile[];
  config: MnemoConfig | null;
}

// --- Helpers ---

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

function statusColor(status: string): string {
  switch (status) {
    case 'healthy': return 'text-green-600';
    case 'degraded': return 'text-yellow-600';
    case 'unhealthy': return 'text-red-600';
    default: return 'text-gray-500';
  }
}

function statusDot(status: string): string {
  switch (status) {
    case 'healthy': return 'bg-green-500';
    case 'degraded': return 'bg-yellow-500';
    case 'unhealthy': return 'bg-red-500';
    default: return 'bg-gray-400';
  }
}

const LEVEL_LABELS: Record<number, string> = {
  0: 'Off',
  1: 'Base (troncamento + rimozione)',
  2: 'Medio (+ summary euristico)',
  3: 'Aggressivo (+ summary LLM)',
};

// --- Subcomponents ---

function Card({ title, icon, children, className = '' }: {
  title: string; icon: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`bg-white rounded-xl border border-cream-200 shadow-sm ${className}`}>
      <div className="px-4 py-3 border-b border-cream-100 flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <h3 className="text-sm font-semibold text-bark-800">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="text-center">
      <div className="text-2xl font-bold text-bark-900">{value}</div>
      <div className="text-xs text-bark-500 mt-0.5">{label}</div>
      {sub && <div className="text-xs text-bark-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function Badge({ label, color = 'gray' }: { label: string; color?: string }) {
  const colors: Record<string, string> = {
    green: 'bg-green-100 text-green-700',
    yellow: 'bg-yellow-100 text-yellow-700',
    red: 'bg-red-100 text-red-700',
    blue: 'bg-blue-100 text-blue-700',
    gray: 'bg-gray-100 text-gray-600',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${colors[color] || colors.gray}`}>
      {label}
    </span>
  );
}

// --- Offline View ---

function OfflineView({ onRetry }: { onRetry: () => void }) {
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const handleStart = async () => {
    setStarting(true);
    setStartError(null);
    try {
      const result = await (window as any).lobster.mnemo.startServer();
      if (result.success) {
        // Ricarica dopo avvio
        setTimeout(onRetry, 1000);
      } else {
        setStartError(result.message || 'Avvio fallito');
      }
    } catch (err: any) {
      setStartError(err.message || 'Errore');
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="text-6xl mb-4">🧠</div>
      <h2 className="text-xl font-bold text-bark-800 mb-2">MNEMO non raggiungibile</h2>
      <p className="text-bark-500 mb-6 max-w-md">
        Il proxy MNEMO non è in esecuzione su <code className="text-xs bg-cream-100 px-1.5 py-0.5 rounded">localhost:11435</code>.
      </p>

      {startError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 max-w-md">
          {startError}
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={handleStart}
          disabled={starting}
          className="px-4 py-2 bg-lobster text-white rounded-lg hover:bg-lobster-dark transition-colors text-sm font-medium disabled:opacity-50"
        >
          {starting ? 'Avvio in corso...' : 'Avvia MNEMO'}
        </button>
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-cream-100 text-bark-600 rounded-lg hover:bg-cream-200 transition-colors text-sm font-medium"
        >
          Riprova connessione
        </button>
      </div>

      <p className="text-bark-400 text-xs mt-6">
        Oppure avvialo manualmente:
      </p>
      <div className="bg-bark-800 text-cream-100 rounded-lg px-4 py-2 font-mono text-sm mt-2">
        cd ~/Desktop/lobster-mnemo && python3 mnemo_server.py
      </div>
    </div>
  );
}

// --- Health Card ---

function HealthCard({ health }: { health: MnemoHealth }) {
  return (
    <Card title="Stato" icon="💓">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${statusDot(health.status)}`} />
          <span className={`font-semibold text-sm ${statusColor(health.status)}`}>
            {health.status.charAt(0).toUpperCase() + health.status.slice(1)}
          </span>
          <span className="text-xs text-bark-400 ml-auto">v{health.version}</span>
        </div>
        <div className="text-xs text-bark-500">{health.phase}</div>
        <div className="grid grid-cols-3 gap-4 pt-2">
          <Stat label="In funzione da" value={formatUptime(health.uptime_seconds)} />
          <Stat label="Richieste totali" value={health.requests_total} />
          <Stat label="Tempo di risposta medio" value={`${health.avg_latency_ms.toFixed(1)}ms`} />
        </div>
        <div className="flex items-center gap-2 pt-2 border-t border-cream-100">
          <div className={`w-2 h-2 rounded-full ${health.ollama.connected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-xs text-bark-600">
            Ollama {health.ollama.connected ? 'connesso' : 'disconnesso'}
          </span>
          {health.ollama.models_available.length > 0 && (
            <span className="text-xs text-bark-400 ml-auto">
              {health.ollama.models_available.length} modelli
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}

// --- Stats Card ---

function StatsCard({ stats }: { stats: MnemoStats }) {
  return (
    <Card title="Statistiche" icon="📊">
      <div className="grid grid-cols-2 gap-4">
        <Stat label="Conversazioni" value={stats.requests.chat} />
        <Stat label="Passate senza compressione" value={stats.requests.passthrough} />
        <Stat label="Fallite" value={stats.requests.failed} />
        <Stat label="In corso ora" value={stats.requests.active} />
      </div>
      <div className="mt-3 pt-3 border-t border-cream-100 grid grid-cols-3 gap-4">
        <Stat label="Risposta tipica (95°)" value={`${stats.latency.p95_ms.toFixed(1)}ms`} sub="il 95% è sotto questo" />
        <Stat label="Risposta più lenta" value={`${stats.latency.max_ms.toFixed(1)}ms`} />
        <Stat label="Richieste al minuto" value={stats.throughput.requests_per_minute.toFixed(1)} />
      </div>
      <div className="mt-3 pt-3 border-t border-cream-100 grid grid-cols-2 gap-4">
        <Stat label="Dati ricevuti" value={formatBytes(stats.throughput.bytes_received)} />
        <Stat label="Dati inviati" value={formatBytes(stats.throughput.bytes_sent)} />
      </div>
    </Card>
  );
}

// --- Compression Card ---

function CompressionCard({ stats, config, onConfigChange }: {
  stats: MnemoStats; config: MnemoConfig | null;
  onConfigChange: (key: string, value: any) => void;
}) {
  const ratio = stats.compression.ratio;
  const ratioColor = ratio >= 3 ? 'text-green-600' : ratio >= 2 ? 'text-blue-600' : ratio >= 1.5 ? 'text-yellow-600' : 'text-bark-600';

  return (
    <Card title="Compressione CAKC" icon="🗜️" className="col-span-2">
      <div className="grid grid-cols-4 gap-4 mb-4">
        <Stat label="Fattore di riduzione" value={`${ratio.toFixed(2)}x`} sub={ratioColor.includes('green') ? 'Eccellente' : ratio >= 2 ? 'Buono' : ratio >= 1.5 ? 'Moderato' : 'Basso'} />
        <Stat label="Token prima della compressione" value={formatTokens(stats.compression.tokens_original)} />
        <Stat label="Token dopo la compressione" value={formatTokens(stats.compression.tokens_compressed)} />
        <Stat label="Volte compresso" value={stats.compression.compressions_applied} />
      </div>

      {config && (
        <div className="pt-3 border-t border-cream-100 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-bark-700">Compressione</span>
            <button
              onClick={() => onConfigChange('compression.enabled', !config.compression.enabled)}
              className={`relative w-10 h-5 rounded-full transition-colors ${
                config.compression.enabled ? 'bg-green-500' : 'bg-gray-300'
              }`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                config.compression.enabled ? 'left-5' : 'left-0.5'
              }`} />
            </button>
          </div>

          <div>
            <label className="text-xs text-bark-500 block mb-1">Livello compressione</label>
            <div className="flex gap-1">
              {[0, 1, 2, 3].map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => onConfigChange('compression.level', lvl)}
                  className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${
                    config.compression.level === lvl
                      ? 'bg-lobster text-white'
                      : 'bg-cream-100 text-bark-600 hover:bg-cream-200'
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>
            <div className="text-xs text-bark-400 mt-1">
              {LEVEL_LABELS[config.compression.level] || ''}
            </div>
          </div>

          <div>
            <label className="text-xs text-bark-500 block mb-1">
              Quanto contesto mantenere: {(config.compression.token_budget_ratio * 100).toFixed(0)}%
            </label>
            <input
              type="range"
              min="50"
              max="95"
              value={config.compression.token_budget_ratio * 100}
              onChange={(e) => onConfigChange('compression.token_budget_ratio', parseInt(e.target.value) / 100)}
              className="w-full h-1.5 bg-cream-200 rounded-lg appearance-none cursor-pointer accent-lobster"
            />
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label className="text-xs text-bark-500 block mb-1">Ultimi messaggi da non toccare</label>
              <input
                type="number"
                min="1"
                max="20"
                value={config.compression.protect_last_n}
                onChange={(e) => onConfigChange('compression.protect_last_n', parseInt(e.target.value))}
                className="w-full px-2 py-1 text-sm border border-cream-200 rounded bg-white"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-bark-500 block mb-1">Righe massime per output tool</label>
              <input
                type="number"
                min="10"
                max="200"
                value={config.compression.max_tool_lines}
                onChange={(e) => onConfigChange('compression.max_tool_lines', parseInt(e.target.value))}
                className="w-full px-2 py-1 text-sm border border-cream-200 rounded bg-white"
              />
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

// --- Sessions Card ---

function SessionsCard({ sessions }: { sessions: MnemoSession[] }) {
  if (sessions.length === 0) {
    return (
      <Card title="Sessioni" icon="💬">
        <div className="text-sm text-bark-400 text-center py-4">Nessuna sessione attiva</div>
      </Card>
    );
  }

  return (
    <Card title={`Sessioni (${sessions.length})`} icon="💬">
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {sessions.map((s) => (
          <div key={s.fingerprint} className="p-2 bg-cream-50 rounded-lg text-xs">
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium text-bark-800">{s.model}</span>
              <Badge label={`${s.request_count} req`} color="blue" />
            </div>
            <div className="flex gap-3 text-bark-500">
              <span>Ricevuti: {formatTokens(s.total_tokens_in)}</span>
              <span>Generati: {formatTokens(s.total_tokens_out)}</span>
              <span>Compressioni: {s.compressions_applied}</span>
              <span>Messaggi max: {s.peak_message_count}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// --- Profiles Card ---

function ProfilesCard({ profiles }: { profiles: MnemoProfile[] }) {
  if (profiles.length === 0) {
    return (
      <Card title="Profili Modello" icon="🤖">
        <div className="text-sm text-bark-400 text-center py-4">Nessun profilo rilevato</div>
      </Card>
    );
  }

  return (
    <Card title={`Profili Modello (${profiles.length})`} icon="🤖">
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {profiles.map((p) => (
          <div key={p.name} className="p-2 bg-cream-50 rounded-lg text-xs">
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium text-bark-800">{p.name}</span>
              <Badge
                label={p.good_for_summary ? 'Può riassumere' : 'No riassunto'}
                color={p.good_for_summary ? 'green' : 'gray'}
              />
            </div>
            <div className="flex gap-3 text-bark-500">
              <span>Finestra contesto: {formatTokens(p.context_window)}</span>
              <span>Dimensione: {p.parameter_size || '?'}</span>
              <span>Famiglia: {p.family}</span>
              <span>Budget ottimale: {(p.optimal_budget_ratio * 100).toFixed(0)}%</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// --- Ollama Models Card ---

function OllamaModelsCard({ models }: { models: string[] }) {
  return (
    <Card title="Modelli Ollama" icon="🦙">
      {models.length === 0 ? (
        <div className="text-sm text-bark-400 text-center py-4">Nessun modello</div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {models.map((m) => (
            <Badge key={m} label={m} color="blue" />
          ))}
        </div>
      )}
    </Card>
  );
}

// --- Main Component ---

export function Mnemo() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(async () => {
    try {
      const overview = await (window as any).lobster.mnemo.getOverview();
      setData(overview);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Errore di comunicazione');
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-refresh
  useEffect(() => {
    loadData();
    if (autoRefresh) {
      intervalRef.current = setInterval(loadData, 5000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [loadData, autoRefresh]);

  const handleConfigChange = useCallback(async (key: string, value: any) => {
    try {
      await (window as any).lobster.mnemo.updateConfig({ [key]: value });
      // Ricarica per riflettere il cambio
      await loadData();
    } catch (err: any) {
      setError(`Errore aggiornamento config: ${err.message}`);
    }
  }, [loadData]);

  // Loading
  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center py-20">
        <div className="text-bark-400 text-sm">Connessione a MNEMO...</div>
      </div>
    );
  }

  // Offline
  if (!data?.available) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <span className="text-3xl">🧠</span>
          <div>
            <h1 className="text-xl font-bold text-bark-900">MNEMO</h1>
            <p className="text-xs text-bark-500">Memory-Native Efficient Model Orchestrator</p>
          </div>
        </div>
        <OfflineView onRetry={loadData} />
      </div>
    );
  }

  const { health, stats, sessions, profiles, config } = data;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🧠</span>
          <div>
            <h1 className="text-xl font-bold text-bark-900">MNEMO</h1>
            <p className="text-xs text-bark-500">Memory-Native Efficient Model Orchestrator</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-bark-500 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded accent-lobster"
            />
            Auto-refresh
          </label>
          <button
            onClick={loadData}
            className="px-3 py-1.5 text-xs bg-cream-100 text-bark-600 rounded-lg hover:bg-cream-200 transition-colors"
          >
            Aggiorna
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Dashboard Grid */}
      <div className="grid grid-cols-2 gap-4">
        {/* Row 1: Health + Stats */}
        {health && <HealthCard health={health} />}
        {stats && <StatsCard stats={stats} />}

        {/* Row 2: Compression (full width) */}
        {stats && <CompressionCard stats={stats} config={config} onConfigChange={handleConfigChange} />}

        {/* Row 3: Sessions + Profiles */}
        <SessionsCard sessions={sessions} />
        <ProfilesCard profiles={profiles} />

        {/* Row 4: Ollama Models */}
        {health && <OllamaModelsCard models={health.ollama.models_available} />}
      </div>
    </div>
  );
}
