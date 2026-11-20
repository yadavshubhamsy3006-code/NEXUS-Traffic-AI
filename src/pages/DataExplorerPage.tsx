import React, { useEffect, useState } from 'react';
import { Download, Search } from 'lucide-react';
import { useNexus } from '../context/NexusContext';

export function DataExplorerPage() {
  const { telemetry } = useNexus();
  const [runs, setRuns] = useState<any[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>('');
  const [runTelemetry, setRunTelemetry] = useState<any[]>([]);
  const [filterText, setFilterText] = useState('');

  useEffect(() => {
    fetch('/api/runs')
      .then((r) => r.json())
      .then((rows) => {
        if (Array.isArray(rows)) {
          setRuns(rows);
          if (rows[0] && !selectedRunId) setSelectedRunId(rows[0].id);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedRunId) return;
    fetch(`/api/telemetry?runId=${encodeURIComponent(selectedRunId)}`)
      .then((r) => r.json())
      .then((rows) => {
        if (Array.isArray(rows)) setRunTelemetry(rows);
      })
      .catch(() => {});
  }, [selectedRunId, telemetry.length]);

  const filteredRuns = runs.filter(
    (r) =>
      r.scenario_name.toLowerCase().includes(filterText.toLowerCase()) ||
      r.controller_type.toLowerCase().includes(filterText.toLowerCase()) ||
      r.city_name.toLowerCase().includes(filterText.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            Data Explorer (SQLite & Supabase Records)
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Inspect persisted simulation runs and step-level telemetry stored in the relational database.
          </p>
        </div>

        <a
          href={`/api/telemetry/export${selectedRunId ? `?runId=${encodeURIComponent(selectedRunId)}` : ''}`}
          className="px-3.5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center gap-1.5"
        >
          <Download className="w-3.5 h-3.5" /> Download Run CSV
        </a>
      </div>

      {/* Runs Table */}
      <div className="p-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-sm font-semibold">Simulation Run Archive ({filteredRuns.length})</h2>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Filter by scenario, controller, city..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="h-8 pl-8 pr-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs w-64"
            />
          </div>
        </div>

        <div className="overflow-x-auto max-h-[260px]">
          {filteredRuns.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500">
              No simulation runs recorded yet. Launch a simulation from Overview or Simulation Lab.
            </div>
          ) : (
            <table className="w-full text-left text-xs font-mono">
              <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-400">
                <tr>
                  <th className="py-2 pr-3">Run ID</th>
                  <th className="py-2 px-2">Scenario</th>
                  <th className="py-2 px-2">City</th>
                  <th className="py-2 px-2">Controller</th>
                  <th className="py-2 px-2 text-right">Duration</th>
                  <th className="py-2 px-2 text-right">Avg Wait</th>
                  <th className="py-2 pl-2 text-right">Throughput</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredRuns.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setSelectedRunId(r.id)}
                    className={`cursor-pointer ${
                      selectedRunId === r.id ? 'bg-cyan-500/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <td className="py-2 pr-3 text-cyan-600 dark:text-cyan-400">{r.id.slice(0, 14)}</td>
                    <td className="py-2 px-2 font-sans">{r.scenario_name}</td>
                    <td className="py-2 px-2 font-sans">{r.city_name}</td>
                    <td className="py-2 px-2 uppercase">{r.controller_type}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{r.sim_time_s}s</td>
                    <td className="py-2 px-2 text-right tabular-nums">{r.avg_wait_s}s</td>
                    <td className="py-2 pl-2 text-right tabular-nums">{Math.round(r.throughput_vph)} vph</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Telemetry Rows for Selected Run */}
      <div className="p-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-3">
        <h2 className="font-display text-sm font-semibold">
          Step Telemetry ({runTelemetry.length} Samples{selectedRunId ? ` · ${selectedRunId}` : ''})
        </h2>
        <div className="overflow-x-auto max-h-[300px]">
          {runTelemetry.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500">Select a simulation run above to inspect telemetry rows.</div>
          ) : (
            <table className="w-full text-left text-xs font-mono">
              <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-400">
                <tr>
                  <th className="py-2 pr-3">t (s)</th>
                  <th className="py-2 px-2 text-right">Vehicles</th>
                  <th className="py-2 px-2 text-right">Avg Wait (s)</th>
                  <th className="py-2 px-2 text-right">Avg Queue</th>
                  <th className="py-2 px-2 text-right">Throughput</th>
                  <th className="py-2 px-2 text-right">Departures</th>
                  <th className="py-2 px-2 text-right">CO2 (g)</th>
                  <th className="py-2 pl-2 text-right">Reward</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {runTelemetry.map((row, idx) => (
                  <tr key={idx}>
                    <td className="py-1.5 pr-3 tabular-nums">{row.sim_time}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{row.vehicles_in_network}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{row.avg_wait_time_s}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{row.avg_queue_length}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{Math.round(row.throughput_vph)}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{row.total_departures}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{row.co2_emissions_g}</td>
                    <td className="py-1.5 pl-2 text-right tabular-nums">{row.total_reward}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
