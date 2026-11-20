import React, { useEffect, useState } from 'react';
import { Play } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

export function ResearchExperimentsPage() {
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [scenarioId, setScenarioId] = useState('sc_corridor_3j');
  const [steps, setSteps] = useState(100);
  const [seed, setSeed] = useState(42);
  const [running, setRunning] = useState(false);
  const [comparison, setComparison] = useState<any | null>(null);

  useEffect(() => {
    fetch('/api/scenarios')
      .then((r) => r.json())
      .then((rows) => {
        if (Array.isArray(rows)) setScenarios(rows);
      })
      .catch(() => {});
  }, []);

  const handleRunBenchmark = async () => {
    setRunning(true);
    try {
      const r = await fetch('/api/experiments/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarioId, steps, seed }),
      });
      if (r.ok) setComparison(await r.json());
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">
          Research & Reproducible Multi-Algorithm Experiments
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Evaluates Fixed-Time, Actuated, Density+Ambulance, Tabular Q, DQN, Dueling DQN, and Multi-Agent Coordinated RL under identical seeds in Python 3.11.
        </p>
      </div>

      {/* Benchmark Launcher */}
      <div className="p-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] flex flex-wrap items-end gap-4">
        <label className="block text-xs flex-1 min-w-[220px]">
          <span className="text-slate-500 block mb-1">Evaluation Scenario (Single or Multi-Junction)</span>
          <select
            value={scenarioId}
            onChange={(e) => setScenarioId(e.target.value)}
            className="w-full h-9 px-3 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
          >
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.intersections}J)
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs w-28">
          <span className="text-slate-500 block mb-1">Eval Steps</span>
          <input
            type="number"
            min={40}
            max={240}
            value={steps}
            onChange={(e) => setSteps(Number(e.target.value))}
            className="w-full h-9 px-3 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono"
          />
        </label>

        <label className="block text-xs w-28">
          <span className="text-slate-500 block mb-1">Random Seed</span>
          <input
            type="number"
            value={seed}
            onChange={(e) => setSeed(Number(e.target.value))}
            className="w-full h-9 px-3 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono"
          />
        </label>

        <button
          type="button"
          onClick={handleRunBenchmark}
          disabled={running}
          className="h-9 px-5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-2"
        >
          <Play className="w-3.5 h-3.5" />
          {running ? 'Running 7 Controllers...' : 'Run Benchmark Suite'}
        </button>
      </div>

      {/* Results */}
      {comparison ? (
        <div className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-3">
              <h2 className="font-display text-sm font-semibold">
                Average Waiting Time & Queue Comparison ({comparison.scenarioName})
              </h2>
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={comparison.results}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                    <XAxis dataKey="algorithm" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="avg_wait_s" name="Avg Wait (s)" fill="#06B6D4" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="avg_queue" name="Avg Queue (veh)" fill="#F59E0B" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-3">
              <h2 className="font-display text-sm font-semibold">Network Throughput (veh/hr)</h2>
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={comparison.results}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                    <XAxis dataKey="algorithm" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="throughput_vph" name="Throughput (veh/hr)" fill="#10B981" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="p-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-400">
                <tr>
                  <th className="py-2.5 pr-3">Controller</th>
                  <th className="py-2.5 px-3 text-right">Avg Wait (s)</th>
                  <th className="py-2.5 px-3 text-right">Avg Queue</th>
                  <th className="py-2.5 px-3 text-right">Max Queue</th>
                  <th className="py-2.5 px-3 text-right">Throughput (vph)</th>
                  <th className="py-2.5 px-3 text-right">Completed</th>
                  <th className="py-2.5 px-3 text-right">Est CO2 (g)</th>
                  <th className="py-2.5 pl-3 text-right">Guard Overrides</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {comparison.results.map((r: any) => (
                  <tr key={r.algorithm}>
                    <td className="py-2.5 pr-3 font-semibold uppercase text-cyan-600 dark:text-cyan-400">
                      {r.algorithm}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{r.avg_wait_s}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{r.avg_queue}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{r.max_queue}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{r.throughput_vph}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{r.total_departures}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{r.co2_emissions_g}</td>
                    <td className="py-2.5 pl-3 text-right tabular-nums">{r.safety_overrides}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="p-10 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111827] text-center space-y-2">
          <div className="font-display text-base font-semibold">Reproducible Experiment Matrix Ready</div>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-lg mx-auto">
            Select a single-junction or 2–3 junction corridor scenario above and click Run Benchmark Suite to execute all 7 controllers under the same random seed.
          </p>
        </div>
      )}
    </div>
  );
}
