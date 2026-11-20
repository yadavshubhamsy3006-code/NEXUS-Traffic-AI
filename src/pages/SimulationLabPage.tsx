import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Plus, Copy, Trash2, FileCode2, CheckCircle2 } from 'lucide-react';
import { useNexus } from '../context/NexusContext';

export function SimulationLabPage() {
  const navigate = useNavigate();
  const { startSim, health } = useNexus();
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [filterCat, setFilterCat] = useState('All');
  const [selectedId, setSelectedId] = useState('sc_rush_hour');
  const [sumoFiles, setSumoFiles] = useState<Record<string, string> | null>(null);
  const [activeSumoTab, setActiveSumoTab] = useState('simulation.sumocfg');

  // Custom Scenario Builder Form
  const [showBuilder, setShowBuilder] = useState(false);
  const [form, setForm] = useState({
    name: 'Custom Corridor Test',
    category: 'Custom',
    description: 'Custom arrival demand and signal timing test.',
    intersections: 2,
    lanes: 2,
    speed_limit_kmh: 50,
    weather_factor: 1.0,
    arrivalN: 0.28,
    arrivalS: 0.26,
    arrivalE: 0.34,
    arrivalW: 0.32,
    pedestrian_rate: 0.14,
    bus_prob: 0.10,
    emergency_prob: 0.015,
    duration_s: 300,
    seed: 42,
    min_green_s: 8,
    max_green_s: 55,
  });

  const loadScenarios = async () => {
    const rows = await fetch('/api/scenarios').then((r) => r.json());
    if (Array.isArray(rows)) setScenarios(rows);
  };

  useEffect(() => {
    loadScenarios();
  }, []);

  const categories = ['All', ...Array.from(new Set(scenarios.map((s) => s.category)))];
  const filtered = filterCat === 'All' ? scenarios : scenarios.filter((s) => s.category === filterCat);
  const selected = scenarios.find((s) => s.id === selectedId) || scenarios[0];

  const handleLaunchScenario = async (scId: string) => {
    await startSim({ scenarioId: scId });
    navigate('/app/live');
  };

  const handleGenerateSumo = async (scId: string) => {
    const r = await fetch('/api/sumo/bundle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenarioId: scId }),
    });
    if (r.ok) {
      const res = await r.json();
      setSumoFiles(res.files);
    }
  };

  const handleCreateScenario = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await fetch('/api/scenarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        category: form.category,
        description: form.description,
        intersections: Number(form.intersections),
        lanes: Number(form.lanes),
        speed_limit_kmh: Number(form.speed_limit_kmh),
        weather_factor: Number(form.weather_factor),
        arrival_rates: {
          N: Number(form.arrivalN),
          S: Number(form.arrivalS),
          E: Number(form.arrivalE),
          W: Number(form.arrivalW),
        },
        turning_probs: { straight: 0.65, left: 0.2, right: 0.15 },
        pedestrian_rate: Number(form.pedestrian_rate),
        bus_prob: Number(form.bus_prob),
        emergency_prob: Number(form.emergency_prob),
        duration_s: Number(form.duration_s),
        seed: Number(form.seed),
        min_green_s: Number(form.min_green_s),
        max_green_s: Number(form.max_green_s),
      }),
    });
    if (r.ok) {
      const created = await r.json();
      await loadScenarios();
      setSelectedId(created.id);
      setShowBuilder(false);
    }
  };

  const handleDuplicate = (sc: any) => {
    setForm({
      name: `${sc.name} (Copy)`,
      category: 'Custom',
      description: sc.description,
      intersections: sc.intersections,
      lanes: sc.lanes,
      speed_limit_kmh: sc.speed_limit_kmh,
      weather_factor: sc.weather_factor,
      arrivalN: sc.arrival_rates.N,
      arrivalS: sc.arrival_rates.S,
      arrivalE: sc.arrival_rates.E,
      arrivalW: sc.arrival_rates.W,
      pedestrian_rate: sc.pedestrian_rate,
      bus_prob: sc.bus_prob,
      emergency_prob: sc.emergency_prob,
      duration_s: sc.duration_s,
      seed: sc.seed + 1,
      min_green_s: sc.min_green_s,
      max_green_s: sc.max_green_s,
    });
    setShowBuilder(true);
  };

  const handleDelete = async (id: string) => {
    const r = await fetch(`/api/scenarios/${id}`, { method: 'DELETE' });
    if (r.ok) loadScenarios();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            Simulation Lab & Scenario Studio
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Reproducible traffic demand presets, custom network editor, and Eclipse SUMO XML export.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowBuilder((v) => !v)}
          className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> {showBuilder ? 'Close Editor' : 'New Custom Scenario'}
        </button>
      </div>

      {/* Custom Scenario Editor */}
      {showBuilder && (
        <form
          onSubmit={handleCreateScenario}
          className="p-5 rounded-lg border border-cyan-500/40 bg-white dark:bg-[#111827] space-y-4"
        >
          <h2 className="font-display text-base font-semibold">Custom Scenario Configuration</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <label className="block sm:col-span-2">
              <span className="text-slate-500 block mb-1">Scenario Name</span>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full h-9 px-2.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
              />
            </label>
            <label className="block">
              <span className="text-slate-500 block mb-1">Intersections (1–4)</span>
              <input
                type="number"
                min={1}
                max={4}
                value={form.intersections}
                onChange={(e) => setForm({ ...form, intersections: Number(e.target.value) })}
                className="w-full h-9 px-2.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono"
              />
            </label>
            <label className="block">
              <span className="text-slate-500 block mb-1">Lanes / Approach</span>
              <input
                type="number"
                min={1}
                max={3}
                value={form.lanes}
                onChange={(e) => setForm({ ...form, lanes: Number(e.target.value) })}
                className="w-full h-9 px-2.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono"
              />
            </label>
            <label className="block">
              <span className="text-slate-500 block mb-1">Arrival N (veh/s)</span>
              <input
                type="number"
                step="0.02"
                min="0.02"
                max="0.8"
                value={form.arrivalN}
                onChange={(e) => setForm({ ...form, arrivalN: Number(e.target.value) })}
                className="w-full h-9 px-2.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono"
              />
            </label>
            <label className="block">
              <span className="text-slate-500 block mb-1">Arrival S (veh/s)</span>
              <input
                type="number"
                step="0.02"
                min="0.02"
                max="0.8"
                value={form.arrivalS}
                onChange={(e) => setForm({ ...form, arrivalS: Number(e.target.value) })}
                className="w-full h-9 px-2.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono"
              />
            </label>
            <label className="block">
              <span className="text-slate-500 block mb-1">Arrival E (veh/s)</span>
              <input
                type="number"
                step="0.02"
                min="0.02"
                max="0.8"
                value={form.arrivalE}
                onChange={(e) => setForm({ ...form, arrivalE: Number(e.target.value) })}
                className="w-full h-9 px-2.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono"
              />
            </label>
            <label className="block">
              <span className="text-slate-500 block mb-1">Arrival W (veh/s)</span>
              <input
                type="number"
                step="0.02"
                min="0.02"
                max="0.8"
                value={form.arrivalW}
                onChange={(e) => setForm({ ...form, arrivalW: Number(e.target.value) })}
                className="w-full h-9 px-2.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono"
              />
            </label>
            <label className="block">
              <span className="text-slate-500 block mb-1">Speed Limit (km/h)</span>
              <input
                type="number"
                min={20}
                max={90}
                value={form.speed_limit_kmh}
                onChange={(e) => setForm({ ...form, speed_limit_kmh: Number(e.target.value) })}
                className="w-full h-9 px-2.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono"
              />
            </label>
            <label className="block">
              <span className="text-slate-500 block mb-1">Weather Factor (0.4–1.0)</span>
              <input
                type="number"
                step="0.05"
                min="0.4"
                max="1.0"
                value={form.weather_factor}
                onChange={(e) => setForm({ ...form, weather_factor: Number(e.target.value) })}
                className="w-full h-9 px-2.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono"
              />
            </label>
            <label className="block">
              <span className="text-slate-500 block mb-1">Bus Share (0–0.5)</span>
              <input
                type="number"
                step="0.02"
                min="0"
                max="0.5"
                value={form.bus_prob}
                onChange={(e) => setForm({ ...form, bus_prob: Number(e.target.value) })}
                className="w-full h-9 px-2.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono"
              />
            </label>
            <label className="block">
              <span className="text-slate-500 block mb-1">Random Seed</span>
              <input
                type="number"
                value={form.seed}
                onChange={(e) => setForm({ ...form, seed: Number(e.target.value) })}
                className="w-full h-9 px-2.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono"
              />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowBuilder(false)}
              className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold"
            >
              Save Scenario to Database
            </button>
          </div>
        </form>
      )}

      {/* Category Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 w-fit">
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setFilterCat(cat)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              filterCat === cat
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Presets Grid + Selected Inspector */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <div className="xl:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-3.5 content-start">
          {filtered.map((sc) => (
            <div
              key={sc.id}
              onClick={() => setSelectedId(sc.id)}
              className={`p-4 rounded-lg border cursor-pointer transition-colors space-y-2 ${
                selectedId === sc.id
                  ? 'border-cyan-500 bg-cyan-500/5 dark:bg-cyan-500/10'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-display font-semibold text-sm text-slate-900 dark:text-white">
                    {sc.name}
                  </div>
                  <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                    {sc.category} · {sc.intersections} Junction{sc.intersections > 1 ? 's' : ''} · {sc.lanes} Lanes · Seed {sc.seed}
                  </div>
                </div>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2">{sc.description}</p>
            </div>
          ))}
        </div>

        {/* Selected Scenario Detail & SUMO Bundle */}
        <div className="xl:col-span-5 space-y-5">
          {selected && (
            <div className="p-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-display text-base font-bold">{selected.name}</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{selected.description}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 text-xs font-mono">
                <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-400 block">Arrivals (N/S/E/W)</span>
                  <span className="font-semibold mt-0.5 block">
                    {selected.arrival_rates.N} / {selected.arrival_rates.S} / {selected.arrival_rates.E} / {selected.arrival_rates.W}
                  </span>
                </div>
                <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-400 block">Speed & Weather</span>
                  <span className="font-semibold mt-0.5 block">
                    {selected.speed_limit_kmh} km/h · {(selected.weather_factor * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-400 block">Transit / Emergency</span>
                  <span className="font-semibold mt-0.5 block">
                    {(selected.bus_prob * 100).toFixed(0)}% bus · {(selected.emergency_prob * 100).toFixed(1)}% emg
                  </span>
                </div>
                <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-400 block">Safety Green Bounds</span>
                  <span className="font-semibold mt-0.5 block">
                    {selected.min_green_s}s – {selected.max_green_s}s
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleLaunchScenario(selected.id)}
                  className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5" /> Run in Live Simulation
                </button>
                <button
                  type="button"
                  onClick={() => handleDuplicate(selected)}
                  className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium flex items-center gap-1"
                >
                  <Copy className="w-3.5 h-3.5" /> Duplicate
                </button>
                <button
                  type="button"
                  onClick={() => handleGenerateSumo(selected.id)}
                  className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium flex items-center gap-1"
                >
                  <FileCode2 className="w-3.5 h-3.5" /> SUMO XML Bundle
                </button>
                {selected.is_preset === 0 && (
                  <button
                    type="button"
                    onClick={() => handleDelete(selected.id)}
                    className="px-3 py-2 rounded-lg border border-rose-500/40 text-rose-500 text-xs font-medium flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                )}
              </div>
            </div>
          )}

          {/* SUMO Integration Status & Generated XML */}
          <div className="p-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold">Eclipse SUMO & TraCI Status</h3>
              <span className="font-mono text-xs flex items-center gap-1 text-cyan-600 dark:text-cyan-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {health?.sumo?.sumo_installed ? 'SUMO Installed' : 'Local Python Fallback Active'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {health?.sumo?.sumo_installed
                ? `Detected binary: ${health.sumo.binary_path} (${health.sumo.version}).`
                : 'SUMO binary not found in this container. Generate valid SUMO .nod.xml, .edg.xml, .rou.xml, and .sumocfg artifacts below for local TraCI execution.'}
            </p>
            {sumoFiles && (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1">
                  {Object.keys(sumoFiles).map((fname) => (
                    <button
                      key={fname}
                      type="button"
                      onClick={() => setActiveSumoTab(fname)}
                      className={`px-2 py-1 rounded text-[11px] font-mono ${
                        activeSumoTab === fname
                          ? 'bg-cyan-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {fname}
                    </button>
                  ))}
                </div>
                <pre className="p-3 rounded bg-slate-950 text-slate-200 font-mono text-[11px] overflow-x-auto max-h-56">
                  {sumoFiles[activeSumoTab]}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
