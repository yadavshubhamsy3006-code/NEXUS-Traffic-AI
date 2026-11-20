import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

export interface SimSnapshot {
  sim_time: number;
  vehicles_in_network: number;
  avg_wait_time_s: number;
  avg_queue_length: number;
  max_queue_length: number;
  throughput_vph: number;
  total_arrivals: number;
  total_departures: number;
  co2_emissions_g: number;
  active_incidents: number;
  emergency_active: boolean;
  inference_latency_ms?: number;
  algorithm?: string;
  explanation?: string;
  reward_breakdown: {
    wait_penalty: number;
    queue_penalty: number;
    throughput_bonus: number;
    fairness_bonus: number;
    pedestrian_penalty: number;
    emergency_bonus: number;
    switch_penalty: number;
    emission_penalty: number;
    total_reward: number;
  };
  junctions: Array<{
    junction_id: string;
    current_phase: number;
    phase_name: string;
    light_state: 'GREEN' | 'YELLOW' | 'ALL_RED';
    phase_elapsed_s: number;
    min_hold_s: number;
    countdown_s: number;
    queues: Record<'N' | 'S' | 'E' | 'W', number>;
    wait_by_approach: Record<'N' | 'S' | 'E' | 'W', number>;
    pedestrians_waiting: number;
    switches: number;
    approach_detection?: Array<{
      approach: 'N' | 'S' | 'E' | 'W';
      vehicle_count: number;
      cars: number;
      bikes: number;
      buses: number;
      stopped: number;
      avg_wait_s: number;
      emergency_detected: boolean;
      density_score: number;
      signal_state: 'GREEN' | 'YELLOW' | 'RED';
      priority_rank: number;
      est_red_wait_s: number;
      engine_off_advised: boolean;
      advisory_message: string;
    }>;
  }>;
  aqi_telemetry?: {
    city_background_aqi: number;
    local_junction_aqi: number;
    pm2_5_ugm3: number;
    category: string;
    eco_idle_stop: boolean;
    fuel_burned_ml: number;
    fuel_saved_ml: number;
    co2_saved_g: number;
  };
  approach_detection?: Array<{
    approach: 'N' | 'S' | 'E' | 'W';
    vehicle_count: number;
    cars: number;
    bikes: number;
    buses: number;
    stopped: number;
    avg_wait_s: number;
    emergency_detected: boolean;
    density_score: number;
    signal_state: 'GREEN' | 'YELLOW' | 'RED';
    priority_rank: number;
    est_red_wait_s: number;
    engine_off_advised: boolean;
    advisory_message: string;
  }>;
  vehicles: Array<{
    id: string;
    j: string;
    a: 'N' | 'S' | 'E' | 'W';
    l: number;
    m: 'straight' | 'left' | 'right';
    t: 'car' | 'bike' | 'bus' | 'emergency';
    p: number;
    s: number;
    w: number;
    st: boolean;
  }>;
  step_overrides: any[];
  total_safety_overrides: number;
}

export interface SimState {
  runId: string | null;
  status: 'idle' | 'running' | 'paused' | 'stopped';
  scenarioId: string;
  scenarioName: string;
  controllerType: string;
  modelId: string | null;
  cityKey: string;
  cityName: string;
  speedMultiplier: number;
  simMode: 'python_microscopic_local' | 'sumo_traci';
  lastUpdated: string;
  latestSnapshot: SimSnapshot | null;
}

export interface CityNetwork {
  cityKey: string;
  displayName: string;
  country: string;
  lat: number;
  lon: number;
  sourceStatus: string;
  attribution: string;
  junctions: Array<{
    id: string;
    name: string;
    lat: number;
    lon: number;
    lanes: number;
    phases: string[];
    approaches: Record<'N' | 'S' | 'E' | 'W', [number, number][]>;
  }>;
  roads: Array<{
    id: string;
    name: string;
    highway: string;
    lanes: number;
    maxspeed: number;
    coords: [number, number][];
  }>;
  weather: {
    temperature_c: number;
    precipitation_mm: number;
    wind_kmh: number;
    condition: string;
    weather_factor: number;
    source: string;
  } | null;
  aqi: {
    us_aqi: number;
    european_aqi: number;
    pm2_5: number;
    pm10: number;
    no2: number;
    co: number;
    category: string;
    source: string;
  } | null;
}

export interface TelemetryPoint {
  sim_time: number;
  avg_wait_time_s: number;
  avg_queue_length: number;
  max_queue_length: number;
  throughput_vph: number;
  total_arrivals: number;
  total_departures: number;
  co2_emissions_g: number;
  total_reward: number;
  active_phase: number;
}

