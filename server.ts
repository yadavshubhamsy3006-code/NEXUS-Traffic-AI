import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { spawnSync } from 'child_process';
import { WebSocketServer } from 'ws';
import { z } from 'zod';
import {
  db,
  getSetting,
  getSupabaseConfig,
  initDatabase,
  setSetting,
  SUPABASE_SCHEMA_SQL,
  syncLocalToSupabase,
  testSupabaseConnection,
} from './server/db.ts';
import {
  getCityNetwork,
  searchCityNominatim,
  TOP_CITIES,
} from './server/osmService.ts';
import { simManager } from './server/simManager.ts';

initDatabase();

const app = express();
app.use(express.json({ limit: '2mb' }));

// ---------------------------------------------------------------------------
// Health & Environment Detection
// ---------------------------------------------------------------------------

function detectSumoStatus(customPath?: string) {
  const pathArg = customPath ?? getSetting('sumo_binary_path') ?? '';
  const res = spawnSync('python3', ['engine/sumo_bridge.py', 'detect', pathArg], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    timeout: 4000,
  });
  try {
    return JSON.parse(res.stdout);
  } catch {
    return {
      sumo_installed: false,
      traci_available: false,
      active_mode: 'python_microscopic_local',
      verify_command: 'sumo --version && python3 -c "import traci; print(\'TraCI OK\')"',
    };
  }
}

app.get('/api/health', async (_req, res) => {
  const sumo = detectSumoStatus();
  const supaCfg = getSupabaseConfig();
  res.json({
    ok: true,
    pythonRuntime: 'Python 3.11',
    database: {
      local: 'SQLite (WAL)',
      supabaseConfigured: supaCfg.configured,
    },
    sumo,
    simState: simManager.state.status,
  });
});

// ---------------------------------------------------------------------------
// SUMO Bridge Endpoints
// ---------------------------------------------------------------------------

app.get('/api/sumo/detect', (req, res) => {
  const customPath = typeof req.query.path === 'string' ? req.query.path : undefined;
  if (customPath !== undefined) {
    setSetting('sumo_binary_path', customPath);
  }
  res.json(detectSumoStatus(customPath));
});

app.post('/api/sumo/bundle', (req, res) => {
  const scenarioId = req.body?.scenarioId || 'sc_rush_hour';
  const scenario = simManager.getScenarioRow(scenarioId) || simManager.getScenarioRow('sc_rush_hour');
  const out = spawnSync('python3', ['engine/sumo_bridge.py', 'bundle'], {
    cwd: process.cwd(),
    input: JSON.stringify(scenario),
    encoding: 'utf-8',
    timeout: 4000,
  });
  try {
    res.json({ ok: true, scenarioName: scenario.name, files: JSON.parse(out.stdout) });
  } catch {
    res.status(500).json({ ok: false, error: 'Failed to generate SUMO XML bundle.' });
  }
});

// ---------------------------------------------------------------------------
// Scenarios CRUD
// ---------------------------------------------------------------------------

const ScenarioCreateSchema = z.object({
  name: z.string().min(3).max(80),
  category: z.string().min(2).max(30).default('Custom'),
  description: z.string().min(4).max(300).default('User configured simulation scenario.'),
  intersections: z.number().int().min(1).max(4).default(1),
  lanes: z.number().int().min(1).max(3).default(2),
  speed_limit_kmh: z.number().min(20).max(90).default(50),
  weather_factor: z.number().min(0.4).max(1.0).default(1.0),
  arrival_rates: z.object({
    N: z.number().min(0.02).max(0.8),
    S: z.number().min(0.02).max(0.8),
    E: z.number().min(0.02).max(0.8),
    W: z.number().min(0.02).max(0.8),
  }),
  turning_probs: z.object({
    straight: z.number().min(0).max(1),
    left: z.number().min(0).max(1),
    right: z.number().min(0).max(1),
  }),
  pedestrian_rate: z.number().min(0).max(0.9).default(0.12),
  bus_prob: z.number().min(0).max(0.5).default(0.08),
  emergency_prob: z.number().min(0).max(0.2).default(0.01),
  duration_s: z.number().int().min(60).max(1800).default(300),
  seed: z.number().int().min(1).max(999999).default(42),
  min_green_s: z.number().min(5).max(20).default(8),
  max_green_s: z.number().min(25).max(90).default(55),
  incident: z
    .object({
      junction: z.string(),
      approach: z.enum(['N', 'S', 'E', 'W']),
      start_s: z.number().min(0),
      end_s: z.number().min(1),
    })
    .nullable()
    .optional(),
});

