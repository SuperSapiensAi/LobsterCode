// ============================================================
// LOBSTER UTILITY — Smart Advisor Service (Ollama Integration)
// Il "Consulente" che analizza i progetti e dà consigli
// Multi-model routing: triage → analysis → deep reasoning
// ============================================================

import { EventEmitter } from 'events';
import type { Project, DockerContainer, PortInfo, SystemResources } from '../../shared/types';

export interface AdvisorSuggestion {
  id: string;
  projectId?: string;
  projectName?: string;
  category: 'performance' | 'security' | 'architecture' | 'docker' | 'ports' | 'general';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string; // Italian, human-readable
  actionLabel?: string;
  actionType?: string; // e.g., 'dockerize', 'add-healthcheck', 'close-port'
  timestamp: string;
}

export interface AdvisorAnalysis {
  projectId: string;
  projectName: string;
  suggestions: AdvisorSuggestion[];
  summary: string; // Italian overview
  analyzedAt: string;
}

interface OllamaResponse {
  model: string;
  response: string;
  done: boolean;
}

export class SmartAdvisorService extends EventEmitter {
  private baseUrl: string;
  private triageModel: string;
  private analysisModel: string;
  private deepModel: string;
  private fallbackModel: string;
  private isAvailable: boolean = false;
  private suggestionHistory: AdvisorSuggestion[] = [];
  private userPreferredModel: string | null = null;

  constructor(config?: {
    baseUrl?: string;
    triageModel?: string;
    analysisModel?: string;
    deepModel?: string;
    fallbackModel?: string;
  }) {
    super();
    this.baseUrl = config?.baseUrl || 'http://localhost:11434';
    this.triageModel = config?.triageModel || 'mistral-small';
    this.analysisModel = config?.analysisModel || 'qwen3:30b';
    this.deepModel = config?.deepModel || 'deepseek-r1:32b';
    this.fallbackModel = config?.fallbackModel || 'mistral:7b';
  }