interface NexusContextValue {
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  wsConnected: boolean;
  simState: SimState;
  snapshot: SimSnapshot | null;
  telemetry: TelemetryPoint[];
  topCities: Array<{ id: string; name: string; country: string; focusIntersection: string; lat: number; lon: number }>;
  cityNetwork: CityNetwork | null;
  cityLoading: boolean;
  health: any;
  trainLiveUpdate: any;
  selectCity: (cityIdOrCustom: string, coords?: { lat: number; lon: number; name: string }, refresh?: boolean) => Promise<void>;
  startSim: (opts?: { scenarioId?: string; controllerType?: string; modelId?: string | null; speedMultiplier?: number }) => Promise<void>;
  pauseSim: () => Promise<void>;
  resumeSim: () => Promise<void>;
  stopSim: () => Promise<void>;
  resetSim: () => Promise<void>;
  setSpeed: (speed: number) => Promise<void>;
  switchController: (controllerType: string, modelId?: string | null) => Promise<void>;
  injectEmergency: (junctionId?: string, approach?: string) => Promise<void>;
  injectIncident: (incident: { junction: string; approach: string; start_s: number; end_s: number } | null) => Promise<void>;
  setEcoIdle: (enabled: boolean) => Promise<void>;
  refreshHealth: () => Promise<void>;
}

const DEFAULT_SIM_STATE: SimState = {
  runId: null,
  status: 'idle',
  scenarioId: 'sc_rush_hour',
  scenarioName: 'Peak Rush-Hour Congestion',
  controllerType: 'dqn',
  modelId: 'mdl_dqn_base',
  cityKey: 'bengaluru',
  cityName: 'Bengaluru',
  speedMultiplier: 1,
  simMode: 'python_microscopic_local',
  lastUpdated: new Date().toISOString(),
  latestSnapshot: null,
};

const NexusContext = createContext<NexusContextValue | null>(null);