app.get('/api/scenarios', (_req, res) => {
  const rows = db.prepare('SELECT * FROM scenarios ORDER BY is_preset DESC, created_at DESC').all() as any[];
  res.json(
    rows.map((r) => ({
      ...r,
      arrival_rates: JSON.parse(r.arrival_rates_json),
      turning_probs: JSON.parse(r.turning_probs_json),
      incident: r.incident_json ? JSON.parse(r.incident_json) : null,
      surge_window: r.surge_window_json ? JSON.parse(r.surge_window_json) : null,
    }))
  );
});

app.post('/api/scenarios', (req, res) => {
  const parsed = ScenarioCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid scenario configuration', details: parsed.error.flatten() });
  }
  const d = parsed.data;
  const id = `sc_custom_${Date.now().toString().slice(-6)}`;
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO scenarios (
      id, name, category, description, intersections, lanes, speed_limit_kmh,
      weather_factor, arrival_rates_json, turning_probs_json, pedestrian_rate,
      bus_prob, emergency_prob, duration_s, seed, incident_json, surge_window_json,
      min_green_s, max_green_s, is_preset, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 0, ?)
  `).run(
    id,
    d.name,
    d.category,
    d.description,
    d.intersections,
    d.lanes,
    d.speed_limit_kmh,
    d.weather_factor,
    JSON.stringify(d.arrival_rates),
    JSON.stringify(d.turning_probs),
    d.pedestrian_rate,
    d.bus_prob,
    d.emergency_prob,
    d.duration_s,
    d.seed,
    d.incident ? JSON.stringify(d.incident) : null,
    d.min_green_s,
    d.max_green_s,
    now
  );
  res.json(simManager.getScenarioRow(id));
});

app.delete('/api/scenarios/:id', (req, res) => {
  const row = db.prepare('SELECT is_preset FROM scenarios WHERE id = ?').get(req.params.id) as { is_preset: number } | undefined;
  if (!row) return res.status(404).json({ error: 'Scenario not found' });
  if (row.is_preset === 1) return res.status(400).json({ error: 'Preset scenarios cannot be deleted.' });
  db.prepare('DELETE FROM scenarios WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Live Simulation Controls
// ---------------------------------------------------------------------------

app.get('/api/sim/state', (_req, res) => {
  res.json(simManager.state);
});

app.post('/api/sim/start', (req, res) => {
  const state = simManager.startSimulation(req.body || {});
  res.json(state);
});

app.post('/api/sim/pause', (_req, res) => {
  const result = simManager.pauseSimulation();
  if (!result.ok) return res.status(409).json(result);
  res.json(result);
});

app.post('/api/sim/resume', (_req, res) => {
  const result = simManager.resumeSimulation();
  if (!result.ok) return res.status(409).json(result);
  res.json(result);
});

app.post('/api/sim/stop', (_req, res) => {
  const result = simManager.stopSimulation();
  if (!result.ok) return res.status(409).json(result);
  res.json(result);
});

app.post('/api/sim/reset', (_req, res) => {
  res.json(simManager.resetSimulation());
});

app.post('/api/sim/speed', (req, res) => {
  const speed = Number(req.body?.speedMultiplier || 1);
  res.json(simManager.setSpeed(speed));
});

app.post('/api/sim/controller', (req, res) => {
  const { controllerType, modelId } = req.body || {};
  if (!controllerType) return res.status(400).json({ error: 'controllerType required' });
  simManager.switchController(controllerType, modelId);
  res.json(simManager.state);
});

app.post('/api/sim/emergency', (req, res) => {
  const { junctionId, approach } = req.body || {};
  simManager.injectEmergency(junctionId || 'J1', approach || 'N');
  res.json({ ok: true });
});

app.post('/api/sim/incident', (req, res) => {
  simManager.injectIncident(req.body?.incident ?? null);
  res.json({ ok: true });
});

app.post('/api/sim/eco-idle', (req, res) => {
  simManager.setEcoIdle(Boolean(req.body?.enabled ?? true));
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Telemetry, Runs, & CSV Export
// ---------------------------------------------------------------------------

app.get('/api/telemetry', (req, res) => {
  const runId = typeof req.query.runId === 'string' ? req.query.runId : simManager.state.runId;
  if (!runId) {
    // Fall back to most recent run if any exists
    const latestRun = db.prepare('SELECT id FROM simulation_runs ORDER BY created_at DESC LIMIT 1').get() as { id: string } | undefined;
    if (!latestRun) return res.json([]);
    const rows = db.prepare('SELECT * FROM simulation_telemetry WHERE run_id = ? ORDER BY sim_time ASC LIMIT 240').all(latestRun.id);
    return res.json(rows);
  }
  const rows = db.prepare('SELECT * FROM simulation_telemetry WHERE run_id = ? ORDER BY sim_time ASC LIMIT 240').all(runId);
  res.json(rows);
});

app.get('/api/telemetry/export', (req, res) => {
  const runId = typeof req.query.runId === 'string' ? req.query.runId : simManager.state.runId;
  const rows = runId
    ? (db.prepare('SELECT * FROM simulation_telemetry WHERE run_id = ? ORDER BY sim_time ASC').all(runId) as any[])
    : [];
  const header = 'sim_time,vehicles_in_network,avg_wait_time_s,avg_queue_length,max_queue_length,throughput_vph,total_arrivals,total_departures,co2_emissions_g,total_reward,active_phase,safety_overrides\n';
  const body = rows
    .map((r) =>
      [
        r.sim_time,
        r.vehicles_in_network,
        r.avg_wait_time_s,
        r.avg_queue_length,
        r.max_queue_length,
        r.throughput_vph,
        r.total_arrivals,
        r.total_departures,
        r.co2_emissions_g,
        r.total_reward,
        r.active_phase,
        r.safety_overrides,
      ].join(',')
    )
    .join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="nexus_telemetry_${runId || 'empty'}.csv"`);
  res.send(header + body);
});

