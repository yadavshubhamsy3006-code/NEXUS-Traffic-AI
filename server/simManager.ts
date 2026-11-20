import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import readline from 'readline';
import { WebSocket, WebSocketServer } from 'ws';
import { db } from './db.ts';

export type SimStatus = 'idle' | 'running' | 'paused' | 'stopped';

export interface ActiveSimulationState {
  runId: string | null;
  status: SimStatus;
  scenarioId: string;
  scenarioName: string;
  controllerType: string;
  modelId: string | null;
  cityKey: string;
  cityName: string;
  speedMultiplier: number;
  simMode: 'python_microscopic_local' | 'sumo_traci';
  lastUpdated: string;
  latestSnapshot: any | null;
}

class SimulationManager {
  private wss: WebSocketServer | null = null;
  private liveProc: ChildProcessWithoutNullStreams | null = null;
  private stepTimer: NodeJS.Timeout | null = null;
  private trainProcs = new Map<string, ChildProcessWithoutNullStreams>();
  private lastTelemetryPersistStep = -1;

  public state: ActiveSimulationState = {
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

  public attachWebSocketServer(wss: WebSocketServer): void {
    this.wss = wss;
    wss.on('connection', (ws: WebSocket) => {
      ws.send(
        JSON.stringify({
          type: 'sim_state',
          data: this.state,
        })
      );
    });
  }

  private broadcast(payload: any): void {
    if (!this.wss) return;
    const msg = JSON.stringify(payload);
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    }
  }

  public getScenarioRow(scenarioId: string): any | null {
    const row = db.prepare('SELECT * FROM scenarios WHERE id = ?').get(scenarioId) as any;
    if (!row) return null;
    return {
      ...row,
      arrival_rates: JSON.parse(row.arrival_rates_json),
      turning_probs: JSON.parse(row.turning_probs_json),
      incident: row.incident_json ? JSON.parse(row.incident_json) : null,
      surge_window: row.surge_window_json ? JSON.parse(row.surge_window_json) : null,
    };
  }

