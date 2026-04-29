import React, { useState, useEffect, useCallback } from 'react';
import { useProjects } from '../../hooks/useLobster';
import { useStore } from '../../store';
import type { Project } from '@shared/types';
import {
  FlaskConical, Loader2, RefreshCw, CheckCircle, XCircle,
  AlertTriangle, Clock, Globe, Zap, Play, PlayCircle,
  ChevronDown, ChevronUp, SkipForward, Copy, Check, Clipboard,
  Terminal
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────
interface UICheck {
  name: string;
  status: 'pass' | 'fail' | 'error';
  message: string;
  details?: string;
}

interface UITestResult {
  id: string;
  projectId: string;
  projectName: string;
  url: string;
  status: 'pass' | 'fail' | 'error' | 'skipped';
  checks: UICheck[];
  duration: number;
  timestamp: string;
  humanSummary: string;
}

// ─── Status Icon ───────────────────────────────────────────
function StatusIcon({ status, size = 16 }: { status: string; size?: number }) {
  switch (status) {
    case 'pass':
      return <CheckCircle size={size} className="text-status-green" />;
    case 'fail':
      return <XCircle size={size} className="text-status-red" />;
    case 'error':
      return <AlertTriangle size={size} className="text-status-yellow" />;
    case 'skipped':
      return <SkipForward size={size} className="text-bark-dim" />;
    default:
      return <Clock size={size} className="text-bark-dim" />;
  }
}

// ─── Generate Claude Fix Prompt ───────────────────────────
function generateClaudePrompt(result: UITestResult): string {
  const failedChecks = result.checks.filter((c) => c.status === 'fail' || c.status === 'error');
  if (failedChecks.length === 0) return '';

  // Analisi automatica dei problemi (il sistema fa l'analisi, il prompt chiede solo il fix)
  const problems = failedChecks.map((c) => {
    let line = `- **${c.name}**: ${c.message}`;
    if (c.details) line += `\n  Causa probabile: ${c.details}`;
    return line;
  }).join('\n');

  const passedChecks = result.checks.filter((c) => c.status === 'pass');
  const passedSummary = passedChecks.length > 0
    ? `\nCheck superati (${passedChecks.length}): ${passedChecks.map((c) => c.name).join(', ')}`
    : '';

  return `Risolvi questi ${failedChecks.length} problemi trovati nel progetto "${result.projectName}" (${result.url}):

${problems}
${passedSummary}

Per ogni problema:
1. Mostrami il codice esatto da modificare (file e riga)
2. Dammi il codice corretto da sostituire, pronto da copiare
3. Se serve installare qualcosa, dammi il comando esatto

Non servono spiegazioni lunghe — vai dritto alla soluzione.`;
}

// ─── Claude Prompt Box ────────────────────────────────────
function ClaudePromptBox({ result }: { result: UITestResult }) {
  const [copied, setCopied] = useState(false);
  const openCodeWithPrompt = useStore((s) => s.openCodeWithPrompt);
  const prompt = generateClaudePrompt(result);

  if (!prompt) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFixInCode = async () => {
    // Recupera il path del progetto
    const projects = await (window as any).lobster.projects.getAll();
    const project = projects?.find((p: any) => p.id === result.projectId);
    const projectPath = project?.path || '~';
    // Naviga alla vista LobsterCode con il prompt
    openCodeWithPrompt(projectPath, prompt);
  };

  return (
    <div className="mt-3 bg-sidebar rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold text-cream-400 flex items-center gap-1.5">
          <Clipboard size={12} />
          Problemi trovati — risolvi automaticamente
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleFixInCode}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-medium bg-lobster text-white hover:bg-lobster-dark transition-colors"
          >
            <Terminal size={10} />
            Fix in Code
          </button>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-lobster/20 text-lobster-light hover:bg-lobster/30 transition-colors"
          >
            {copied ? <Check size={10} /> : <Copy size={10} />}
            {copied ? 'Copiato!' : 'Copia'}
          </button>
        </div>
      </div>
      <pre className="text-[10px] text-cream-400 font-mono whitespace-pre-wrap max-h-32 overflow-y-auto leading-relaxed">
        {prompt}
      </pre>
    </div>
  );
}

// ─── Check Row ─────────────────────────────────────────────
function CheckRow({ check }: { check: UICheck }) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      <StatusIcon status={check.status} size={14} />
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-bark">{check.name}</span>
        </div>
        <p className="text-[11px] text-bark-secondary">{check.message}</p>
        {check.details && (
          <p className="text-[10px] text-bark-dim mt-0.5">{check.details}</p>
        )}
      </div>
    </div>
  );
}