app.get('/api/runs', (_req, res) => {
  const rows = db.prepare('SELECT * FROM simulation_runs ORDER BY created_at DESC LIMIT 40').all();
  res.json(rows);
});

// ---------------------------------------------------------------------------
// RL Training, Models & Multi-Algorithm Reproducible Benchmark
// ---------------------------------------------------------------------------

const TrainJobSchema = z.object({
  algorithm: z.enum(['tabular_q', 'dqn', 'dueling_dqn', 'multi_agent_q']),
  scenarioId: z.string(),
  episodes: z.number().int().min(3).max(150).default(15),
  maxSteps: z.number().int().min(30).max(400).default(100),
  learningRate: z.number().min(0.0001).max(0.5).default(0.005),
  gamma: z.number().min(0.5).max(0.999).default(0.94),
  epsilonStart: z.number().min(0.05).max(1.0).default(0.45),
  epsilonEnd: z.number().min(0.01).max(0.5).default(0.05),
  batchSize: z.number().int().min(4).max(128).default(16),
  seed: z.number().int().min(1).max(999999).default(42),
  modelName: z.string().max(60).optional(),
  rewardWeights: z.object({
    wait: z.number().min(0).max(5).default(1.0),
    queue: z.number().min(0).max(5).default(0.6),
    throughput: z.number().min(0).max(5).default(1.4),
    fairness: z.number().min(0).max(5).default(0.4),
    pedestrian: z.number().min(0).max(5).default(0.5),
    emergency: z.number().min(0).max(5).default(2.0),
    switch: z.number().min(0).max(5).default(0.3),
    emissions: z.number().min(0).max(5).default(0.25),
  }),
});

app.post('/api/rl/train', (req, res) => {
  const parsed = TrainJobSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid training parameters', details: parsed.error.flatten() });
  }
  const job = simManager.startTrainingJob(parsed.data);
  res.json(job);
});

app.get('/api/rl/jobs', (_req, res) => {
  const rows = db.prepare('SELECT * FROM rl_training_jobs ORDER BY created_at DESC LIMIT 20').all() as any[];
  res.json(
    rows.map((r) => ({
      ...r,
      hyperparams: JSON.parse(r.hyperparams_json),
      reward_weights: JSON.parse(r.reward_weights_json),
      metrics_history: JSON.parse(r.metrics_history_json),
      logs: JSON.parse(r.logs_json),
    }))
  );
});

