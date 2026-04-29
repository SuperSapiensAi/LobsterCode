// ============================================================
// LOBSTER UTILITY — Profile Editor (MY-PROFILE.md)
// Gestione del file profilo personale per AI
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import { useStore } from '../../store';
import {
  FileText, Save, Plus, Edit3, Eye, Loader2, Copy,
  FolderOpen, RefreshCw, ArrowLeft, User
} from 'lucide-react';

export function ProfileEditor() {
  const { setActiveView, showToast } = useStore();

  const [content, setContent] = useState('');
  const [exists, setExists] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [profilePath, setProfilePath] = useState('');

  // Load profile on mount
  useEffect(() => {
    setLoading(true);
    window.lobster?.profile?.get?.()
      .then((result: any) => {
        setExists(result?.exists || false);
        setContent(result?.content || '');
        setProfilePath(result?.path || '');
      })
      .catch(() => {
        setExists(false);
        setContent('');
      })
      .finally(() => setLoading(false));
  }, []);

  const handleGenerate = useCallback(async () => {
    setLoading(true);
    try {
      const result = await window.lobster?.profile?.generate?.();
      if (result) {
        setExists(true);
        setContent(result.content);
        setEditing(true);
        setProfilePath(result.path || '');
        showToast(
          result.wasGenerated ? 'MY-PROFILE.md creato!' : 'MY-PROFILE.md già esistente',
          'success'
        );
      }
    } catch {
      showToast('Errore generando il profilo', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const handleSave = useCallback(async () => {
    if (!content) return;
    setSaving(true);
    try {
      await window.lobster?.profile?.save?.(content);
      setDirty(false);
      showToast('Profilo salvato', 'success');
    } catch {
      showToast('Errore salvando il profilo', 'error');
    } finally {
      setSaving(false);
    }
  }, [content, showToast]);

  const handleCopyPath = useCallback(() => {
    if (!profilePath) return;
    navigator.clipboard.writeText(profilePath).then(() => {
      showToast('Percorso copiato — puoi condividerlo con le AI', 'success');
    }).catch(() => {
      showToast('Errore copiando il percorso', 'error');
    });
  }, [profilePath, showToast]);

  const handleCopyContent = useCallback(() => {
    if (!content) return;
    navigator.clipboard.writeText(content).then(() => {
      showToast('Contenuto copiato negli appunti', 'success');
    }).catch(() => {
      showToast('Errore copiando il contenuto', 'error');
    });
  }, [content, showToast]);

  const handleOpenFolder = useCallback(() => {
    if (!profilePath) return;
    const dir = profilePath.substring(0, profilePath.lastIndexOf('/'));
    window.lobster?.system?.openPath?.(dir);
  }, [profilePath]);

  return (
    <div className="p-6 max-w-[900px] mx-auto">
      {/* Back */}
      <button
        onClick={() => setActiveView('dashboard')}
        className="flex items-center gap-2 text-bark-secondary hover:text-bark transition-colors mb-4"
      >
        <ArrowLeft size={18} />
        <span className="text-sm">Torna alla Dashboard</span>
      </button>

      {/* Header */}
      <div className="card mb-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl flex-shrink-0 bg-lobster/10 border-2 border-lobster/30">
            <User size={28} className="text-lobster" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-bark">Il Mio Profilo</h1>
            <p className="text-sm text-bark-secondary mt-1">
              Un file .md con chi sei, come lavori e le tue regole per le AI.
              Puoi condividerlo con Claude, ChatGPT, Copilot e qualsiasi AI.
            </p>
            {profilePath && (
              <p className="text-[10px] text-bark-dim font-mono mt-2 truncate" title={profilePath}>
                {profilePath.replace(/^\/Users\/[^/]+/, '~')}
              </p>
            )}
          </div>
        </div>

        {/* Action bar */}
        {exists && (
          <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-cream-200">
            <button onClick={handleCopyContent} className="btn-secondary flex items-center gap-1.5 text-xs px-3 py-1.5">
              <Copy size={14} /> Copia Contenuto
            </button>
            <button onClick={handleCopyPath} className="btn-secondary flex items-center gap-1.5 text-xs px-3 py-1.5">
              <FolderOpen size={14} /> Copia Percorso
            </button>
            <button onClick={handleOpenFolder} className="btn-secondary flex items-center gap-1.5 text-xs px-3 py-1.5">
              <FolderOpen size={14} /> Apri Cartella
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <FileText size={18} className="text-lobster" />
          <h2 className="text-sm font-semibold text-bark">MY-PROFILE.md</h2>
          <div className="flex items-center gap-1 ml-auto">
            {exists && !editing && (
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-bark-dim hover:text-bark hover:bg-cream-100 transition-colors"
              >
                <Edit3 size={12} /> Modifica
              </button>
            )}
            {editing && (
              <>
                <button
                  onClick={() => { setEditing(false); setDirty(false); }}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-bark-dim hover:text-bark hover:bg-cream-100 transition-colors"
                >
                  <Eye size={12} /> Anteprima
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !dirty}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-white bg-lobster hover:bg-lobster-light disabled:opacity-50 transition-colors"
                >
                  {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                  {saving ? 'Salvo...' : 'Salva'}
                </button>
              </>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-8 justify-center">
            <Loader2 size={16} className="animate-spin text-bark-dim" />
            <span className="text-xs text-bark-dim">Caricamento profilo...</span>
          </div>
        ) : !exists ? (
          <div className="flex flex-col items-center py-8 text-center">
            <User size={40} className="text-bark-dim mb-3 opacity-30" />
            <p className="text-sm text-bark-secondary mb-1">Nessun profilo creato ancora.</p>
            <p className="text-xs text-bark-dim mb-4 max-w-md">
              Crea un file MY-PROFILE.md con il tuo profilo, i tuoi progetti attivi
              e le tue regole per le AI. Lo troverai in ~/Documents/Lobster/.
            </p>
            <button onClick={handleGenerate} className="btn-primary flex items-center gap-1.5 text-sm px-5 py-2">
              <Plus size={16} /> Crea Il Mio Profilo
            </button>
          </div>
        ) : editing ? (
          <textarea
            value={content}
            onChange={(e) => { setContent(e.target.value); setDirty(true); }}
            className="w-full h-[500px] bg-cream-50 border border-cream-200 rounded-lg p-4 text-sm text-bark font-mono resize-y focus:outline-none focus:ring-2 focus:ring-lobster/30 focus:border-lobster/50"
            placeholder="Scrivi il tuo profilo qui..."
            spellCheck={false}
          />
        ) : (
          <div
            className="bg-cream-50 rounded-lg p-4 max-h-[500px] overflow-y-auto cursor-pointer hover:bg-cream-100 transition-colors"
            onClick={() => setEditing(true)}
            title="Clicca per modificare"
          >
            <pre className="whitespace-pre-wrap text-xs font-mono text-bark-secondary leading-relaxed">{content}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