export function NexusProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('nexus_theme');
    return saved === 'light' ? 'light' : 'dark';
  });
  const [wsConnected, setWsConnected] = useState(false);
  const [simState, setSimState] = useState<SimState>(DEFAULT_SIM_STATE);
  const [snapshot, setSnapshot] = useState<SimSnapshot | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryPoint[]>([]);
  const [topCities, setTopCities] = useState<any[]>([]);
  const [cityNetwork, setCityNetwork] = useState<CityNetwork | null>(null);
  const [cityLoading, setCityLoading] = useState(false);
  const [health, setHealth] = useState<any>(null);
  const [trainLiveUpdate, setTrainLiveUpdate] = useState<any>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('nexus_theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const refreshHealth = useCallback(async () => {
    try {
      const r = await fetch('/api/health');
      if (r.ok) setHealth(await r.json());
    } catch {
      // Ignore
    }
  }, []);

  const selectCity = useCallback(
    async (cityIdOrCustom: string, coords?: { lat: number; lon: number; name: string }, refresh = false) => {
      setCityLoading(true);
      try {
        const url = coords
          ? `/api/geo/network?lat=${coords.lat}&lon=${coords.lon}&name=${encodeURIComponent(coords.name)}${refresh ? '&refresh=1' : ''}`
          : `/api/geo/city/${encodeURIComponent(cityIdOrCustom)}${refresh ? '?refresh=1' : ''}`;
        const r = await fetch(url);
        if (r.ok) {
          const data: CityNetwork = await r.json();
          setCityNetwork(data);
          setSimState((prev) => ({ ...prev, cityKey: cityIdOrCustom, cityName: data.displayName }));
        }
      } finally {
        setCityLoading(false);
      }
    },
    []
  );

  // Initial load: health, cities, Bengaluru default, telemetry history
  useEffect(() => {
    refreshHealth();
    fetch('/api/geo/cities')
      .then((r) => r.json())
      .then((list) => setTopCities(list))
      .catch(() => {});
    selectCity('bengaluru');
    fetch('/api/telemetry')
      .then((r) => r.json())
      .then((rows) => {
        if (Array.isArray(rows) && rows.length > 0) {
          setTelemetry(rows);
        }
      })
      .catch(() => {});
  }, [refreshHealth, selectCity]);

  // WebSocket live connection with automatic reconnect
  useEffect(() => {
    let alive = true;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (!alive) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (alive) setWsConnected(true);
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === 'sim_state' && msg.data) {
            setSimState(msg.data);
            if (msg.data.latestSnapshot) setSnapshot(msg.data.latestSnapshot);
          } else if (msg.type === 'sim_tick') {
            if (msg.state) setSimState(msg.state);
            if (msg.snapshot) {
              const s: SimSnapshot = msg.snapshot;
              setSnapshot(s);
              setTelemetry((prev) => {
                const pt: TelemetryPoint = {
                  sim_time: s.sim_time,
                  avg_wait_time_s: s.avg_wait_time_s,
                  avg_queue_length: s.avg_queue_length,
                  max_queue_length: s.max_queue_length,
                  throughput_vph: s.throughput_vph,
                  total_arrivals: s.total_arrivals,
                  total_departures: s.total_departures,
                  co2_emissions_g: s.co2_emissions_g,
                  total_reward: s.reward_breakdown?.total_reward ?? 0,
                  active_phase: s.junctions?.[0]?.current_phase ?? 0,
                };
                if (prev.length > 0 && s.sim_time <= prev[prev.length - 1].sim_time && s.sim_time < 3) {
                  return [pt];
                }
                const next = [...prev, pt];
                return next.length > 140 ? next.slice(-140) : next;
              });
            }
          } else if (msg.type === 'train_progress' || msg.type === 'train_complete' || msg.type === 'train_cancelled') {
            setTrainLiveUpdate({ ...msg, receivedAt: Date.now() });
          }
        } catch {
          // Ignore malformed WS frame
        }
      };

      ws.onclose = () => {
        if (alive) {
          setWsConnected(false);
          retryTimer = setTimeout(connect, 2000);
        }
      };
    }

    connect();
    return () => {
      alive = false;
      if (retryTimer) clearTimeout(retryTimer);
      wsRef.current?.close();
    };
  }, []);

  const startSim = useCallback(
    async (opts?: { scenarioId?: string; controllerType?: string; modelId?: string | null; speedMultiplier?: number }) => {
      setTelemetry([]);
      const r = await fetch('/api/sim/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cityKey: simState.cityKey,
          cityName: simState.cityName,
          ...opts,
        }),
      });
      if (r.ok) {
        const data = await r.json();
        setSimState(data);
      }
    },
    [simState.cityKey, simState.cityName]
  );

  const pauseSim = useCallback(async () => {
    const r = await fetch('/api/sim/pause', { method: 'POST' });
    if (r.ok) {
      const res = await r.json();
      if (res.state) setSimState(res.state);
    }
  }, []);

  const resumeSim = useCallback(async () => {
    const r = await fetch('/api/sim/resume', { method: 'POST' });
    if (r.ok) {
      const res = await r.json();
      if (res.state) setSimState(res.state);
    }
  }, []);

  const stopSim = useCallback(async () => {
    const r = await fetch('/api/sim/stop', { method: 'POST' });
    if (r.ok) {
      const res = await r.json();
      if (res.state) setSimState(res.state);
    }
  }, []);

  const resetSim = useCallback(async () => {
    setTelemetry([]);
    const r = await fetch('/api/sim/reset', { method: 'POST' });
    if (r.ok) {
      const data = await r.json();
      setSimState(data);
      if (!data.latestSnapshot) setSnapshot(null);
    }
  }, []);

  const setSpeed = useCallback(async (speed: number) => {
    const r = await fetch('/api/sim/speed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ speedMultiplier: speed }),
    });
    if (r.ok) setSimState(await r.json());
  }, []);

  const switchController = useCallback(async (controllerType: string, modelId?: string | null) => {
    const r = await fetch('/api/sim/controller', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ controllerType, modelId }),
    });
    if (r.ok) setSimState(await r.json());
  }, []);

  const injectEmergency = useCallback(async (junctionId = 'J1', approach = 'N') => {
    await fetch('/api/sim/emergency', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ junctionId, approach }),
    });
  }, []);

  const injectIncident = useCallback(async (incident: { junction: string; approach: string; start_s: number; end_s: number } | null) => {
    await fetch('/api/sim/incident', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ incident }),
    });
  }, []);

  const setEcoIdle = useCallback(async (enabled: boolean) => {
    await fetch('/api/sim/eco-idle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
  }, []);

  return (
    <NexusContext.Provider
      value={{
        theme,
        toggleTheme,
        wsConnected,
        simState,
        snapshot,
        telemetry,
        topCities,
        cityNetwork,
        cityLoading,
        health,
        trainLiveUpdate,
        selectCity,
        startSim,
        pauseSim,
        resumeSim,
        stopSim,
        resetSim,
        setSpeed,
        switchController,
        injectEmergency,
        injectIncident,
        setEcoIdle,
        refreshHealth,
      }}
    >
      {children}
    </NexusContext.Provider>
  );
}

export function useNexus() {
  const ctx = useContext(NexusContext);
  if (!ctx) throw new Error('useNexus must be used within NexusProvider');
  return ctx;
}
