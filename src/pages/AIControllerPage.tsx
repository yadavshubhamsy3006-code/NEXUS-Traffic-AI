import React, { useEffect, useState } from 'react';
import { Play, Square, CheckCircle2, Download, ShieldCheck } from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { useNexus } from '../context/NexusContext';

export function AIControllerPage() {
  const { trainLiveUpdate, switchController, simState } = useNexus();
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [models, setModels] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);

  // Training Form State
  const [algorithm, setAlgorithm] = useState<'dqn' | 'dueling_dqn' | 'tabular_q' | 'multi_agent_q'>('dqn');
  const [scenarioId, setScenarioId] = useState('sc_rush_hour');
  const [episodes, setEpisodes] = useState(15);
  const [maxSteps, setMaxSteps] = useState(90);
  const [learningRate, setLearningRate] = useState(0.005);
  const [gamma, setGamma] = useState(0.94);
  const [epsilonStart, setEpsilonStart] = useState(0.45);
  const [epsilonEnd, setEpsilonEnd] = useState(0.05);
  const [batchSize, setBatchSize] = useState(16);
  const [seed, setSeed] = useState(42);
  const [modelName, setModelName] = useState('');
  const [rewardWeights, setRewardWeights] = useState({
    wait: 1.0,
    queue: 0.6,
    throughput: 1.4,
    fairness: 0.4,
    pedestrian: 0.5,
    emergency: 2.0,
    switch: 0.3,
    emissions: 0.25,
  });

  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [liveSeries, setLiveSeries] = useState<any[]>([]);
  const [liveLogs, setLiveLogs] = useState<string[]>([]);

  const loadData = async () => {
    const [scR, mdlR, jobR] = await Promise.all([
      fetch('/api/scenarios').then((r) => r.json()),
      fetch('/api/rl/models').then((r) => r.json()),
      fetch('/api/rl/jobs').then((r) => r.json()),
    ]);
    if (Array.isArray(scR)) setScenarios(scR);
    if (Array.isArray(mdlR)) setModels(mdlR);
    if (Array.isArray(jobR)) {
      setJobs(jobR);
      if (jobR[0] && liveSeries.length === 0) {
        setLiveSeries(jobR[0].metrics_history || []);
        setLiveLogs(jobR[0].logs || []);
      }
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!trainLiveUpdate) return;
    if (trainLiveUpdate.type === 'train_progress') {
      setLiveSeries((prev) => [...prev, trainLiveUpdate.data]);
      if (trainLiveUpdate.logs) setLiveLogs(trainLiveUpdate.logs);
    } else if (trainLiveUpdate.type === 'train_complete' || trainLiveUpdate.type === 'train_cancelled') {
      setActiveJobId(null);
      if (trainLiveUpdate.logs) setLiveLogs(trainLiveUpdate.logs);
      loadData();
    }
  }, [trainLiveUpdate]);

  const handleStartTraining = async (e: React.FormEvent) => {
    e.preventDefault();
    setLiveSeries([]);
    setLiveLogs(['Submitting training job to Python 3.11 RL Worker...']);
    const r = await fetch('/api/rl/train', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        algorithm,
        scenarioId,
        episodes,
        maxSteps,
        learningRate,
        gamma,
        epsilonStart,
        epsilonEnd,
        batchSize,
        seed,
        modelName: modelName.trim() || undefined,
        rewardWeights,
      }),
    });
    if (r.ok) {
      const res = await r.json();
      setActiveJobId(res.jobId);
    }
  };

  const handleCancelJob = async () => {
    if (!activeJobId) return;
    await fetch(`/api/rl/jobs/${activeJobId}/cancel`, { method: 'POST' });
    setActiveJobId(null);
  };

  const handleModelStatus = async (id: string, status: 'approved' | 'archived') => {
    await fetch(`/api/rl/models/${id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    loadData();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            AI Controller & RL Training Studio
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Train, evaluate, and manage reinforcement learning traffic policies. Approved models authorize simulation use only.
          </p>
        </div>
        <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
          Implemented: Fixed-Time · Actuated · Tabular Q · DQN · Dueling DQN · Multi-Agent Q
        </div>
      </div>

      {/* Training Configuration + Live Progress */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <form
          onSubmit={handleStartTraining}
          className="xl:col-span-5 p-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-4"
        >
          <h2 className="font-display text-base font-semibold">Launch RL Training Job</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <label className="block">
              <span className="text-slate-500 dark:text-slate-400 block mb-1">RL Algorithm</span>
              <select
                value={algorithm}
                onChange={(e) => setAlgorithm(e.target.value as any)}
                className="w-full h-9 px-2.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
              >
                <option value="dqn">Deep Q-Network (DQN)</option>
                <option value="dueling_dqn">Dueling DQN (Value + Adv)</option>
                <option value="tabular_q">Tabular Q-Learning</option>
                <option value="multi_agent_q">Multi-Agent Corridor Q</option>
              </select>
            </label>

            <label className="block">
              <span className="text-slate-500 dark:text-slate-400 block mb-1">Training Scenario</span>
              <select
                value={scenarioId}
                onChange={(e) => setScenarioId(e.target.value)}
                className="w-full h-9 px-2.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
              >
                {scenarios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-slate-500 dark:text-slate-400 block mb-1">Episodes (3–150)</span>
              <input
                type="number"
                min={3}
                max={150}
                value={episodes}
                onChange={(e) => setEpisodes(Number(e.target.value))}
                className="w-full h-9 px-2.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono"
              />
            </label>

            <label className="block">
              <span className="text-slate-500 dark:text-slate-400 block mb-1">Max Steps / Episode</span>
              <input
                type="number"
                min={30}
                max={400}
                value={maxSteps}
                onChange={(e) => setMaxSteps(Number(e.target.value))}
                className="w-full h-9 px-2.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono"
              />
            </label>

            <label className="block">
              <span className="text-slate-500 dark:text-slate-400 block mb-1">Learning Rate</span>
              <input
                type="number"
                step="0.001"
                value={learningRate}
                onChange={(e) => setLearningRate(Number(e.target.value))}
                className="w-full h-9 px-2.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono"
              />
            </label>

            <label className="block">
              <span className="text-slate-500 dark:text-slate-400 block mb-1">Discount Factor (Gamma)</span>
              <input
                type="number"
                step="0.01"
                min="0.5"
                max="0.999"
                value={gamma}
                onChange={(e) => setGamma(Number(e.target.value))}
                className="w-full h-9 px-2.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono"
              />
            </label>

            <label className="block">
              <span className="text-slate-500 dark:text-slate-400 block mb-1">Batch Size (DQN)</span>
              <input
                type="number"
                min={4}
                max={128}
                value={batchSize}
                onChange={(e) => setBatchSize(Number(e.target.value))}
                className="w-full h-9 px-2.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono"
              />
            </label>

            <label className="block">
              <span className="text-slate-500 dark:text-slate-400 block mb-1">Random Seed</span>
              <input
                type="number"
                value={seed}
                onChange={(e) => setSeed(Number(e.target.value))}
                className="w-full h-9 px-2.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono"
              />
            </label>
          </div>

          <label className="block text-xs">
            <span className="text-slate-500 dark:text-slate-400 block mb-1">Checkpoint Model Name (Optional)</span>
            <input
              type="text"
              placeholder="e.g. Bengaluru Rush-Hour DQN"
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              className="w-full h-9 px-2.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
            />
          </label>

          {/* Reward Function Weights */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
            <div className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Multi-Objective Reward Weights
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              {(Object.keys(rewardWeights) as Array<keyof typeof rewardWeights>).map((key) => (
                <label key={key} className="flex items-center justify-between gap-2">
                  <span className="capitalize text-slate-500 dark:text-slate-400">{key}</span>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="5"
                    value={rewardWeights[key]}
                    onChange={(e) =>
                      setRewardWeights((prev) => ({ ...prev, [key]: Number(e.target.value) }))
                    }
                    className="w-16 h-7 px-1.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono text-right"
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="submit"
              disabled={Boolean(activeJobId)}
              className="flex-1 h-10 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm font-semibold flex items-center justify-center gap-2"
            >
              <Play className="w-4 h-4" />
              {activeJobId ? 'Training in Progress...' : 'Start Background Training'}
            </button>
            {activeJobId && (
              <button
                type="button"
                onClick={handleCancelJob}
                className="h-10 px-4 rounded-lg border border-rose-500/40 text-rose-500 text-xs font-semibold flex items-center gap-1"
              >
                <Square className="w-3.5 h-3.5" /> Cancel
              </button>
            )}
          </div>
        </form>

        {/* Live Training Curves & Worker Logs */}
        <div className="xl:col-span-7 space-y-5">
          <div className="p-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold">Episode Reward & Average Waiting Time</h2>
              <span className="font-mono text-xs text-slate-400">
                {liveSeries.length > 0
                  ? `Ep ${liveSeries[liveSeries.length - 1].episode}/${liveSeries[liveSeries.length - 1].total_episodes}`
                  : 'Ready'}
              </span>
            </div>
            <div className="h-[240px]">
              {liveSeries.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-slate-500">
                  Start a training job to plot real-time episode rewards, TD loss, and exploration decay.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={liveSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                    <XAxis dataKey="episode" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="episode_reward"
                      name="Episode Reward"
                      stroke="#06B6D4"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="avg_wait_s"
                      name="Avg Wait (s)"
                      stroke="#10B981"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-2">
            <h3 className="font-display text-sm font-semibold">Python RL Worker Logs</h3>
            <div className="h-36 overflow-y-auto rounded bg-slate-950 text-slate-200 p-3 font-mono text-[11px] space-y-1">
              {liveLogs.length === 0 ? (
                <div className="text-slate-500">No worker output yet.</div>
              ) : (
                liveLogs.map((line, i) => <div key={i}>{line}</div>)
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Model Registry */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-base font-semibold">Saved Model Registry & Simulation Deployment</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Models must be approved after evaluation before selection. Approval authorizes simulation research use only.
            </p>
          </div>
          <span className="font-mono text-xs text-slate-400">{models.length} Checkpoints</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
              <tr>
                <th className="py-2.5 px-3 font-medium">Model</th>
                <th className="py-2.5 px-3 font-medium">Algorithm</th>
                <th className="py-2.5 px-3 font-medium text-right">Eval Score</th>
                <th className="py-2.5 px-3 font-medium text-right">Wait Δ vs Fixed</th>
                <th className="py-2.5 px-3 font-medium text-right">Inference</th>
                <th className="py-2.5 px-3 font-medium">Status</th>
                <th className="py-2.5 px-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono">
              {models.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="py-2.5 px-3 font-sans">
                    <div className="font-medium text-slate-900 dark:text-white">{m.name}</div>
                    <div className="text-[11px] text-slate-400">{m.version} · {m.scenario_id}</div>
                  </td>
                  <td className="py-2.5 px-3 uppercase">{m.algorithm}</td>
                  <td className="py-2.5 px-3 text-right tabular-nums">{m.eval_score}/100</td>
                  <td className="py-2.5 px-3 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                    {m.wait_improvement_pct >= 0 ? '+' : ''}{m.wait_improvement_pct}%
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums">{m.inference_latency_ms} ms</td>
                  <td className="py-2.5 px-3 uppercase">{m.status}</td>
                  <td className="py-2.5 px-3 text-right font-sans">
                    <div className="inline-flex items-center gap-2">
                      {m.status === 'approved' ? (
                        <button
                          type="button"
                          onClick={() => switchController(m.algorithm, m.id)}
                          className={`px-2.5 py-1 rounded text-xs font-medium ${
                            simState.modelId === m.id
                              ? 'bg-emerald-600 text-white'
                              : 'bg-cyan-600 hover:bg-cyan-500 text-white'
                          }`}
                        >
                          {simState.modelId === m.id ? 'Active' : 'Load Policy'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleModelStatus(m.id, 'approved')}
                          className="px-2.5 py-1 rounded border border-emerald-500/40 text-emerald-600 dark:text-emerald-400 text-xs font-medium inline-flex items-center gap-1"
                        >
                          <CheckCircle2 className="w-3 h-3" /> Approve
                        </button>
                      )}
                      <a
                        href={`/api/rl/models/${m.id}/export`}
                        title="Export checkpoint JSON"
                        className="p-1.5 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* State & Action Vector Documentation */}
      <div className="p-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
        <div className="space-y-2">
          <h3 className="font-display text-sm font-semibold">14-Dimensional Normalized State Vector</h3>
          <p className="text-slate-600 dark:text-slate-400 leading-relaxed font-mono">
            [0..3] N/S/E/W Queue Lengths (/15) · [4..7] N/S/E/W Mean Wait (/60s) · [8] Active Phase (0..1) ·
            [9] Phase Elapsed (/60s) · [10] Pedestrian Demand (/10) · [11] Bus/Emergency Priority ·
            [12] Neighbor Junction Pressure · [13] Weather & Incident Capacity Factor
          </p>
        </div>
        <div className="space-y-2">
          <h3 className="font-display text-sm font-semibold flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-500" /> Safety-Constrained Action Space
          </h3>
          <p className="text-slate-600 dark:text-slate-400 leading-relaxed font-mono">
            0: NS_THROUGH · 1: NS_LEFT · 2: EW_THROUGH · 3: EW_LEFT · 4: PEDESTRIAN_ALL_WALK.
            All proposals pass through SafetyGuard (min_green, max_green, 3s yellow, 2s all-red, emergency preemption).
          </p>
        </div>
      </div>
    </div>
  );
}
