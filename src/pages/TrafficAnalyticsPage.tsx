import React, { useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { useNexus } from '../context/NexusContext';

export function TrafficAnalyticsPage() {
  const { telemetry, snapshot } = useNexus();
  const [runs, setRuns] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/runs')
      .then((r) => r.json())
      .then((rows) => {
        if (Array.isArray(rows)) setRuns(rows);
      })
      .catch(() => {});
  }, [snapshot?.sim_time]);

  // Phase distribution from telemetry
  const phaseCounts: Record<string, number> = {
    NS_THROUGH: 0,
    NS_LEFT: 0,
    EW_THROUGH: 0,
    EW_LEFT: 0,
    PED_WALK: 0,
  };
  const phaseNames = ['NS_THROUGH', 'NS_LEFT', 'EW_THROUGH', 'EW_LEFT', 'PED_WALK'];
  for (const pt of telemetry) {
    const nm = phaseNames[pt.active_phase] || 'NS_THROUGH';
    phaseCounts[nm] += 2;
  }
  const phaseData = Object.entries(phaseCounts).map(([phase, seconds]) => ({ phase, seconds }));

  const junctionPerf = (snapshot?.junctions || []).map((j) => ({
    junction: j.junction_id,
    totalQueue: j.queues.N + j.queues.S + j.queues.E + j.queues.W,
    avgWait: Number(
      ((j.wait_by_approach.N + j.wait_by_approach.S + j.wait_by_approach.E + j.wait_by_approach.W) / 4).toFixed(1)
    ),
    switches: j.switches,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">Traffic Analytics</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Signal phase duration distribution, throughput dynamics, and intersection-level performance comparison.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold">Throughput Over Time (veh/hr)</h2>
            <span className="text-[11px] font-mono text-slate-400">Estimated · Current Run</span>
          </div>
          <div className="h-[240px]">
            {telemetry.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-500">
                No telemetry yet. Start a simulation to record throughput.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={telemetry}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                  <XAxis dataKey="sim_time" tick={{ fontSize: 11 }} unit="s" />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="throughput_vph" name="Throughput (veh/hr)" stroke="#06B6D4" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold">Signal Phase Duration Distribution (s)</h2>
            <span className="text-[11px] font-mono text-slate-400">Simulated · J1</span>
          </div>
          <div className="h-[240px]">
            {telemetry.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-500">
                Phase duration bars appear once telemetry is captured.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={phaseData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                  <XAxis dataKey="phase" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="seconds" name="Active Time (s)" fill="#10B981" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold">Performance by Intersection</h2>
            <span className="text-[11px] font-mono text-slate-400">Live Snapshot</span>
          </div>
          <div className="h-[240px]">
            {junctionPerf.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-500">
                Start a single or multi-junction simulation to compare intersections.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={junctionPerf}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                  <XAxis dataKey="junction" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="totalQueue" name="Total Queue (veh)" fill="#F59E0B" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="avgWait" name="Avg Wait (s)" fill="#06B6D4" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-3">
          <h2 className="font-display text-sm font-semibold">Historical Simulation Runs ({runs.length})</h2>
          <div className="overflow-x-auto max-h-[240px]">
            {runs.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500">No saved simulation runs yet.</div>
            ) : (
              <table className="w-full text-left text-xs font-mono">
                <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-400">
                  <tr>
                    <th className="py-2 pr-2">Scenario</th>
                    <th className="py-2 px-2">Ctrl</th>
                    <th className="py-2 px-2 text-right">Wait</th>
                    <th className="py-2 pl-2 text-right">Thru/h</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {runs.slice(0, 10).map((r) => (
                    <tr key={r.id}>
                      <td className="py-2 pr-2 font-sans truncate max-w-[140px]">{r.scenario_name}</td>
                      <td className="py-2 px-2 uppercase">{r.controller_type}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{r.avg_wait_s}s</td>
                      <td className="py-2 pl-2 text-right tabular-nums">{Math.round(r.throughput_vph)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