  public startSimulation(opts: {
    scenarioId?: string;
    controllerType?: string;
    modelId?: string | null;
    cityKey?: string;
    cityName?: string;
    speedMultiplier?: number;
  }): ActiveSimulationState {
    this.cleanupLiveProcess();

    const scenarioId = opts.scenarioId || this.state.scenarioId || 'sc_rush_hour';
    const scenario = this.getScenarioRow(scenarioId) || this.getScenarioRow('sc_rush_hour');
    const controllerType = opts.controllerType || this.state.controllerType || 'dqn';
    const modelId = opts.modelId !== undefined ? opts.modelId : this.state.modelId;
    const cityKey = opts.cityKey || this.state.cityKey || 'bengaluru';
    const cityName = opts.cityName || this.state.cityName || 'Bengaluru';
    const speedMultiplier = Math.max(1, Math.min(10, Number(opts.speedMultiplier || this.state.speedMultiplier || 1)));

    let modelWeights: any = null;
    if (modelId) {
      const mRow = db.prepare('SELECT weights_json FROM rl_models WHERE id = ?').get(modelId) as { weights_json: string } | undefined;
      if (mRow && mRow.weights_json && mRow.weights_json !== '{}') {
        try {
          modelWeights = JSON.parse(mRow.weights_json);
        } catch {
          modelWeights = null;
        }
      }
    }

    const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();
    this.lastTelemetryPersistStep = -1;

    db.prepare(`
      INSERT INTO simulation_runs (
        id, scenario_id, scenario_name, controller_type, model_id,
        sim_mode, city_name, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'running', ?)
    `).run(runId, scenario.id, scenario.name, controllerType, modelId || null, 'python_microscopic_local', cityName, now);

    db.prepare(`
      INSERT INTO alerts_events (severity, category, title, detail, junction_id, acknowledged, created_at)
      VALUES ('info', 'simulation', ?, ?, 'J1', 0, ?)
    `).run(
      `Simulation started (${controllerType.toUpperCase()})`,
      `Scenario "${scenario.name}" launched in ${cityName} using Python 3.11 microscopic engine.`,
      now
    );

    this.state = {
      runId,
      status: 'running',
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      controllerType,
      modelId: modelId || null,
      cityKey,
      cityName,
      speedMultiplier,
      simMode: 'python_microscopic_local',
      lastUpdated: now,
      latestSnapshot: null,
    };

    const proc = spawn('python3', ['-u', 'engine/nexus_rl.py', '--mode', 'live'], {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.liveProc = proc;

    const rl = readline.createInterface({ input: proc.stdout });
    rl.on('line', (line) => {
      try {
        const msg = JSON.parse(line);
        if (msg.type === 'snapshot' && msg.data) {
          this.handleSnapshot(msg.data);
        }
      } catch {
        // Ignore malformed line
      }
    });

    proc.stderr.on('data', (chunk) => {
      console.error('[Python RL Engine]', chunk.toString());
    });

    proc.on('exit', () => {
      if (this.liveProc === proc) {
        this.liveProc = null;
        if (this.stepTimer) {
          clearInterval(this.stepTimer);
          this.stepTimer = null;
        }
      }
    });

    // Send initial config
    proc.stdin.write(
      JSON.stringify({
        scenario,
        algorithm: controllerType,
        weights: modelWeights,
      }) + '\n'
    );

    this.startStepLoop();
    this.broadcast({ type: 'sim_state', data: this.state });
    return this.state;
  }

  private startStepLoop(): void {
    if (this.stepTimer) clearInterval(this.stepTimer);
    this.stepTimer = setInterval(() => {
      if (this.state.status === 'running' && this.liveProc && !this.liveProc.killed) {
        this.liveProc.stdin.write(
          JSON.stringify({ cmd: 'step', steps: this.state.speedMultiplier }) + '\n'
        );
      }
    }, 500);
  }

  private handleSnapshot(snap: any): void {
    const now = new Date().toISOString();
    this.state.latestSnapshot = snap;
    this.state.lastUpdated = now;

    if (this.state.runId) {
      db.prepare(`
        UPDATE simulation_runs SET
          sim_time_s = ?, avg_wait_s = ?, avg_queue = ?, max_queue = ?,
          throughput_vph = ?, total_departures = ?, co2_grams = ?, safety_overrides = ?
        WHERE id = ?
      `).run(
        snap.sim_time,
        snap.avg_wait_time_s,
        snap.avg_queue_length,
        snap.max_queue_length,
        snap.throughput_vph,
        snap.total_departures,
        snap.co2_emissions_g,
        snap.total_safety_overrides,
        this.state.runId
      );

      // Persist telemetry every 2 sim-seconds
      const stepBucket = Math.floor(snap.sim_time / 2);
      if (stepBucket > this.lastTelemetryPersistStep) {
        this.lastTelemetryPersistStep = stepBucket;
        const activePhase = snap.junctions?.[0]?.current_phase ?? 0;
        db.prepare(`
          INSERT INTO simulation_telemetry (
            run_id, sim_time, vehicles_in_network, avg_wait_time_s, avg_queue_length,
            max_queue_length, throughput_vph, total_arrivals, total_departures,
            co2_emissions_g, total_reward, active_phase, safety_overrides, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          this.state.runId,
          snap.sim_time,
          snap.vehicles_in_network,
          snap.avg_wait_time_s,
          snap.avg_queue_length,
          snap.max_queue_length,
          snap.throughput_vph,
          snap.total_arrivals,
          snap.total_departures,
          snap.co2_emissions_g,
          snap.reward_breakdown?.total_reward ?? 0,
          activePhase,
          snap.total_safety_overrides,
          now
        );
      }

      // Persist any safety overrides from this step
      if (Array.isArray(snap.step_overrides) && snap.step_overrides.length > 0) {
        const stmt = db.prepare(`
          INSERT INTO safety_logs (
            run_id, sim_time, junction_id, proposed_action, executed_action,
            override_type, reason, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const ov of snap.step_overrides) {
          stmt.run(
            this.state.runId,
            ov.sim_time,
            ov.junction_id,
            ov.proposed_action,
            ov.executed_action,
            ov.override_type,
            ov.reason,
            now
          );
        }
      }
    }

    this.broadcast({ type: 'sim_tick', state: this.state, snapshot: snap });
  }

  public pauseSimulation(): { ok: boolean; error?: string; state: ActiveSimulationState } {
    if (this.state.status !== 'running') {
      return { ok: false, error: 'Cannot pause: simulation is not currently running.', state: this.state };
    }
    this.state.status = 'paused';
    this.state.lastUpdated = new Date().toISOString();
    if (this.state.runId) {
      db.prepare("UPDATE simulation_runs SET status = 'paused' WHERE id = ?").run(this.state.runId);
    }
    this.broadcast({ type: 'sim_state', data: this.state });
    return { ok: true, state: this.state };
  }

  public resumeSimulation(): { ok: boolean; error?: string; state: ActiveSimulationState } {
    if (this.state.status !== 'paused' || !this.liveProc) {
      return { ok: false, error: 'Cannot resume: no paused simulation active.', state: this.state };
    }
    this.state.status = 'running';
    this.state.lastUpdated = new Date().toISOString();
    if (this.state.runId) {
      db.prepare("UPDATE simulation_runs SET status = 'running' WHERE id = ?").run(this.state.runId);
    }
    this.broadcast({ type: 'sim_state', data: this.state });
    return { ok: true, state: this.state };
  }

  public stopSimulation(): { ok: boolean; error?: string; state: ActiveSimulationState } {
    if (this.state.status === 'idle' || this.state.status === 'stopped') {
      return { ok: false, error: 'No active simulation to stop.', state: this.state };
    }
    const now = new Date().toISOString();
    if (this.state.runId) {
      db.prepare("UPDATE simulation_runs SET status = 'completed', completed_at = ? WHERE id = ?").run(now, this.state.runId);
    }
    this.cleanupLiveProcess();
    this.state.status = 'stopped';
    this.state.lastUpdated = now;
    this.broadcast({ type: 'sim_state', data: this.state });
    return { ok: true, state: this.state };
  }

  public resetSimulation(): ActiveSimulationState {
    if (this.state.status === 'running' || this.state.status === 'paused') {
      return this.startSimulation({
        scenarioId: this.state.scenarioId,
        controllerType: this.state.controllerType,
        modelId: this.state.modelId,
        cityKey: this.state.cityKey,
        cityName: this.state.cityName,
        speedMultiplier: this.state.speedMultiplier,
      });
    }
    this.cleanupLiveProcess();
    this.state.status = 'idle';
    this.state.latestSnapshot = null;
    this.state.runId = null;
    this.state.lastUpdated = new Date().toISOString();
    this.broadcast({ type: 'sim_state', data: this.state });
    return this.state;
  }

  public setSpeed(speedMultiplier: number): ActiveSimulationState {
    this.state.speedMultiplier = Math.max(1, Math.min(10, Number(speedMultiplier || 1)));
    this.broadcast({ type: 'sim_state', data: this.state });
    return this.state;
  }

  public switchController(controllerType: string, modelId?: string | null): void {
    this.state.controllerType = controllerType;
    this.state.modelId = modelId || null;
    let weights: any = null;
    if (modelId) {
      const mRow = db.prepare('SELECT weights_json FROM rl_models WHERE id = ?').get(modelId) as { weights_json: string } | undefined;
      if (mRow && mRow.weights_json && mRow.weights_json !== '{}') {
        try {
          weights = JSON.parse(mRow.weights_json);
        } catch {
          weights = null;
        }
      }
    }
    if (this.liveProc && !this.liveProc.killed) {
      this.liveProc.stdin.write(
        JSON.stringify({ cmd: 'set_controller', algorithm: controllerType, weights }) + '\n'
      );
    }
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO alerts_events (severity, category, title, detail, junction_id, acknowledged, created_at)
      VALUES ('info', 'controller', ?, ?, 'J1', 0, ?)
    `).run(
      `Controller switched to ${controllerType.toUpperCase()}`,
      `Active control policy updated${modelId ? ` using model ${modelId}` : ''}.`,
      now
    );
    this.broadcast({ type: 'sim_state', data: this.state });
  }

  public setCity(cityKey: string, cityName: string, weatherFactor?: number, backgroundAqi?: number): void {
    this.state.cityKey = cityKey;
    this.state.cityName = cityName;
    if (this.liveProc && !this.liveProc.killed) {
      if (weatherFactor) {
        this.liveProc.stdin.write(JSON.stringify({ cmd: 'update_weather', weather_factor: weatherFactor }) + '\n');
      }
      if (backgroundAqi) {
        this.liveProc.stdin.write(JSON.stringify({ cmd: 'update_aqi', background_aqi: backgroundAqi }) + '\n');
      }
    }
    this.broadcast({ type: 'sim_state', data: this.state });
  }

  public setEcoIdle(enabled: boolean): void {
    if (this.liveProc && !this.liveProc.killed) {
      this.liveProc.stdin.write(JSON.stringify({ cmd: 'set_eco_idle', enabled }) + '\n');
    }
  }

  public injectEmergency(junctionId = 'J1', approach = 'N'): void {
    if (this.liveProc && !this.liveProc.killed) {
      this.liveProc.stdin.write(
        JSON.stringify({ cmd: 'inject_emergency', junction_id: junctionId, approach }) + '\n'
      );
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO alerts_events (severity, category, title, detail, junction_id, acknowledged, created_at)
        VALUES ('warning', 'emergency', ?, ?, ?, 0, ?)
      `).run(
        `Emergency Vehicle Dispatched on ${junctionId} (${approach})`,
        'Safety Guard preemption armed for approaching emergency unit.',
        junctionId,
        now
      );
    }
  }

  public injectIncident(incident: { junction: string; approach: string; start_s: number; end_s: number } | null): void {
    if (this.liveProc && !this.liveProc.killed) {
      this.liveProc.stdin.write(JSON.stringify({ cmd: 'inject_incident', incident }) + '\n');
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO alerts_events (severity, category, title, detail, junction_id, acknowledged, created_at)
        VALUES (?, 'incident', ?, ?, ?, 0, ?)
      `).run(
        incident ? 'critical' : 'info',
        incident ? `Lane Incident Active (${incident.junction} ${incident.approach})` : 'Roadway Incident Cleared',
        incident
          ? `Approach ${incident.approach} restricted between t=${incident.start_s}s and t=${incident.end_s}s.`
          : 'Full lane capacity restored.',
        incident?.junction || 'J1',
        now
      );
    }
  }

  private cleanupLiveProcess(): void {
    if (this.stepTimer) {
      clearInterval(this.stepTimer);
      this.stepTimer = null;
    }
    if (this.liveProc) {
      try {
        this.liveProc.stdin.write(JSON.stringify({ cmd: 'quit' }) + '\n');
        this.liveProc.kill();
      } catch {
        // Ignore
      }
      this.liveProc = null;
    }
  }

  // -------------------------------------------------------------------------
  // RL Background Training Orchestrator
  // -------------------------------------------------------------------------

  public startTrainingJob(config: {
    algorithm: string;
    scenarioId: string;
    episodes: number;
    maxSteps: number;
    learningRate: number;
    gamma: number;
    epsilonStart: number;
    epsilonEnd: number;
    batchSize: number;
    seed: number;
    rewardWeights: Record<string, number>;
    modelName?: string;
  }) {
    const scenario = this.getScenarioRow(config.scenarioId) || this.getScenarioRow('sc_rush_hour');
    const scenarioWithWeights = { ...scenario, reward_weights: config.rewardWeights };
    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();

    const hyperparams = {
      learning_rate: config.learningRate,
      gamma: config.gamma,
      epsilon_start: config.epsilonStart,
      epsilon_end: config.epsilonEnd,
      batch_size: config.batchSize,
      max_steps: config.maxSteps,
      seed: config.seed,
    };

    const initLogs = [
      `[${now}] Initialized Python 3.11 RL Trainer (${config.algorithm.toUpperCase()}) on scenario "${scenario.name}"`,
    ];

    db.prepare(`
      INSERT INTO rl_training_jobs (
        id, algorithm, scenario_id, hyperparams_json, reward_weights_json,
        status, current_episode, total_episodes, best_reward, metrics_history_json,
        logs_json, created_at
      ) VALUES (?, ?, ?, ?, ?, 'running', 0, ?, NULL, '[]', ?, ?)
    `).run(
      jobId,
      config.algorithm,
      scenario.id,
      JSON.stringify(hyperparams),
      JSON.stringify(config.rewardWeights),
      config.episodes,
      JSON.stringify(initLogs),
      now
    );

    const proc = spawn('python3', ['-u', 'engine/nexus_rl.py', '--mode', 'train'], {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.trainProcs.set(jobId, proc);

    const metricsHistory: any[] = [];
    const logs: string[] = [...initLogs];
    let bestReward = -1e9;

    const rl = readline.createInterface({ input: proc.stdout });
    rl.on('line', (line) => {
      try {
        const msg = JSON.parse(line);
        if (msg.type === 'train_progress') {
          if (msg.episode_reward > bestReward) bestReward = msg.episode_reward;
          metricsHistory.push(msg);
          if (msg.episode === 1 || msg.episode % 5 === 0 || msg.episode === msg.total_episodes) {
            logs.push(
              `Ep ${msg.episode}/${msg.total_episodes} · reward=${msg.episode_reward} · wait=${msg.avg_wait_s}s · eps=${msg.epsilon} · loss=${msg.avg_loss}`
            );
          }
          db.prepare(`
            UPDATE rl_training_jobs SET
              current_episode = ?, best_reward = ?, metrics_history_json = ?, logs_json = ?
            WHERE id = ?
          `).run(msg.episode, bestReward, JSON.stringify(metricsHistory), JSON.stringify(logs.slice(-80)), jobId);

          this.broadcast({ type: 'train_progress', jobId, data: msg, logs: logs.slice(-20) });
        } else if (msg.type === 'train_complete') {
          const doneAt = new Date().toISOString();
          logs.push(
            `Evaluation complete: RL wait=${msg.eval_rl_avg_wait_s}s vs Fixed=${msg.eval_fixed_avg_wait_s}s (${msg.wait_improvement_pct >= 0 ? '+' : ''}${msg.wait_improvement_pct}% improvement, latency=${msg.inference_latency_ms}ms)`
          );
          db.prepare(`
            UPDATE rl_training_jobs SET
              status = 'completed', completed_at = ?, logs_json = ?
            WHERE id = ?
          `).run(doneAt, JSON.stringify(logs.slice(-80)), jobId);

          // Register trained model into Model Registry
          const modelId = `mdl_${config.algorithm}_${Date.now().toString().slice(-6)}`;
          const modelCount = (db.prepare('SELECT COUNT(*) as cnt FROM rl_models').get() as { cnt: number }).cnt;
          const approved = msg.eval_score >= 60.0;
          db.prepare(`
            INSERT INTO rl_models (
              id, name, version, algorithm, scenario_id, eval_score,
              wait_improvement_pct, inference_latency_ms, status, weights_json, config_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            modelId,
            config.modelName || `${config.algorithm.toUpperCase()} (${scenario.name.slice(0, 22)})`,
            `v1.${modelCount}.0`,
            config.algorithm,
            scenario.id,
            msg.eval_score,
            msg.wait_improvement_pct,
            msg.inference_latency_ms,
            approved ? 'approved' : 'trained',
            JSON.stringify(msg.weights || {}),
            JSON.stringify({ ...hyperparams, reward_weights: config.rewardWeights }),
            doneAt
          );

          db.prepare(`
            INSERT INTO alerts_events (severity, category, title, detail, junction_id, acknowledged, created_at)
            VALUES ('info', 'training', ?, ?, 'J1', 0, ?)
          `).run(
            `RL Model Trained & Evaluated (${config.algorithm.toUpperCase()})`,
            `Score ${msg.eval_score}/100 · ${msg.wait_improvement_pct}% wait improvement vs Fixed-Time.`,
            doneAt
          );

          this.broadcast({ type: 'train_complete', jobId, modelId, data: msg, logs: logs.slice(-20) });
        }
      } catch {
        // Ignore non-JSON lines
      }
    });

    proc.stderr.on('data', (chunk) => {
      logs.push(`[STDERR] ${chunk.toString().trim()}`);
    });

    proc.on('exit', (code) => {
      this.trainProcs.delete(jobId);
      const row = db.prepare('SELECT status FROM rl_training_jobs WHERE id = ?').get(jobId) as { status: string } | undefined;
      if (row && row.status === 'running') {
        db.prepare("UPDATE rl_training_jobs SET status = ? WHERE id = ?").run(code === 0 ? 'completed' : 'cancelled', jobId);
      }
    });

    proc.stdin.write(
      JSON.stringify({
        algorithm: config.algorithm,
        scenario: scenarioWithWeights,
        episodes: config.episodes,
        max_steps: config.maxSteps,
        learning_rate: config.learningRate,
        gamma: config.gamma,
        epsilon_start: config.epsilonStart,
        epsilon_end: config.epsilonEnd,
        batch_size: config.batchSize,
        seed: config.seed,
      }) + '\n'
    );

    return { jobId, status: 'running' };
  }

  public cancelTrainingJob(jobId: string): boolean {
    const proc = this.trainProcs.get(jobId);
    if (proc) {
      proc.kill();
      this.trainProcs.delete(jobId);
      db.prepare("UPDATE rl_training_jobs SET status = 'cancelled', completed_at = ? WHERE id = ?").run(
        new Date().toISOString(),
        jobId
      );
      this.broadcast({ type: 'train_cancelled', jobId });
      return true;
    }
    return false;
  }
}

export const simManager = new SimulationManager();
