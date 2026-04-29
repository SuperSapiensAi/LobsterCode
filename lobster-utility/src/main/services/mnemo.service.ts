// ============================================================
// LOBSTER UTILITY — MNEMO Service
// Comunicazione con il proxy MNEMO per monitoraggio e config.
// MNEMO (Memory-Native Efficient Model Orchestrator) moltiplica
// la context window dei modelli Ollama via compressione intelligente.
// ============================================================

import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// --- Types ---

export interface MnemoHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  phase: string;
  uptime_seconds: number;
  ollama: {
    connected: boolean;
    base_url: string;
    models_available: string[];
    last_check: number;
  };
  proxy: {
    host: string;
    port: number;
    compression_enabled: boolean;
  };
  requests_total: number;
  requests_failed: number;
  avg_latency_ms: number;
}

export interface MnemoStats {
  uptime_seconds: number;
  requests: {
    total: number;
    chat: number;
    generate: number;
    passthrough: number;
    failed: number;
    active: number;
  };
  latency: {
    avg_ms: number;
    p95_ms: number;
    max_ms: number;
    samples: number;
  };
  throughput: {
    bytes_received: number;
    bytes_sent: number;
    requests_per_minute: number;
  };
  compression: {
    enabled: boolean;
    level: number;
    tokens_original: number;
    tokens_compressed: number;
    ratio: number;
    compressions_applied: number;
  };
  last_request_time: number;
  last_error: string | null;
  last_error_time: number;
}

export interface MnemoSession {
  fingerprint: string;
  model: string;
  request_count: number;
  total_tokens_in: number;
  total_tokens_out: number;
  compressions_applied: number;
  peak_message_count: number;
  created_at: number;
  last_seen: number;
}

export interface MnemoProfile {
  name: string;
  context_window: number;
  parameter_size: string;
  quantization: string;
  family: string;
  format: string;
  good_for_summary: boolean;
  optimal_budget_ratio: number;
  detected_at: number;
}

export interface MnemoConfig {
  proxy: { host: string; port: number; ollama_port: number };
  compression: {
    enabled: boolean;
    level: number;
    token_budget_ratio: number;
    protect_last_n: number;
    max_tool_lines: number;
    max_code_block_lines: number;
    llm_summary_model: string;
    llm_summary_timeout: number;
  };
  [key: string]: any;
}

export interface MnemoOverview {
  available: boolean;
  health: MnemoHealth | null;
  stats: MnemoStats | null;
  sessions: MnemoSession[];
  profiles: MnemoProfile[];
  config: MnemoConfig | null;
}

// --- Service ---

export class MnemoService extends EventEmitter {
  private baseUrl: string;
  private isAvailable: boolean = false;
  private pollInterval: NodeJS.Timeout | null = null;
  private pollMs: number = 5000;
  private lastHealth: MnemoHealth | null = null;
  private autoStart: boolean = false;
  private mnemoProcess: ChildProcess | null = null;
  private autoStartAttempted: boolean = false;

  constructor(mnemoBaseUrl?: string) {
    super();
    this.baseUrl = mnemoBaseUrl || 'http://127.0.0.1:11435';
  }

  // --- Public API ---

  /** Controlla se MNEMO è raggiungibile */
  async checkAvailability(): Promise<boolean> {
    try {
      const health = await this.fetchJson<MnemoHealth>('/mnemo/health');
      this.isAvailable = true;
      this.lastHealth = health;
      return true;
    } catch {
      this.isAvailable = false;
      this.lastHealth = null;
      return false;
    }
  }

  /** Health check */
  async getHealth(): Promise<MnemoHealth | null> {
    try {
      const health = await this.fetchJson<MnemoHealth>('/mnemo/health');
      this.lastHealth = health;
      this.isAvailable = true;
      return health;
    } catch {
      this.isAvailable = false;
      return null;
    }
  }

  /** Statistiche dettagliate */
  async getStats(): Promise<MnemoStats | null> {
    try {
      return await this.fetchJson<MnemoStats>('/mnemo/stats');
    } catch {
      return null;
    }
  }

  /** Sessioni attive */
  async getSessions(): Promise<MnemoSession[]> {
    try {
      const data = await this.fetchJson<{ sessions: MnemoSession[] }>('/mnemo/sessions');
      return data.sessions || [];
    } catch {
      return [];
    }
  }

  /** Profili modello rilevati */
  async getProfiles(): Promise<MnemoProfile[]> {
    try {
      const data = await this.fetchJson<{ profiles: MnemoProfile[] }>('/mnemo/profiles');
      return data.profiles || [];
    } catch {
      return [];
    }
  }

  /** Configurazione corrente */
  async getConfig(): Promise<MnemoConfig | null> {
    try {
      return await this.fetchJson<MnemoConfig>('/mnemo/config');
    } catch {
      return null;
    }
  }

  /** Aggiorna configurazione */
  async updateConfig(updates: Record<string, any>): Promise<MnemoConfig | null> {
    try {
      return await this.postJson<MnemoConfig>('/mnemo/config', updates);
    } catch {
      return null;
    }
  }

  /** Panoramica completa per la dashboard */
  async getOverview(): Promise<MnemoOverview> {
    const available = await this.checkAvailability();
    if (!available) {
      return {
        available: false,
        health: null,
        stats: null,
        sessions: [],
        profiles: [],
        config: null,
      };
    }

    // Fetch parallelo per performance
    const [health, stats, sessions, profiles, config] = await Promise.all([
      this.getHealth(),
      this.getStats(),
      this.getSessions(),
      this.getProfiles(),
      this.getConfig(),
    ]);

    return { available: true, health, stats, sessions, profiles, config };
  }

