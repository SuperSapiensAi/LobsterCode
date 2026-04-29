import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useProjects } from '../../hooks/useLobster';
import { useStore } from '../../store';
import type { Project } from '@shared/types';
import {
  Brain, Loader2, RefreshCw, AlertTriangle, CheckCircle, Info,
  Zap, Shield, Server, Plug, Box, ChevronDown, ChevronRight,
  WifiOff, Sparkles, ExternalLink, Terminal
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────
interface AdvisorSuggestion {
  id: string;
  projectId?: string;
  projectName?: string;
  category: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  actionLabel?: string;
  actionType?: string;
  timestamp: string;
}

// Mappa actionType → vista dell'app
const ACTION_VIEW_MAP: Record<string, 'dashboard' | 'ports' | 'docker' | 'advisor' | 'uitest'> = {
  'go-docker': 'docker',
  'go-ports': 'ports',
  'go-dashboard': 'dashboard',
  'go-uitest': 'uitest',
};

interface AdvisorAnalysis {
  projectId: string;
  projectName: string;
  suggestions: AdvisorSuggestion[];
  summary: string;
  analyzedAt: string;
}

interface AdvisorStatus {
  available: boolean;
  models: string[];
}

// ─── Category Icons ────────────────────────────────────────
function CategoryIcon({ category }: { category: string }) {
  const icons: Record<string, React.ReactNode> = {
    performance: <Zap size={14} className="text-status-yellow" />,
    security: <Shield size={14} className="text-status-red" />,
    architecture: <Server size={14} className="text-purple-500" />,
    docker: <Box size={14} className="text-ocean" />,
    ports: <Plug size={14} className="text-ocean" />,
    general: <Info size={14} className="text-bark-dim" />,
  };
  return <>{icons[category] || icons.general}</>;
}

// ─── Severity Badge ────────────────────────────────────────
function SeverityBadge({ severity }: { severity: string }) {
  const styles: Record<string, string> = {
    info: 'bg-blue-50 text-ocean border-blue-200',
    warning: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    critical: 'bg-red-50 text-status-red border-red-200',
  };
  const labels: Record<string, string> = {
    info: 'Info',
    warning: 'Attenzione',
    critical: 'Critico',
  };
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${styles[severity] || styles.info}`}>
      {labels[severity] || severity}
    </span>
  );
}

// ─── Generate fix prompt from suggestion ──────────────────
function generateFixPrompt(suggestion: AdvisorSuggestion): string {
  return `Risolvi questo problema nel progetto "${suggestion.projectName || 'corrente'}":

**${suggestion.title}** (${suggestion.severity})
Categoria: ${suggestion.category}

${suggestion.description}

Per favore:
1. Individua il file e la riga esatta del problema
2. Mostra il codice corretto da sostituire
3. Se serve installare qualcosa, dammi il comando esatto

Vai dritto alla soluzione, senza spiegazioni lunghe.`;
}

// ─── Suggestion Card ───────────────────────────────────────
function SuggestionCard({ suggestion, onNavigate }: { suggestion: AdvisorSuggestion; onNavigate: (view: string) => void }) {
  const targetView = suggestion.actionType ? ACTION_VIEW_MAP[suggestion.actionType] : null;
  const openCodeWithPrompt = useStore((s) => s.openCodeWithPrompt);

  const handleFixInCode = async () => {
    try {
      const projects = await (window as any).lobster?.projects?.getAll();
      const project = projects?.find((p: any) => p.id === suggestion.projectId);
      const projectPath = project?.path || '~';
      const prompt = generateFixPrompt(suggestion);
      openCodeWithPrompt(projectPath, prompt);
    } catch (err: any) {
      console.error('[SmartAdvisor] Errore fix in code:', err);
    }
  };

  const showFixButton = suggestion.severity === 'warning' || suggestion.severity === 'critical';

  return (
    <div className="bg-white rounded-lg border border-cream-200 p-3 hover:shadow-sm transition-shadow">
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5">
          <CategoryIcon category={suggestion.category} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h4 className="text-xs font-semibold text-bark">{suggestion.title}</h4>
            <SeverityBadge severity={suggestion.severity} />
          </div>
          <p className="text-[11px] text-bark-secondary leading-relaxed">{suggestion.description}</p>
          <div className="flex items-center gap-3 mt-1.5">
            {suggestion.actionLabel && targetView && (
              <button
                onClick={() => onNavigate(targetView)}
                className="text-[11px] font-medium text-ocean hover:text-lobster transition-colors flex items-center gap-1"
              >
                <ExternalLink size={10} />
                {suggestion.actionLabel}
              </button>
            )}
            {showFixButton && (
              <button
                onClick={handleFixInCode}
                className="text-[11px] font-medium text-lobster hover:text-lobster-dark transition-colors flex items-center gap-1"
              >
                <Terminal size={10} />
                Fix in Code
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Project Suggestion Group (collapsible) ────────────────
function ProjectSuggestionGroup({
  projectName,
  suggestions,
  onNavigate,
}: {
  projectName: string;
  suggestions: AdvisorSuggestion[];
  onNavigate: (view: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  const criticalCount = suggestions.filter((s) => s.severity === 'critical').length;
  const warningCount = suggestions.filter((s) => s.severity === 'warning').length;

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-3 hover:bg-cream-50 transition-colors text-left"
      >
        {expanded ? <ChevronDown size={14} className="text-bark-dim" /> : <ChevronRight size={14} className="text-bark-dim" />}
        <span className="text-sm font-semibold text-bark flex-1">{projectName}</span>
        <div className="flex items-center gap-1.5">
          {criticalCount > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-status-red">
              {criticalCount} critici
            </span>
          )}
          {warningCount > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700">
              {warningCount} attenzione
            </span>
          )}
          <span className="text-[10px] text-bark-dim">{suggestions.length} suggerimenti</span>
        </div>
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          {suggestions.map((s) => (
            <SuggestionCard key={s.id} suggestion={s} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Ollama Offline State ──────────────────────────────────
function OllamaOffline() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <WifiOff size={48} className="text-bark-dim mb-4" />
      <h2 className="text-lg font-bold text-bark mb-2">Ollama non disponibile</h2>
      <p className="text-bark-secondary text-sm max-w-md mb-4">
        Il consulente intelligente usa Ollama per analizzare i tuoi progetti.
        Avvia Ollama per attivare questa funzione.
      </p>
      <div className="bg-cream-100 rounded-lg p-4 max-w-sm text-left">
        <p className="text-xs font-semibold text-bark mb-2">Come attivare:</p>
        <ol className="text-xs text-bark-secondary space-y-1.5">
          <li>1. Installa Ollama da <span className="font-mono text-ocean">ollama.com</span></li>
          <li>2. Apri il Terminale</li>
          <li>3. Scrivi: <span className="font-mono bg-white px-1.5 py-0.5 rounded text-bark">ollama serve</span></li>
          <li>4. Scarica un modello: <span className="font-mono bg-white px-1.5 py-0.5 rounded text-bark">ollama pull mistral-small</span></li>
          <li>5. Torna qui e premi Aggiorna</li>
        </ol>
      </div>
    </div>
  );
}

// ─── Project Selector ──────────────────────────────────────
function ProjectSelector({
  projects,
  selectedId,
  onSelect,
}: {
  projects: Project[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => onSelect(null)}
        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
          !selectedId
            ? 'bg-lobster text-white'
            : 'bg-cream-100 text-bark-secondary hover:bg-cream-200'
        }`}
      >
        Tutti i progetti
      </button>
      {projects.map((p) => (
        <button
          key={p.id}
          onClick={() => onSelect(p.id)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
            selectedId === p.id
              ? 'bg-lobster text-white'
              : 'bg-cream-100 text-bark-secondary hover:bg-cream-200'
          }`}
        >
          <span>{p.icon}</span>
          {p.name}
        </button>
      ))}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────
export function SmartAdvisor() {
  const { data: projects } = useProjects();
  const setActiveView = useStore((s) => s.setActiveView);
  const [status, setStatus] = useState<AdvisorStatus | null>(null);
  const [suggestions, setSuggestions] = useState<AdvisorSuggestion[]>([]);
  const [analysis, setAnalysis] = useState<AdvisorAnalysis | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [triageLoading, setTriageLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

  // Check Ollama status on mount
  useEffect(() => {
    checkOllamaStatus();
  }, []);

  const checkOllamaStatus = useCallback(async () => {
    setCheckingStatus(true);
    try {
      const result = await window.lobster?.advisor?.checkStatus();
      setStatus(result);
      if (result.available) {
        // Load cached suggestions and preferred model
        const [cached, preferredModel] = await Promise.all([
          window.lobster?.advisor?.getSuggestions(),
          window.lobster?.advisor?.getPreferredModel(),
        ]);
        setSuggestions(cached || []);
        if (preferredModel) setSelectedModel(preferredModel);
      }
    } catch {
      setStatus({ available: false, models: [] });
    } finally {
      setCheckingStatus(false);
    }
  }, []);

  const handleSelectModel = useCallback(async (model: string) => {
    setSelectedModel(model);
    try {
      await window.lobster?.advisor?.setModel(model);
    } catch (error) {
      console.error('Error setting model:', error);
    }
  }, []);

  const handleQuickTriage = useCallback(async () => {
    setTriageLoading(true);
    setAnalysis(null);
    try {
      const results = await window.lobster?.advisor?.quickTriage();
      if (results && results.length > 0) {
        setSuggestions((prev) => [...results, ...prev].slice(0, 50));
      } else {
        // Nessun suggerimento — mostra feedback
        setAnalysis({
          projectId: 'triage',
          projectName: 'Analisi Rapida',
          suggestions: [],
          summary: 'L\'analisi non ha prodotto suggerimenti. Potrebbe essere che Ollama sta ancora caricando il modello, oppure tutti i progetti sono in buono stato.',
          analyzedAt: new Date().toISOString(),
        });
      }
    } catch (error: any) {
      setAnalysis({
        projectId: 'triage',
        projectName: 'Analisi Rapida',
        suggestions: [],
        summary: `Errore nell'analisi rapida: ${error?.message || 'Errore sconosciuto'}`,
        analyzedAt: new Date().toISOString(),
      });
    } finally {
      setTriageLoading(false);
    }
  }, []);

  const handleAnalyzeProject = useCallback(async (projectId: string) => {
    setLoading(true);
    setAnalysis(null);
    try {
      const result = await window.lobster?.advisor?.analyzeProject(projectId);
      setAnalysis(result);
      if (result.suggestions && result.suggestions.length > 0) {
        setSuggestions((prev) => [
          ...result.suggestions,
          ...prev.filter((s: AdvisorSuggestion) => s.projectId !== projectId),
        ].slice(0, 50));
      }
    } catch (error: any) {
      // IPC fallback: show error as analysis result
      setAnalysis({
        projectId,
        projectName: 'Errore',
        suggestions: [],
        summary: error?.message || 'Errore sconosciuto durante l\'analisi. Controlla che Ollama sia attivo.',
        analyzedAt: new Date().toISOString(),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const filteredSuggestions = selectedProjectId
    ? suggestions.filter((s) => s.projectId === selectedProjectId)
    : suggestions;

  // Raggruppa suggerimenti per progetto
  const groupedSuggestions = useMemo(() => {
    const groups = new Map<string, AdvisorSuggestion[]>();
    for (const s of filteredSuggestions) {
      const key = s.projectName || 'Generale';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(s);
    }
    // Ordina: progetti con critici prima, poi per nome
    return Array.from(groups.entries()).sort((a, b) => {
      const aCrit = a[1].filter((s) => s.severity === 'critical').length;
      const bCrit = b[1].filter((s) => s.severity === 'critical').length;
      if (aCrit !== bCrit) return bCrit - aCrit;
      return a[0].localeCompare(b[0]);
    });
  }, [filteredSuggestions]);

  const handleNavigate = useCallback((view: string) => {
    setActiveView(view as any);
  }, [setActiveView]);

  // Loading state
  if (checkingStatus) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="animate-spin text-lobster" size={32} />
        <span className="ml-3 text-bark-secondary">Connessione a Ollama...</span>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-bark">🧠 Consulente Intelligente</h1>
          <p className="text-sm text-bark-secondary mt-1">
            {status?.available
              ? `Ollama attivo con ${status.models.length} modelli`
              : 'Il tuo assistente AI per analizzare i progetti'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {status?.available && (
            <button
              onClick={handleQuickTriage}
              disabled={triageLoading}
              className="btn-primary flex items-center gap-2 text-sm"
            >
              {triageLoading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Sparkles size={14} />
              )}
              Analisi Rapida
            </button>
          )}
          <button
            onClick={checkOllamaStatus}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            <RefreshCw size={14} />
            Aggiorna
          </button>
        </div>
      </div>

      {/* Ollama not available */}
      {!status?.available && <OllamaOffline />}

      {/* Ollama available — show advisor UI */}
      {status?.available && (
        <>
          {/* Models selector */}
          <div className="card mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Brain size={16} className="text-purple-500" />
              <span className="text-xs font-semibold text-bark">Seleziona il modello da usare:</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {status.models.map((m) => {
                const isActive = selectedModel === m || (!selectedModel && m === status.models[0]);
                return (
                  <button
                    key={m}
                    onClick={() => handleSelectModel(m)}
                    className={`text-[11px] px-2.5 py-1.5 rounded-md font-mono transition-all cursor-pointer border ${
                      isActive
                        ? 'bg-lobster text-white border-lobster shadow-sm'
                        : 'bg-cream-100 text-bark-secondary border-cream-200 hover:bg-cream-200 hover:border-cream-300'
                    }`}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
            {selectedModel && (
              <p className="text-[10px] text-bark-dim mt-2">
                Modello selezionato: <span className="font-mono font-medium text-bark">{selectedModel}</span>
              </p>
            )}
          </div>

          {/* Project selector */}
          {projects && projects.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-semibold text-bark mb-2">Seleziona un progetto da analizzare:</p>
              <ProjectSelector
                projects={projects}
                selectedId={selectedProjectId}
                onSelect={(id) => {
                  setSelectedProjectId(id);
                  if (id) handleAnalyzeProject(id);
                }}
              />
            </div>
          )}

          {/* Analysis in progress */}
          {loading && (
            <div className="card flex items-center gap-3 mb-4">
              <Loader2 className="animate-spin text-lobster" size={20} />
              <div>
                <p className="text-sm font-medium text-bark">Analisi in corso...</p>
                <p className="text-xs text-bark-dim">Il consulente sta esaminando il progetto</p>
              </div>
            </div>
          )}

          {/* Analysis result */}
          {analysis && !loading && (() => {
            const isError = analysis.suggestions.length === 0 && analysis.summary.startsWith('Errore');
            return (
              <div className={`card mb-4 border-l-4 ${isError ? 'border-l-status-yellow' : 'border-l-ocean'}`}>
                <div className="flex items-center gap-2 mb-2">
                  {isError
                    ? <AlertTriangle size={16} className="text-status-yellow" />
                    : <CheckCircle size={16} className="text-ocean" />
                  }
                  <h3 className="text-sm font-semibold text-bark">
                    {isError ? 'Problema con l\'analisi' : `Analisi: ${analysis.projectName}`}
                  </h3>
                  <span className="text-[10px] text-bark-dim ml-auto">
                    {new Date(analysis.analyzedAt).toLocaleTimeString('it-IT')}
                  </span>
                </div>
                <p className="text-xs text-bark-secondary">{analysis.summary}</p>
                {isError && (
                  <p className="text-[11px] text-bark-dim mt-2">
                    Verifica che Ollama sia in esecuzione e che almeno un modello sia scaricato.
                  </p>
                )}
              </div>
            );
          })()}

          {/* Suggestions grouped by project */}
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-bark">
              Suggerimenti {filteredSuggestions.length > 0 && `(${filteredSuggestions.length})`}
            </h3>
          </div>

          {filteredSuggestions.length === 0 ? (
            <div className="text-center py-12">
              <Brain size={32} className="text-bark-dim mx-auto mb-3" />
              <p className="text-bark-secondary text-sm">
                Nessun suggerimento al momento. Premi "Analisi Rapida" per iniziare.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {groupedSuggestions.map(([projectName, projectSuggestions]) => (
                <ProjectSuggestionGroup
                  key={projectName}
                  projectName={projectName}
                  suggestions={projectSuggestions}
                  onNavigate={handleNavigate}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
