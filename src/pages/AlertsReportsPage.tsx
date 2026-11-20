import React, { useEffect, useState } from 'react';
import { Check, Download } from 'lucide-react';
import { useNexus } from '../context/NexusContext';

export function AlertsReportsPage() {
  const { simState, snapshot } = useNexus();
  const [alerts, setAlerts] = useState<any[]>([]);
  const [filter, setFilter] = useState<'all' | 'unack'>('all');

  const loadAlerts = () => {
    fetch('/api/alerts')
      .then((r) => r.json())
      .then((rows) => {
        if (Array.isArray(rows)) setAlerts(rows);
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadAlerts();
  }, [snapshot?.sim_time]);

  const handleAck = async (id: number) => {
    await fetch(`/api/alerts/${id}/ack`, { method: 'POST' });
    loadAlerts();
  };

  const handleDownloadReport = () => {
    const report = {
      generatedAt: new Date().toISOString(),
      platform: 'NEXUS Traffic AI (Research & Simulation Only)',
      activeSimulation: {
        runId: simState.runId,
        scenario: simState.scenarioName,
        controller: simState.controllerType,
        city: simState.cityName,
        simMode: simState.simMode,
      },
      latestSnapshot: snapshot,
      recentAlerts: alerts.slice(0, 20),
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nexus_report_${simState.runId || 'summary'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const displayed = filter === 'unack' ? alerts.filter((a) => !a.acknowledged) : alerts;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">Alerts & Simulation Reports</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Operational notifications for simulation events, emergency preemptions, controller changes, and RL evaluations.
          </p>
        </div>

        <button
          type="button"
          onClick={handleDownloadReport}
          className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center gap-1.5"
        >
          <Download className="w-3.5 h-3.5" /> Export JSON Report
        </button>
      </div>

      <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 w-fit">
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={`px-3 py-1.5 rounded text-xs font-medium ${
            filter === 'all' ? 'bg-white dark:bg-slate-800 shadow-xs' : 'text-slate-500'
          }`}
        >
          All Events ({alerts.length})
        </button>
        <button
          type="button"
          onClick={() => setFilter('unack')}
          className={`px-3 py-1.5 rounded text-xs font-medium ${
            filter === 'unack' ? 'bg-white dark:bg-slate-800 shadow-xs' : 'text-slate-500'
          }`}
        >
          Unacknowledged ({alerts.filter((a) => !a.acknowledged).length})
        </button>
      </div>

      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] divide-y divide-slate-200 dark:divide-slate-800">
        {displayed.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">No alerts matching current filter.</div>
        ) : (
          displayed.map((a) => (
            <div key={a.id} className="p-4 flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-mono">
                  <span
                    className={
                      a.severity === 'critical'
                        ? 'text-rose-500 font-semibold'
                        : a.severity === 'warning'
                          ? 'text-amber-500 font-semibold'
                          : 'text-cyan-500 font-semibold'
                    }
                  >
                    {a.severity.toUpperCase()}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="text-slate-400">{a.category}</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-slate-400">{new Date(a.created_at).toLocaleString()}</span>
                </div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white">{a.title}</div>
                <div className="text-xs text-slate-600 dark:text-slate-400">{a.detail}</div>
              </div>

              {!a.acknowledged ? (
                <button
                  type="button"
                  onClick={() => handleAck(a.id)}
                  className="px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium flex items-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" /> Acknowledge
                </button>
              ) : (
                <span className="text-xs font-mono text-slate-400">Acknowledged</span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