  /** Abilita/disabilita auto-start */
  setAutoStart(enabled: boolean): void {
    this.autoStart = enabled;
    if (enabled) {
      this.autoStartAttempted = false; // Reset per consentire un nuovo tentativo
    }
  }

  /** Avvia il server MNEMO automaticamente */
  async tryAutoStart(): Promise<boolean> {
    if (this.autoStartAttempted || this.mnemoProcess) {
      return false; // Già tentato o già in esecuzione
    }
    this.autoStartAttempted = true;

    // Cerca mnemo_server.py in percorsi noti
    const home = os.homedir();
    const searchPaths = [
      path.join(home, 'Desktop', 'lobster-mnemo', 'mnemo_server.py'),
      path.join(home, 'lobster-mnemo', 'mnemo_server.py'),
      path.join(home, 'Projects', 'lobster-mnemo', 'mnemo_server.py'),
    ];

    let serverPath: string | null = null;
    for (const p of searchPaths) {
      if (fs.existsSync(p)) {
        serverPath = p;
        break;
      }
    }

    if (!serverPath) {
      console.log('[MNEMO] Server non trovato nei percorsi noti. Percorsi cercati:', searchPaths.join(', '));
      this.emit('auto-start-failed', 'Server non trovato');
      return false;
    }

    // Estrai porta dall'URL
    const portMatch = this.baseUrl.match(/:(\d+)/);
    const port = portMatch ? portMatch[1] : '11435';

    try {
      console.log(`[MNEMO] Avvio automatico: python3 ${serverPath} --port ${port}`);
      const logDir = path.join(home, '.lobster', 'mnemo');
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      const logFile = fs.openSync(path.join(logDir, 'mnemo.log'), 'a');

      this.mnemoProcess = spawn('python3', [serverPath, '--port', port], {
        cwd: path.dirname(serverPath),
        detached: true,
        stdio: ['ignore', logFile, logFile],
      });

      this.mnemoProcess.unref();

      // Salva PID
      const pidFile = path.join(logDir, 'mnemo.pid');
      if (this.mnemoProcess.pid) {
        fs.writeFileSync(pidFile, String(this.mnemoProcess.pid));
      }

      this.mnemoProcess.on('exit', (code) => {
        console.log(`[MNEMO] Processo terminato con codice ${code}`);
        this.mnemoProcess = null;
      });

      // Attendi che il server sia pronto (max 8 secondi)
      for (let i = 0; i < 8; i++) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const alive = await this.checkAvailabilityRaw();
        if (alive) {
          console.log('[MNEMO] Server avviato con successo');
          this.emit('auto-start-success');
          return true;
        }
      }

      console.warn('[MNEMO] Timeout avvio server');
      this.emit('auto-start-failed', 'Timeout');
      return false;
    } catch (err: any) {
      console.error('[MNEMO] Errore avvio automatico:', err.message);
      this.emit('auto-start-failed', err.message);
      return false;
    }
  }

  /** Check senza side-effects per auto-start */
  private async checkAvailabilityRaw(): Promise<boolean> {
    try {
      await this.fetchJson<MnemoHealth>('/mnemo/health');
      return true;
    } catch {
      return false;
    }
  }

  /** Aggiorna l'URL base di MNEMO */
  updateBaseUrl(url: string): void {
    this.baseUrl = url;
    this.isAvailable = false;
    this.lastHealth = null;
    this.autoStartAttempted = false; // Reset per nuovo URL
  }

  /** Avvia polling periodico */
  startPolling(intervalMs?: number): void {
    this.stopPolling();
    this.pollMs = intervalMs || this.pollMs;
    this.pollInterval = setInterval(async () => {
      const wasAvailable = this.isAvailable;
      await this.checkAvailability();

      // Auto-start se non raggiungibile e auto-start abilitato
      if (!this.isAvailable && this.autoStart && !this.autoStartAttempted) {
        console.log('[MNEMO] Non raggiungibile, tentativo auto-start...');
        const started = await this.tryAutoStart();
        if (started) {
          await this.checkAvailability();
        }
      }

      if (wasAvailable !== this.isAvailable) {
        this.emit('availability-changed', this.isAvailable);
      }
      if (this.isAvailable && this.lastHealth) {
        this.emit('health-update', this.lastHealth);
      }
    }, this.pollMs);
    // Check immediato con auto-start
    this.checkAvailability().then(async (available) => {
      if (!available && this.autoStart) {
        console.log('[MNEMO] Non raggiungibile al primo check, tentativo auto-start...');
        const started = await this.tryAutoStart();
        if (started) {
          await this.checkAvailability();
          if (this.isAvailable) {
            this.emit('availability-changed', true);
          }
        }
      }
    });
  }

  /** Ferma polling */
  stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  get available(): boolean {
    return this.isAvailable;
  }

  get url(): string {
    return this.baseUrl;
  }

  // --- Internal ---

  private async fetchJson<T>(path: string): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const resp = await fetch(`${this.baseUrl}${path}`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return (await resp.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async postJson<T>(path: string, data: any): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const resp = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(data),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return (await resp.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}