app.post('/api/rl/jobs/:id/cancel', (req, res) => {
  const cancelled = simManager.cancelTrainingJob(req.params.id);
  res.json({ ok: cancelled });
});

app.get('/api/rl/models', (_req, res) => {
  const rows = db
    .prepare(
      'SELECT id, name, version, algorithm, scenario_id, eval_score, wait_improvement_pct, inference_latency_ms, status, config_json, created_at FROM rl_models ORDER BY created_at DESC'
    )
    .all() as any[];
  res.json(
    rows.map((r) => ({
      ...r,
      config: JSON.parse(r.config_json || '{}'),
    }))
  );
});

app.post('/api/rl/models/:id/status', (req, res) => {
  const status = req.body?.status;
  if (!['approved', 'trained', 'archived'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  db.prepare('UPDATE rl_models SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ ok: true });
});

app.get('/api/rl/models/:id/export', (req, res) => {
  const row = db.prepare('SELECT * FROM rl_models WHERE id = ?').get(req.params.id) as any;
  if (!row) return res.status(404).json({ error: 'Model not found' });
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${row.id}_${row.version}.json"`);
  res.send(
    JSON.stringify(
      {
        id: row.id,
        name: row.name,
        version: row.version,
        algorithm: row.algorithm,
        scenario_id: row.scenario_id,
        eval_score: row.eval_score,
        disclaimer: 'Simulation research checkpoint only. Not certified for public road hardware.',
        config: JSON.parse(row.config_json || '{}'),
        weights: JSON.parse(row.weights_json || '{}'),
      },
      null,
      2
    )
  );
});

app.post('/api/experiments/compare', (req, res) => {
  const scenarioId = req.body?.scenarioId || 'sc_rush_hour';
  const steps = Math.max(40, Math.min(240, Number(req.body?.steps || 100)));
  const seed = Number(req.body?.seed || 42);
  const scenario = simManager.getScenarioRow(scenarioId) || simManager.getScenarioRow('sc_rush_hour');

  const pyScript = `
import json, sys
from engine.nexus_rl import TrafficNetworkEnv, build_controller

payload = json.loads(sys.stdin.read())
sc = payload['scenario']
steps = payload['steps']
seed = payload['seed']

algos = ['fixed_time', 'actuated', 'density_ambulance', 'tabular_q', 'dqn', 'dueling_dqn', 'multi_agent_q']
results = []

for alg in algos:
    ctrl = build_controller(alg, {'seed': seed, 'epsilon_start': 0.25})
    # Quick warmup for learning agents so comparison reflects learned policy
    if alg in ('tabular_q', 'dqn', 'dueling_dqn', 'multi_agent_q'):
        for ep in range(6):
            w_env = TrafficNetworkEnv(sc, seed=seed + ep)
            obs = w_env.reset()
            for _ in range(60):
                acts = {jid: ctrl.select_action(obs[jid], w_env.signals[jid], training=True)[0] for jid in w_env.junction_ids}
                n_obs, rwds, _, _ = w_env.step(acts)
                for jid in w_env.junction_ids:
                    ctrl.observe(obs[jid], acts[jid], rwds[jid], n_obs[jid])
                obs = n_obs

    env = TrafficNetworkEnv(sc, seed=seed + 100)
    obs = env.reset()
    waits, queues = [], []
    last_info = {}
    for _ in range(steps):
        acts = {jid: ctrl.select_action(obs[jid], env.signals[jid], training=False)[0] for jid in env.junction_ids}
        obs, _, _, last_info = env.step(acts)
        waits.append(last_info['avg_wait_time_s'])
        queues.append(last_info['avg_queue_length'])

    results.append({
        'algorithm': alg,
        'avg_wait_s': round(sum(waits)/len(waits), 2),
        'avg_queue': round(sum(queues)/len(queues), 2),
        'max_queue': last_info['max_queue_length'],
        'throughput_vph': last_info['throughput_vph'],
        'total_departures': last_info['total_departures'],
        'co2_emissions_g': last_info['co2_emissions_g'],
        'safety_overrides': last_info['total_safety_overrides'],
    })

print(json.dumps(results))
`;

  const out = spawnSync('python3', ['-c', pyScript], {
    cwd: process.cwd(),
    input: JSON.stringify({ scenario, steps, seed }),
    encoding: 'utf-8',
    timeout: 25000,
  });

  if (out.status !== 0) {
    return res.status(500).json({ error: 'Experiment comparison failed', detail: out.stderr });
  }
  try {
    res.json({ scenarioName: scenario.name, steps, seed, results: JSON.parse(out.stdout) });
  } catch {
    res.status(500).json({ error: 'Invalid output from experiment runner' });
  }
});

// ---------------------------------------------------------------------------
// Safety Guard Logs & Automated Unit Verification
// ---------------------------------------------------------------------------

app.get('/api/safety/logs', (_req, res) => {
  const rows = db.prepare('SELECT * FROM safety_logs ORDER BY id DESC LIMIT 80').all();
  res.json(rows);
});

app.post('/api/safety/verify', (_req, res) => {
  const out = spawnSync('python3', ['-m', 'unittest', 'discover', '-s', 'engine', '-p', 'test_*.py', '-v'], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    timeout: 8000,
  });
  res.json({
    passed: out.status === 0,
    output: (out.stdout + '\n' + out.stderr).trim(),
    verifiedAt: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// Alerts & Events
// ---------------------------------------------------------------------------

app.get('/api/alerts', (_req, res) => {
  const rows = db.prepare('SELECT * FROM alerts_events ORDER BY id DESC LIMIT 60').all();
  res.json(rows);
});

app.post('/api/alerts/:id/ack', (req, res) => {
  db.prepare('UPDATE alerts_events SET acknowledged = 1 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Geospatial OpenStreetMap, Overpass & Weather Endpoints
// ---------------------------------------------------------------------------

app.get('/api/geo/cities', (_req, res) => {
  res.json(TOP_CITIES);
});

app.get('/api/geo/search', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (q.length < 2) return res.json([]);
  const results = await searchCityNominatim(q);
  res.json(results);
});

app.get('/api/geo/city/:cityId', async (req, res) => {
  const refresh = req.query.refresh === '1';
  const payload = await getCityNetwork(req.params.cityId, undefined, undefined, undefined, refresh);
  simManager.setCity(req.params.cityId, payload.displayName, payload.weather?.weather_factor, payload.aqi?.us_aqi);
  res.json(payload);
});

app.get('/api/geo/network', async (req, res) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  const name = typeof req.query.name === 'string' ? req.query.name : 'Selected City';
  const refresh = req.query.refresh === '1';
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return res.status(400).json({ error: 'Valid lat and lon required' });
  }
  const payload = await getCityNetwork(name.toLowerCase().replace(/\s+/g, '_'), lat, lon, name, refresh);
  simManager.setCity(payload.cityKey, payload.displayName, payload.weather?.weather_factor, payload.aqi?.us_aqi);
  res.json(payload);
});

// ---------------------------------------------------------------------------
// Supabase Integration Endpoints
// ---------------------------------------------------------------------------

app.get('/api/integrations/supabase', async (_req, res) => {
  const cfg = getSupabaseConfig();
  const status = await testSupabaseConnection();
  res.json({
    configured: cfg.configured,
    url: cfg.url ? cfg.url.replace(/(https:\/\/[^.]+).*/, '$1.supabase.co') : '',
    ...status,
    schemaSql: SUPABASE_SCHEMA_SQL,
  });
});

app.post('/api/integrations/supabase', async (req, res) => {
  const { url, anonKey } = req.body || {};
  if (!url || !anonKey) {
    return res.status(400).json({ error: 'Supabase Project URL and Anon Key are required.' });
  }
  setSetting('supabase_url', String(url).trim());
  setSetting('supabase_anon_key', String(anonKey).trim());
  const status = await testSupabaseConnection();
  res.json(status);
});

app.post('/api/integrations/supabase/sync', async (_req, res) => {
  const result = await syncLocalToSupabase();
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

// ---------------------------------------------------------------------------
// Server Bootstrap (HTTP + WebSocket + Vite/Static)
// ---------------------------------------------------------------------------

async function startServer() {
  const PORT = Number(process.env.PORT || 3000);
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });
  simManager.attachWebSocketServer(wss);

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`NEXUS Traffic AI Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