  /**
   * Check if Ollama is running and reachable
   */
  async checkAvailability(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (response.ok) {
        const data = await response.json();
        this.isAvailable = true;
        console.log(`[SmartAdvisor] Ollama available with ${data.models?.length || 0} models`);
        return true;
      }
      this.isAvailable = false;
      return false;
    } catch {
      this.isAvailable = false;
      console.warn('[SmartAdvisor] Ollama not available');
      return false;
    }
  }

  /**
   * List available models on Ollama
   */
  async getAvailableModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) return [];
      const data = await response.json();
      return (data.models || []).map((m: any) => m.name);
    } catch {
      return [];
    }
  }

  /**
   * Pick the best available model from preference list.
   * Ollama model names can be "mistral:latest", "mistral-small:7b", etc.
   * We match flexibly: "mistral" matches "mistral:latest", "mistral-small:7b", etc.
   */
  private async pickModel(preferred: string): Promise<string> {
    const models = await this.getAvailableModels();
    if (models.length === 0) {
      throw new Error('Nessun modello disponibile su Ollama. Scarica un modello con: ollama pull mistral-small');
    }

    console.log(`[SmartAdvisor] Modelli disponibili: ${models.join(', ')}`);
    console.log(`[SmartAdvisor] Modello preferito: ${preferred}`);

    // Exact match (e.g. "mistral-small" == "mistral-small:latest")
    const exactMatch = models.find((m) => m === preferred || m.startsWith(preferred + ':'));
    if (exactMatch) {
      console.log(`[SmartAdvisor] Match esatto: ${exactMatch}`);
      return exactMatch;
    }

    // Partial match: preferred is a substring of model name or vice-versa
    // e.g., preferred="mistral-small" matches model "mistral-small:7b-instruct"
    const partialMatch = models.find((m) => {
      const modelBase = m.split(':')[0]; // "mistral-small" from "mistral-small:7b"
      return modelBase === preferred || preferred.startsWith(modelBase) || modelBase.startsWith(preferred);
    });
    if (partialMatch) {
      console.log(`[SmartAdvisor] Match parziale: ${partialMatch}`);
      return partialMatch;
    }

    // Fallback chain — try each, same flexible matching
    const fallbacks = [this.fallbackModel, 'mistral-small', 'mistral', 'llama3.2', 'llama3', 'qwen', 'gemma'];
    for (const fb of fallbacks) {
      const fallbackMatch = models.find((m) => {
        const modelBase = m.split(':')[0];
        return modelBase === fb || fb.startsWith(modelBase) || modelBase.startsWith(fb);
      });
      if (fallbackMatch) {
        console.log(`[SmartAdvisor] Fallback match: ${fallbackMatch} (da ${fb})`);
        return fallbackMatch;
      }
    }

    // Use whatever is available as last resort
    console.log(`[SmartAdvisor] Nessun match, uso il primo disponibile: ${models[0]}`);
    return models[0];
  }

  /**
   * Send a prompt to Ollama and get a response (with timeout)
   */
  private async queryOllama(model: string, prompt: string, systemPrompt?: string): Promise<string> {
    const actualModel = await this.pickModel(model);
    console.log(`[SmartAdvisor] Invio query al modello ${actualModel}...`);

    const body: any = {
      model: actualModel,
      prompt,
      stream: false,
    };

    if (systemPrompt) {
      body.system = systemPrompt;
    }

    // Timeout di 120 secondi (modelli locali possono essere lenti)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);

    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new Error(`Ollama errore ${response.status}: ${response.statusText}. ${errorBody}`.trim());
      }

      const data: OllamaResponse = await response.json();
      console.log(`[SmartAdvisor] Risposta ricevuta da ${actualModel} (${(data.response || '').length} chars)`);
      return data.response || '';
    } catch (error: any) {
      clearTimeout(timeout);
      if (error?.name === 'AbortError') {
        console.error(`[SmartAdvisor] Timeout: il modello ${actualModel} non ha risposto in 120s`);
        throw new Error(`Il modello ${actualModel} non ha risposto entro 120 secondi. Prova con un modello più leggero.`);
      }
      console.error(`[SmartAdvisor] Query failed with model ${actualModel}:`, error);
      throw error;
    }
  }

  /**
   * Analyze a single project and generate suggestions
   */
  async analyzeProject(project: Project): Promise<AdvisorAnalysis> {
    if (!this.isAvailable) {
      await this.checkAvailability();
      if (!this.isAvailable) {
        throw new Error('Ollama non è disponibile. Avvialo con: ollama serve');
      }
    }

    const systemPrompt = `Sei il Consulente Intelligente di Lobster Manager — un assistente per sviluppatori non-tecnici su macOS.
Rispondi SOLO in italiano. Sii breve, chiaro, amichevole e INTELLIGENTE.

## IL TUO RUOLO
Lobster Manager è un'app desktop che monitora i progetti di sviluppo locali: le loro porte di rete, container Docker e risorse di sistema. Tu analizzi i dati raccolti dall'app e dai consigli utili e pertinenti.

## RAGIONAMENTO CRITICO — LEGGI BENE
Non tutti i progetti funzionano allo stesso modo. DEVI ragionare sul tipo di progetto prima di dare suggerimenti:

TIPI DI PROGETTO e cosa aspettarsi:
- "docker-compose": usa container Docker. Se non ha container attivi, POTREBBE essere un problema.
- "node": è un progetto Node.js. Potrebbe avere un dev server su una porta OPPURE essere una CLI/libreria senza porte. Nessuna porta ≠ errore.
- "python": idem — potrebbe essere un server web Django/Flask OPPURE uno script/tool locale. Nessuna porta ≠ errore.
- "content": è un progetto di contenuti (documenti, siti statici, ecc.). NON ha bisogno di Docker né di porte. Non suggerire mai Docker o porte per questi.
- "generic": progetto generico. Potrebbe essere un'app Electron, un monorepo, una libreria. Analizza i file presenti (package.json, docker-compose.yml, ecc.) per capire di cosa si tratta.

REGOLE DI BUON SENSO:
1. Se un progetto NON ha docker-compose configurato, NON suggerire "verifica Docker" — non usa Docker!
2. Se un progetto è di tipo "content" o "generic" senza servizi, NON dire "il progetto è offline" — non è un servizio web.
3. "Nessuna porta attiva" è normale per librerie, CLI, app desktop, tool locali. Non è un errore.
4. "Nessun container" è normale per progetti che non usano Docker. Non è un errore.
5. Concentrati su ciò che il progetto HA realmente, non su ciò che gli manca rispetto a un modello ideale.
6. Se il progetto ha file come "Electron", "electron-builder", o è un'app desktop, NON suggerire porte o Docker.
7. Se non c'è nulla di critico da segnalare, dì semplicemente che il progetto sembra a posto.

## CONSIGLI PROATTIVI — ragiona come un consulente esperto
Non limitarti a segnalare errori. Se vedi un pattern architetturale migliorabile, suggeriscilo come "info":
- Se un progetto node/python ha PORTE APERTE sulla rete ma NON usa Docker → suggerisci Docker come best practice per isolamento e sicurezza (severity: "info", non "critical" — è un consiglio, non un errore)
- Se un progetto ha molti container e nessun healthcheck configurato → suggerisci di aggiungerne
- Se un progetto ha porte esposte su 0.0.0.0 invece che su 127.0.0.1 → segnala il rischio sicurezza
- Se ci sono più progetti che usano la stessa porta → segnala il potenziale conflitto
- Se un container usa un'immagine generica (es. "latest") → suggerisci di specificare una versione
Questi sono consigli intelligenti che un buon CTO darebbe. Ma solo quando i dati li giustificano!

## SEGNALAZIONI DI PROBLEMI REALI
- Container in errore/riavvio continuo → critico
- Porta attesa occupata da un altro processo → critico
- CPU o memoria molto alte → warning — SPECIFICA quali processi/container stanno consumando di più (i dati "CHI USA PIÙ RAM" te li forniamo noi)
- Container con architettura diversa (es. amd64 su Apple Silicon) → warning
- docker-compose configurato ma nessun container attivo → il progetto potrebbe essersi fermato
- Tutto a posto → dì che va bene, nessun suggerimento forzato

## REGOLA FONDAMENTALE: SPIEGA SEMPRE IL PERCHÉ
Per OGNI problema segnalato, DEVI spiegare:
1. COSA sta succedendo (il sintomo)
2. PERCHÉ sta succedendo (la causa — es. "Docker Desktop sta usando 4.2 GB di RAM")
3. COME risolverlo (azione concreta nell'app — es. "Puoi fermare i container non necessari dalla Dashboard")
Se non sai il perché, non segnalare il problema. Mai dire "alto utilizzo RAM" senza dire COSA la sta usando.

## REGOLE ANTI-ALLUCINAZIONE — IMPORTANTISSIMO
1. NON inventare problemi che non vedi nei dati. Se una porta è attiva e non ci sono conflitti nei dati → non dire "controlla i conflitti"
2. NON dare suggerimenti vaghi come "assicurati che non ci siano conflitti" — SE vedi un conflitto reale (due processi sulla stessa porta, porta attesa ma occupata da altro) segnalalo con i DETTAGLI specifici. Altrimenti non menzionarlo.
3. NON suggerire "controlla aggiornamenti" o "verifica sicurezza" come riempitivi — sono consigli generici inutili. Suggerisci SOLO se vedi un problema specifico nei dati.
4. Se un progetto ha porte attive e funziona → è un punto positivo, non un problema. Non dire "la porta X è attiva, controlla i conflitti".
5. PREFERISCI dare 0 suggerimenti piuttosto che suggerimenti generici/inventati. La qualità batte la quantità.

## FORMATO RISPOSTA — JSON obbligatorio:
{
  "summary": "riepilogo intelligente basato su ciò che il progetto È realmente",
  "suggestions": [
    {
      "category": "performance|security|architecture|docker|ports|general",
      "severity": "info|warning|critical",
      "title": "titolo breve e specifico",
      "description": "spiegazione pratica in italiano per non-tecnici",
      "actionLabel": "etichetta bottone (es: Vai a Docker)",
      "actionType": "go-docker|go-ports|go-dashboard|go-uitest|none"
    }
  ]
}

Se il progetto sta bene, restituisci "suggestions": [] e un summary positivo.

REGOLE actionType:
- "go-docker": solo se il suggerimento riguarda container Docker realmente presenti o attesi
- "go-ports": solo se riguarda porte di rete realmente rilevanti per il progetto
- "go-dashboard": per panoramica generale
- "go-uitest": per testare interfacce web del progetto
- "none": suggerimento solo informativo
NON suggerire azioni esterne all'app — l'utente non è tecnico.`;

    const projectContext = this.buildProjectContext(project);

    try {
      const response = await this.queryOllama(this.analysisModel, projectContext, systemPrompt);
      const parsed = this.parseAdvisorResponse(response, project);

      // Cache suggestions
      this.suggestionHistory = [
        ...parsed.suggestions,
        ...this.suggestionHistory.filter((s) => s.projectId !== project.id),
      ].slice(0, 100);

      this.emit('analysisComplete', parsed);
      return parsed;
    } catch (error: any) {
      const errorMsg = error?.message || String(error);
      console.error(`[SmartAdvisor] Analysis failed for ${project.name}:`, errorMsg);
      // Return a graceful fallback WITH the actual error message
      return {
        projectId: project.id,
        projectName: project.name,
        suggestions: [],
        summary: `Errore nell'analisi: ${errorMsg}`,
        analyzedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Quick triage — lightweight check using small model
   */
  async quickTriage(projects: Project[], resources: SystemResources | null): Promise<AdvisorSuggestion[]> {
    if (!this.isAvailable) {
      await this.checkAvailability();
      if (!this.isAvailable) {
        console.log('[SmartAdvisor] Ollama non disponibile per triage');
        return [];
      }
    }

    console.log(`[SmartAdvisor] Avvio triage rapido per ${projects.length} progetti...`);

    const systemPrompt = `Sei il Consulente Rapido di Lobster Manager — fai un check veloce della situazione per uno sviluppatore non-tecnico su macOS.
Rispondi SOLO in italiano, formato JSON. Max 3 suggerimenti, solo se davvero utili.

## CONTESTO
L'utente usa Lobster Manager per monitorare i propri progetti di sviluppo locali (porte, Docker, risorse).
I progetti hanno tipi diversi: docker-compose, node, python, content, generic.
NON tutti i progetti devono avere Docker o porte! Un progetto "content" o "generic" senza porte e senza Docker è perfettamente NORMALE.

## RAGIONA PRIMA DI SUGGERIRE
- Se un progetto non ha docker-compose configurato → NON suggerire Docker
- Se un progetto è di tipo content/generic senza servizi → NON dire che è offline
- Se le risorse di sistema sono normali → NON inventare problemi di performance
- Se tutto va bene → restituisci "suggestions": [] — non forzare suggerimenti inutili
- Concentrati su problemi REALI: container in errore, porte in conflitto, CPU/RAM alta, servizi attesi ma fermi
- Se la RAM è alta, DEVI dire all'utente QUALI processi stanno consumando di più — i dati "CHI USA PIÙ RAM" te li forniamo noi nei dati. Cita i nomi dei processi e quanta RAM usano.
- Per OGNI problema segnalato, spiega sempre il PERCHÉ e suggerisci una soluzione concreta. Non dire solo "RAM alta" — dì "RAM alta perché Docker Desktop usa 4.2 GB e Chrome 1.8 GB. Puoi fermare container non necessari dalla Dashboard."

Formato: { "suggestions": [{ "category": "performance|security|architecture|docker|ports|general", "severity": "info|warning|critical", "title": "...", "description": "...", "actionLabel": "Vai a Docker|Controlla le porte|Testa interfaccia|...", "actionType": "go-docker|go-ports|go-dashboard|go-uitest|none" }] }
Se non ci sono problemi reali, restituisci: { "suggestions": [] }
NON suggerire azioni esterne all'app — l'utente non è tecnico.
NON inventare problemi: niente "controlla conflitti" se non vedi conflitti reali, niente "verifica sicurezza" generico. Solo problemi concreti dai dati.`;

    const context = this.buildTriageContext(projects, resources);

    try {
      const response = await this.queryOllama(this.triageModel, context, systemPrompt);
      console.log(`[SmartAdvisor] Triage completato, parsing risposta...`);
      const parsed = this.parseTriageResponse(response);
      console.log(`[SmartAdvisor] Triage: ${parsed.length} suggerimenti generati`);
      return parsed;
    } catch (error: any) {
      console.error(`[SmartAdvisor] Triage fallito:`, error?.message || error);
      throw error; // Lascia propagare l'errore al renderer per feedback utente
    }
  }

  /**
   * Get all cached suggestions
   */
  getSuggestions(): AdvisorSuggestion[] {
    return this.suggestionHistory;
  }

  /**
   * Get suggestions for a specific project
   */
  getProjectSuggestions(projectId: string): AdvisorSuggestion[] {
    return this.suggestionHistory.filter((s) => s.projectId === projectId);
  }

  /**
   * Set preferred model for analysis (user selection)
   */
  setPreferredModel(model: string): void {
    this.userPreferredModel = model;
    this.analysisModel = model;
    this.triageModel = model; // usa lo stesso per semplicità
    console.log(`[SmartAdvisor] Modello preferito impostato: ${model}`);
  }

  /**
   * Get currently selected model name
   */
  getPreferredModel(): string {
    return this.userPreferredModel || this.analysisModel;
  }

  /**
   * Update configuration at runtime (called when settings change)
   */
  updateConfig(config: {
    baseUrl?: string;
    triageModel?: string;
    analysisModel?: string;
    deepModel?: string;
    fallbackModel?: string;
  }): void {
    if (config.baseUrl) this.baseUrl = config.baseUrl;
    if (config.triageModel) this.triageModel = config.triageModel;
    if (config.analysisModel) this.analysisModel = config.analysisModel;
    if (config.deepModel) this.deepModel = config.deepModel;
    if (config.fallbackModel) this.fallbackModel = config.fallbackModel;
    // Reset availability check — l'URL potrebbe essere cambiato
    this.isAvailable = false;
    console.log(`[SmartAdvisor] Configurazione aggiornata: baseUrl=${this.baseUrl}`);
  }

  /**
   * Build context string for project analysis
   */
  private buildProjectContext(project: Project): string {
    const lines: string[] = [
      `PROGETTO: ${project.name}`,
      `TIPO RILEVATO: ${project.type}`,
      `PERCORSO: ${project.path}`,
      `STATO LOBSTER: ${project.status} (${project.humanStatus})`,
      `SALUTE: ${project.health}`,
    ];

    // Aiuta il modello a capire cosa aspettarsi dal tipo di progetto
    const typeHints: Record<string, string> = {
      'docker-compose': 'Questo progetto USA Docker Compose. È normale che abbia container. Se non ne ha, potrebbe essere fermo.',
      'node': 'Progetto Node.js. Potrebbe essere un server web (con porte) o una libreria/CLI (senza porte). Entrambi sono normali.',
      'python': 'Progetto Python. Potrebbe essere un server web (Django/Flask) o uno script/tool. Nessuna porta è normale per script.',
      'content': 'Progetto di CONTENUTI (documenti, siti statici). NON usa Docker, NON ha porte. Questo è normale.',
      'generic': 'Progetto generico. Potrebbe essere qualsiasi cosa: app desktop, monorepo, libreria. Analizza i dati concreti.',
    };
    lines.push(`NOTA SUL TIPO: ${typeHints[project.type] || typeHints['generic']}`);

    // Info configurazione — indica se Docker è atteso
    if (project.config?.dockerComposePath) {
      lines.push(`DOCKER-COMPOSE CONFIGURATO: sì (${project.config.dockerComposePath})`);
    } else {
      lines.push('DOCKER-COMPOSE CONFIGURATO: no — questo progetto NON usa Docker Compose');
    }

    if (project.config?.expectedPorts && project.config.expectedPorts.length > 0) {
      lines.push(`PORTE ATTESE: ${project.config.expectedPorts.map((p) => `${p.port} (${p.service})`).join(', ')}`);
    } else {
      lines.push('PORTE ATTESE: nessuna configurata — il progetto potrebbe non averne bisogno');
    }

    // Porte effettive
    if (project.ports.length > 0) {
      lines.push(`PORTE ATTIVE ORA: ${project.ports.map((p) => `${p.port} (${p.humanLabel})`).join(', ')}`);
    } else {
      lines.push('PORTE ATTIVE ORA: nessuna');
    }

    // Container effettivi
    if (project.containers.length > 0) {
      lines.push('CONTAINER DOCKER ATTIVI:');
      for (const c of project.containers) {
        lines.push(`  - ${c.friendlyName}: ${c.state} (${c.humanStatus})`);
        if (c.platformWarning) lines.push(`    ⚠️ ${c.platformWarning}`);
      }
    } else {
      lines.push('CONTAINER DOCKER ATTIVI: nessuno');
    }

    if (project.gitBranch) {
      lines.push(`GIT BRANCH: ${project.gitBranch}`);
    }

    return lines.join('\n');
  }

  /**
   * Build context for quick triage
   */
  private buildTriageContext(projects: Project[], resources: SystemResources | null): string {
    const lines: string[] = [];

    if (resources) {
      lines.push(`RISORSE SISTEMA: CPU ${resources.cpuPercent}% (${resources.cpuHumanLabel}), RAM ${resources.memoryPercent}% usata (${resources.memoryUsedGB.toFixed(1)}/${resources.memoryTotalGB.toFixed(0)} GB — ${resources.memoryHumanLabel}), Disco ${resources.diskPercent}%`);
      // Include top memory consumers so the advisor can explain WHAT is using RAM
      if (resources.memoryTopConsumers && resources.memoryTopConsumers.length > 0) {
        lines.push('CHI USA PIÙ RAM:');
        for (const consumer of resources.memoryTopConsumers.slice(0, 8)) {
          const memLabel = consumer.memoryMB >= 1024
            ? `${(consumer.memoryMB / 1024).toFixed(1)} GB`
            : `${consumer.memoryMB} MB`;
          lines.push(`  - ${consumer.name}: ${memLabel}`);
        }
      }
    }

    lines.push(`\nPROGETTI (${projects.length} totali):`);
    for (const p of projects.slice(0, 10)) {
      const hasDocker = p.config?.dockerComposePath ? 'sì' : 'no';
      const portCount = p.ports.length;
      const containerCount = p.containers.length;
      const errContainers = p.containers.filter((c) => c.state === 'exited' || c.state === 'dead').length;
      lines.push(`- ${p.name} [tipo:${p.type}] stato:${p.status} — ${p.humanStatus}`);
      lines.push(`  docker-compose:${hasDocker} | container:${containerCount}${errContainers > 0 ? ` (${errContainers} in errore!)` : ''} | porte:${portCount}`);
    }

    lines.push('\nNOTA: Non tutti i progetti hanno bisogno di Docker o porte. Progetti "content" e "generic" senza servizi sono normali.');

    return lines.join('\n');
  }

  /**
   * Parse Ollama response for project analysis
   */
  private parseAdvisorResponse(response: string, project: Project): AdvisorAnalysis {
    try {
      // Extract JSON from response (Ollama may wrap it in text)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          projectId: project.id,
          projectName: project.name,
          suggestions: [],
          summary: response.slice(0, 200),
          analyzedAt: new Date().toISOString(),
        };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const suggestions: AdvisorSuggestion[] = (parsed.suggestions || []).map(
        (s: any, i: number) => ({
          id: `advisor_${project.id}_${Date.now()}_${i}`,
          projectId: project.id,
          projectName: project.name,
          category: s.category || 'general',
          severity: s.severity || 'info',
          title: s.title || 'Suggerimento',
          description: s.description || '',
          actionLabel: s.actionLabel,
          actionType: s.actionType,
          timestamp: new Date().toISOString(),
        })
      );

      return {
        projectId: project.id,
        projectName: project.name,
        suggestions,
        summary: parsed.summary || 'Analisi completata',
        analyzedAt: new Date().toISOString(),
      };
    } catch {
      return {
        projectId: project.id,
        projectName: project.name,
        suggestions: [],
        summary: 'Errore nel parsing della risposta',
        analyzedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Parse triage response
   */
  private parseTriageResponse(response: string): AdvisorSuggestion[] {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return [];

      const parsed = JSON.parse(jsonMatch[0]);
      return (parsed.suggestions || []).map((s: any, i: number) => ({
        id: `triage_${Date.now()}_${i}`,
        category: s.category || 'general',
        severity: s.severity || 'info',
        title: s.title || 'Suggerimento',
        description: s.description || '',
        actionLabel: s.actionLabel,
        actionType: s.actionType,
        timestamp: new Date().toISOString(),
      }));
    } catch {
      return [];
    }
  }
}
