import React, { useState, useEffect, useCallback, useRef, Component, ErrorInfo } from 'react';
import type { AppSettings } from '@shared/types';
import { DEFAULT_SETTINGS } from '@shared/constants';
import {
  Settings as SettingsIcon, Monitor, FolderSearch, Container, Brain, Plug, Cpu,
  Bell, Loader2, RotateCcw, Save, CheckCircle, AlertTriangle,
  Plus, X, ChevronDown, ChevronRight,
} from 'lucide-react';

// Usa i defaults condivisi — unica fonte di verità
const LOCAL_DEFAULTS = DEFAULT_SETTINGS;

/** Deep merge locale — garantisce che tutti i campi esistano */
function ensureComplete(loaded: any): AppSettings {
  const result: any = { ...LOCAL_DEFAULTS };
  if (!loaded || typeof loaded !== 'object') return result;
  for (const key of Object.keys(LOCAL_DEFAULTS)) {
    if (loaded[key] && typeof loaded[key] === 'object' && !Array.isArray(loaded[key])) {
      result[key] = { ...(LOCAL_DEFAULTS as any)[key], ...loaded[key] };
    } else if (loaded[key] !== undefined) {
      result[key] = loaded[key];
    }
  }
  return result;
}

// ─── Error Boundary per Settings ───────────────────────────
class SettingsErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean; error: string }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: '' };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Settings] Crash:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 text-center">
          <AlertTriangle size={32} className="text-status-yellow mx-auto mb-3" />
          <h2 className="text-lg font-bold text-bark mb-2">Errore nelle impostazioni</h2>
          <p className="text-sm text-bark-secondary mb-4">{this.state.error}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: '' })}
            className="btn-primary text-sm"
          >
            Riprova
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Toggle Component ──────────────────────────────────────
function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group py-2">
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`mt-0.5 relative flex-shrink-0 w-9 h-5 rounded-full transition-colors duration-200 ${
          checked ? 'bg-lobster' : 'bg-cream-300'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${
            checked ? 'translate-x-4' : ''
          }`}
        />
      </button>
      <div className="flex-1 min-w-0">
        <span className="text-sm text-bark font-medium block">{label}</span>
        {description && (
          <span className="text-[11px] text-bark-dim leading-relaxed block mt-0.5">{description}</span>
        )}
      </div>
    </label>
  );
}

// ─── Number Input ──────────────────────────────────────────
function NumberInput({
  value,
  onChange,
  label,
  description,
  min,
  max,
  step,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
  description?: string;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <div className="py-2">
      <label className="text-sm text-bark font-medium block mb-1">{label}</label>
      {description && (
        <span className="text-[11px] text-bark-dim leading-relaxed block mb-1.5">{description}</span>
      )}
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          min={min}
          max={max}
          step={step}
          className="w-24 px-2.5 py-1.5 rounded-lg border border-cream-200 bg-white text-sm text-bark focus:outline-none focus:ring-2 focus:ring-lobster/20 focus:border-lobster"
        />
        {suffix && <span className="text-xs text-bark-dim">{suffix}</span>}
      </div>
    </div>
  );
}

// ─── Text Input ────────────────────────────────────────────
function TextInput({
  value,
  onChange,
  label,
  description,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  description?: string;
  placeholder?: string;
}) {
  return (
    <div className="py-2">
      <label className="text-sm text-bark font-medium block mb-1">{label}</label>
      {description && (
        <span className="text-[11px] text-bark-dim leading-relaxed block mb-1.5">{description}</span>
      )}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full max-w-md px-3 py-1.5 rounded-lg border border-cream-200 bg-white text-sm text-bark font-mono focus:outline-none focus:ring-2 focus:ring-lobster/20 focus:border-lobster"
      />
    </div>
  );
}

