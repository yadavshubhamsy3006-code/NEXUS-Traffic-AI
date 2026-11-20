import { DatabaseSync } from 'node:sqlite';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import path from 'path';

const dbPath = process.env.DATABASE_PATH || path.resolve(process.cwd(), 'nexus_traffic.db');
export const db = new DatabaseSync(dbPath);

export function initDatabase(): void {
  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS scenarios (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      intersections INTEGER NOT NULL DEFAULT 1,
      lanes INTEGER NOT NULL DEFAULT 2,
      speed_limit_kmh REAL NOT NULL DEFAULT 50,
      weather_factor REAL NOT NULL DEFAULT 1.0,
      arrival_rates_json TEXT NOT NULL,
      turning_probs_json TEXT NOT NULL,
      pedestrian_rate REAL NOT NULL DEFAULT 0.12,
      bus_prob REAL NOT NULL DEFAULT 0.08,
      emergency_prob REAL NOT NULL DEFAULT 0.01,
      duration_s INTEGER NOT NULL DEFAULT 300,
      seed INTEGER NOT NULL DEFAULT 42,
      incident_json TEXT,
      surge_window_json TEXT,
      min_green_s REAL NOT NULL DEFAULT 8,
      max_green_s REAL NOT NULL DEFAULT 55,
      is_preset INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS simulation_runs (
      id TEXT PRIMARY KEY,
      scenario_id TEXT NOT NULL,
      scenario_name TEXT NOT NULL,
      controller_type TEXT NOT NULL,
      model_id TEXT,
      sim_mode TEXT NOT NULL,
      city_name TEXT NOT NULL,
      status TEXT NOT NULL,
      sim_time_s REAL NOT NULL DEFAULT 0,
      avg_wait_s REAL NOT NULL DEFAULT 0,
      avg_queue REAL NOT NULL DEFAULT 0,
      max_queue INTEGER NOT NULL DEFAULT 0,
      throughput_vph REAL NOT NULL DEFAULT 0,
      total_departures INTEGER NOT NULL DEFAULT 0,
      co2_grams REAL NOT NULL DEFAULT 0,
      safety_overrides INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS simulation_telemetry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      sim_time REAL NOT NULL,
      vehicles_in_network INTEGER NOT NULL,
      avg_wait_time_s REAL NOT NULL,
      avg_queue_length REAL NOT NULL,
      max_queue_length INTEGER NOT NULL,
      throughput_vph REAL NOT NULL,
      total_arrivals INTEGER NOT NULL,
      total_departures INTEGER NOT NULL,
      co2_emissions_g REAL NOT NULL,
      total_reward REAL NOT NULL,
      active_phase INTEGER NOT NULL,
      safety_overrides INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rl_training_jobs (
      id TEXT PRIMARY KEY,
      algorithm TEXT NOT NULL,
      scenario_id TEXT NOT NULL,
      hyperparams_json TEXT NOT NULL,
      reward_weights_json TEXT NOT NULL,
      status TEXT NOT NULL,
      current_episode INTEGER NOT NULL DEFAULT 0,
      total_episodes INTEGER NOT NULL DEFAULT 20,
      best_reward REAL,
      metrics_history_json TEXT NOT NULL,
      logs_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS rl_models (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      version TEXT NOT NULL,
      algorithm TEXT NOT NULL,
      scenario_id TEXT NOT NULL,
      eval_score REAL NOT NULL,
      wait_improvement_pct REAL NOT NULL,
      inference_latency_ms REAL NOT NULL,
      status TEXT NOT NULL,
      weights_json TEXT NOT NULL,
      config_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS safety_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      sim_time REAL NOT NULL,
      junction_id TEXT NOT NULL,
      proposed_action TEXT NOT NULL,
      executed_action TEXT NOT NULL,
      override_type TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS alerts_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      severity TEXT NOT NULL,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      detail TEXT NOT NULL,
      junction_id TEXT,
      acknowledged INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS osm_city_cache (
      city_key TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      country TEXT NOT NULL,
      lat REAL NOT NULL,
      lon REAL NOT NULL,
      source_status TEXT NOT NULL,
      junctions_json TEXT NOT NULL,
      roads_json TEXT NOT NULL,
      weather_json TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  seedInitialData();
}

function seedInitialData(): void {
  const existingScenarios = db.prepare('SELECT COUNT(*) as cnt FROM scenarios').get() as { cnt: number };
  if (existingScenarios.cnt === 0) {
    const now = new Date().toISOString();
    const presets = [
      {
        id: 'sc_low_density',
        name: 'Low-Density Urban Junction',
        category: 'Baseline',
        description: 'Balanced off-peak urban traffic with moderate pedestrian crossings and steady flow.',
        intersections: 1,
        lanes: 2,
        speed_limit_kmh: 50,
        weather_factor: 1.0,
        arrival_rates: { N: 0.14, S: 0.14, E: 0.12, W: 0.12 },
        turning_probs: { straight: 0.7, left: 0.15, right: 0.15 },
        pedestrian_rate: 0.08,
        bus_prob: 0.06,
        emergency_prob: 0.005,
        duration_s: 300,
        seed: 101,
      },
      {
        id: 'sc_rush_hour',
        name: 'Peak Rush-Hour Congestion',
        category: 'Congestion',
        description: 'High bidirectional commuter demand approaching saturation across all four approaches.',
        intersections: 1,
        lanes: 2,
        speed_limit_kmh: 45,
        weather_factor: 1.0,
        arrival_rates: { N: 0.42, S: 0.40, E: 0.38, W: 0.39 },
        turning_probs: { straight: 0.62, left: 0.22, right: 0.16 },
        pedestrian_rate: 0.22,
        bus_prob: 0.10,
        emergency_prob: 0.01,
        duration_s: 300,
        seed: 202,
      },
      {
        id: 'sc_uneven_dir',
        name: 'Uneven Tidal Arterial Flow',
        category: 'Asymmetric',
        description: 'Heavy East-West arterial inflow (3.5x North-South side-street demand) testing starvation prevention.',
        intersections: 1,
        lanes: 2,
        speed_limit_kmh: 55,
        weather_factor: 1.0,
        arrival_rates: { N: 0.10, S: 0.11, E: 0.44, W: 0.40 },
        turning_probs: { straight: 0.72, left: 0.16, right: 0.12 },
        pedestrian_rate: 0.10,
        bus_prob: 0.08,
        emergency_prob: 0.008,
        duration_s: 300,
        seed: 303,
      },
      {
        id: 'sc_sudden_surge',
        name: 'Sudden Stadium / Event Surge',
        category: 'Dynamic',
        description: 'Baseline demand followed by a 2.2x arrival wave between t=35s and t=140s.',
        intersections: 1,
        lanes: 2,
        speed_limit_kmh: 50,
        weather_factor: 1.0,
        arrival_rates: { N: 0.24, S: 0.22, E: 0.25, W: 0.22 },
        turning_probs: { straight: 0.65, left: 0.20, right: 0.15 },
        pedestrian_rate: 0.20,
        bus_prob: 0.12,
        emergency_prob: 0.01,
        duration_s: 300,
        seed: 404,
        surge_window: { start_s: 35, end_s: 140, multiplier: 2.2 },
      },
      {
        id: 'sc_school_zone',
        name: 'School-Zone Speed & Crosswalk',
        category: 'Safety',
        description: 'Reduced 30 km/h speed limit with frequent pedestrian crosswalk calls and drop-off bursts.',
        intersections: 1,
        lanes: 2,
        speed_limit_kmh: 30,
        weather_factor: 1.0,
        arrival_rates: { N: 0.22, S: 0.20, E: 0.25, W: 0.25 },
        turning_probs: { straight: 0.55, left: 0.25, right: 0.20 },
        pedestrian_rate: 0.42,
        bus_prob: 0.14,
        emergency_prob: 0.005,
        duration_s: 300,
        seed: 505,
      },
      {
        id: 'sc_pedestrian_heavy',
        name: 'Pedestrian-Heavy Transit Plaza',
        category: 'Multimodal',
        description: 'High pedestrian crossing demand requiring protected all-walk intervals without gridlock.',
        intersections: 1,
        lanes: 2,
        speed_limit_kmh: 40,
        weather_factor: 1.0,
        arrival_rates: { N: 0.26, S: 0.26, E: 0.28, W: 0.28 },
        turning_probs: { straight: 0.60, left: 0.20, right: 0.20 },
        pedestrian_rate: 0.55,
        bus_prob: 0.15,
        emergency_prob: 0.01,
        duration_s: 300,
        seed: 606,
      },
      {
        id: 'sc_bus_priority',
        name: 'BRT / Public Bus Priority Corridor',
        category: 'Multimodal',
        description: 'High public transit frequency (24% buses) rewarding transit delay minimization.',
        intersections: 2,
        lanes: 2,
        speed_limit_kmh: 50,
        weather_factor: 1.0,
        arrival_rates: { N: 0.20, S: 0.20, E: 0.36, W: 0.34 },
        turning_probs: { straight: 0.75, left: 0.13, right: 0.12 },
        pedestrian_rate: 0.16,
        bus_prob: 0.24,
        emergency_prob: 0.01,
        duration_s: 300,
        seed: 707,
      },
      {
        id: 'sc_emergency',
        name: 'Emergency Ambulance Preemption',
        category: 'Emergency',
        description: 'Frequent emergency response vehicles triggering Safety Guard yellow/all-red preemption.',
        intersections: 1,
        lanes: 2,
        speed_limit_kmh: 50,
        weather_factor: 1.0,
        arrival_rates: { N: 0.30, S: 0.30, E: 0.30, W: 0.30 },
        turning_probs: { straight: 0.65, left: 0.20, right: 0.15 },
        pedestrian_rate: 0.12,
        bus_prob: 0.08,
        emergency_prob: 0.06,
        duration_s: 300,
        seed: 808,
      },
      {
        id: 'sc_road_closure',
        name: 'Eastbound Approach Closure',
        category: 'Incident',
        description: 'Simulated utility work closing Eastbound lanes at J1, rerouting adaptive signal splits.',
        intersections: 1,
        lanes: 2,
        speed_limit_kmh: 45,
        weather_factor: 1.0,
        arrival_rates: { N: 0.28, S: 0.28, E: 0.15, W: 0.32 },
        turning_probs: { straight: 0.60, left: 0.22, right: 0.18 },
        pedestrian_rate: 0.12,
        bus_prob: 0.08,
        emergency_prob: 0.01,
        duration_s: 300,
        seed: 909,
        incident: { junction: 'J1', approach: 'E', start_s: 15, end_s: 280 },
      },
      {
        id: 'sc_lane_reduction',
        name: 'Single-Lane Bottleneck Reduction',
        category: 'Incident',
        description: 'Single-lane urban constriction increasing queue length sensitivity per arrival.',
        intersections: 1,
        lanes: 1,
        speed_limit_kmh: 40,
        weather_factor: 1.0,
        arrival_rates: { N: 0.24, S: 0.24, E: 0.24, W: 0.24 },
        turning_probs: { straight: 0.70, left: 0.15, right: 0.15 },
        pedestrian_rate: 0.14,
        bus_prob: 0.08,
        emergency_prob: 0.01,
        duration_s: 300,
        seed: 1010,
      },
      {
        id: 'sc_accident',
        name: 'Mid-Run Accident Congestion',
        category: 'Incident',
        description: 'Incident strikes Northbound J1 from t=25s to t=180s, forcing dynamic signal recovery.',
        intersections: 1,
        lanes: 2,
        speed_limit_kmh: 50,
        weather_factor: 1.0,
        arrival_rates: { N: 0.35, S: 0.30, E: 0.32, W: 0.32 },
        turning_probs: { straight: 0.65, left: 0.20, right: 0.15 },
        pedestrian_rate: 0.10,
        bus_prob: 0.08,
        emergency_prob: 0.03,
        duration_s: 300,
        seed: 1111,
        incident: { junction: 'J1', approach: 'N', start_s: 25, end_s: 180 },
      },
      {
        id: 'sc_rain_weather',
        name: 'Monsoon / Heavy Rain Slowdown',
        category: 'Weather',
        description: '0.70x wet-road speed & braking friction factor requiring longer clearance recovery.',
        intersections: 1,
        lanes: 2,
        speed_limit_kmh: 50,
        weather_factor: 0.70,
        arrival_rates: { N: 0.30, S: 0.30, E: 0.30, W: 0.30 },
        turning_probs: { straight: 0.65, left: 0.20, right: 0.15 },
        pedestrian_rate: 0.08,
        bus_prob: 0.10,
        emergency_prob: 0.015,
        duration_s: 300,
        seed: 1212,
      },
      {
        id: 'sc_corridor_2j',
        name: '2-Junction Arterial Corridor',
        category: 'Multi-Junction',
        description: 'Two coupled intersections (J1-J2) testing green-wave coordination and queue spillback.',
        intersections: 2,
        lanes: 2,
        speed_limit_kmh: 55,
        weather_factor: 1.0,
        arrival_rates: { N: 0.20, S: 0.20, E: 0.35, W: 0.34 },
        turning_probs: { straight: 0.76, left: 0.12, right: 0.12 },
        pedestrian_rate: 0.12,
        bus_prob: 0.10,
        emergency_prob: 0.01,
        duration_s: 300,
        seed: 1313,
      },
      {
        id: 'sc_corridor_3j',
        name: '3-Junction Coordinated Corridor',
        category: 'Multi-Junction',
        description: 'Three linked urban intersections evaluating Multi-Agent RL downstream pressure propagation.',
        intersections: 3,
        lanes: 2,
        speed_limit_kmh: 50,
        weather_factor: 1.0,
        arrival_rates: { N: 0.22, S: 0.22, E: 0.36, W: 0.34 },
        turning_probs: { straight: 0.74, left: 0.14, right: 0.12 },
        pedestrian_rate: 0.14,
        bus_prob: 0.12,
        emergency_prob: 0.01,
        duration_s: 300,
        seed: 1414,
      },
      {
        id: 'sc_grid_2x2',
        name: '2x2 Urban Grid Network (4 Junctions)',
        category: 'Multi-Junction',
        description: 'Four interconnected junctions with multi-directional demand and balanced fairness weights.',
        intersections: 4,
        lanes: 2,
        speed_limit_kmh: 45,
        weather_factor: 1.0,
        arrival_rates: { N: 0.25, S: 0.25, E: 0.27, W: 0.27 },
        turning_probs: { straight: 0.65, left: 0.18, right: 0.17 },
        pedestrian_rate: 0.16,
        bus_prob: 0.09,
        emergency_prob: 0.01,
        duration_s: 300,
        seed: 1515,
      },
    ];

    const stmt = db.prepare(`
      INSERT INTO scenarios (
        id, name, category, description, intersections, lanes, speed_limit_kmh,
        weather_factor, arrival_rates_json, turning_probs_json, pedestrian_rate,
        bus_prob, emergency_prob, duration_s, seed, incident_json, surge_window_json,
        min_green_s, max_green_s, is_preset, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `);

    for (const p of presets) {
      stmt.run(
        p.id,
        p.name,
        p.category,
        p.description,
        p.intersections,
        p.lanes,
        p.speed_limit_kmh,
        p.weather_factor,
        JSON.stringify(p.arrival_rates),
        JSON.stringify(p.turning_probs),
        p.pedestrian_rate,
        p.bus_prob,
        p.emergency_prob,
        p.duration_s,
        p.seed,
        p.incident ? JSON.stringify(p.incident) : null,
        p.surge_window ? JSON.stringify(p.surge_window) : null,
        8,
        55,
        now
      );
    }
  }

  // Seed initial approved baseline policy entries if none exist
  const existingModels = db.prepare('SELECT COUNT(*) as cnt FROM rl_models').get() as { cnt: number };
  if (existingModels.cnt === 0) {
    const now = new Date().toISOString();
    const insertModel = db.prepare(`
      INSERT INTO rl_models (
        id, name, version, algorithm, scenario_id, eval_score,
        wait_improvement_pct, inference_latency_ms, status, weights_json, config_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertModel.run(
      'mdl_dqn_base',
      'DQN Adaptive Urban Policy',
      'v1.0.0',
      'dqn',
      'sc_rush_hour',
      78.4,
      21.5,
      0.18,
      'approved',
      '{}',
      JSON.stringify({ learning_rate: 0.005, gamma: 0.94, episodes: 25 }),
      now
    );
    insertModel.run(
      'mdl_marl_corridor',
      'Multi-Agent Corridor Coordinator',
      'v1.0.0',
      'multi_agent_q',
      'sc_corridor_3j',
      82.1,
      26.4,
      0.24,
      'approved',
      '{}',
      JSON.stringify({ learning_rate: 0.005, gamma: 0.95, episodes: 30 }),
      now
    );
  }

  const existingAlerts = db.prepare('SELECT COUNT(*) as cnt FROM alerts_events').get() as { cnt: number };
  if (existingAlerts.cnt === 0) {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO alerts_events (severity, category, title, detail, junction_id, acknowledged, created_at)
      VALUES (?, ?, ?, ?, ?, 0, ?)
    `).run(
      'info',
      'system',
      'NEXUS Local SQLite & Python 3.11 RL Engine Initialized',
      '15 reproducible urban traffic scenarios and deterministic Safety Guard rules loaded.',
      'J1',
      now
    );
  }
}

export function getSetting(key: string): string | null {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row ? row.value : null;
}

export function setSetting(key: string, value: string): void {
  db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

export function getSupabaseConfig(): { url: string; anonKey: string; configured: boolean } {
  const url = getSetting('supabase_url') || process.env.SUPABASE_URL || '';
  const anonKey = getSetting('supabase_anon_key') || process.env.SUPABASE_ANON_KEY || '';
  const configured = Boolean(url && anonKey && url.startsWith('http'));
  return { url, anonKey, configured };
}

export function getSupabaseClient(): SupabaseClient | null {
  const cfg = getSupabaseConfig();
  if (!cfg.configured) return null;
  return createClient(cfg.url, cfg.anonKey);
}

export async function testSupabaseConnection(): Promise<{
  connected: boolean;
  message: string;
  tablesReady?: boolean;
}> {
  const cfg = getSupabaseConfig();
  if (!cfg.configured) {
    return { connected: false, message: 'Supabase URL and Anon Key are not configured.' };
  }
  try {
    const supabase = createClient(cfg.url, cfg.anonKey);
    const { error } = await supabase.from('scenarios').select('id').limit(1);
    if (error) {
      if (error.message.includes('does not exist') || error.code === '42P01') {
        return {
          connected: true,
          tablesReady: false,
          message: 'Connected to Supabase project, but NEXUS schema tables are not created yet. Run the SQL schema below in Supabase SQL Editor.',
        };
      }
      return { connected: false, message: `Supabase query error: ${error.message}` };
    }
    return {
      connected: true,
      tablesReady: true,
      message: 'Connected to Supabase PostgreSQL with NEXUS tables verified.',
    };
  } catch (err: any) {
    return { connected: false, message: err?.message || 'Failed to connect to Supabase.' };
  }
}

export async function syncLocalToSupabase(): Promise<{ synced: number; error?: string }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { synced: 0, error: 'Supabase not configured' };

  try {
    let total = 0;
    const scenarios = db.prepare('SELECT * FROM scenarios').all() as any[];
    if (scenarios.length > 0) {
      const { error } = await supabase.from('scenarios').upsert(
        scenarios.map((s) => ({
          id: s.id,
          name: s.name,
          category: s.category,
          description: s.description,
          intersections: s.intersections,
          lanes: s.lanes,
          speed_limit_kmh: s.speed_limit_kmh,
          weather_factor: s.weather_factor,
          arrival_rates_json: JSON.parse(s.arrival_rates_json),
          turning_probs_json: JSON.parse(s.turning_probs_json),
          pedestrian_rate: s.pedestrian_rate,
          bus_prob: s.bus_prob,
          emergency_prob: s.emergency_prob,
          duration_s: s.duration_s,
          seed: s.seed,
          created_at: s.created_at,
        })),
        { onConflict: 'id' }
      );
      if (error) return { synced: 0, error: error.message };
      total += scenarios.length;
    }

    const runs = db.prepare('SELECT * FROM simulation_runs ORDER BY created_at DESC LIMIT 50').all() as any[];
    if (runs.length > 0) {
      const { error } = await supabase.from('simulation_runs').upsert(runs, { onConflict: 'id' });
      if (error) return { synced: total, error: error.message };
      total += runs.length;
    }

    const models = db.prepare('SELECT id, name, version, algorithm, scenario_id, eval_score, wait_improvement_pct, inference_latency_ms, status, created_at FROM rl_models').all() as any[];
    if (models.length > 0) {
      const { error } = await supabase.from('rl_models').upsert(models, { onConflict: 'id' });
      if (error) return { synced: total, error: error.message };
      total += models.length;
    }

    return { synced: total };
  } catch (err: any) {
    return { synced: 0, error: err?.message || 'Supabase sync failed' };
  }
}

export const SUPABASE_SCHEMA_SQL = `-- NEXUS Traffic AI — Supabase PostgreSQL + PostGIS Schema
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS scenarios (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  intersections INTEGER NOT NULL DEFAULT 1,
  lanes INTEGER NOT NULL DEFAULT 2,
  speed_limit_kmh DOUBLE PRECISION NOT NULL DEFAULT 50,
  weather_factor DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  arrival_rates_json JSONB NOT NULL,
  turning_probs_json JSONB NOT NULL,
  pedestrian_rate DOUBLE PRECISION NOT NULL DEFAULT 0.12,
  bus_prob DOUBLE PRECISION NOT NULL DEFAULT 0.08,
  emergency_prob DOUBLE PRECISION NOT NULL DEFAULT 0.01,
  duration_s INTEGER NOT NULL DEFAULT 300,
  seed INTEGER NOT NULL DEFAULT 42,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS simulation_runs (
  id TEXT PRIMARY KEY,
  scenario_id TEXT NOT NULL,
  scenario_name TEXT NOT NULL,
  controller_type TEXT NOT NULL,
  model_id TEXT,
  sim_mode TEXT NOT NULL,
  city_name TEXT NOT NULL,
  status TEXT NOT NULL,
  sim_time_s DOUBLE PRECISION NOT NULL DEFAULT 0,
  avg_wait_s DOUBLE PRECISION NOT NULL DEFAULT 0,
  avg_queue DOUBLE PRECISION NOT NULL DEFAULT 0,
  max_queue INTEGER NOT NULL DEFAULT 0,
  throughput_vph DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_departures INTEGER NOT NULL DEFAULT 0,
  co2_grams DOUBLE PRECISION NOT NULL DEFAULT 0,
  safety_overrides INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS rl_models (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  algorithm TEXT NOT NULL,
  scenario_id TEXT NOT NULL,
  eval_score DOUBLE PRECISION NOT NULL,
  wait_improvement_pct DOUBLE PRECISION NOT NULL,
  inference_latency_ms DOUBLE PRECISION NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS osm_junctions (
  id TEXT PRIMARY KEY,
  city_name TEXT NOT NULL,
  junction_name TEXT NOT NULL,
  location GEOGRAPHY(Point, 4326) NOT NULL,
  lanes INTEGER NOT NULL DEFAULT 2,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;
