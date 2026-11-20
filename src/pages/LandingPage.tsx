import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Play, ShieldCheck, Layers, Globe, Activity, Sun, Moon } from 'lucide-react';
import { NexusLogo } from '../components/NexusLogo';
import { IntersectionCanvas } from '../components/IntersectionCanvas';
import { useNexus } from '../context/NexusContext';

export function LandingPage() {
  const navigate = useNavigate();
  const { theme, toggleTheme, topCities, selectCity, startSim } = useNexus();

  const [onboardScenario, setOnboardScenario] = useState('sc_rush_hour');
  const [onboardController, setOnboardController] = useState('dqn');
  const [onboardCity, setOnboardCity] = useState('bengaluru');
  const [launching, setLaunching] = useState(false);

  const handleLaunchOnboarding = async () => {
    setLaunching(true);
    try {
      await selectCity(onboardCity);
      await startSim({
        scenarioId: onboardScenario,
        controllerType: onboardController,
        modelId: onboardController === 'dqn' ? 'mdl_dqn_base' : null,
      });
      navigate('/app/overview');
    } finally {
      setLaunching(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#0B1120] dark:text-slate-100">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="sticky top-0 z-40 border-b border-slate-200 dark:border-slate-800/80 bg-white/90 dark:bg-[#0B1120]/90 backdrop-blur">
        <div className="max-w-[1280px] mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <a href="/" className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
            <NexusLogo className="w-7 h-7" />
            <span className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white">
              NEXUS Traffic AI
            </span>
          </a>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
            <a href="#how-it-works" className="hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors whitespace-nowrap shrink-0">
              How RL Works
            </a>
            <a href="#comparison" className="hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors whitespace-nowrap shrink-0">
              Comparison
            </a>
            <a href="#impact" className="hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors whitespace-nowrap shrink-0">
              Societal Impact
            </a>
            <a href="#research" className="hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors whitespace-nowrap shrink-0">
              Research
            </a>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle color theme"
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => navigate('/app/sim-lab')}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white transition-colors whitespace-nowrap shrink-0 flex items-center gap-2"
            >
              Open Simulation Lab
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1280px] mx-auto px-6 py-12 space-y-20">
        {/* Hero Split */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-center space-y-6">
            <div className="text-xs font-mono text-cyan-600 dark:text-cyan-400 tracking-wide">
              Reinforcement Learning · Microscopic Simulation · OpenStreetMap
            </div>
            <h1
              className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 dark:text-white leading-[1.12]"
              style={{ textWrap: 'balance' }}
            >
              Traffic that learns. Cities that move.
            </h1>
            <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
              An open, reproducible research platform exploring how reinforcement learning coordinates urban traffic
              signals compared to fixed-time and actuated controllers—guarded by a deterministic safety verification layer.
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-1">
              <button
                type="button"
                onClick={() => navigate('/app/overview')}
                className="px-5 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-sm transition-colors flex items-center gap-2"
              >
                <Play className="w-4 h-4" />
                Enter Command Center
              </button>
              <button
                type="button"
                onClick={() => navigate('/app/city-map')}
                className="px-5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800/70 text-slate-800 dark:text-slate-200 font-semibold text-sm transition-colors"
              >
                Explore City Maps
              </button>
            </div>

            <div className="pt-2 text-xs text-slate-500 dark:text-slate-400">
              Research & simulation platform only · Guest demo mode enabled · No registration required
            </div>
          </div>

          <div className="lg:col-span-6 flex flex-col justify-between">
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4 space-y-3 h-full flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span className="font-medium text-slate-700 dark:text-slate-200">
                  Interactive Junction Preview
                </span>
                <span className="font-mono">Simulated Demo · Synthetic Flow</span>
              </div>
              <IntersectionCanvas demoMode height={320} theme={theme} />
              <div className="grid grid-cols-3 gap-4 pt-1 border-t border-slate-200 dark:border-slate-800 text-xs">
                <div>
                  <div className="text-slate-500 dark:text-slate-400">Signal Policy</div>
                  <div className="font-mono font-semibold text-slate-900 dark:text-slate-100">DQN + Safety Guard</div>
                </div>
                <div>
                  <div className="text-slate-500 dark:text-slate-400">Conflict Check</div>
                  <div className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">Verified Clear</div>
                </div>
                <div>
                  <div className="text-slate-500 dark:text-slate-400">Demo Mode</div>
                  <div className="font-mono font-semibold text-cyan-600 dark:text-cyan-400">Synthetic Preview</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Quick-Start Onboarding Strip */}
        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div className="space-y-1">
              <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                Quick-Start Simulation Onboarding
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Select a city road network, traffic demand scenario, and signal controller to launch a live Python 3.11 simulation.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 flex-1 max-w-3xl">
              <label className="block text-xs">
                <span className="text-slate-500 dark:text-slate-400 block mb-1">City Road Network</span>
                <select
                  value={onboardCity}
                  onChange={(e) => setOnboardCity(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm"
                >
                  {(topCities.length
                    ? topCities
                    : [
                        { id: 'bengaluru', name: 'Bengaluru, India' },
                        { id: 'mumbai', name: 'Mumbai, India' },
                        { id: 'london', name: 'London, UK' },
                        { id: 'tokyo', name: 'Tokyo, Japan' },
                      ]
                  ).map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-xs">
                <span className="text-slate-500 dark:text-slate-400 block mb-1">Traffic Scenario</span>
                <select
                  value={onboardScenario}
                  onChange={(e) => setOnboardScenario(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm"
                >
                  <option value="sc_rush_hour">Peak Rush-Hour</option>
                  <option value="sc_uneven_dir">Uneven Arterial Flow</option>
                  <option value="sc_emergency">Emergency Preemption</option>
                  <option value="sc_corridor_3j">3-Junction Corridor</option>
                  <option value="sc_rain_weather">Monsoon Rain Slowdown</option>
                </select>
              </label>

              <label className="block text-xs">
                <span className="text-slate-500 dark:text-slate-400 block mb-1">Signal Controller</span>
                <select
                  value={onboardController}
                  onChange={(e) => setOnboardController(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm"
                >
                  <option value="dqn">Deep Q-Network (DQN)</option>
                  <option value="density_ambulance">Density + Ambulance Priority</option>
                  <option value="dueling_dqn">Dueling DQN</option>
                  <option value="multi_agent_q">Multi-Agent Corridor RL</option>
                  <option value="tabular_q">Tabular Q-Learning</option>
                  <option value="actuated">Actuated Baseline</option>
                  <option value="fixed_time">Fixed-Time Baseline</option>
                </select>
              </label>

              <div className="flex items-end">
                <button
                  type="button"
                  disabled={launching}
                  onClick={handleLaunchOnboarding}
                  className="w-full h-10 px-4 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-60 text-white font-semibold text-sm transition-colors whitespace-nowrap"
                >
                  {launching ? 'Starting...' : 'Launch Simulation'}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* How RL Works */}
        <section id="how-it-works" className="space-y-6">
          <div className="max-w-2xl space-y-2">
            <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
              How Adaptive Reinforcement Learning Operates
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Unlike static timers, the RL policy observes real-time queue dynamics every simulation step and routes every
              decision through a deterministic Traffic Safety Guard.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
            {[
              {
                step: '01. Observe State',
                icon: Activity,
                text: 'Reads 14 normalized features: per-approach queues, waiting times, pedestrian calls, bus/emergency presence, and downstream neighbor pressure.',
              },
              {
                step: '02. Policy Proposal',
                icon: Layers,
                text: 'DQN, Dueling DQN, Tabular Q, or Multi-Agent RL scores compatible traffic movement phases based on learned expected cumulative reward.',
              },
              {
                step: '03. Safety Guard Check',
                icon: ShieldCheck,
                text: 'Deterministic layer verifies conflict-free green movements, enforces min/max green holds, inserts yellow & all-red clearance, and handles emergency preemption.',
              },
              {
                step: '04. Explainable Reward',
                icon: Globe,
                text: 'Logs individual reward contributions—waiting time, queue reduction, throughput, approach fairness, pedestrian delay, and CO2 emissions.',
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.step}
                  className="p-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-3"
                >
                  <Icon className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                  <h3 className="font-display font-semibold text-base text-slate-900 dark:text-white">{item.step}</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{item.text}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Traditional vs Adaptive Comparison */}
        <section id="comparison" className="space-y-6">
          <div className="max-w-2xl space-y-2">
            <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
              Conventional Fixed-Time vs. Adaptive RL Control
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Architectural comparison of signal timing paradigms tested inside the Research & Experiments suite.
            </p>
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827]">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="py-3 px-4 font-medium">Dimension</th>
                  <th className="py-3 px-4 font-medium">Fixed-Time Baseline</th>
                  <th className="py-3 px-4 font-medium">Actuated Loop Control</th>
                  <th className="py-3 px-4 font-medium text-cyan-600 dark:text-cyan-400">NEXUS RL + Safety Guard</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                <tr>
                  <td className="py-3 px-4 font-medium">Demand Adaptation</td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">Static cycle splits</td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">Local gap-out extension</td>
                  <td className="py-3 px-4">Multi-approach queue & wait optimization</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-medium">Multi-Junction Flow</td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">Manual offset tuning</td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">Isolated per junction</td>
                  <td className="py-3 px-4">Neighbor pressure observation & green waves</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-medium">Multimodal Priority</td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">None</td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">Basic push-button</td>
                  <td className="py-3 px-4">Weighted transit, pedestrian & emergency preemption</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-medium">Safety Assurance</td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">Hardware conflict monitor</td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">Controller min/max green</td>
                  <td className="py-3 px-4">Deterministic Safety Guard + audited override log</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Societal Impact & Reproducibility */}
        <section id="impact" className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-6 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-3">
            <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
              Urban Mobility & Environmental Impact
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Stop-and-go idling at misaligned intersections wastes fuel and disproportionately delays buses, ambulances,
              and pedestrians. NEXUS explicitly measures idling vs. cruising CO2 estimates and approach fairness (Jain&apos;s
              Index) so side streets are never starved to inflate main-arterial throughput.
            </p>
          </div>
          <div id="research" className="p-6 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-3">
            <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
              Reproducible Research & Open Data Stack
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Every experiment records random seeds, scenario demand parameters, reward weights, Safety Guard overrides,
              and model checkpoints. Road networks load directly from OpenStreetMap Overpass API, weather and live Air Quality Index (AQI) adjust via
              Open-Meteo, and runs persist to local SQLite or Supabase PostgreSQL.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 dark:border-slate-800 py-8 mt-12">
        <div className="max-w-[1280px] mx-auto px-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
          <div>
            NEXUS Traffic AI — Academic & Smart-City Research Platform. Simulation testing does not establish readiness for real-road deployment.
          </div>
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => navigate('/app/research')} className="hover:text-cyan-500">
              Methodology
            </button>
            <button type="button" onClick={() => navigate('/app/emergency')} className="hover:text-cyan-500">
              Safety Guard Proofs
            </button>
            <button type="button" onClick={() => navigate('/app/settings')} className="hover:text-cyan-500">
              Supabase & SUMO Setup
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
