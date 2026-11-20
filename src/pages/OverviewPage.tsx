import React, { useEffect, useState } from 'react';
import { Play, Pause, RotateCcw, Map as MapIcon, Grid, Siren, Wind, Fuel } from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { useNexus } from '../context/NexusContext';
import { IntersectionCanvas } from '../components/IntersectionCanvas';
import { CityMapCanvas } from '../components/CityMapCanvas';

export function OverviewPage() {
  const {
    theme,
    simState,
    snapshot,
    telemetry,
    cityNetwork,
    startSim,
    pauseSim,
    resumeSim,
    resetSim,
    setSpeed,
    setEcoIdle,
    injectEmergency,
  } = useNexus();

  const [viewMode, setViewMode] = useState<'junction' | 'map'>('junction');
  const [selectedJunction, setSelectedJunction] = useState('J1');
  const [alerts, setAlerts] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/alerts')
      .then((r) => r.json())
      .then((rows) => {
        if (Array.isArray(rows)) setAlerts(rows.slice(0, 8));
      })
      .catch(() => {});
  }, [snapshot?.sim_time]);

  const activeJ =
    snapshot?.junctions?.find((j) => j.junction_id === selectedJunction) || snapshot?.junctions?.[0];

  const activeDetection =
    (activeJ?.approach_detection && activeJ.approach_detection.length > 0
      ? activeJ.approach_detection
      : snapshot?.approach_detection) || [];
  const sortedDetection = [...activeDetection].sort((a, b) => a.priority_rank - b.priority_rank);
  const ecoOn = snapshot?.aqi_telemetry?.eco_idle_stop ?? true;
  const localAqi = snapshot?.aqi_telemetry?.local_junction_aqi ?? cityNetwork?.aqi?.us_aqi ?? 68;
  const aqiCat = snapshot?.aqi_telemetry?.category ?? cityNetwork?.aqi?.category ?? 'Moderate';

  const kpis = [
    {
      label: 'Vehicles in Network',
      value: snapshot ? `${snapshot.vehicles_in_network}` : '0',
      unit: 'vehicles',
      meta: `Simulated · t=${snapshot?.sim_time ?? 0}s`,
    },
    {
      label: 'Avg Waiting Time',
      value: snapshot ? `${snapshot.avg_wait_time_s.toFixed(1)}` : '—',
      unit: 'sec/veh',
      meta: snapshot ? 'Simulated · Rolling mean' : 'Unavailable · Start sim',
    },
    {
      label: 'Avg Queue Length',
      value: snapshot ? `${snapshot.avg_queue_length.toFixed(1)}` : '—',
      unit: `veh/lane (max ${snapshot?.max_queue_length ?? 0})`,
      meta: snapshot ? 'Simulated · Current step' : 'Unavailable · Start sim',
    },
    {
      label: 'Vehicles Served / Hr',
      value: snapshot ? `${Math.round(snapshot.throughput_vph)}` : '—',
      unit: 'veh/hr',
      meta: snapshot ? 'Estimated · Cumulative rate' : 'Unavailable · Start sim',
    },
    {
      label: 'Local Junction AQI',
      value: `${Math.round(localAqi)}`,
      unit: `US AQI · ${aqiCat}`,
      meta: `City Base ${Math.round(cityNetwork?.aqi?.us_aqi ?? 68)} · PM2.5 ${(snapshot?.aqi_telemetry?.pm2_5_ugm3 ?? cityNetwork?.aqi?.pm2_5 ?? 18).toFixed(1)} µg/m³`,
    },
    {
      label: 'Eco Fuel & CO2 Saved',
      value: snapshot?.aqi_telemetry ? `${snapshot.aqi_telemetry.fuel_saved_ml.toFixed(1)}` : '0.0',
      unit: `mL (${snapshot?.aqi_telemetry?.co2_saved_g?.toFixed(0) ?? 0}g CO2)`,
      meta: ecoOn ? 'Last-Priority Engine-Off Active' : 'Eco Idle-Stop Disabled',
    },
    {
      label: 'Active Incidents',
      value: snapshot ? `${snapshot.active_incidents}` : '0',
      unit: `${snapshot?.total_safety_overrides ?? 0} guard overrides`,
      meta: 'Simulated · Safety Guard active',
    },
    {
      label: 'Active Controller',
      value: simState.controllerType.toUpperCase(),
      unit: simState.simMode === 'sumo_traci' ? 'SUMO TraCI' : 'Python 3.11 RL',
      meta: `${simState.status} · ${snapshot?.inference_latency_ms ?? 0}ms`,
    },
  ];

  const rewardBars = snapshot?.reward_breakdown
    ? [
        { name: 'Wait', val: snapshot.reward_breakdown.wait_penalty },
        { name: 'Queue', val: snapshot.reward_breakdown.queue_penalty },
        { name: 'Thru', val: snapshot.reward_breakdown.throughput_bonus },
        { name: 'Fair', val: snapshot.reward_breakdown.fairness_bonus },
        { name: 'Ped', val: snapshot.reward_breakdown.pedestrian_penalty },
        { name: 'Emg', val: snapshot.reward_breakdown.emergency_bonus },
        { name: 'CO2', val: snapshot.reward_breakdown.emission_penalty },
      ]
    : [];

  return (
    <div className="space-y-6">
      {/* Top Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            Command Center Overview
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Scenario: {simState.scenarioName} · City: {cityNetwork?.displayName || simState.cityName}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {simState.status === 'running' ? (
            <button
              type="button"
              onClick={pauseSim}
              className="px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <Pause className="w-3.5 h-3.5" /> Pause
            </button>
          ) : simState.status === 'paused' ? (
            <button
              type="button"
              onClick={resumeSim}
              className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5" /> Resume
            </button>
          ) : (
            <button
              type="button"
              onClick={() => startSim()}
              className="px-3.5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5" /> Start Simulation
            </button>
          )}

          <button
            type="button"
            onClick={resetSim}
            className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </button>

          <select
            aria-label="Simulation speed"
            value={simState.speedMultiplier}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="h-8 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono"
          >
            <option value={1}>1x Speed</option>
            <option value={2}>2x Speed</option>
            <option value={5}>5x Speed</option>
            <option value={10}>10x Speed</option>
          </select>

          <button
            type="button"
            onClick={() => injectEmergency(selectedJunction, 'N')}
            disabled={simState.status !== 'running'}
            className="px-3 py-2 rounded-lg border border-rose-500/40 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 disabled:opacity-40 text-xs font-medium flex items-center gap-1.5"
          >
            <Siren className="w-3.5 h-3.5" /> Dispatch Emergency
          </button>
        </div>
      </div>

      {/* 8 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-1.5"
          >
            <div className="text-xs text-slate-500 dark:text-slate-400">{k.label}</div>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">
                {k.value}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 truncate">{k.unit}</span>
            </div>
            <div className="text-[11px] font-mono text-slate-400 dark:text-slate-500">{k.meta}</div>
          </div>
        ))}
      </div>

      {/* 4-Road Signal Priority, Density Detection & Last-Priority Engine-Off Advisory */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Wind className="w-4 h-4 text-cyan-500" />
              4-Road Vehicle Density, Ambulance Detector &amp; Eco Idle-Stop Advisory ({activeJ?.junction_id || 'J1'})
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Ranks all 4 approaches by ambulance presence and vehicle density; advises lowest-priority (#4) red road drivers to stop bikes &amp; engines to cut pollution and save fuel.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEcoIdle(!ecoOn)}
            className={`px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors ${
              ecoOn
                ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'
            }`}
          >
            <Fuel className="w-3.5 h-3.5" />
            Eco Idle-Stop: {ecoOn ? 'ENABLED' : 'OFF'}
          </button>
        </div>

        {sortedDetection.length === 0 ? (
          <div className="text-xs text-slate-500 dark:text-slate-400 py-3">
            Start a simulation to detect live vehicle counts (cars, bikes, buses, ambulances) and signal priority ranking across N/S/E/W roads.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {sortedDetection.map((row) => (
              <div
                key={row.approach}
                className={`p-3 rounded-lg border space-y-2 text-xs ${
                  row.emergency_detected
                    ? 'border-rose-500/60 bg-rose-500/5'
                    : row.engine_off_advised
                    ? 'border-amber-500/60 bg-amber-500/5'
                    : row.signal_state === 'GREEN'
                    ? 'border-emerald-500/40 bg-emerald-500/5'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900'
                }`}
              >
                <div className="flex items-center justify-between font-mono">
                  <span className="font-bold text-slate-900 dark:text-white">
                    #{row.priority_rank} · Road {row.approach}
                  </span>
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
                </div>

                <div className="grid grid-cols-2 gap-1 font-mono text-[11px] text-slate-600 dark:text-slate-300 tabular-nums">
                  <span>Total: {row.vehicle_count} veh</span>
                  <span>Score: {row.density_score.toFixed(1)}</span>
                  <span>Cars: {row.cars} · Bikes: {row.bikes}</span>
                  <span>Buses: {row.buses} · Wait: {row.avg_wait_s}s</span>
                </div>

                {row.emergency_detected && (
                  <div className="text-[11px] font-mono font-semibold text-rose-600 dark:text-rose-400">
                    AMBULANCE DETECTED · PRIORITY PREEMPTION
                  </div>
                )}

                {row.engine_off_advised ? (
                  <div className="text-[11px] font-mono font-semibold text-amber-600 dark:text-amber-400">
                    {row.advisory_message}
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {row.advisory_message}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Main Visual Area + Selected Junction Inspector */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <div className="xl:col-span-8 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setViewMode('junction')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors ${
                  viewMode === 'junction'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <Grid className="w-3.5 h-3.5" /> Microscopic Junction
              </button>
              <button
                type="button"
                onClick={() => setViewMode('map')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors ${
                  viewMode === 'map'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <MapIcon className="w-3.5 h-3.5" /> Live City Map ({cityNetwork?.displayName || 'OSM'})
              </button>
            </div>

            {snapshot?.explanation && (
              <div className="text-xs font-mono text-cyan-600 dark:text-cyan-400 truncate max-w-md">
                {snapshot.explanation}
              </div>
            )}
          </div>

          {viewMode === 'junction' ? (
            <IntersectionCanvas
              snapshot={snapshot}
              selectedJunctionId={selectedJunction}
              onSelectJunction={setSelectedJunction}
              height={400}
              theme={theme}
            />
          ) : (
            <CityMapCanvas
              cityNetwork={cityNetwork}
              snapshot={snapshot}
              selectedJunctionId={selectedJunction}
              onSelectJunction={setSelectedJunction}
              height={400}
              theme={theme}
            />
          )}
        </div>

        {/* Right Contextual Junction & Events Panel */}
        <div className="xl:col-span-4 space-y-5">
          <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold">Junction Detail · {activeJ?.junction_id || 'J1'}</h2>
              <span className="font-mono text-xs text-cyan-600 dark:text-cyan-400">
                {activeJ?.phase_name || 'IDLE'}
              </span>
            </div>

            {activeJ ? (
              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-2 font-mono">
                  <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <div className="text-slate-400">Light State</div>
                    <div className="font-semibold mt-0.5">{activeJ.light_state}</div>
                  </div>
                  <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <div className="text-slate-400">Elapsed / Max</div>
                    <div className="font-semibold mt-0.5 tabular-nums">
                      {activeJ.phase_elapsed_s}s / {(activeJ.phase_elapsed_s + activeJ.countdown_s).toFixed(0)}s
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="text-slate-500 dark:text-slate-400">Approach Queues & Avg Wait</div>
                  {(['N', 'S', 'E', 'W'] as const).map((app) => (
                    <div key={app} className="flex items-center justify-between font-mono py-1 border-b border-slate-100 dark:border-slate-800/70">
                      <span>Approach {app}</span>
                      <span className="tabular-nums">
                        {activeJ.queues[app]} veh · {activeJ.wait_by_approach[app]}s wait
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between font-mono pt-1">
                    <span>Pedestrians Waiting</span>
                    <span className="tabular-nums">{activeJ.pedestrians_waiting} pax</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center">
                Start a simulation to inspect live per-approach queues, phases, and pedestrian demand.
              </div>
            )}
          </div>

          {/* Recent Events Feed */}
          <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-3">
            <h2 className="font-display text-sm font-semibold">Recent System & Safety Events</h2>
            <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
              {alerts.length === 0 ? (
                <div className="text-xs text-slate-500">No recent events logged.</div>
              ) : (
                alerts.map((a) => (
                  <div key={a.id} className="text-xs pb-2 border-b border-slate-100 dark:border-slate-800/70 last:border-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-800 dark:text-slate-200 truncate">{a.title}</span>
                      <span className="font-mono text-[10px] text-slate-400 shrink-0">
                        {a.category}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{a.detail}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Dashboard Analytics Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold">Waiting Time & Queue Length Over Time</h3>
            <span className="text-[11px] font-mono text-slate-400">sec / veh · Simulated</span>
          </div>
          <div className="h-[230px]">
            {telemetry.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-500">
                No telemetry points recorded yet. Click Start Simulation to stream live data.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={telemetry}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                  <XAxis dataKey="sim_time" tick={{ fontSize: 11 }} unit="s" />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area
                    type="monotone"
                    dataKey="avg_wait_time_s"
                    name="Avg Wait (s)"
                    stroke="#06B6D4"
                    fill="#06B6D4"
                    fillOpacity={0.18}
                  />
                  <Area
                    type="monotone"
                    dataKey="avg_queue_length"
                    name="Avg Queue (veh)"
                    stroke="#F59E0B"
                    fill="#F59E0B"
                    fillOpacity={0.15}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold">Cumulative Arrivals vs. Departures & Throughput</h3>
            <span className="text-[11px] font-mono text-slate-400">vehicles · Simulated</span>
          </div>
          <div className="h-[230px]">
            {telemetry.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-500">
                Start a simulation to view cumulative arrival/departure curves.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={telemetry}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                  <XAxis dataKey="sim_time" tick={{ fontSize: 11 }} unit="s" />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="total_arrivals" name="Arrivals" stroke="#94A3B8" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="total_departures" name="Departures" stroke="#10B981" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold">Step Reward Component Attribution</h3>
            <span className="text-[11px] font-mono text-slate-400">
              Total: {snapshot?.reward_breakdown?.total_reward ?? 0}
            </span>
          </div>
          <div className="h-[220px]">
            {rewardBars.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-500">
                Reward breakdown appears once simulation is active.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rewardBars}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="val" name="Reward Term" fill="#06B6D4" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold">Cumulative Estimated CO2 Emissions</h3>
            <span className="text-[11px] font-mono text-slate-400">grams CO2 · Estimated</span>
          </div>
          <div className="h-[220px]">
            {telemetry.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-500">
                CO2 estimates will populate during simulation runs.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={telemetry}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                  <XAxis dataKey="sim_time" tick={{ fontSize: 11 }} unit="s" />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="co2_emissions_g" name="CO2 (g)" stroke="#10B981" fill="#10B981" fillOpacity={0.18} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
