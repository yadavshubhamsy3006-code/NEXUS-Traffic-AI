import React, { useEffect, useState } from 'react';
import { ShieldCheck, Siren, AlertTriangle, PlayCircle } from 'lucide-react';
import { useNexus } from '../context/NexusContext';

export function EmergencyIncidentsPage() {
  const { simState, snapshot, injectEmergency, injectIncident } = useNexus();
  const [safetyLogs, setSafetyLogs] = useState<any[]>([]);
  const [verifyOutput, setVerifyOutput] = useState<{ passed: boolean; output: string; verifiedAt: string } | null>(null);
  const [verifying, setVerifying] = useState(false);

  const [emApproach, setEmApproach] = useState<'N' | 'S' | 'E' | 'W'>('N');
  const [incApproach, setIncApproach] = useState<'N' | 'S' | 'E' | 'W'>('E');

  const loadSafetyLogs = () => {
    fetch('/api/safety/logs')
      .then((r) => r.json())
      .then((rows) => {
        if (Array.isArray(rows)) setSafetyLogs(rows);
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadSafetyLogs();
  }, [snapshot?.total_safety_overrides]);

  const handleRunSafetyProofs = async () => {
    setVerifying(true);
    try {
      const r = await fetch('/api/safety/verify', { method: 'POST' });
      if (r.ok) setVerifyOutput(await r.json());
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">
          Emergency Preemption, Incidents & Safety Guard Audit
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Deterministic Traffic Safety Guard enforces conflict-free phases, yellow/all-red clearance, and emergency preemption.
        </p>
      </div>

      {/* Interactive Incident & Emergency Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="p-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold flex items-center gap-2">
              <Siren className="w-4 h-4 text-rose-500" /> Emergency Vehicle Dispatch
            </h2>
            <span className="font-mono text-xs text-slate-400">
              {snapshot?.emergency_active ? 'Emergency Unit Active' : 'No Active Unit'}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Spawns a simulated emergency ambulance on the chosen approach. Safety Guard forces safe yellow/all-red clearance to serve it.
          </p>
          <div className="flex items-center gap-2">
            <select
              value={emApproach}
              onChange={(e) => setEmApproach(e.target.value as any)}
              className="h-9 px-3 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-mono"
            >
              <option value="N">Northbound (N)</option>
              <option value="S">Southbound (S)</option>
              <option value="E">Eastbound (E)</option>
              <option value="W">Westbound (W)</option>
            </select>
            <button
              type="button"
              disabled={simState.status !== 'running'}
              onClick={() => injectEmergency('J1', emApproach)}
              className="h-9 px-4 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white text-xs font-semibold"
            >
              Dispatch Emergency Vehicle
            </button>
          </div>
        </div>

        <div className="p-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" /> Roadway Incident / Lane Closure
            </h2>
            <span className="font-mono text-xs text-slate-400">
              Active Incidents: {snapshot?.active_incidents ?? 0}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Inject a temporary approach bottleneck at J1 and inspect how the RL controller adapts green splits.
          </p>
          <div className="flex items-center gap-2">
            <select
              value={incApproach}
              onChange={(e) => setIncApproach(e.target.value as any)}
              className="h-9 px-3 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-mono"
            >
              <option value="N">Northbound (N)</option>
              <option value="S">Southbound (S)</option>
              <option value="E">Eastbound (E)</option>
              <option value="W">Westbound (W)</option>
            </select>
            <button
              type="button"
              disabled={simState.status !== 'running'}
              onClick={() =>
                injectIncident({
                  junction: 'J1',
                  approach: incApproach,
                  start_s: snapshot?.sim_time ?? 0,
                  end_s: (snapshot?.sim_time ?? 0) + 120,
                })
              }
              className="h-9 px-4 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-xs font-semibold"
            >
              Inject Incident
            </button>
            <button
              type="button"
              disabled={simState.status !== 'running'}
              onClick={() => injectIncident(null)}
              className="h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 disabled:opacity-40 text-xs font-medium"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* Deterministic Safety Guard Unit Proof Suite */}
      <div className="p-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500" /> Safety Guard Formal Verification Suite
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Executes <code className="text-[11px]">engine/test_safety_guard.py</code> in Python 3.11 to prove zero conflicting green grants, clearance enforcement, and invalid-action fallback.
            </p>
          </div>
          <button
            type="button"
            onClick={handleRunSafetyProofs}
            disabled={verifying}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5"
          >
            <PlayCircle className="w-4 h-4" /> {verifying ? 'Running Tests...' : 'Run Safety Guard Tests'}
          </button>
        </div>

        {verifyOutput && (
          <pre className="p-3 rounded bg-slate-950 text-emerald-400 font-mono text-[11px] overflow-x-auto">
            {verifyOutput.output}
          </pre>
        )}
      </div>

      {/* Safety Override Audit Table */}
      <div className="p-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-semibold">Safety Guard Override Audit Log</h2>
          <span className="font-mono text-xs text-slate-400">{safetyLogs.length} Logged Overrides</span>
        </div>
        <div className="overflow-x-auto max-h-[340px]">
          {safetyLogs.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500">
              No safety overrides triggered yet. Overrides appear when RL proposes switching below min-green, exceeds max-green, or triggers emergency preemption.
            </div>
          ) : (
            <table className="w-full text-left text-xs font-mono">
              <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-400">
                <tr>
                  <th className="py-2 pr-3">Sim Time</th>
                  <th className="py-2 px-2">Junction</th>
                  <th className="py-2 px-2">Override Type</th>
                  <th className="py-2 px-2">Proposed → Executed</th>
                  <th className="py-2 pl-2">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {safetyLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="py-2 pr-3 tabular-nums">{log.sim_time}s</td>
                    <td className="py-2 px-2">{log.junction_id}</td>
                    <td className="py-2 px-2 text-amber-600 dark:text-amber-400">{log.override_type}</td>
                    <td className="py-2 px-2">
                      {log.proposed_action} → {log.executed_action}
                    </td>
                    <td className="py-2 pl-2 font-sans text-slate-600 dark:text-slate-300">{log.reason}</td>
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
