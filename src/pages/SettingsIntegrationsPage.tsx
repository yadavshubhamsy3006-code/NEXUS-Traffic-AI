import React, { useEffect, useState } from 'react';
import { Database, CheckCircle2, RefreshCw, Copy, Terminal } from 'lucide-react';
import { useNexus } from '../context/NexusContext';

export function SettingsIntegrationsPage() {
  const { theme, toggleTheme, refreshHealth } = useNexus();

  const [supaInfo, setSupaInfo] = useState<any>(null);
  const [supaUrl, setSupaUrl] = useState('');
  const [supaKey, setSupaKey] = useState('');
  const [supaMsg, setSupaMsg] = useState('');
  const [syncMsg, setSyncMsg] = useState('');
  const [copiedSql, setCopiedSql] = useState(false);

  const [sumoPath, setSumoPath] = useState('sumo');
  const [sumoStatus, setSumoStatus] = useState<any>(null);

  const loadIntegrations = async () => {
    const [supaR, sumoR] = await Promise.all([
      fetch('/api/integrations/supabase').then((r) => r.json()),
      fetch('/api/sumo/detect').then((r) => r.json()),
    ]);
    setSupaInfo(supaR);
    setSumoStatus(sumoR);
  };

  useEffect(() => {
    loadIntegrations();
  }, []);

  const handleSaveSupabase = async (e: React.FormEvent) => {
    e.preventDefault();
    setSupaMsg('Testing Supabase PostgreSQL connection...');
    const r = await fetch('/api/integrations/supabase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: supaUrl, anonKey: supaKey }),
    });
    const res = await r.json();
    setSupaMsg(res.message || res.error || 'Updated.');
    loadIntegrations();
    refreshHealth();
  };

  const handleSyncSupabase = async () => {
    setSyncMsg('Syncing local SQLite scenarios, runs, and models to Supabase...');
    const r = await fetch('/api/integrations/supabase/sync', { method: 'POST' });
    const res = await r.json();
    if (r.ok) {
      setSyncMsg(`Synced ${res.synced} records to Supabase PostgreSQL.`);
    } else {
      setSyncMsg(`Sync error: ${res.error}`);
    }
  };

  const handleVerifySumo = async () => {
    const r = await fetch(`/api/sumo/detect?path=${encodeURIComponent(sumoPath)}`);
    if (r.ok) setSumoStatus(await r.json());
    refreshHealth();
  };

  const handleCopySql = () => {
    if (supaInfo?.schemaSql) {
      navigator.clipboard.writeText(supaInfo.schemaSql);
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 2000);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">
          Settings, Supabase PostgreSQL & SUMO Integrations
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Local-first SQLite persistence is active automatically. Connect an optional free-tier Supabase PostgreSQL + PostGIS project or local Eclipse SUMO installation.
        </p>
      </div>

      {/* Supabase PostgreSQL Configuration */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <form
          onSubmit={handleSaveSupabase}
          className="xl:col-span-6 p-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold flex items-center gap-2">
              <Database className="w-4 h-4 text-emerald-500" /> Supabase PostgreSQL Integration
            </h2>
            <span className="font-mono text-xs text-slate-400">
              {supaInfo?.connected ? 'Connected' : 'Local SQLite Active'}
            </span>
          </div>

          <p className="text-xs text-slate-600 dark:text-slate-400">
            Status: <strong className="text-slate-900 dark:text-white">{supaInfo?.message || 'Checking...'}</strong>
          </p>

          <div className="space-y-3 text-xs">
            <label className="block">
              <span className="text-slate-500 block mb-1">Supabase Project URL</span>
              <input
                type="url"
                required
                placeholder="https://your-project-id.supabase.co"
                value={supaUrl}
                onChange={(e) => setSupaUrl(e.target.value)}
                className="w-full h-9 px-3 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono"
              />
            </label>

            <label className="block">
              <span className="text-slate-500 block mb-1">Supabase Anon / Public Key</span>
              <input
                type="password"
                required
                placeholder="eyJhbGciOi..."
                value={supaKey}
                onChange={(e) => setSupaKey(e.target.value)}
                className="w-full h-9 px-3 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold"
            >
              Connect & Test Supabase
            </button>
            <button
              type="button"
              onClick={handleSyncSupabase}
              disabled={!supaInfo?.connected}
              className="px-4 py-2 rounded-lg border border-emerald-500/40 text-emerald-600 dark:text-emerald-400 disabled:opacity-40 text-xs font-semibold flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Sync Local Data to Supabase
            </button>
          </div>

          {supaMsg && <div className="text-xs font-mono text-cyan-600 dark:text-cyan-400">{supaMsg}</div>}
          {syncMsg && <div className="text-xs font-mono text-emerald-600 dark:text-emerald-400">{syncMsg}</div>}
        </form>

        {/* PostgreSQL + PostGIS Schema SQL */}
        <div className="xl:col-span-6 p-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold">Supabase PostgreSQL + PostGIS Schema SQL</h2>
            <button
              type="button"
              onClick={handleCopySql}
              className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 text-xs font-medium flex items-center gap-1"
            >
              {copiedSql ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedSql ? 'Copied' : 'Copy SQL'}
            </button>
          </div>
          <pre className="p-3 rounded bg-slate-950 text-slate-200 font-mono text-[11px] overflow-x-auto max-h-64">
            {supaInfo?.schemaSql || '-- Loading schema...'}
          </pre>
        </div>
      </div>

      {/* SUMO Verification & Theme Preferences */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="p-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-3">
          <h2 className="font-display text-base font-semibold flex items-center gap-2">
            <Terminal className="w-4 h-4 text-cyan-500" /> Eclipse SUMO Binary Configuration
          </h2>
          <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
            Active Engine: {sumoStatus?.sumo_installed ? 'SUMO + TraCI' : 'Python 3.11 Microscopic Local Fallback'}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={sumoPath}
              onChange={(e) => setSumoPath(e.target.value)}
              placeholder="sumo or /usr/bin/sumo"
              className="flex-1 h-9 px-3 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-mono"
            />
            <button
              type="button"
              onClick={handleVerifySumo}
              className="h-9 px-4 rounded-lg bg-slate-900 dark:bg-slate-700 text-white text-xs font-semibold"
            >
              Detect SUMO
            </button>
          </div>
          <div className="text-[11px] font-mono text-slate-400">
            CLI Verify: <code>{sumoStatus?.verify_command || 'sumo --version'}</code>
          </div>
        </div>

        <div className="p-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-3">
          <h2 className="font-display text-base font-semibold">Interface Theme & Free Open APIs</h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Uses OpenStreetMap Tiles, Nominatim Geocoder, Overpass Road Topology API, and Open-Meteo Live Weather API—all free without API keys.
          </p>
          <button
            type="button"
            onClick={toggleTheme}
            className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold"
          >
            Switch to {theme === 'dark' ? 'Light Theme' : 'Dark Midnight Theme'}
          </button>
        </div>
      </div>
    </div>
  );
}
