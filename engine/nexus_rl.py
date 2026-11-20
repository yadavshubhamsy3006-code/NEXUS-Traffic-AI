#!/usr/bin/env python3
"""
NEXUS Traffic AI — Reinforcement Learning & Microscopic Traffic Engine (Python 3.11)

Implements:
- Gymnasium-compatible multi-junction microscopic traffic simulation
- Deterministic Traffic Safety Guard Layer (conflict matrix, min/max green, yellow, all-red, emergency preemption)
- Controllers: Fixed-Time, Actuated, Tabular Q-Learning, DQN, Dueling DQN, Multi-Agent Coordinated Q
- Multi-component explainable reward function
- JSON-lines interactive live simulation mode & background RL training mode
"""

from __future__ import annotations
import argparse
import json
import math
import random
import sys
import time
from collections import deque
from dataclasses import dataclass, field, asdict
from typing import Any, Dict, List, Optional, Tuple


# ---------------------------------------------------------------------------
# Phase & Conflict Definitions (Safety Guard)
# ---------------------------------------------------------------------------

PHASES = {
    0: "NS_THROUGH",
    1: "NS_LEFT",
    2: "EW_THROUGH",
    3: "EW_LEFT",
    4: "PEDESTRIAN_ALL_WALK",
}

# Movements permitted during each phase: (approach, movement)
PHASE_MOVEMENTS: Dict[int, List[Tuple[str, str]]] = {
    0: [("N", "straight"), ("N", "right"), ("S", "straight"), ("S", "right")],
    1: [("N", "left"), ("S", "left")],
    2: [("E", "straight"), ("E", "right"), ("W", "straight"), ("W", "right")],
    3: [("E", "left"), ("W", "left")],
    4: [],  # All vehicle approaches RED; pedestrians cross safely
}

# Conflicting movement pairs that must NEVER hold green simultaneously
CONFLICTING_AXIS_PAIRS = {
    frozenset(["N_straight", "E_straight"]),
    frozenset(["N_straight", "W_straight"]),
    frozenset(["S_straight", "E_straight"]),
    frozenset(["S_straight", "W_straight"]),
    frozenset(["N_straight", "S_left"]),
    frozenset(["S_straight", "N_left"]),
    frozenset(["E_straight", "W_left"]),
    frozenset(["W_straight", "E_left"]),
    frozenset(["N_left", "E_left"]),
    frozenset(["N_left", "W_left"]),
    frozenset(["S_left", "E_left"]),
    frozenset(["S_left", "W_left"]),
}


def verify_phase_conflict_free(phase_id: int) -> bool:
    """Verify mathematically that no two movements in a phase conflict."""
    if phase_id not in PHASE_MOVEMENTS:
        return False
    moves = [f"{app}_{mov}" for app, mov in PHASE_MOVEMENTS[phase_id]]
    for i in range(len(moves)):
        for j in range(i + 1, len(moves)):
            if frozenset([moves[i], moves[j]]) in CONFLICTING_AXIS_PAIRS:
                return False
    return True


@dataclass
class SafetyConfig:
    min_green_s: float = 8.0
    max_green_s: float = 55.0
    yellow_s: float = 3.0
    all_red_s: float = 2.0
    ped_clearance_s: float = 6.0


@dataclass
class JunctionSignalState:
    junction_id: str
    current_phase: int = 0
    target_phase: int = 0
    light_state: str = "GREEN"  # GREEN | YELLOW | ALL_RED
    phase_elapsed_s: float = 0.0
    clearance_remaining_s: float = 0.0
    total_switches: int = 0


class SafetyGuard:
    """
    Deterministic safety layer sitting between RL policy proposals and signal actuation.
    Validates action bounds, enforces min/max green, yellow & all-red clearance intervals,
    pedestrian clearance, and safe emergency preemption.
    """

    def __init__(self, config: Optional[SafetyConfig] = None):
        self.config = config or SafetyConfig()
        # Self-check all defined phases at initialization
        for pid in PHASES:
            if not verify_phase_conflict_free(pid):
                raise ValueError(f"Unsafe phase definition detected for phase {pid}")

    def step_signal(
        self,
        sig: JunctionSignalState,
        proposed_phase: Any,
        dt: float,
        sim_time: float,
        emergency_approach: Optional[str] = None,
        ped_waiting: int = 0,
    ) -> Tuple[int, Optional[Dict[str, Any]]]:
        override_log: Optional[Dict[str, Any]] = None
        sig.phase_elapsed_s += dt

        # If currently in yellow or all-red clearance, complete clearance before switching
        if sig.light_state in ("YELLOW", "ALL_RED"):
            sig.clearance_remaining_s -= dt
            if sig.clearance_remaining_s <= 0.0:
                if sig.light_state == "YELLOW":
                    sig.light_state = "ALL_RED"
                    sig.clearance_remaining_s = self.config.all_red_s
                else:
                    sig.current_phase = sig.target_phase
                    sig.light_state = "GREEN"
                    sig.phase_elapsed_s = 0.0
                    sig.clearance_remaining_s = 0.0
                    sig.total_switches += 1
            return sig.current_phase, None

        # Validate proposed_phase type & range (fail-safe fallback)
        if not isinstance(proposed_phase, int) or proposed_phase not in PHASES:
            fallback_phase = sig.current_phase
            override_log = {
                "sim_time": round(sim_time, 1),
                "junction_id": sig.junction_id,
                "proposed_action": str(proposed_phase),
                "executed_action": PHASES[fallback_phase],
                "override_type": "INVALID_ACTION_FALLBACK",
                "reason": f"Invalid policy proposal '{proposed_phase}'; retained safe phase {PHASES[fallback_phase]}.",
            }
            proposed_phase = fallback_phase

        # Emergency preemption override (routes safely through yellow -> all-red if needed)
        if emergency_approach in ("N", "S", "E", "W"):
            needed_phase = 0 if emergency_approach in ("N", "S") else 2
            if sig.current_phase != needed_phase:
                if proposed_phase != needed_phase:
                    override_log = {
                        "sim_time": round(sim_time, 1),
                        "junction_id": sig.junction_id,
                        "proposed_action": PHASES[proposed_phase],
                        "executed_action": PHASES[needed_phase],
                        "override_type": "EMERGENCY_PREEMPTION",
                        "reason": f"Emergency vehicle approaching {emergency_approach}; initiated safe clearance to {PHASES[needed_phase]}.",
                    }
                self._start_transition(sig, needed_phase)
                return sig.current_phase, override_log

        # Enforce minimum green / pedestrian clearance before allowing a phase change
        min_hold = (
            self.config.ped_clearance_s
            if sig.current_phase == 4
            else self.config.min_green_s
        )
        if proposed_phase != sig.current_phase and sig.phase_elapsed_s < min_hold:
            override_log = {
                "sim_time": round(sim_time, 1),
                "junction_id": sig.junction_id,
                "proposed_action": PHASES[proposed_phase],
                "executed_action": PHASES[sig.current_phase],
                "override_type": "MIN_GREEN_VIOLATION",
                "reason": f"Blocked early switch to {PHASES[proposed_phase]} ({sig.phase_elapsed_s:.1f}s < {min_hold:.1f}s min hold).",
            }
            return sig.current_phase, override_log

        # Enforce maximum green to prevent starvation
        if sig.phase_elapsed_s >= self.config.max_green_s and proposed_phase == sig.current_phase:
            next_phase = 2 if sig.current_phase in (0, 1) else 0
            if ped_waiting >= 4 and sig.current_phase != 4:
                next_phase = 4
            override_log = {
                "sim_time": round(sim_time, 1),
                "junction_id": sig.junction_id,
                "proposed_action": PHASES[proposed_phase],
                "executed_action": PHASES[next_phase],
                "override_type": "MAX_GREEN_ANTI_STARVATION",
                "reason": f"Max green ({self.config.max_green_s:.0f}s) reached; forcing safe rotation to {PHASES[next_phase]}.",
            }
            self._start_transition(sig, next_phase)
            return sig.current_phase, override_log

        # Valid permitted phase switch
        if proposed_phase != sig.current_phase:
            self._start_transition(sig, proposed_phase)

        return sig.current_phase, override_log

    def _start_transition(self, sig: JunctionSignalState, next_phase: int) -> None:
        if not verify_phase_conflict_free(next_phase):
            return
        sig.target_phase = next_phase
        sig.light_state = "YELLOW"
        sig.clearance_remaining_s = self.config.yellow_s