// ─── Test Result Card ──────────────────────────────────────
function TestResultCard({ result }: { result: UITestResult }) {
  const [expanded, setExpanded] = useState(result.status !== 'pass');

  const statusColors: Record<string, string> = {
    pass: 'border-l-status-green',
    fail: 'border-l-status-red',
    error: 'border-l-status-yellow',
    skipped: 'border-l-bark-dim',
  };

  const statusLabels: Record<string, string> = {
    pass: 'Superato',
    fail: 'Problemi',
    error: 'Errore',
    skipped: 'Saltato',
  };

  return (
    <div className={`card border-l-4 ${statusColors[result.status] || 'border-l-bark-dim'}`}>
      <div
        className="flex items-center gap-3 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <StatusIcon status={result.status} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-bark">{result.projectName}</h4>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
              result.status === 'pass' ? 'bg-green-50 text-status-green' :
              result.status === 'fail' ? 'bg-red-50 text-status-red' :
              'bg-yellow-50 text-status-yellow'
            }`}>
              {statusLabels[result.status]}
            </span>
          </div>
          <p className="text-xs text-bark-secondary">{result.humanSummary}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-bark-dim">
          {result.url && (
            <span className="font-mono text-ocean">{new URL(result.url).host}</span>
          )}
          {result.duration > 0 && (
            <span>{result.duration}ms</span>
          )}
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </div>

      {expanded && result.checks.length > 0 && (
        <div className="mt-3 pt-3 border-t border-cream-200 space-y-0.5">
          {result.checks.map((check, i) => (
            <CheckRow key={i} check={check} />
          ))}

          {/* Prompt Claude per risolvere i problemi trovati */}
          {(result.status === 'fail' || result.status === 'error') && (
            <ClaudePromptBox result={result} />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Manual URL Test ───────────────────────────────────────
function ManualUrlTest() {
  const [url, setUrl] = useState('');
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<UITestResult | null>(null);

  const handleTest = async () => {
    if (!url.trim()) return;
    setTesting(true);
    setResult(null);
    try {
      const testResult = await window.lobster.uitest.testUrl(url);
      setResult(testResult);
    } catch (error) {
      console.error('Manual test failed:', error);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="card mb-4">
      <div className="flex items-center gap-2 mb-3">
        <Globe size={16} className="text-ocean" />
        <span className="text-xs font-semibold text-bark">Test Manuale</span>
      </div>
      <div className="flex gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="http://localhost:3000"
          className="flex-1 px-3 py-2 bg-white border border-cream-300 rounded-lg text-sm text-bark placeholder:text-bark-dim focus:outline-none focus:ring-2 focus:ring-lobster/20 focus:border-lobster transition-colors font-mono"
          onKeyDown={(e) => e.key === 'Enter' && handleTest()}
        />
        <button
          onClick={handleTest}
          disabled={testing || !url.trim()}
          className="btn-primary flex items-center gap-2 text-sm"
        >
          {testing ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
          Testa
        </button>
      </div>
      {result && (
        <div className="mt-3">
          <TestResultCard result={result} />
        </div>
      )}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────
export function UITestAgent() {
  const { data: projects } = useProjects();
  const [results, setResults] = useState<UITestResult[]>([]);
  const [testingAll, setTestingAll] = useState(false);
  const [testingProject, setTestingProject] = useState<string | null>(null);

  // Load cached results on mount
  useEffect(() => {
    window.lobster.uitest.getResults().then(setResults).catch(() => {});
  }, []);

  const handleTestAll = useCallback(async () => {
    setTestingAll(true);
    try {
      const newResults = await window.lobster.uitest.testAll();
      setResults(newResults);
    } catch (error) {
      console.error('Test all failed:', error);
    } finally {
      setTestingAll(false);
    }
  }, []);

  const handleTestProject = useCallback(async (projectId: string) => {
    setTestingProject(projectId);
    try {
      const result = await window.lobster.uitest.testProject(projectId);
      setResults((prev) => [
        result,
        ...prev.filter((r) => r.projectId !== projectId),
      ]);
    } catch (error) {
      console.error('Project test failed:', error);
    } finally {
      setTestingProject(null);
    }
  }, []);

  const passCount = results.filter((r) => r.status === 'pass').length;
  const failCount = results.filter((r) => r.status === 'fail' || r.status === 'error').length;

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-bark">🧪 Test UI Automatici</h1>
          <p className="text-sm text-bark-secondary mt-1">
            {results.length > 0
              ? `${passCount} ok, ${failCount} problemi su ${results.length} test`
              : 'Verifica automatica che i tuoi siti web funzionino'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleTestAll}
            disabled={testingAll}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            {testingAll ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <PlayCircle size={14} />
            )}
            Testa Tutti
          </button>
        </div>
      </div>

      {/* Manual URL test */}
      <ManualUrlTest />

      {/* Project test buttons */}
      {projects && projects.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-semibold text-bark mb-2">Testa un singolo progetto:</p>
          <div className="flex flex-wrap gap-2">
            {projects
              .filter((p) => p.status === 'running' || p.ports.length > 0)
              .map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleTestProject(p.id)}
                  disabled={testingProject === p.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-cream-100 text-bark-secondary hover:bg-cream-200 transition-colors disabled:opacity-50"
                >
                  {testingProject === p.id ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Play size={12} />
                  )}
                  <span>{p.icon}</span>
                  {p.name}
                </button>
              ))}
            {projects.filter((p) => p.status === 'running' || p.ports.length > 0).length === 0 && (
              <p className="text-xs text-bark-dim italic">Nessun progetto attivo da testare</p>
            )}
          </div>
        </div>
      )}

      {/* Test in progress */}
      {testingAll && (
        <div className="card flex items-center gap-3 mb-4">
          <Loader2 className="animate-spin text-lobster" size={20} />
          <div>
            <p className="text-sm font-medium text-bark">Test in corso...</p>
            <p className="text-xs text-bark-dim">Sto verificando tutti i progetti attivi</p>
          </div>
        </div>
      )}

      {/* Results */}
      {results.length === 0 && !testingAll ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FlaskConical size={48} className="text-bark-dim mb-4" />
          <h2 className="text-lg font-bold text-bark mb-2">Nessun test eseguito</h2>
          <p className="text-bark-secondary text-sm max-w-md">
            Premi "Testa Tutti" per verificare automaticamente che tutti i tuoi siti web siano raggiungibili e funzionanti.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {results.map((r) => (
            <TestResultCard key={r.id} result={r} />
          ))}
        </div>
      )}
    </div>
  );
}
