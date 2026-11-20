import React, { useEffect, useState } from 'react';
import { Play, Pause, Square, RotateCcw, Download, Siren, AlertTriangle, Fuel, Wind } from 'lucide-react';
import { useNexus } from '../context/NexusContext';
import { IntersectionCanvas } from '../components/IntersectionCanvas';
import { CityMapCanvas } from '../components/CityMapCanvas';

export function LiveTrafficPage() {
  const {
    theme,
    wsConnected,
    simState,
    snapshot,
    cityNetwork,
    startSim,
    pauseSim,
    resumeSim,
    stopSim,
    resetSim,
    setSpeed,
    setEcoIdle,
    switchController,
    injectEmergency,
    injectIncident,
  } = useNexus();

  const [scenarios, setScenarios] = useState<any[]>([]);
  const [selectedScenario, setSelectedScenario] = useState(simState.scenarioId);
  const [selectedJunction, setSelectedJunction] = useState('J1');
  const [incidentActive, setIncidentActive] = useState(false);

  useEffect(() => {
    fetch('/api/scenarios')
      .then((r) => r.json())
      .then((rows) => {
        if (Array.isArray(rows)) setScenarios(rows);
      })
      .catch(() => {});
  }, []);

  const activeJ =
    snapshot?.junctions?.find((j) => j.junction_id === selectedJunction) || snapshot?.junctions?.[0];

  const handleToggleIncident = async () => {
    if (incidentActive) {
      await injectIncident(null);
      setIncidentActive(false);
    } else {
      await injectIncident({
        junction: selectedJunction,
        approach: 'E',
        start_s: snapshot?.sim_time ?? 0,
        end_s: (snapshot?.sim_time ?? 0) + 120,
      });
      setIncidentActive(true);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Health Telemetry */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            Live Traffic Operations
          </h1>
          <div className="text-xs font-mono text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-2 mt-0.5">
            <span>WebSocket: {wsConnected ? 'Connected' : 'Reconnecting'}</span>
            <span aria-hidden="true">·</span>
            <span>Simulator: {simState.status.toUpperCase()}</span>
            <span aria-hidden="true">·</span>
            <span>Updated: {new Date(simState.lastUpdated).toLocaleTimeString()}</span>
          </div>
        </div>

        <a
          href="/api/telemetry/export"
          className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium flex items-center gap-1.5"
        >
          <Download className="w-3.5 h-3.5" /> Export Simulation CSV
        </a>
      </div>

      {/* Operational Control Bar */}
      <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] flex flex-wrap items-center gap-3">
        <select
          aria-label="Select scenario"
          value={selectedScenario}
          onChange={(e) => setSelectedScenario(e.target.value)}
          className="h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-medium max-w-xs"
        >
          {scenarios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.intersections}J)
            </option>
          ))}
        </select>

        <select
          aria-label="Select controller"
          value={simState.controllerType}
          onChange={(e) => switchController(e.target.value)}
          className="h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-medium"
        >
          <option value="density_ambulance">Density + Ambulance Priority</option>
          <option value="dqn">DQN RL Policy</option>
          <option value="dueling_dqn">Dueling DQN Policy</option>
          <option value="multi_agent_q">Multi-Agent Corridor RL</option>
          <option value="tabular_q">Tabular Q-Learning</option>
          <option value="actuated">Actuated Baseline</option>
          <option value="fixed_time">Fixed-Time Baseline</option>
        </select>

        <div className="flex items-center gap-1.5">
          {simState.status === 'idle' || simState.status === 'stopped' ? (
            <button
              type="button"
              onClick={() => startSim({ scenarioId: selectedScenario, controllerType: simState.controllerType })}
              className="h-9 px-4 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5" /> Start
            </button>
          ) : simState.status === 'running' ? (
            <button
              type="button"
              onClick={pauseSim}
              className="h-9 px-4 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <Pause className="w-3.5 h-3.5" /> Pause
            </button>
          ) : (
            <button
              type="button"
              onClick={resumeSim}
              className="h-9 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5" /> Resume
            </button>
          )}

          <button
            type="button"
            disabled={simState.status === 'idle' || simState.status === 'stopped'}
            onClick={stopSim}
            className="h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 disabled:opacity-40 text-xs font-medium flex items-center gap-1"
          >
            <Square className="w-3.5 h-3.5" /> Stop
          </button>

          <button
            type="button"
            onClick={resetSim}
            className="h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium flex items-center gap-1"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </button>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900">
          {[1, 2, 5, 10].map((sp) => (
            <button
              key={sp}
              type="button"
              onClick={() => setSpeed(sp)}
              className={`px-2.5 py-1 rounded text-xs font-mono ${
                simState.speedMultiplier === sp
                  ? 'bg-cyan-600 text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {sp}x
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 ml-auto">
          <button
            type="button"
            onClick={() => setEcoIdle(!(snapshot?.aqi_telemetry?.eco_idle_stop ?? true))}
            className={`h-9 px-3 rounded-lg border text-xs font-medium flex items-center gap-1.5 ${
              (snapshot?.aqi_telemetry?.eco_idle_stop ?? true)
                ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'border-slate-300 dark:border-slate-700 text-slate-500'
            }`}
          >
            <Fuel className="w-3.5 h-3.5" />
            Eco Idle-Stop: {(snapshot?.aqi_telemetry?.eco_idle_stop ?? true) ? 'ON' : 'OFF'}
          </button>
          <button
            type="button"
            disabled={simState.status !== 'running'}
            onClick={() => injectEmergency(selectedJunction, 'N')}
            className="h-9 px-3 rounded-lg border border-rose-500/40 text-rose-600 dark:text-rose-400 disabled:opacity-40 text-xs font-medium flex items-center gap-1.5"
          >
            <Siren className="w-3.5 h-3.5" /> Emergency Unit
          </button>
          <button
            type="button"
            disabled={simState.status !== 'running'}
            onClick={handleToggleIncident}
            className={`h-9 px-3 rounded-lg border text-xs font-medium flex items-center gap-1.5 disabled:opacity-40 ${
              incidentActive
                ? 'border-amber-500 bg-amber-500/15 text-amber-600 dark:text-amber-400'
                : 'border-slate-300 dark:border-slate-700'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" /> {incidentActive ? 'Clear Lane Incident' : 'Trigger Lane Closure'}
          </button>
        </div>
      </div>

      {/* Empty Setup State if Idle */}
      {simState.status === 'idle' && !snapshot ? (
        <div className="p-10 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111827] text-center space-y-4">
          <h2 className="font-display text-lg font-semibold">No Simulation Running</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Select a scenario and controller above, then click Start to stream real-time Python 3.11 vehicle kinematics,
            signal phases, and Safety Guard logs over WebSockets.
          </p>
          <button
            type="button"
            onClick={() => startSim({ scenarioId: selectedScenario, controllerType: simState.controllerType })}
            className="px-5 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold inline-flex items-center gap-2"
          >
            <Play className="w-4 h-4" /> Launch Scenario Now
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          {/* Side-by-Side Microscopic Junction + Live OSM Map */}
          <div className="xl:col-span-6 space-y-2">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Microscopic Lane Physics (Python 3.11)
            </div>
            <IntersectionCanvas
              snapshot={snapshot}
              selectedJunctionId={selectedJunction}
              onSelectJunction={setSelectedJunction}
              height={400}
              theme={theme}
            />
          </div>

          <div className="xl:col-span-6 space-y-2">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Real-Time Map Overlay · {cityNetwork?.displayName || simState.cityName}
            </div>
            <CityMapCanvas
              cityNetwork={cityNetwork}
              snapshot={snapshot}
              selectedJunctionId={selectedJunction}
              onSelectJunction={setSelectedJunction}
              height={400}
              theme={theme}
            />
          </div>

          {/* Per-Junction Live Table */}
          <div className="xl:col-span-12 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-sm font-semibold">
                Junction Signal & Approach Matrix ({snapshot?.junctions?.length || 0} Junctions)
              </h3>
              <div className="flex items-center gap-1.5">
                {(snapshot?.junctions || []).map((j) => (
                  <button
                    key={j.junction_id}
                    type="button"
                    onClick={() => setSelectedJunction(j.junction_id)}
                    className={`px-2.5 py-1 rounded text-xs font-mono ${
                      selectedJunction === j.junction_id
                        ? 'bg-cyan-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {j.junction_id}
                  </button>
                ))}
              </div>
            </div>

            {activeJ && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-xs font-mono">
                  <div className="p-3 rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <div className="text-slate-400">Phase</div>
                    <div className="font-semibold text-cyan-600 dark:text-cyan-400 mt-1">{activeJ.phase_name}</div>
                  </div>
                  <div className="p-3 rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <div className="text-slate-400">Countdown</div>
                    <div className="font-semibold tabular-nums mt-1">{activeJ.countdown_s}s</div>
                  </div>
                  {(['N', 'S', 'E', 'W'] as const).map((app) => (
                    <div key={app} className="p-3 rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                      <div className="text-slate-400">Approach {app}</div>
                      <div className="font-semibold tabular-nums mt-1">
                        Q={activeJ.queues[app]} · W={activeJ.wait_by_approach[app]}s
                      </div>
                    </div>
                  ))}
                </div>

                {/* Live AQI & 4-Road Density / Ambulance / Engine-Off Detection Table */}
                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="font-display font-semibold flex items-center gap-1.5 text-slate-900 dark:text-white">
                      <Wind className="w-3.5 h-3.5 text-cyan-500" />
                      4-Road Density, Ambulance Priority &amp; Last-Priority Engine-Off Table
                    </div>
                    {snapshot?.aqi_telemetry && (
                      <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                        Local AQI: <strong className="text-slate-900 dark:text-white">{snapshot.aqi_telemetry.local_junction_aqi.toFixed(0)}</strong> ({snapshot.aqi_telemetry.category}) ·
                        Fuel Saved: <strong className="text-emerald-600 dark:text-emerald-400">{snapshot.aqi_telemetry.fuel_saved_ml.toFixed(1)} mL</strong> ·
                        CO2 Saved: <strong className="text-emerald-600 dark:text-emerald-400">{snapshot.aqi_telemetry.co2_saved_g.toFixed(0)} g</strong>
                      </div>
                    )}
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-400">
                        <tr>
                          <th className="py-2 pr-3">Rank</th>
                          <th className="py-2 px-3">Road</th>
                          <th className="py-2 px-3">Signal</th>
                          <th className="py-2 px-3 text-right">Cars / Bikes / Buses</th>
                          <th className="py-2 px-3 text-right">Density</th>
                          <th className="py-2 px-3">Ambulance</th>
                          <th className="py-2 pl-3">Eco Instruction</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {[...(activeJ.approach_detection || snapshot?.approach_detection || [])]
                          .sort((a, b) => a.priority_rank - b.priority_rank)
                          .map((row) => (
                            <tr key={row.approach}>
                              <td className="py-2 pr-3 font-semibold">#{row.priority_rank}</td>
                              <td className="py-2 px-3">Approach {row.approach}</td>
                              <td className="py-2 px-3">
                                <span
                                  className={`font-semibold ${
                                    row.signal_state === 'GREEN'
                                      ? 'text-emerald-600 dark:text-emerald-400'
                                      : row.signal_state === 'YELLOW'
                                      ? 'text-amber-500'
                                      : 'text-rose-500'
                                  }`}
                                >
                                  {row.signal_state}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-right tabular-nums">
                                {row.cars} / {row.bikes} / {row.buses} ({row.vehicle_count})
                              </td>
                              <td className="py-2 px-3 text-right tabular-nums">{row.density_score.toFixed(1)}</td>
                              <td className="py-2 px-3">
                                {row.emergency_detected ? (
                                  <span className="text-rose-600 dark:text-rose-400 font-semibold">AMBULANCE</span>
                                ) : (
                                  <span className="text-slate-400">Clear</span>
                                )}
                              </td>
                              <td className="py-2 pl-3">
                                {row.engine_off_advised ? (
                                  <span className="text-amber-600 dark:text-amber-400 font-semibold">
                                    {row.advisory_message}
                                  </span>
                                ) : (
                                  <span className="text-slate-500 dark:text-slate-400">{row.advisory_message}</span>
                                )}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
