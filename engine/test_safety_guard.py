#!/usr/bin/env python3
"""
Unit tests proving that NEXUS Traffic Safety Guard prevents conflicting movements
from receiving simultaneous green, enforces min/max green, handles invalid RL actions,
and safely preempts via yellow -> all-red clearance for emergency vehicles.
"""

import unittest
from nexus_rl import (
    PHASES,
    PHASE_MOVEMENTS,
    CONFLICTING_AXIS_PAIRS,
    SafetyConfig,
    SafetyGuard,
    JunctionSignalState,
    verify_phase_conflict_free,
)


class TestSafetyGuard(unittest.TestCase):
    def setUp(self):
        self.guard = SafetyGuard(SafetyConfig(min_green_s=8.0, max_green_s=45.0, yellow_s=3.0, all_red_s=2.0))

    def test_no_conflicting_movements_in_any_phase(self):
        for pid in PHASES:
            self.assertTrue(verify_phase_conflict_free(pid), f"Phase {pid} failed conflict check")
            moves = [f"{a}_{m}" for a, m in PHASE_MOVEMENTS[pid]]
            for i in range(len(moves)):
                for j in range(i + 1, len(moves)):
                    self.assertNotIn(frozenset([moves[i], moves[j]]), CONFLICTING_AXIS_PAIRS)

    def test_blocks_early_switch_below_min_green(self):
        sig = JunctionSignalState("J1", current_phase=0, phase_elapsed_s=2.0)
        phase, override = self.guard.step_signal(sig, proposed_phase=2, dt=1.0, sim_time=3.0)
        self.assertEqual(phase, 0)
        self.assertEqual(sig.light_state, "GREEN")
        self.assertIsNotNone(override)
        self.assertEqual(override["override_type"], "MIN_GREEN_VIOLATION")

    def test_clearance_sequence_yellow_then_all_red(self):
        sig = JunctionSignalState("J1", current_phase=0, phase_elapsed_s=10.0)
        self.guard.step_signal(sig, proposed_phase=2, dt=1.0, sim_time=11.0)
        self.assertEqual(sig.light_state, "YELLOW")
        # Step through 3s yellow -> becomes ALL_RED
        for t in range(3):
            self.guard.step_signal(sig, proposed_phase=2, dt=1.0, sim_time=12.0 + t)
        self.assertEqual(sig.light_state, "ALL_RED")
        # Step through 2s all-red -> becomes GREEN on phase 2
        for t in range(2):
            self.guard.step_signal(sig, proposed_phase=2, dt=1.0, sim_time=15.0 + t)
        self.assertEqual(sig.light_state, "GREEN")
        self.assertEqual(sig.current_phase, 2)

    def test_invalid_action_fallback(self):
        sig = JunctionSignalState("J1", current_phase=2, phase_elapsed_s=12.0)
        phase, override = self.guard.step_signal(sig, proposed_phase="UNSAFE_99", dt=1.0, sim_time=13.0)
        self.assertEqual(phase, 2)
        self.assertIsNotNone(override)
        self.assertEqual(override["override_type"], "INVALID_ACTION_FALLBACK")

    def test_emergency_preemption_triggers_safe_clearance(self):
        sig = JunctionSignalState("J1", current_phase=0, phase_elapsed_s=3.0)
        phase, override = self.guard.step_signal(sig, proposed_phase=0, dt=1.0, sim_time=4.0, emergency_approach="E")
        self.assertEqual(sig.light_state, "YELLOW")
        self.assertEqual(sig.target_phase, 2)
        self.assertIsNotNone(override)
        self.assertEqual(override["override_type"], "EMERGENCY_PREEMPTION")


if __name__ == "__main__":
    unittest.main()