# ---------------------------------------------------------------------------
# Microscopic Vehicle & Intersection Simulation Environment
# ---------------------------------------------------------------------------

@dataclass
class Vehicle:
    id: str
    junction_id: str
    approach: str       # N | S | E | W
    lane: int           # 0 (inner/left), 1 (outer/through-right)
    movement: str       # straight | left | right
    vtype: str          # car | bus | emergency
    pos_m: float        # -160.0 (spawn) -> 0.0 (stop line) -> +50.0 (exit)
    speed_mps: float
    wait_s: float = 0.0
    stopped: bool = False
    co2_g: float = 0.0


DEFAULT_REWARD_WEIGHTS = {
    "wait": 1.0,
    "queue": 0.6,
    "throughput": 1.4,
    "fairness": 0.4,
    "pedestrian": 0.5,
    "emergency": 2.0,
    "switch": 0.3,
    "emissions": 0.25,
}


class TrafficNetworkEnv:
    """
    Gymnasium-style microscopic traffic simulation supporting 1 to 4 junctions.
    Models individual vehicles, lane queues, turning movements, buses, emergency vehicles,
    pedestrians, weather speed factors, and incident lane closures.
    """

    def __init__(self, scenario: Dict[str, Any], seed: Optional[int] = None):
        self.scenario = scenario
        self.seed = seed if seed is not None else int(scenario.get("seed", 42))
        self.rng = random.Random(self.seed)

        self.num_junctions = max(1, min(4, int(scenario.get("intersections", 1))))
        self.lanes_per_approach = max(1, min(3, int(scenario.get("lanes", 2))))
        self.speed_limit_kmh = float(scenario.get("speed_limit_kmh", 50.0))
        self.weather_factor = float(scenario.get("weather_factor", 1.0))
        self.arrival_rates = scenario.get(
            "arrival_rates", {"N": 0.28, "S": 0.28, "E": 0.26, "W": 0.26}
        )
        self.turning_probs = scenario.get(
            "turning_probs", {"straight": 0.65, "left": 0.20, "right": 0.15}
        )
        self.ped_rate = float(scenario.get("pedestrian_rate", 0.12))
        self.bus_prob = float(scenario.get("bus_prob", 0.08))
        self.bike_prob = float(scenario.get("bike_prob", 0.28))
        self.emergency_prob = float(scenario.get("emergency_prob", 0.01))
        self.eco_idle_stop = bool(scenario.get("eco_idle_stop", True))
        self.background_aqi = float(scenario.get("background_aqi", 68.0))
        self.incident = scenario.get("incident", None)  # e.g. {"junction": "J1", "approach": "E", "start_s": 20, "end_s": 120}
        self.reward_weights = {**DEFAULT_REWARD_WEIGHTS, **(scenario.get("reward_weights") or {})}

        safety_cfg = SafetyConfig(
            min_green_s=float(scenario.get("min_green_s", 8.0)),
            max_green_s=float(scenario.get("max_green_s", 55.0)),
            yellow_s=float(scenario.get("yellow_s", 3.0)),
            all_red_s=float(scenario.get("all_red_s", 2.0)),
        )
        self.safety_guard = SafetyGuard(safety_cfg)
        self.dt = 1.0
        self.reset()

    def reset(self) -> Dict[str, List[float]]:
        self.sim_time = 0.0
        self.veh_counter = 0
        self.vehicles: List[Vehicle] = []
        self.junction_ids = [f"J{i+1}" for i in range(self.num_junctions)]
        self.signals: Dict[str, JunctionSignalState] = {
            jid: JunctionSignalState(junction_id=jid) for jid in self.junction_ids
        }
        self.pedestrians: Dict[str, int] = {jid: 0 for jid in self.junction_ids}
        self.ped_wait_total: Dict[str, float] = {jid: 0.0 for jid in self.junction_ids}

        self.total_arrivals = 0
        self.total_departures = 0
        self.completed_wait_sum = 0.0
        self.emergency_wait_sum = 0.0
        self.total_co2_g = 0.0
        self.total_co2_saved_g = 0.0
        self.total_fuel_burned_ml = 0.0
        self.total_fuel_saved_ml = 0.0
        self.local_aqi = self.background_aqi
        self.safety_overrides: List[Dict[str, Any]] = []
        self.events: List[Dict[str, Any]] = []
        self.last_reward_breakdown: Dict[str, float] = {
            "wait_penalty": 0.0,
            "queue_penalty": 0.0,
            "throughput_bonus": 0.0,
            "fairness_bonus": 0.0,
            "pedestrian_penalty": 0.0,
            "emergency_bonus": 0.0,
            "switch_penalty": 0.0,
            "emission_penalty": 0.0,
            "total_reward": 0.0,
        }

        # Seed initial vehicles so simulation begins with realistic traffic state
        for jid in self.junction_ids:
            for app in ("N", "S", "E", "W"):
                init_count = self.rng.randint(1, 4)
                for k in range(init_count):
                    self._spawn_vehicle(jid, app, initial_pos=-22.0 - k * 14.0)

        return self.get_observations()

    def _spawn_vehicle(
        self,
        junction_id: str,
        approach: str,
        initial_pos: float = -155.0,
        forced_vtype: Optional[str] = None,
    ) -> None:
        # Check spacing near spawn point so vehicles don't overlap
        for v in self.vehicles:
            if v.junction_id == junction_id and v.approach == approach and abs(v.pos_m - initial_pos) < 8.5:
                return

        r_mov = self.rng.random()
        p_s = float(self.turning_probs.get("straight", 0.65))
        p_l = float(self.turning_probs.get("left", 0.20))
        if r_mov < p_s:
            movement = "straight"
            lane = min(self.lanes_per_approach - 1, 1 if self.lanes_per_approach > 1 else 0)
        elif r_mov < p_s + p_l:
            movement = "left"
            lane = 0
        else:
            movement = "right"
            lane = self.lanes_per_approach - 1

        if forced_vtype:
            vtype = forced_vtype
        else:
            r_type = self.rng.random()
            if r_type < self.emergency_prob:
                vtype = "emergency"
            elif r_type < self.emergency_prob + self.bus_prob:
                vtype = "bus"
            elif r_type < self.emergency_prob + self.bus_prob + self.bike_prob:
                vtype = "bike"
            else:
                vtype = "car"

        self.veh_counter += 1
        max_mps = (self.speed_limit_kmh / 3.6) * self.weather_factor
        self.vehicles.append(
            Vehicle(
                id=f"V{self.veh_counter}",
                junction_id=junction_id,
                approach=approach,
                lane=lane,
                movement=movement,
                vtype=vtype,
                pos_m=initial_pos,
                speed_mps=max_mps * 0.75,
            )
        )
        self.total_arrivals += 1
        if vtype == "emergency":
            self.events.append({
                "sim_time": round(self.sim_time, 1),
                "severity": "warning",
                "category": "emergency",
                "junction_id": junction_id,
                "title": f"Emergency vehicle detected on {junction_id} ({approach} approach)",
            })

    def is_incident_active(self, junction_id: str, approach: str) -> bool:
        if not self.incident:
            return False
        inc_j = self.incident.get("junction", "J1")
        inc_a = self.incident.get("approach")
        start_s = float(self.incident.get("start_s", 0))
        end_s = float(self.incident.get("end_s", 999999))
        return junction_id == inc_j and approach == inc_a and start_s <= self.sim_time <= end_s

    def get_observations(self) -> Dict[str, List[float]]:
        """
        14-element normalized observation vector per junction:
        [0..3]  queue length N, S, E, W (normalized / 15)
        [4..7]  mean waiting time N, S, E, W (normalized / 60s)
        [8]     normalized active phase (0..1)
        [9]     phase elapsed time (/ 60s)
        [10]    pedestrian demand (/ 10)
        [11]    bus / emergency priority signal (0..1)
        [12]    downstream neighbor queue pressure (0..1)
        [13]    weather/incident capacity factor (0..1)
        """
        obs: Dict[str, List[float]] = {}
        junction_queues: Dict[str, Dict[str, int]] = {}
        junction_waits: Dict[str, Dict[str, float]] = {}

        for jid in self.junction_ids:
            q = {"N": 0, "S": 0, "E": 0, "W": 0}
            w_sum = {"N": 0.0, "S": 0.0, "E": 0.0, "W": 0.0}
            cnt = {"N": 0, "S": 0, "E": 0, "W": 0}
            priority_flag = 0.0
            for v in self.vehicles:
                if v.junction_id == jid and v.pos_m <= 0.0:
                    cnt[v.approach] += 1
                    w_sum[v.approach] += v.wait_s
                    if v.stopped or v.speed_mps < 1.5:
                        q[v.approach] += 1
                    if v.vtype == "emergency":
                        priority_flag = 1.0
                    elif v.vtype == "bus" and priority_flag < 0.6:
                        priority_flag = 0.6
            junction_queues[jid] = q
            junction_waits[jid] = {
                a: (w_sum[a] / cnt[a]) if cnt[a] > 0 else 0.0 for a in ("N", "S", "E", "W")
            }

        for idx, jid in enumerate(self.junction_ids):
            q = junction_queues[jid]
            w = junction_waits[jid]
            sig = self.signals[jid]
            # Neighbor pressure from downstream junction along corridor
            neighbor_pressure = 0.0
            if self.num_junctions > 1:
                next_jid = self.junction_ids[(idx + 1) % self.num_junctions]
                nq = junction_queues[next_jid]
                neighbor_pressure = min(1.0, sum(nq.values()) / 24.0)

            priority_val = 0.0
            for v in self.vehicles:
                if v.junction_id == jid and v.pos_m <= 0.0:
                    if v.vtype == "emergency":
                        priority_val = 1.0
                        break
                    if v.vtype == "bus":
                        priority_val = max(priority_val, 0.5)

            incident_penalty = 0.35 if any(self.is_incident_active(jid, a) for a in ("N", "S", "E", "W")) else 0.0

            obs[jid] = [
                min(1.0, q["N"] / 15.0),
                min(1.0, q["S"] / 15.0),
                min(1.0, q["E"] / 15.0),
                min(1.0, q["W"] / 15.0),
                min(1.0, w["N"] / 60.0),
                min(1.0, w["S"] / 60.0),
                min(1.0, w["E"] / 60.0),
                min(1.0, w["W"] / 60.0),
                sig.current_phase / 4.0,
                min(1.0, sig.phase_elapsed_s / 60.0),
                min(1.0, self.pedestrians[jid] / 10.0),
                priority_val,
                neighbor_pressure,
                max(0.2, self.weather_factor - incident_penalty),
            ]
        return obs

    def step(self, actions: Dict[str, Any]) -> Tuple[Dict[str, List[float]], Dict[str, float], bool, Dict[str, Any]]:
        self.sim_time += self.dt
        step_departures = 0
        step_co2_g = 0.0
        step_switches = 0
        step_overrides: List[Dict[str, Any]] = []

        # 1. Apply Safety Guard per junction
        for jid in self.junction_ids:
            sig = self.signals[jid]
            prev_switches = sig.total_switches

            # Detect approaching emergency vehicle
            emerg_app: Optional[str] = None
            for v in self.vehicles:
                if v.junction_id == jid and v.vtype == "emergency" and -110.0 <= v.pos_m <= 2.0:
                    emerg_app = v.approach
                    break

            _, override = self.safety_guard.step_signal(
                sig=sig,
                proposed_phase=actions.get(jid, sig.current_phase),
                dt=self.dt,
                sim_time=self.sim_time,
                emergency_approach=emerg_app,
                ped_waiting=self.pedestrians[jid],
            )
            if sig.total_switches > prev_switches:
                step_switches += 1
            if override:
                step_overrides.append(override)
                self.safety_overrides.append(override)
                if len(self.safety_overrides) > 200:
                    self.safety_overrides.pop(0)

        # 2. Spawn arrivals per approach
        for jid in self.junction_ids:
            # Time-of-day surge multiplier if configured
            surge = 1.0
            if self.scenario.get("surge_window"):
                sw = self.scenario["surge_window"]
                if float(sw.get("start_s", 0)) <= self.sim_time <= float(sw.get("end_s", 0)):
                    surge = float(sw.get("multiplier", 1.8))

            for app in ("N", "S", "E", "W"):
                rate = float(self.arrival_rates.get(app, 0.25)) * surge
                if self.rng.random() < rate * self.dt:
                    self._spawn_vehicle(jid, app)

            if self.rng.random() < self.ped_rate * self.dt:
                self.pedestrians[jid] = min(20, self.pedestrians[jid] + 1)

            # Pedestrian crossing discharge during PEDESTRIAN_ALL_WALK
            if self.signals[jid].current_phase == 4 and self.signals[jid].light_state == "GREEN":
                crossed = min(self.pedestrians[jid], 4)
                self.pedestrians[jid] -= crossed
            else:
                self.ped_wait_total[jid] += self.pedestrians[jid] * self.dt

        # 3. Advance vehicles microscopically (car-following + signal stop-line physics)
        max_mps = (self.speed_limit_kmh / 3.6) * self.weather_factor
        remaining_vehicles: List[Vehicle] = []

        # Group vehicles per (junction, approach, lane) sorted by pos_m descending (leader first)
        grouped: Dict[Tuple[str, str, int], List[Vehicle]] = {}
        for v in self.vehicles:
            grouped.setdefault((v.junction_id, v.approach, v.lane), []).append(v)

        # Pre-compute last-priority approaches per junction for Engine-Off Eco Advisory
        last_priority_apps: Dict[str, set] = {}
        for jid in self.junction_ids:
            ranked = self._rank_approaches(jid)
            advised = {
                item["approach"]
                for item in ranked
                if item["engine_off_advised"]
            }
            last_priority_apps[jid] = advised

        step_idling_load = 0.0
        for key, lane_vehs in grouped.items():
            jid, app, lane = key
            lane_vehs.sort(key=lambda x: x.pos_m, reverse=True)
            sig = self.signals[jid]
            permitted = PHASE_MOVEMENTS[sig.current_phase] if sig.light_state == "GREEN" else []
            incident_blocked = self.is_incident_active(jid, app)
            eco_off_approach = self.eco_idle_stop and (app in last_priority_apps.get(jid, set()))

            leader_pos: Optional[float] = None
            for v in lane_vehs:
                # Can this vehicle cross the stop line?
                can_go = (app, v.movement) in permitted
                # Right-turn-on-red slow yield when not incident blocked and emergency not conflicting
                if not can_go and v.movement == "right" and sig.light_state == "GREEN" and sig.current_phase != 4:
                    if not incident_blocked and self.rng.random() < 0.15:
                        can_go = True

                target_speed = max_mps * (0.65 if v.movement in ("left", "right") else 1.0)
                if incident_blocked:
                    target_speed *= 0.25 if lane == 0 else 0.0

                # Stop-line constraint before pos_m == 0
                must_stop_at_line = (not can_go) and (-18.0 <= v.pos_m <= 0.5)
                if incident_blocked and lane > 0 and v.pos_m <= 0.5:
                    must_stop_at_line = True

                # Car-following gap to leader
                gap = (leader_pos - v.pos_m - (4.5 if v.vtype == "bike" else 6.5)) if leader_pos is not None else 999.0
                if must_stop_at_line and v.pos_m <= 0.0:
                    stop_gap = max(0.0, -1.5 - v.pos_m)
                    gap = min(gap, stop_gap)

                if gap <= 0.6:
                    v.speed_mps = max(0.0, v.speed_mps - 4.5 * self.dt)
                elif gap < 14.0:
                    safe_v = min(target_speed, gap * 0.85)
                    if v.speed_mps > safe_v:
                        v.speed_mps = max(safe_v, v.speed_mps - 3.5 * self.dt)
                    else:
                        v.speed_mps = min(safe_v, v.speed_mps + 2.2 * self.dt)
                else:
                    if v.speed_mps < target_speed:
                        v.speed_mps = min(target_speed, v.speed_mps + 2.8 * self.dt)
                    else:
                        v.speed_mps = max(target_speed, v.speed_mps - 1.5 * self.dt)

                v.pos_m += v.speed_mps * self.dt
                v.stopped = v.speed_mps < 0.8
                if v.stopped and v.pos_m <= 2.0:
                    v.wait_s += self.dt
                    if v.vtype == "emergency":
                        self.emergency_wait_sum += self.dt

                # CO2 & fuel consumption model (g/s & mL/s)
                # Bikes ~0.35x, Cars 1.0x, Buses 2.6x. Eco idle-off cuts stopped idling by 68%!
                mult = 2.6 if v.vtype == "bus" else (0.35 if v.vtype == "bike" else 1.0)
                base_idle_co2 = 0.78 * mult
                if v.stopped:
                    step_idling_load += mult
                    if eco_off_approach and v.vtype in ("bike", "car"):
                        em_rate = base_idle_co2 * 0.32
                        saved_co2 = base_idle_co2 * 0.68
                        self.total_co2_saved_g += saved_co2 * self.dt
                        self.total_fuel_saved_ml += (saved_co2 / 2.31) * self.dt
                    else:
                        em_rate = base_idle_co2
                else:
                    em_rate = (1.45 + 0.06 * v.speed_mps) * mult

                fuel_ml = (em_rate / 2.31) * self.dt
                self.total_fuel_burned_ml += fuel_ml
                v.co2_g += em_rate * self.dt
                step_co2_g += em_rate * self.dt
                self.total_co2_g += em_rate * self.dt

                if v.pos_m >= 48.0:
                    self.total_departures += 1
                    self.completed_wait_sum += v.wait_s
                    step_departures += 1
                    # Corridor propagation: vehicle exiting J(i) East/West feeds neighbor junction!
                    if self.num_junctions > 1:
                        j_idx = self.junction_ids.index(jid)
                        if app == "E" and j_idx + 1 < self.num_junctions and v.movement == "straight":
                            self._spawn_vehicle(self.junction_ids[j_idx + 1], "E", -145.0, v.vtype)
                        elif app == "W" and j_idx - 1 >= 0 and v.movement == "straight":
                            self._spawn_vehicle(self.junction_ids[j_idx - 1], "W", -145.0, v.vtype)
                else:
                    remaining_vehicles.append(v)
                    leader_pos = v.pos_m

        self.vehicles = remaining_vehicles

        # Smooth micro-AQI update from city background AQI + current idling exhaust
        target_aqi = self.background_aqi + min(95.0, step_idling_load * (0.9 if self.eco_idle_stop else 1.85))
        self.local_aqi = 0.85 * self.local_aqi + 0.15 * target_aqi

        # 4. Compute multi-component reward per junction & network aggregate
        rewards: Dict[str, float] = {}
        agg_breakdown = {
            "wait_penalty": 0.0,
            "queue_penalty": 0.0,
            "throughput_bonus": 0.0,
            "fairness_bonus": 0.0,
            "pedestrian_penalty": 0.0,
            "emergency_bonus": 0.0,
            "switch_penalty": 0.0,
            "emission_penalty": 0.0,
            "total_reward": 0.0,
        }

        w_cfg = self.reward_weights
        for jid in self.junction_ids:
            j_vehs = [v for v in self.vehicles if v.junction_id == jid and v.pos_m <= 0.0]
            stopped_count = sum(1 for v in j_vehs if v.stopped)
            wait_sum = sum(v.wait_s for v in j_vehs)
            app_waits = [
                sum(v.wait_s for v in j_vehs if v.approach == a) for a in ("N", "S", "E", "W")
            ]
            # Jain's fairness index across approaches
            sum_w = sum(app_waits)
            sum_w2 = sum(x * x for x in app_waits)
            fairness = (sum_w * sum_w) / (4.0 * sum_w2) if sum_w2 > 0 else 1.0

            emerg_moving = sum(1 for v in self.vehicles if v.junction_id == jid and v.vtype == "emergency" and not v.stopped)
            emerg_stopped = sum(1 for v in self.vehicles if v.junction_id == jid and v.vtype == "emergency" and v.stopped)

            c_wait = -w_cfg["wait"] * (wait_sum / 60.0)
            c_queue = -w_cfg["queue"] * (stopped_count / 10.0)
            c_thru = w_cfg["throughput"] * (step_departures / max(1, self.num_junctions))
            c_fair = w_cfg["fairness"] * (fairness - 0.5)
            c_ped = -w_cfg["pedestrian"] * (self.pedestrians[jid] / 12.0)
            c_emerg = w_cfg["emergency"] * (0.6 * emerg_moving - 1.2 * emerg_stopped)
            c_sw = -w_cfg["switch"] * step_switches
            c_em = -w_cfg["emissions"] * (step_co2_g / 60.0)

            tot = c_wait + c_queue + c_thru + c_fair + c_ped + c_emerg + c_sw + c_em
            rewards[jid] = round(tot, 4)

            agg_breakdown["wait_penalty"] += c_wait
            agg_breakdown["queue_penalty"] += c_queue
            agg_breakdown["throughput_bonus"] += c_thru
            agg_breakdown["fairness_bonus"] += c_fair
            agg_breakdown["pedestrian_penalty"] += c_ped
            agg_breakdown["emergency_bonus"] += c_emerg
            agg_breakdown["switch_penalty"] += c_sw
            agg_breakdown["emission_penalty"] += c_em
            agg_breakdown["total_reward"] += tot

        for k in agg_breakdown:
            agg_breakdown[k] = round(agg_breakdown[k] / max(1, self.num_junctions), 4)
        self.last_reward_breakdown = agg_breakdown

        next_obs = self.get_observations()
        info = self.get_snapshot(step_overrides)
        return next_obs, rewards, False, info

    def _rank_approaches(self, jid: str) -> List[Dict[str, Any]]:
        sig = self.signals[jid]
        items: List[Dict[str, Any]] = []
        for app in ("N", "S", "E", "W"):
            app_v = [v for v in self.vehicles if v.junction_id == jid and v.approach == app and v.pos_m <= 2.0]
            cars = sum(1 for v in app_v if v.vtype == "car")
            bikes = sum(1 for v in app_v if v.vtype == "bike")
            buses = sum(1 for v in app_v if v.vtype == "bus")
            emerg = any(v.vtype == "emergency" for v in app_v)
            stopped = sum(1 for v in app_v if v.stopped)
            avg_w = (sum(v.wait_s for v in app_v) / len(app_v)) if app_v else 0.0
            density_score = round(cars * 1.0 + bikes * 0.65 + buses * 2.2 + avg_w * 0.12 + (100.0 if emerg else 0.0), 1)
            is_green = ((app in ("N", "S") and sig.current_phase in (0, 1)) or (app in ("E", "W") and sig.current_phase in (2, 3))) and sig.light_state == "GREEN"
            items.append({
                "approach": app,
                "vehicle_count": len(app_v),
                "cars": cars,
                "bikes": bikes,
                "buses": buses,
                "stopped": stopped,
                "avg_wait_s": round(avg_w, 1),
                "emergency_detected": emerg,
                "density_score": density_score,
                "signal_state": "GREEN" if is_green else ("YELLOW" if sig.light_state == "YELLOW" and ((app in ("N", "S") and sig.current_phase in (0, 1)) or (app in ("E", "W") and sig.current_phase in (2, 3))) else "RED"),
            })

        # Sort highest density/emergency first -> priority_rank 1..4
        items.sort(key=lambda x: x["density_score"], reverse=True)
        for idx, item in enumerate(items):
            rank = idx + 1
            item["priority_rank"] = rank
            is_red = item["signal_state"] == "RED"
            est_red_wait = max(0, round(10 + (rank - 2) * 8)) if is_red else 0
            item["est_red_wait_s"] = est_red_wait
            # Last priority (rank 4) or long red queue triggers "Stop Bikes & Engines" advisory
            advised = is_red and not item["emergency_detected"] and (rank == 4 or (item["stopped"] >= 2 and est_red_wait >= 14))
            item["engine_off_advised"] = advised
            if item["emergency_detected"]:
                item["advisory_message"] = "AMBULANCE PRIORITY — Clearing Path"
            elif advised and self.eco_idle_stop:
                item["advisory_message"] = f"LAST PRIORITY ({est_red_wait}s Red): Stop Bikes & Engines to Save Fuel/AQI"
            elif item["signal_state"] == "GREEN":
                item["advisory_message"] = "GO — Highest Density / Active Green"
            else:
                item["advisory_message"] = f"Standby Queue (Priority #{rank})"
        return items

    def get_snapshot(self, step_overrides: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
        active_waits = [v.wait_s for v in self.vehicles if v.pos_m <= 2.0]
        avg_wait = (sum(active_waits) / len(active_waits)) if active_waits else 0.0

        junction_details = []
        max_q_all = 0
        total_q_all = 0
        primary_approach_detection: List[Dict[str, Any]] = []

        for j_idx, jid in enumerate(self.junction_ids):
            sig = self.signals[jid]
            q_by_app = {}
            w_by_app = {}
            for app in ("N", "S", "E", "W"):
                app_v = [v for v in self.vehicles if v.junction_id == jid and v.approach == app and v.pos_m <= 2.0]
                q_len = sum(1 for v in app_v if v.stopped)
                q_by_app[app] = q_len
                w_by_app[app] = round(sum(v.wait_s for v in app_v) / len(app_v), 1) if app_v else 0.0
                total_q_all += q_len
                if q_len > max_q_all:
                    max_q_all = q_len

            ranked = self._rank_approaches(jid)
            if j_idx == 0:
                primary_approach_detection = ranked

            min_hold = self.safety_guard.config.ped_clearance_s if sig.current_phase == 4 else self.safety_guard.config.min_green_s
            countdown = max(
                0.0,
                sig.clearance_remaining_s
                if sig.light_state in ("YELLOW", "ALL_RED")
                else (self.safety_guard.config.max_green_s - sig.phase_elapsed_s),
            )
            junction_details.append({
                "junction_id": jid,
                "current_phase": sig.current_phase,
                "phase_name": PHASES[sig.current_phase],
                "light_state": sig.light_state,
                "phase_elapsed_s": round(sig.phase_elapsed_s, 1),
                "min_hold_s": min_hold,
                "countdown_s": round(countdown, 1),
                "queues": q_by_app,
                "wait_by_approach": w_by_app,
                "pedestrians_waiting": self.pedestrians[jid],
                "switches": sig.total_switches,
                "approach_detection": ranked,
            })

        avg_q = total_q_all / (4.0 * max(1, self.num_junctions))
        throughput_vph = round((self.total_departures / max(1.0, self.sim_time)) * 3600.0, 1)

        aqi_val = round(self.local_aqi)
        aqi_cat = "Good" if aqi_val <= 50 else ("Moderate" if aqi_val <= 100 else ("Sensitive" if aqi_val <= 150 else "Unhealthy"))
        pm25 = round(max(5.0, aqi_val * 0.36), 1)

        return {
            "sim_time": round(self.sim_time, 1),
            "vehicles_in_network": len(self.vehicles),
            "avg_wait_time_s": round(avg_wait, 2),
            "avg_queue_length": round(avg_q, 2),
            "max_queue_length": max_q_all,
            "throughput_vph": throughput_vph,
            "total_arrivals": self.total_arrivals,
            "total_departures": self.total_departures,
            "co2_emissions_g": round(self.total_co2_g, 1),
            "active_incidents": 1 if self.incident and any(self.is_incident_active(jid, a) for jid in self.junction_ids for a in ("N", "S", "E", "W")) else 0,
            "emergency_active": any(v.vtype == "emergency" for v in self.vehicles),
            "aqi_telemetry": {
                "city_background_aqi": round(self.background_aqi),
                "local_junction_aqi": aqi_val,
                "pm2_5_ugm3": pm25,
                "category": aqi_cat,
                "eco_idle_stop": self.eco_idle_stop,
                "fuel_burned_ml": round(self.total_fuel_burned_ml, 1),
                "fuel_saved_ml": round(self.total_fuel_saved_ml, 1),
                "co2_saved_g": round(self.total_co2_saved_g, 1),
            },
            "approach_detection": primary_approach_detection,
            "reward_breakdown": self.last_reward_breakdown,
            "junctions": junction_details,
            "vehicles": [
                {
                    "id": v.id,
                    "j": v.junction_id,
                    "a": v.approach,
                    "l": v.lane,
                    "m": v.movement,
                    "t": v.vtype,
                    "p": round(v.pos_m, 2),
                    "s": round(v.speed_mps, 2),
                    "w": round(v.wait_s, 1),
                    "st": v.stopped,
                }
                for v in self.vehicles[:160]
            ],
            "step_overrides": step_overrides or [],
            "total_safety_overrides": len(self.safety_overrides),
        }


# ---------------------------------------------------------------------------
# RL & Baseline Controllers (Pure Python 3.11)
# ---------------------------------------------------------------------------

class BaseController:
    name: str = "base"

    def select_action(self, obs: List[float], sig: JunctionSignalState, training: bool = False) -> Tuple[int, str]:
        raise NotImplementedError

    def observe(self, obs: List[float], action: int, reward: float, next_obs: List[float]) -> Optional[float]:
        return None

    def export_weights(self) -> Dict[str, Any]:
        return {}

    def load_weights(self, weights: Dict[str, Any]) -> None:
        pass


class FixedTimeController(BaseController):
    name = "fixed_time"

    def select_action(self, obs: List[float], sig: JunctionSignalState, training: bool = False) -> Tuple[int, str]:
        cycle = [(0, 24.0), (1, 10.0), (2, 24.0), (3, 10.0)]
        if obs[10] > 0.35:
            cycle.append((4, 8.0))
        cur = sig.current_phase
        durations = {p: d for p, d in cycle}
        dur = durations.get(cur, 20.0)
        if sig.phase_elapsed_s >= dur:
            order = [p for p, _ in cycle]
            nxt = order[(order.index(cur) + 1) % len(order)] if cur in order else 0
            return nxt, f"Fixed timer expired ({dur:.0f}s); rotating to {PHASES[nxt]}."
        return cur, f"Fixed-time holding {PHASES[cur]} ({sig.phase_elapsed_s:.0f}s/{dur:.0f}s)."


class ActuatedController(BaseController):
    name = "actuated"

    def select_action(self, obs: List[float], sig: JunctionSignalState, training: bool = False) -> Tuple[int, str]:
        ns_q = obs[0] + obs[1]
        ew_q = obs[2] + obs[3]
        ped_demand = obs[10]
        cur = sig.current_phase

        if obs[11] >= 0.99:
            target = 0 if ns_q >= ew_q else 2
            return target, f"Actuated priority request toward {PHASES[target]}."

        if sig.phase_elapsed_s < 10.0:
            return cur, f"Actuated minimum extension holding {PHASES[cur]}."

        if cur in (0, 1) and ew_q > ns_q + 0.15:
            return 2, f"Actuated gap-out: EW demand ({ew_q*15:.0f} veh) exceeds NS ({ns_q*15:.0f} veh)."
        if cur in (2, 3) and ns_q > ew_q + 0.15:
            return 0, f"Actuated gap-out: NS demand ({ns_q*15:.0f} veh) exceeds EW ({ew_q*15:.0f} veh)."
        if ped_demand > 0.55 and cur != 4 and sig.phase_elapsed_s >= 18.0:
            return 4, "Actuated pedestrian call triggered."
        if cur == 4 and sig.phase_elapsed_s >= 8.0:
            nxt = 0 if ns_q >= ew_q else 2
            return nxt, f"Pedestrian clearance complete; serving {PHASES[nxt]}."
        return cur, f"Actuated controller extending active phase {PHASES[cur]}."


class TabularQAgent(BaseController):
    name = "tabular_q"

    def __init__(self, lr: float = 0.15, gamma: float = 0.92, epsilon: float = 0.25, seed: int = 42):
        self.lr = lr
        self.gamma = gamma
        self.epsilon = epsilon
        self.rng = random.Random(seed)
        self.q_table: Dict[str, List[float]] = {}

    def _state_key(self, obs: List[float]) -> str:
        ns_bin = min(3, int((obs[0] + obs[1]) * 2.5))
        ew_bin = min(3, int((obs[2] + obs[3]) * 2.5))
        phase = int(round(obs[8] * 4))
        ped_bin = 1 if obs[10] > 0.4 else 0
        prio_bin = 1 if obs[11] > 0.5 else 0
        return f"{ns_bin}_{ew_bin}_{phase}_{ped_bin}_{prio_bin}"

    def select_action(self, obs: List[float], sig: JunctionSignalState, training: bool = False) -> Tuple[int, str]:
        key = self._state_key(obs)
        q_vals = self.q_table.setdefault(key, [0.0] * 5)
        if training and self.rng.random() < self.epsilon:
            act = self.rng.randint(0, 4)
            return act, f"Tabular-Q exploration (eps={self.epsilon:.2f}) sampled {PHASES[act]}."
        best_q = max(q_vals)
        best_acts = [i for i, q in enumerate(q_vals) if q == best_q]
        act = best_acts[0]
        return act, f"Tabular-Q greedy state[{key}] -> {PHASES[act]} (Q={best_q:.2f})."

    def observe(self, obs: List[float], action: int, reward: float, next_obs: List[float]) -> Optional[float]:
        s = self._state_key(obs)
        ns = self._state_key(next_obs)
        q_s = self.q_table.setdefault(s, [0.0] * 5)
        q_ns = self.q_table.setdefault(ns, [0.0] * 5)
        td_target = reward + self.gamma * max(q_ns)
        td_err = td_target - q_s[action]
        q_s[action] += self.lr * td_err
        return abs(td_err)

    def export_weights(self) -> Dict[str, Any]:
        return {"type": "tabular_q", "q_table": self.q_table}

    def load_weights(self, weights: Dict[str, Any]) -> None:
        if "q_table" in weights:
            self.q_table = weights["q_table"]


class DQNAgent(BaseController):
    """
    Pure Python 3.11 Deep Q-Network (and Dueling DQN option) with:
    - 14 -> 24 (ReLU) -> 5 Q-values (or Value + Advantage streams when dueling=True)
    - Experience Replay Buffer & Target Network soft updates
    """
    name = "dqn"

    def __init__(
        self,
        lr: float = 0.005,
        gamma: float = 0.94,
        epsilon: float = 0.35,
        batch_size: int = 16,
        buffer_size: int = 1000,
        dueling: bool = False,
        seed: int = 42,
    ):
        self.in_dim = 14
        self.hid_dim = 24
        self.out_dim = 5
        self.lr = lr
        self.gamma = gamma
        self.epsilon = epsilon
        self.batch_size = batch_size
        self.dueling = dueling
        self.name = "dueling_dqn" if dueling else "dqn"
        self.rng = random.Random(seed)
        self.replay: deque = deque(maxlen=buffer_size)

        # Xavier-like weight initialization
        scale1 = math.sqrt(2.0 / self.in_dim)
        scale2 = math.sqrt(2.0 / self.hid_dim)
        self.w1 = [[self.rng.gauss(0, scale1) for _ in range(self.in_dim)] for _ in range(self.hid_dim)]
        self.b1 = [0.0] * self.hid_dim
        self.w2 = [[self.rng.gauss(0, scale2) for _ in range(self.hid_dim)] for _ in range(self.out_dim)]
        self.b2 = [0.0] * self.out_dim
        # Value head for Dueling DQN
        self.wv = [self.rng.gauss(0, scale2) for _ in range(self.hid_dim)]
        self.bv = 0.0

        # Target network mirror
        self.tw1 = [row[:] for row in self.w1]
        self.tb1 = self.b1[:]
        self.tw2 = [row[:] for row in self.w2]
        self.tb2 = self.b2[:]
        self.twv = self.wv[:]
        self.tbv = self.bv

    def _forward(self, x: List[float], target: bool = False) -> Tuple[List[float], List[float]]:
        w1 = self.tw1 if target else self.w1
        b1 = self.tb1 if target else self.b1
        w2 = self.tw2 if target else self.w2
        b2 = self.tb2 if target else self.b2
        wv = self.twv if target else self.wv
        bv = self.tbv if target else self.bv

        h = []
        for j in range(self.hid_dim):
            s = b1[j]
            row = w1[j]
            for i in range(self.in_dim):
                s += row[i] * x[i]
            h.append(s if s > 0.0 else 0.0)

        raw = []
        for k in range(self.out_dim):
            s = b2[k]
            row = w2[k]
            for j in range(self.hid_dim):
                s += row[j] * h[j]
            raw.append(s)

        if self.dueling:
            val = bv + sum(wv[j] * h[j] for j in range(self.hid_dim))
            mean_adv = sum(raw) / self.out_dim
            q = [val + (a - mean_adv) for a in raw]
            return q, h
        return raw, h

    def select_action(self, obs: List[float], sig: JunctionSignalState, training: bool = False) -> Tuple[int, str]:
        if training and self.rng.random() < self.epsilon:
            act = self.rng.randint(0, 4)
            return act, f"{self.name.upper()} exploration (eps={self.epsilon:.2f}) sampled {PHASES[act]}."
        q_vals, _ = self._forward(obs, target=False)
        best_q = max(q_vals)
        act = q_vals.index(best_q)
        ns_q = (obs[0] + obs[1]) * 15.0
        ew_q = (obs[2] + obs[3]) * 15.0
        return act, f"{self.name.upper()} selected {PHASES[act]} (Q={best_q:.2f}; NS_q={ns_q:.0f}, EW_q={ew_q:.0f})."

    def observe(self, obs: List[float], action: int, reward: float, next_obs: List[float]) -> Optional[float]:
        self.replay.append((obs, action, reward, next_obs))
        if len(self.replay) < self.batch_size:
            return None

        batch = self.rng.sample(list(self.replay), self.batch_size)
        total_loss = 0.0
        for s, a, r, ns in batch:
            q_s, h = self._forward(s, target=False)
            q_ns_target, _ = self._forward(ns, target=True)
            y = r + self.gamma * max(q_ns_target)
            err = max(-5.0, min(5.0, q_s[a] - y))
            total_loss += 0.5 * err * err

            # Backprop output -> hidden
            dh = [0.0] * self.hid_dim
            grad = err / self.batch_size
            for j in range(self.hid_dim):
                dh[j] += grad * self.w2[a][j]
                self.w2[a][j] -= self.lr * grad * h[j]
            self.b2[a] -= self.lr * grad

            if self.dueling:
                for j in range(self.hid_dim):
                    dh[j] += grad * self.wv[j]
                    self.wv[j] -= self.lr * grad * h[j]
                self.bv -= self.lr * grad

            for j in range(self.hid_dim):
                if h[j] > 0.0:
                    g_h = dh[j]
                    for i in range(self.in_dim):
                        self.w1[j][i] -= self.lr * g_h * s[i]
                    self.b1[j] -= self.lr * g_h

        # Soft target update
        tau = 0.05
        for j in range(self.hid_dim):
            self.tb1[j] = (1 - tau) * self.tb1[j] + tau * self.b1[j]
            self.twv[j] = (1 - tau) * self.twv[j] + tau * self.wv[j]
            for i in range(self.in_dim):
                self.tw1[j][i] = (1 - tau) * self.tw1[j][i] + tau * self.w1[j][i]
        for k in range(self.out_dim):
            self.tb2[k] = (1 - tau) * self.tb2[k] + tau * self.b2[k]
            for j in range(self.hid_dim):
                self.tw2[k][j] = (1 - tau) * self.tw2[k][j] + tau * self.w2[k][j]
        self.tbv = (1 - tau) * self.tbv + tau * self.bv

        return total_loss / self.batch_size

    def export_weights(self) -> Dict[str, Any]:
        return {
            "type": self.name,
            "dueling": self.dueling,
            "w1": self.w1,
            "b1": self.b1,
            "w2": self.w2,
            "b2": self.b2,
            "wv": self.wv,
            "bv": self.bv,
        }

    def load_weights(self, weights: Dict[str, Any]) -> None:
        if "w1" in weights:
            self.w1 = weights["w1"]
            self.b1 = weights["b1"]
            self.w2 = weights["w2"]
            self.b2 = weights["b2"]
            self.wv = weights.get("wv", self.wv)
            self.bv = weights.get("bv", self.bv)
            self.tw1 = [row[:] for row in self.w1]
            self.tb1 = self.b1[:]
            self.tw2 = [row[:] for row in self.w2]
            self.tb2 = self.b2[:]
            self.twv = self.wv[:]
            self.tbv = self.bv


class MultiAgentQController(DQNAgent):
    """Coordinated multi-junction DQN utilizing neighbor pressure obs[12] for green-wave coordination."""
    name = "multi_agent_q"

    def __init__(self, **kwargs):
        super().__init__(dueling=True, **kwargs)
        self.name = "multi_agent_q"

    def select_action(self, obs: List[float], sig: JunctionSignalState, training: bool = False) -> Tuple[int, str]:
        act, _ = super().select_action(obs, sig, training=training)
        neighbor_p = obs[12]
        return act, f"Multi-Agent MARL selected {PHASES[act]} (neighbor pressure={neighbor_p:.2f})."


class DensityAmbulanceController(BaseController):
    """
    Real-time Vehicle Density & Ambulance Priority Detector Controller.
    Calculates highest-density axis from approach queues & wait pressure and immediately
    requests signal preemption when an emergency ambulance is detected.
    """
    name = "density_ambulance"

    def select_action(self, obs: List[float], sig: JunctionSignalState, training: bool = False) -> Tuple[int, str]:
        ns_density = (obs[0] + obs[1]) * 15.0 + (obs[4] + obs[5]) * 6.0
        ew_density = (obs[2] + obs[3]) * 15.0 + (obs[6] + obs[7]) * 6.0
        cur = sig.current_phase

        if obs[11] >= 0.99:
            target = 0 if ns_density >= ew_density else 2
            return target, f"Ambulance Priority Detector switched to {PHASES[target]}."

        if obs[10] > 0.65 and cur != 4 and sig.phase_elapsed_s >= 22.0:
            return 4, "Density Controller serving pedestrian crosswalk burst."

        if sig.phase_elapsed_s < 8.5:
            return cur, f"Density Controller holding {PHASES[cur]} (NS={ns_density:.1f}, EW={ew_density:.1f})."

        if ew_density > ns_density + 1.8:
            return 2, f"Highest Vehicle Density on EW path ({ew_density:.1f} vs NS {ns_density:.1f}) -> EW_THROUGH."
        if ns_density > ew_density + 1.8:
            return 0, f"Highest Vehicle Density on NS path ({ns_density:.1f} vs EW {ew_density:.1f}) -> NS_THROUGH."
        return cur, f"Balanced density (NS={ns_density:.1f}, EW={ew_density:.1f}); holding {PHASES[cur]}."


def build_controller(algorithm: str, params: Optional[Dict[str, Any]] = None, weights: Optional[Dict[str, Any]] = None) -> BaseController:
    params = params or {}
    seed = int(params.get("seed", 42))
    lr = float(params.get("learning_rate", 0.005))
    gamma = float(params.get("gamma", 0.94))
    eps = float(params.get("epsilon_start", 0.35))
    batch = int(params.get("batch_size", 16))

    if algorithm == "fixed_time":
        ctrl: BaseController = FixedTimeController()
    elif algorithm == "actuated":
        ctrl = ActuatedController()
    elif algorithm == "density_ambulance":
        ctrl = DensityAmbulanceController()
    elif algorithm == "tabular_q":
        ctrl = TabularQAgent(lr=max(0.05, lr * 10), gamma=gamma, epsilon=eps, seed=seed)
    elif algorithm == "dueling_dqn":
        ctrl = DQNAgent(lr=lr, gamma=gamma, epsilon=eps, batch_size=batch, dueling=True, seed=seed)
    elif algorithm == "multi_agent_q":
        ctrl = MultiAgentQController(lr=lr, gamma=gamma, epsilon=eps, batch_size=batch, seed=seed)
    else:
        ctrl = DQNAgent(lr=lr, gamma=gamma, epsilon=eps, batch_size=batch, dueling=False, seed=seed)

    if weights:
        ctrl.load_weights(weights)
    return ctrl


# ---------------------------------------------------------------------------
# Training & Live Streaming Entrypoints
# ---------------------------------------------------------------------------

def run_training_job(config: Dict[str, Any]) -> None:
    algorithm = config.get("algorithm", "dqn")
    scenario = config.get("scenario", {})
    episodes = max(1, min(200, int(config.get("episodes", 20))))
    max_steps = max(20, min(600, int(config.get("max_steps", 120))))
    eps_start = float(config.get("epsilon_start", 0.45))
    eps_end = float(config.get("epsilon_end", 0.05))
    seed = int(config.get("seed", 42))

    ctrl = build_controller(algorithm, config)
    best_reward = -1e9
    best_weights: Dict[str, Any] = {}
    t0 = time.time()

    for ep in range(1, episodes + 1):
        env = TrafficNetworkEnv(scenario, seed=seed + ep)
        obs = env.reset()
        if hasattr(ctrl, "epsilon"):
            frac = (ep - 1) / max(1, episodes - 1)
            ctrl.epsilon = eps_start + frac * (eps_end - eps_start)

        ep_reward = 0.0
        losses: List[float] = []
        wait_samples: List[float] = []

        for _ in range(max_steps):
            actions: Dict[str, int] = {}
            for jid in env.junction_ids:
                act, _ = ctrl.select_action(obs[jid], env.signals[jid], training=True)
                actions[jid] = act
            next_obs, rewards, _, info = env.step(actions)
            for jid in env.junction_ids:
                loss = ctrl.observe(obs[jid], actions[jid], rewards[jid], next_obs[jid])
                if loss is not None:
                    losses.append(loss)
                ep_reward += rewards[jid]
            wait_samples.append(info["avg_wait_time_s"])
            obs = next_obs

        ep_reward_avg = ep_reward / max(1, len(env.junction_ids))
        avg_loss = sum(losses) / len(losses) if losses else 0.0
        avg_wait = sum(wait_samples) / len(wait_samples) if wait_samples else 0.0
        if ep_reward_avg > best_reward:
            best_reward = ep_reward_avg
            best_weights = ctrl.export_weights()

        progress_msg = {
            "type": "train_progress",
            "episode": ep,
            "total_episodes": episodes,
            "episode_reward": round(ep_reward_avg, 3),
            "avg_loss": round(avg_loss, 4),
            "epsilon": round(getattr(ctrl, "epsilon", 0.0), 3),
            "avg_wait_s": round(avg_wait, 2),
            "throughput_vph": info["throughput_vph"],
            "safety_overrides": info["total_safety_overrides"],
            "elapsed_s": round(time.time() - t0, 2),
        }
        print(json.dumps(progress_msg), flush=True)

    # Evaluate against Fixed-Time baseline on a holdout seed
    eval_env_rl = TrafficNetworkEnv(scenario, seed=seed + 999)
    eval_env_ft = TrafficNetworkEnv(scenario, seed=seed + 999)
    ft_ctrl = FixedTimeController()
    ctrl.load_weights(best_weights)

    obs_rl = eval_env_rl.reset()
    obs_ft = eval_env_ft.reset()
    rl_waits, ft_waits = [], []
    t_inf0 = time.perf_counter()
    inf_calls = 0

    for _ in range(max_steps):
        a_rl = {}
        for jid in eval_env_rl.junction_ids:
            inf_calls += 1
            a_rl[jid], _ = ctrl.select_action(obs_rl[jid], eval_env_rl.signals[jid], training=False)
        obs_rl, _, _, i_rl = eval_env_rl.step(a_rl)
        rl_waits.append(i_rl["avg_wait_time_s"])

        a_ft = {}
        for jid in eval_env_ft.junction_ids:
            a_ft[jid], _ = ft_ctrl.select_action(obs_ft[jid], eval_env_ft.signals[jid], training=False)
        obs_ft, _, _, i_ft = eval_env_ft.step(a_ft)
        ft_waits.append(i_ft["avg_wait_time_s"])

    inf_latency_ms = ((time.perf_counter() - t_inf0) * 1000.0) / max(1, inf_calls)
    rl_avg_wait = sum(rl_waits) / max(1, len(rl_waits))
    ft_avg_wait = sum(ft_waits) / max(1, len(ft_waits))
    improvement_pct = ((ft_avg_wait - rl_avg_wait) / max(0.1, ft_avg_wait)) * 100.0

    complete_msg = {
        "type": "train_complete",
        "algorithm": algorithm,
        "best_reward": round(best_reward, 3),
        "eval_rl_avg_wait_s": round(rl_avg_wait, 2),
        "eval_fixed_avg_wait_s": round(ft_avg_wait, 2),
        "wait_improvement_pct": round(improvement_pct, 1),
        "eval_score": round(max(0.0, min(100.0, 65.0 + improvement_pct * 0.8)), 1),
        "inference_latency_ms": round(inf_latency_ms, 3),
        "weights": best_weights,
    }
    print(json.dumps(complete_msg), flush=True)


def run_live_loop(init_cfg: Dict[str, Any]) -> None:
    """Interactive stdin/stdout JSON-line simulation worker."""
    scenario = init_cfg.get("scenario", {})
    algorithm = init_cfg.get("algorithm", "dqn")
    weights = init_cfg.get("weights")
    env = TrafficNetworkEnv(scenario)
    ctrl = build_controller(algorithm, init_cfg, weights)
    obs = env.reset()

    # Emit initial snapshot
    print(json.dumps({"type": "snapshot", "data": env.get_snapshot(), "explanation": "Initialized Python simulation engine."}), flush=True)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            cmd = json.loads(line)
        except json.JSONDecodeError:
            continue

        ctype = cmd.get("cmd")
        if ctype == "step":
            steps = max(1, min(10, int(cmd.get("steps", 1))))
            explanation = ""
            t_inf0 = time.perf_counter()
            for _ in range(steps):
                actions: Dict[str, int] = {}
                explanations: List[str] = []
                for jid in env.junction_ids:
                    act, exp = ctrl.select_action(obs[jid], env.signals[jid], training=False)
                    actions[jid] = act
                    explanations.append(f"{jid}: {exp}")
                obs, _, _, info = env.step(actions)
                explanation = " | ".join(explanations)
            inf_ms = round((time.perf_counter() - t_inf0) * 1000.0 / max(1, steps), 3)
            info["inference_latency_ms"] = inf_ms
            info["algorithm"] = ctrl.name
            info["explanation"] = explanation
            print(json.dumps({"type": "snapshot", "data": info}), flush=True)
        elif ctype == "set_controller":
            algorithm = cmd.get("algorithm", "dqn")
            weights = cmd.get("weights")
            ctrl = build_controller(algorithm, cmd, weights)
            print(json.dumps({"type": "ack", "algorithm": ctrl.name}), flush=True)
        elif ctype == "inject_emergency":
            jid = cmd.get("junction_id", "J1")
            app = cmd.get("approach", "N")
            if jid in env.junction_ids:
                env._spawn_vehicle(jid, app, -110.0, forced_vtype="emergency")
            print(json.dumps({"type": "snapshot", "data": env.get_snapshot()}), flush=True)
        elif ctype == "inject_incident":
            env.incident = cmd.get("incident")
            print(json.dumps({"type": "snapshot", "data": env.get_snapshot()}), flush=True)
        elif ctype == "update_weather":
            env.weather_factor = max(0.35, min(1.0, float(cmd.get("weather_factor", 1.0))))
        elif ctype == "update_aqi":
            env.background_aqi = max(10.0, min(400.0, float(cmd.get("background_aqi", 68.0))))
        elif ctype == "set_eco_idle":
            env.eco_idle_stop = bool(cmd.get("enabled", True))
            print(json.dumps({"type": "snapshot", "data": env.get_snapshot()}), flush=True)
        elif ctype == "reset":
            if cmd.get("scenario"):
                env = TrafficNetworkEnv(cmd["scenario"])
            obs = env.reset()
            print(json.dumps({"type": "snapshot", "data": env.get_snapshot()}), flush=True)
        elif ctype == "quit":
            break


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["live", "train"], required=True)
    args = parser.parse_args()
    raw = sys.stdin.readline()
    cfg = json.loads(raw) if raw.strip() else {}
    if args.mode == "live":
        run_live_loop(cfg)
    else:
        run_training_job(cfg)
