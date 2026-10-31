import React, { useState } from 'react';
import { CheckCircle2, Copy, Database, ExternalLink, KeyRound, Server, Trash2, X } from 'lucide-react';
import { clearRuntimeSupabaseConfig, getSupabaseConfig, saveRuntimeSupabaseConfig } from '../lib/supabase';

interface SupabaseConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export const SupabaseConfigModal: React.FC<SupabaseConfigModalProps> = ({
  isOpen,
  onClose,
  onSaved,
}) => {
  const current = getSupabaseConfig();
  const [url, setUrl] = useState(current.isConfigured ? current.url : '');
  const [anonKey, setAnonKey] = useState(current.isConfigured ? current.anonKey : '');
  const [error, setError] = useState('');
  const [copiedNote, setCopiedNote] = useState(false);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleanUrl = url.trim();
    const cleanKey = anonKey.trim();

    if (!cleanUrl || !cleanUrl.startsWith('https://')) {
      setError('Please enter a valid Supabase Project URL starting with https://');
      return;
    }
    if (!cleanKey || cleanKey.length < 20) {
      setError('Please enter your valid Supabase public anon key.');
      return;
    }

    saveRuntimeSupabaseConfig(cleanUrl, cleanKey);
    onSaved();
    onClose();
  };

  const handleReset = () => {
    clearRuntimeSupabaseConfig();
    setUrl('');
    setAnonKey('');
    onSaved();
  };

  const handleCopyEnvTemplate = async () => {
    const content = `VITE_SUPABASE_URL="${url.trim() || 'https://your-project-id.supabase.co'}"\nVITE_SUPABASE_ANON_KEY="${anonKey.trim() || 'your-public-anon-key'}"`;
    await navigator.clipboard.writeText(content);
    setCopiedNote(true);
    setTimeout(() => setCopiedNote(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 overflow-hidden">
      <div className="w-full max-w-lg max-h-dvh-modal flex flex-col overflow-hidden rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl">
        <div className="shrink-0 flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                OSA Supabase Connection
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Connect your real Supabase PostgreSQL, Auth, Realtime &amp; Storage
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-4 pb-2">
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 p-4 text-xs text-slate-600 dark:text-slate-300 space-y-2">
              <p className="font-semibold text-slate-900 dark:text-white">
                Setup Checklist for Production Supabase:
              </p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Create a Supabase project and run <code className="font-mono text-blue-600 dark:text-blue-400">supabase/schema.sql</code> in the SQL Editor.</li>
                <li>Copy your <strong>Project URL</strong> and <strong>anon public key</strong> from Project Settings &rarr; API.</li>
                <li>Set <code className="font-mono">VITE_SUPABASE_URL</code> and <code className="font-mono">VITE_SUPABASE_ANON_KEY</code> in <code className="font-mono">.env</code> or enter them below.</li>
              </ol>
            </div>

            {error && (
              <div className="rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800/70 px-4 py-3 text-xs text-red-700 dark:text-red-300">
                {error}
              </div>
            )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Supabase Project URL (VITE_SUPABASE_URL)
            </label>
            <div className="relative">
              <Server className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://xyzcompany.supabase.co"
                required
                className="w-full pl-10 pr-4 py-2.5 min-h-[44px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Supabase Anon Public Key (VITE_SUPABASE_ANON_KEY)
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                value={anonKey}
                onChange={(e) => setAnonKey(e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                required
                className="w-full pl-10 pr-4 py-2.5 min-h-[44px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600 font-mono"
              />
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Never enter a service-role secret key here. Use only the safe public <code className="font-mono">anon</code> key.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            <button
              type="button"
              onClick={handleCopyEnvTemplate}
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {copiedNote ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  <span>Copied .env format</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copy .env Snippet</span>
                </>
              )}
            </button>

            {current.source === 'runtime' && (
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                <span>Clear Saved Keys</span>
              </button>
            )}
          </div>
          </div>

          <div className="shrink-0 flex items-center gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 min-h-[44px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm transition-colors inline-flex items-center justify-center gap-2"
            >
              <span>Save &amp; Connect</span>
              <ExternalLink className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