// ─── Directory List ────────────────────────────────────────
function DirectoryList({
  directories,
  onChange,
  label,
  description,
}: {
  directories: string[];
  onChange: (dirs: string[]) => void;
  label: string;
  description?: string;
}) {
  const [newDir, setNewDir] = useState('');

  const addDir = () => {
    const trimmed = newDir.trim();
    if (trimmed && !directories.includes(trimmed)) {
      onChange([...directories, trimmed]);
      setNewDir('');
    }
  };

  const removeDir = (index: number) => {
    onChange(directories.filter((_, i) => i !== index));
  };

  return (
    <div className="py-2">
      <label className="text-sm text-bark font-medium block mb-1">{label}</label>
      {description && (
        <span className="text-[11px] text-bark-dim leading-relaxed block mb-1.5">{description}</span>
      )}
      <div className="space-y-1.5 mb-2">
        {directories.map((dir, i) => (
          <div key={i} className="flex items-center gap-2 bg-cream-50 rounded-lg px-3 py-1.5">
            <span className="text-xs font-mono text-bark flex-1">{dir}</span>
            <button
              onClick={() => removeDir(i)}
              className="text-bark-dim hover:text-status-red transition-colors p-0.5"
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={newDir}
          onChange={(e) => setNewDir(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addDir()}
          placeholder="~/percorso/cartella"
          className="flex-1 max-w-sm px-3 py-1.5 rounded-lg border border-cream-200 bg-white text-xs font-mono text-bark focus:outline-none focus:ring-2 focus:ring-lobster/20 focus:border-lobster"
        />
        <button
          onClick={addDir}
          disabled={!newDir.trim()}
          className="btn-secondary text-xs flex items-center gap-1 px-2.5 py-1.5"
        >
          <Plus size={12} /> Aggiungi
        </button>
      </div>
    </div>
  );
}

// ─── Port List (hidden ports) ──────────────────────────────
function PortList({
  ports,
  onChange,
}: {
  ports: number[];
  onChange: (ports: number[]) => void;
}) {
  const [newPort, setNewPort] = useState('');

  const addPort = () => {
    const num = parseInt(newPort, 10);
    if (num > 0 && num <= 65535 && !ports.includes(num)) {
      onChange([...ports, num].sort((a, b) => a - b));
      setNewPort('');
    }
  };

  return (
    <div className="py-2">
      <label className="text-sm text-bark font-medium block mb-1">Porte nascoste</label>
      <span className="text-[11px] text-bark-dim block mb-1.5">
        Queste porte non verranno mostrate nel monitor
      </span>
      {ports.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {ports.map((p) => (
            <span
              key={p}
              className="inline-flex items-center gap-1 bg-cream-100 text-xs font-mono px-2 py-1 rounded-md"
            >
              {p}
              <button
                onClick={() => onChange(ports.filter((x) => x !== p))}
                className="text-bark-dim hover:text-status-red"
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={newPort}
          onChange={(e) => setNewPort(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addPort()}
          placeholder="es. 5199"
          min={1}
          max={65535}
          className="w-28 px-2.5 py-1.5 rounded-lg border border-cream-200 bg-white text-xs font-mono text-bark focus:outline-none focus:ring-2 focus:ring-lobster/20 focus:border-lobster"
        />
        <button
          onClick={addPort}
          disabled={!newPort.trim()}
          className="btn-secondary text-xs flex items-center gap-1 px-2.5 py-1.5"
        >
          <Plus size={12} /> Aggiungi
        </button>
      </div>
    </div>
  );
}

// ─── Section Wrapper ───────────────────────────────────────
function Section({
  title,
  icon,
  children,
  defaultOpen = false,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 p-4 hover:bg-cream-50 transition-colors text-left"
      >
        <span className="text-lobster">{icon}</span>
        <span className="text-sm font-semibold text-bark flex-1">{title}</span>
        {open ? (
          <ChevronDown size={14} className="text-bark-dim" />
        ) : (
          <ChevronRight size={14} className="text-bark-dim" />
        )}
      </button>
      {open && <div className="px-4 pb-4 border-t border-cream-100 pt-3">{children}</div>}
    </div>
  );
}

// ─── Main Settings Component ───────────────────────────────
function SettingsInner() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const raw = await window.lobster.settings.get();
      setSettings(ensureComplete(raw));
      setError(null);
    } catch (err: any) {
      console.error('[Settings] Load error:', err);
      // Fallback ai defaults locali per non bloccare l'UI
      setSettings(LOCAL_DEFAULTS);
      setError(err?.message || 'Errore nel caricamento — usando valori predefiniti');
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounce timer ref to coalesce rapid changes (e.g. typing in text fields)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingUpdatesRef = useRef<Partial<AppSettings>>({});

  // Flush pending debounced updates immediately (used on unmount)
  const flushPendingUpdates = useCallback(async () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const pending = pendingUpdatesRef.current;
    if (Object.keys(pending).length === 0) return;
    pendingUpdatesRef.current = {};
    setSaving(true);
    setSaved(false);
    try {
      const newSettings = await window.lobster.settings.update(pending);
      setSettings(ensureComplete(newSettings));
      setError(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      console.error('[Settings] Save error:', err);
      setError(err?.message || 'Errore nel salvataggio — modifica applicata localmente');
    } finally {
      setSaving(false);
    }
  }, []);

  // Flush on unmount so pending changes are never lost
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      const pending = pendingUpdatesRef.current;
      if (Object.keys(pending).length > 0) {
        // Fire-and-forget: save pending changes before component disappears
        window.lobster.settings.update(pending).catch(() => {});
      }
    };
  }, []);

  const saveSettings = useCallback(async (updates: Partial<AppSettings>) => {
    // Apply locally immediately so the UI is responsive
    setSettings((prev) => {
      if (!prev) return LOCAL_DEFAULTS;
      const patched = { ...prev };
      for (const key of Object.keys(updates) as (keyof AppSettings)[]) {
        if (updates[key] && typeof updates[key] === 'object') {
          (patched as any)[key] = { ...(prev as any)[key], ...(updates as any)[key] };
        }
      }
      return patched;
    });

    // Merge into pending updates
    for (const key of Object.keys(updates) as (keyof AppSettings)[]) {
      if (updates[key] && typeof updates[key] === 'object') {
        (pendingUpdatesRef.current as any)[key] = {
          ...((pendingUpdatesRef.current as any)[key] || {}),
          ...(updates as any)[key],
        };
      } else if (updates[key] !== undefined) {
        (pendingUpdatesRef.current as any)[key] = updates[key];
      }
    }

    // Debounce the actual IPC call by 500ms
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      flushPendingUpdates();
    }, 500);
  }, [flushPendingUpdates]);

  const resetSettings = useCallback(async () => {
    // Confirm before wiping all settings
    const confirmed = window.confirm('Sei sicuro di voler ripristinare tutte le impostazioni ai valori predefiniti? Questa azione non può essere annullata.');
    if (!confirmed) return;

    setSaving(true);
    try {
      const defaultSettings = await window.lobster.settings.reset();
      setSettings(ensureComplete(defaultSettings));
      setError(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      console.error('[Settings] Reset error:', err);
      setSettings(LOCAL_DEFAULTS);
      setError(err?.message || 'Errore nel ripristino — usando valori predefiniti');
    } finally {
      setSaving(false);
    }
  }, []);

  // Helper: update a nested section
  const updateSection = <K extends keyof AppSettings>(
    section: K,
    updates: Partial<AppSettings[K]>,
  ) => {
    if (!settings) return;
    const newSection = { ...settings[section], ...updates };
    saveSettings({ [section]: newSection } as Partial<AppSettings>);
  };

  if (loading || !settings) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="animate-spin text-lobster" size={32} />
        <span className="ml-3 text-bark-secondary">Caricamento impostazioni...</span>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[800px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-bark">⚙️ Impostazioni</h1>
          <p className="text-sm text-bark-secondary mt-1">
            Configura Lobster Manager secondo le tue esigenze
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saved && (
            <span className="text-xs text-green-600 flex items-center gap-1">
              <CheckCircle size={12} /> Salvato
            </span>
          )}
          {saving && <Loader2 size={14} className="animate-spin text-bark-dim" />}
          <button
            onClick={resetSettings}
            className="btn-secondary flex items-center gap-1.5 text-xs"
            title="Ripristina tutto ai valori predefiniti"
          >
            <RotateCcw size={12} /> Ripristina
          </button>
        </div>
      </div>

      {error && (
        <div className="card border-l-4 border-l-status-red mb-4 flex items-center gap-2 p-3">
          <AlertTriangle size={14} className="text-status-red" />
          <span className="text-xs text-bark">{error}</span>
        </div>
      )}

      <div className="space-y-3">
        {/* ── GENERALE ──────────────────────── */}
        <Section title="Generale" icon={<Monitor size={16} />} defaultOpen={true}>
          <Toggle
            checked={settings.general.launchAtStartup}
            onChange={(v) => updateSection('general', { launchAtStartup: v })}
            label="Avvia con il Mac"
            description="Lobster Manager si apre automaticamente quando accendi il Mac"
          />
          <Toggle
            checked={settings.general.minimizeToTray}
            onChange={(v) => updateSection('general', { minimizeToTray: v })}
            label="Minimizza nella tray"
            description="Quando chiudi la finestra, l'app resta attiva nell'icona della barra menu"
          />
          <Toggle
            checked={settings.general.showTrayIcon}
            onChange={(v) => updateSection('general', { showTrayIcon: v })}
            label="Mostra icona nella barra menu"
            description="L'icona 🦞 nella barra menu per accesso rapido"
          />
          <Toggle
            checked={settings.general.notificationsEnabled}
            onChange={(v) => updateSection('general', { notificationsEnabled: v })}
            label="Notifiche di sistema"
            description="Mostra notifiche macOS per eventi importanti"
          />
          <Toggle
            checked={settings.general.soundEnabled}
            onChange={(v) => updateSection('general', { soundEnabled: v })}
            label="Suoni"
            description="Riproduci un suono quando arrivano le notifiche"
          />
        </Section>

        {/* ── PROGETTI (Scansione) ──────────── */}
        <Section title="Progetti" icon={<FolderSearch size={16} />}>
          <DirectoryList
            directories={settings.scanning.directories}
            onChange={(dirs) => updateSection('scanning', { directories: dirs })}
            label="Cartelle da scansionare"
            description="Lobster cerca i tuoi progetti in queste cartelle"
          />
          <Toggle
            checked={settings.scanning.autoDiscovery}
            onChange={(v) => updateSection('scanning', { autoDiscovery: v })}
            label="Scoperta automatica"
            description="Rileva automaticamente nuovi progetti quando appaiono nelle cartelle"
          />
          <NumberInput
            value={settings.scanning.pollingIntervalMs}
            onChange={(v) => updateSection('scanning', { pollingIntervalMs: Math.max(1000, v) })}
            label="Intervallo scansione"
            description="Ogni quanti millisecondi controllare le porte attive"
            min={1000}
            max={30000}
            step={1000}
            suffix="ms"
          />
          <div className="mt-2 pt-2 border-t border-cream-100">
            <span className="text-xs font-semibold text-bark block mb-2">Tipi di progetto da rilevare</span>
            <div className="grid grid-cols-2 gap-x-4">
              <Toggle
                checked={settings.scanning.detectDocker}
                onChange={(v) => updateSection('scanning', { detectDocker: v })}
                label="🐳 Docker Compose"
              />
              <Toggle
                checked={settings.scanning.detectNode}
                onChange={(v) => updateSection('scanning', { detectNode: v })}
                label="📦 Node.js"
              />
              <Toggle
                checked={settings.scanning.detectPython}
                onChange={(v) => updateSection('scanning', { detectPython: v })}
                label="🐍 Python"
              />
              <Toggle
                checked={settings.scanning.detectGit}
                onChange={(v) => updateSection('scanning', { detectGit: v })}
                label="📂 Repository Git"
              />
            </div>
          </div>
        </Section>

        {/* ── CONSULENTE AI (Ollama) ───────── */}
        <Section title="Consulente AI (Ollama)" icon={<Brain size={16} />}>
          <Toggle
            checked={settings.ollama.enabled}
            onChange={(v) => updateSection('ollama', { enabled: v })}
            label="Abilita Consulente Intelligente"
            description="Il consulente AI analizza i progetti e dà consigli. Richiede Ollama installato."
          />
          <TextInput
            value={settings.ollama.baseUrl}
            onChange={(v) => updateSection('ollama', { baseUrl: v })}
            label="URL di Ollama"
            description="Cambia se Ollama è su un'altra macchina in rete"
            placeholder="http://localhost:11434"
          />
          <div className="mt-2 pt-2 border-t border-cream-100">
            <span className="text-xs font-semibold text-bark block mb-2">Modelli preferiti</span>
            <TextInput
              value={settings.ollama.triageModel}
              onChange={(v) => updateSection('ollama', { triageModel: v })}
              label="Modello rapido (triage)"
              description="Usato per l'analisi rapida — scegli un modello veloce"
              placeholder="mistral-small"
            />
            <TextInput
              value={settings.ollama.analysisModel}
              onChange={(v) => updateSection('ollama', { analysisModel: v })}
              label="Modello analisi"
              description="Usato per l'analisi approfondita dei progetti"
              placeholder="qwen3:30b"
            />
            <TextInput
              value={settings.ollama.deepModel}
              onChange={(v) => updateSection('ollama', { deepModel: v })}
              label="Modello ragionamento"
              description="Usato per ragionamenti complessi"
              placeholder="deepseek-r1:32b"
            />
            <TextInput
              value={settings.ollama.fallbackModel}
              onChange={(v) => updateSection('ollama', { fallbackModel: v })}
              label="Modello di fallback"
              description="Usato se i modelli preferiti non sono disponibili"
              placeholder="mistral:7b"
            />
          </div>
        </Section>

        {/* ── MNEMO PROXY ───────────────────── */}
        <Section title="MNEMO Proxy" icon={<Cpu size={16} />}>
          <Toggle
            checked={settings.mnemo.enabled}
            onChange={(v) => updateSection('mnemo', { enabled: v })}
            label="Integrazione MNEMO"
            description="Abilita il monitoraggio del proxy MNEMO per la compressione del contesto LLM"
          />
          <TextInput
            value={settings.mnemo.baseUrl}
            onChange={(v) => updateSection('mnemo', { baseUrl: v })}
            label="URL di MNEMO"
            description="Indirizzo del proxy MNEMO. Default: http://127.0.0.1:11435"
            placeholder="http://127.0.0.1:11435"
          />
          <Toggle
            checked={settings.mnemo.autoStart}
            onChange={(v) => updateSection('mnemo', { autoStart: v })}
            label="Avvio automatico"
            description="Tenta di avviare MNEMO automaticamente se non raggiungibile"
          />
        </Section>

        {/* ── DOCKER ───────────────────────── */}
        <Section title="Docker" icon={<Container size={16} />}>
          <Toggle
            checked={settings.docker.enabled}
            onChange={(v) => updateSection('docker', { enabled: v })}
            label="Monitoraggio Docker"
            description="Monitora i container Docker in esecuzione"
          />
          <TextInput
            value={settings.docker.socketPath}
            onChange={(v) => updateSection('docker', { socketPath: v })}
            label="Socket Docker"
            description="Il percorso del socket Docker. Cambia se usi Colima, Rancher Desktop o OrbStack."
            placeholder="/var/run/docker.sock"
          />
          <NumberInput
            value={settings.docker.pollingIntervalMs}
            onChange={(v) => updateSection('docker', { pollingIntervalMs: Math.max(2000, v) })}
            label="Intervallo aggiornamento"
            description="Ogni quanti millisecondi aggiornare lo stato dei container"
            min={2000}
            max={30000}
            step={1000}
            suffix="ms"
          />
        </Section>

        {/* ── PORTE ────────────────────────── */}
        <Section title="Porte" icon={<Plug size={16} />}>
          <Toggle
            checked={settings.ports.showEphemeralPorts}
            onChange={(v) => updateSection('ports', { showEphemeralPorts: v })}
            label="Mostra porte effimere"
            description="Le porte nel range 49152-65535 sono temporanee del sistema. Nascondile per un monitor più pulito."
          />
          <NumberInput
            value={settings.ports.pollingIntervalMs}
            onChange={(v) => updateSection('ports', { pollingIntervalMs: Math.max(2000, v) })}
            label="Intervallo scansione porte"
            description="Ogni quanti millisecondi scansionare le porte attive"
            min={2000}
            max={30000}
            step={1000}
            suffix="ms"
          />
          <PortList
            ports={settings.ports.hiddenPorts}
            onChange={(ports) => updateSection('ports', { hiddenPorts: ports })}
          />
        </Section>

        {/* ── NOTIFICHE ────────────────────── */}
        <Section title="Notifiche" icon={<Bell size={16} />}>
          <p className="text-[11px] text-bark-dim mb-3">
            Scegli per quali eventi vuoi ricevere una notifica.
            Le notifiche generali devono essere attive nella sezione Generale.
          </p>
          <div className="space-y-0.5">
            <Toggle
              checked={settings.notifications.projectStopped}
              onChange={(v) => updateSection('notifications', { projectStopped: v })}
              label="Progetto fermato"
              description="Quando un progetto passa da attivo a fermo"
            />
            <Toggle
              checked={settings.notifications.projectStarted}
              onChange={(v) => updateSection('notifications', { projectStarted: v })}
              label="Progetto avviato"
              description="Quando un progetto diventa attivo"
            />
            <Toggle
              checked={settings.notifications.containerStopped}
              onChange={(v) => updateSection('notifications', { containerStopped: v })}
              label="Container fermo"
              description="Quando un container Docker si ferma inaspettatamente"
            />
            <Toggle
              checked={settings.notifications.containerStarted}
              onChange={(v) => updateSection('notifications', { containerStarted: v })}
              label="Container avviato"
              description="Quando un container Docker parte"
            />
            <Toggle
              checked={settings.notifications.portOccupied}
              onChange={(v) => updateSection('notifications', { portOccupied: v })}
              label="Nuova porta occupata"
              description="Quando un processo inizia ad ascoltare su una nuova porta"
            />
            <Toggle
              checked={settings.notifications.portFreed}
              onChange={(v) => updateSection('notifications', { portFreed: v })}
              label="Porta liberata"
              description="Quando una porta diventa disponibile"
            />
            <Toggle
              checked={settings.notifications.highCpu}
              onChange={(v) => updateSection('notifications', { highCpu: v })}
              label="CPU alta"
              description="Quando il processore è sotto pressione (oltre 80%)"
            />
            <Toggle
              checked={settings.notifications.highMemory}
              onChange={(v) => updateSection('notifications', { highMemory: v })}
              label="RAM alta"
              description="Quando la memoria è quasi piena (oltre 85%)"
            />
            <Toggle
              checked={settings.notifications.highDisk}
              onChange={(v) => updateSection('notifications', { highDisk: v })}
              label="Disco quasi pieno"
              description="Quando lo spazio su disco scende sotto il 15%"
            />
          </div>
        </Section>
      </div>

      {/* Footer info */}
      <div className="mt-6 text-center">
        <p className="text-[10px] text-bark-dim">
          Le impostazioni vengono salvate automaticamente quando le modifichi.
          Alcune modifiche richiedono il riavvio dell'app.
        </p>
      </div>
    </div>
  );
}

// Esporta con Error Boundary
export function Settings() {
  return (
    <SettingsErrorBoundary>
      <SettingsInner />
    </SettingsErrorBoundary>
  );
}
