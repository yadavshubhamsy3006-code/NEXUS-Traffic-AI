import React, { useEffect, useRef, useState } from 'react';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { SimSnapshot } from '../context/NexusContext';

interface Props {
  snapshot?: SimSnapshot | null;
  selectedJunctionId?: string;
  onSelectJunction?: (jid: string) => void;
  height?: number;
  demoMode?: boolean;
  theme?: 'dark' | 'light';
}

// Smoothly interpolates vehicle positions between backend 0.5s snapshots
export function IntersectionCanvas({
  snapshot,
  selectedJunctionId = 'J1',
  onSelectJunction,
  height = 420,
  demoMode = false,
  theme = 'dark',
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ active: boolean; x: number; y: number }>({ active: false, x: 0, y: 0 });
  const snapRef = useRef<SimSnapshot | null>(snapshot);
  const lastSnapTimeRef = useRef<number>(performance.now());

  useEffect(() => {
    snapRef.current = snapshot;
    lastSnapTimeRef.current = performance.now();
  }, [snapshot]);

  useEffect(() => {
    let animId = 0;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = (now: number) => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.floor(rect.width * dpr) || canvas.height !== Math.floor(rect.height * dpr)) {
        canvas.width = Math.floor(rect.width * dpr);
        canvas.height = Math.floor(rect.height * dpr);
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      const w = rect.width;
      const h = rect.height;

      const isDark = theme === 'dark';
      ctx.fillStyle = isDark ? '#0B1120' : '#F1F5F9';
      ctx.fillRect(0, 0, w, h);

      // Subtle architectural grid
      ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.06)' : 'rgba(15, 23, 42, 0.06)';
      ctx.lineWidth = 1;
      for (let gx = 0; gx < w; gx += 32) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, h);
        ctx.stroke();
      }
      for (let gy = 0; gy < h; gy += 32) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(w, gy);
        ctx.stroke();
      }

      const activeSnap = demoMode ? buildDemoSnapshot(now / 1000) : snapRef.current;
      const elapsedSinceSnap = demoMode ? 0 : Math.min(0.6, (now - lastSnapTimeRef.current) / 1000);

      const junctions = activeSnap?.junctions?.length
        ? activeSnap.junctions
        : [
            {
              junction_id: 'J1',
              current_phase: 0,
              phase_name: 'NS_THROUGH',
              light_state: 'GREEN' as const,
              phase_elapsed_s: 0,
              min_hold_s: 8,
              countdown_s: 45,
              queues: { N: 0, S: 0, E: 0, W: 0 },
              wait_by_approach: { N: 0, S: 0, E: 0, W: 0 },
              pedestrians_waiting: 0,
              switches: 0,
            },
          ];

      ctx.translate(w / 2 + pan.x, h / 2 + pan.y);
      const autoScale = junctions.length === 1 ? 1.0 : junctions.length === 2 ? 0.68 : 0.54;
      ctx.scale(zoom * autoScale, zoom * autoScale);

      // Compute center offsets for 1, 2, 3, or 4 junctions
      const centers: Record<string, { x: number; y: number }> = {};
      if (junctions.length === 1) {
        centers[junctions[0].junction_id] = { x: 0, y: 0 };
      } else if (junctions.length === 2) {
        centers[junctions[0].junction_id] = { x: -210, y: 0 };
        centers[junctions[1].junction_id] = { x: 210, y: 0 };
      } else if (junctions.length === 3) {
        centers[junctions[0].junction_id] = { x: -280, y: 0 };
        centers[junctions[1].junction_id] = { x: 0, y: 0 };
        centers[junctions[2].junction_id] = { x: 280, y: 0 };
      } else {
        centers[junctions[0].junction_id] = { x: -195, y: -155 };
        centers[junctions[1].junction_id] = { x: 195, y: -155 };
        centers[junctions[2].junction_id] = { x: -195, y: 155 };
        centers[junctions[3].junction_id] = { x: 195, y: 155 };
      }

      const roadHalf = 34;
      const armLen = 175;

      for (const j of junctions) {
        const c = centers[j.junction_id] || { x: 0, y: 0 };
        const isSelected = j.junction_id === selectedJunctionId;

        ctx.save();
        ctx.translate(c.x, c.y);

        // Asphalt roads
        ctx.fillStyle = isDark ? '#1E293B' : '#CBD5E1';
        ctx.fillRect(-roadHalf, -armLen, roadHalf * 2, armLen * 2);
        ctx.fillRect(-armLen, -roadHalf, armLen * 2, roadHalf * 2);

        // Congestion heatmap overlay on approaches
        const drawHeat = (app: 'N' | 'S' | 'E' | 'W', q: number) => {
          if (q <= 1) return;
          const intensity = Math.min(0.42, q * 0.045);
          ctx.fillStyle = q >= 6 ? `rgba(239, 68, 68, ${intensity})` : `rgba(245, 158, 11, ${intensity})`;
          if (app === 'N') ctx.fillRect(-roadHalf, -armLen, roadHalf, armLen - roadHalf);
          if (app === 'S') ctx.fillRect(0, roadHalf, roadHalf, armLen - roadHalf);
          if (app === 'E') ctx.fillRect(roadHalf, -roadHalf, armLen - roadHalf, roadHalf);
          if (app === 'W') ctx.fillRect(-armLen, 0, armLen - roadHalf, roadHalf);
        };
        drawHeat('N', j.queues.N);
        drawHeat('S', j.queues.S);
        drawHeat('E', j.queues.E);
        drawHeat('W', j.queues.W);

        // Center yellow dividers
        ctx.strokeStyle = '#F59E0B';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.moveTo(0, -armLen);
        ctx.lineTo(0, -roadHalf - 10);
        ctx.moveTo(0, roadHalf + 10);
        ctx.lineTo(0, armLen);
        ctx.moveTo(-armLen, 0);
        ctx.lineTo(-roadHalf - 10, 0);
        ctx.moveTo(roadHalf + 10, 0);
        ctx.lineTo(armLen, 0);
        ctx.stroke();
        ctx.setLineDash([]);

        // Pedestrian crosswalks
        ctx.fillStyle = isDark ? 'rgba(226, 232, 240, 0.35)' : 'rgba(255, 255, 255, 0.85)';
        for (let s = -roadHalf + 4; s < roadHalf - 4; s += 9) {
          ctx.fillRect(s, -roadHalf - 8, 5, 7);
          ctx.fillRect(s, roadHalf + 1, 5, 7);
          ctx.fillRect(-roadHalf - 8, s, 7, 5);
          ctx.fillRect(roadHalf + 1, s, 7, 5);
        }

        // Pedestrian waiting indicator dot cluster if waiting
        if (j.pedestrians_waiting > 0) {
          ctx.fillStyle = j.current_phase === 4 ? '#10B981' : '#38BDF8';
          const pCount = Math.min(6, j.pedestrians_waiting);
          for (let p = 0; p < pCount; p++) {
            ctx.beginPath();
            ctx.arc(-roadHalf - 14 - (p % 2) * 6, -roadHalf - 14 - Math.floor(p / 2) * 6, 2.6, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Selection ring around junction box
        if (isSelected) {
          ctx.strokeStyle = '#06B6D4';
          ctx.lineWidth = 2;
          ctx.strokeRect(-roadHalf - 2, -roadHalf - 2, roadHalf * 2 + 4, roadHalf * 2 + 4);
        }

        // Signal light indicators at stop lines
        const nsColor =
          j.current_phase === 0 || j.current_phase === 1
            ? j.light_state === 'GREEN'
              ? '#10B981'
              : j.light_state === 'YELLOW'
                ? '#F59E0B'
                : '#EF4444'
            : '#EF4444';
        const ewColor =
          j.current_phase === 2 || j.current_phase === 3
            ? j.light_state === 'GREEN'
              ? '#10B981'
              : j.light_state === 'YELLOW'
                ? '#F59E0B'
                : '#EF4444'
            : '#EF4444';

        const drawSignalHead = (sx: number, sy: number, color: string) => {
          ctx.fillStyle = '#0F172A';
          ctx.beginPath();
          ctx.arc(sx, sy, 7.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(sx, sy, 4.8, 0, Math.PI * 2);
          ctx.fill();
        };

        drawSignalHead(-roadHalf - 11, -roadHalf - 11, nsColor); // N
        drawSignalHead(roadHalf + 11, roadHalf + 11, nsColor);   // S
        drawSignalHead(roadHalf + 11, -roadHalf - 11, ewColor);  // E
        drawSignalHead(-roadHalf - 11, roadHalf + 11, ewColor);  // W

        // Road & Junction labels
        ctx.fillStyle = isDark ? '#94A3B8' : '#475569';
        ctx.font = '600 11px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${j.junction_id} · ${j.phase_name}`, 0, -roadHalf - 18);
        ctx.fillText(`N (q:${j.queues.N})`, 0, -armLen - 8);
        ctx.fillText(`S (q:${j.queues.S})`, 0, armLen + 16);
        ctx.fillText(`W (${j.queues.W})`, -armLen - 28, 4);
        ctx.fillText(`E (${j.queues.E})`, armLen + 28, 4);

        // Roadside "STOP ENGINES" advisory sign on last-priority red approaches
        const ecoOn = activeSnap?.aqi_telemetry?.eco_idle_stop ?? true;
        if (ecoOn && Array.isArray((j as any).approach_detection)) {
          for (const det of (j as any).approach_detection) {
            if (det.engine_off_advised) {
              ctx.fillStyle = '#065F46';
              const tag = `STOP ENGINES (${det.est_red_wait_s}s)`;
              if (det.approach === 'N') {
                ctx.fillRect(-roadHalf - 115, -roadHalf - 46, 108, 16);
                ctx.fillStyle = '#6EE7B7';
                ctx.font = '600 9px "JetBrains Mono", monospace';
                ctx.fillText(tag, -roadHalf - 61, -roadHalf - 35);
              } else if (det.approach === 'S') {
                ctx.fillRect(roadHalf + 8, roadHalf + 30, 108, 16);
                ctx.fillStyle = '#6EE7B7';
                ctx.font = '600 9px "JetBrains Mono", monospace';
                ctx.fillText(tag, roadHalf + 62, roadHalf + 41);
              } else if (det.approach === 'E') {
                ctx.fillRect(roadHalf + 8, -roadHalf - 34, 108, 16);
                ctx.fillStyle = '#6EE7B7';
                ctx.font = '600 9px "JetBrains Mono", monospace';
                ctx.fillText(tag, roadHalf + 62, -roadHalf - 23);
              } else if (det.approach === 'W') {
                ctx.fillRect(-roadHalf - 115, roadHalf + 30, 108, 16);
                ctx.fillStyle = '#6EE7B7';
                ctx.font = '600 9px "JetBrains Mono", monospace';
                ctx.fillText(tag, -roadHalf - 61, roadHalf + 41);
              }
            }
          }
        }

        ctx.restore();
      }

      // Render vehicles
      const vehicles = activeSnap?.vehicles || [];
      for (const v of vehicles) {
        const c = centers[v.j];
        if (!c) continue;
        // Scale simulation meters (-160..+48) to canvas pixels
        const posM = v.p + (v.st ? 0 : v.s * elapsedSinceSnap);
        const pxDist = posM * 0.92; // stop line at 0 -> roadHalf
        const laneOffset = v.l === 0 ? 11 : 23;

        let vx = c.x;
        let vy = c.y;
        let angle = 0;

        if (v.a === 'N') {
          vx = c.x - laneOffset;
          vy = c.y - roadHalf + pxDist;
          angle = Math.PI / 2;
        } else if (v.a === 'S') {
          vx = c.x + laneOffset;
          vy = c.y + roadHalf - pxDist;
          angle = -Math.PI / 2;
        } else if (v.a === 'E') {
          vx = c.x + roadHalf - pxDist;
          vy = c.y - laneOffset;
          angle = Math.PI;
        } else if (v.a === 'W') {
          vx = c.x - roadHalf + pxDist;
          vy = c.y + laneOffset;
          angle = 0;
        }

        // Clip vehicles beyond road arm
        if (Math.abs(vx - c.x) > armLen + 10 || Math.abs(vy - c.y) > armLen + 10) continue;

        ctx.save();
        ctx.translate(vx, vy);
        ctx.rotate(angle);

        const len = v.t === 'bus' ? 18 : v.t === 'emergency' ? 14 : v.t === 'bike' ? 7.5 : 11;
        const wid = v.t === 'bus' ? 7.5 : v.t === 'bike' ? 3.5 : 6;

        if (v.t === 'emergency') {
          ctx.fillStyle = '#EF4444';
        } else if (v.t === 'bus') {
          ctx.fillStyle = '#F59E0B';
        } else if (v.t === 'bike') {
          ctx.fillStyle = v.st ? '#F472B6' : '#10B981';
        } else if (v.st) {
          ctx.fillStyle = '#FB7185';
        } else {
          ctx.fillStyle = '#06B6D4';
        }

        ctx.beginPath();
        ctx.roundRect(-len / 2, -wid / 2, len, wid, 2);
        ctx.fill();

        if (v.t === 'emergency' && Math.floor(now / 200) % 2 === 0) {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(-1.5, -wid / 2, 3, wid);
        }

        ctx.restore();
      }

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [zoom, pan, selectedJunctionId, demoMode, theme]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onSelectJunction || !snapshot?.junctions?.length) return;
    if (snapshot.junctions.length === 1) {
      onSelectJunction(snapshot.junctions[0].junction_id);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = e.clientX - rect.left - rect.width / 2 - pan.x;
    const idx = cx < 0 ? 0 : Math.min(snapshot.junctions.length - 1, 1);
    onSelectJunction(snapshot.junctions[idx].junction_id);
  };

  return (
    <div className="relative w-full overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-[#0B1120]">
      <canvas
        ref={canvasRef}
        style={{ height }}
        className="w-full block cursor-grab active:cursor-grabbing"
        onClick={handleClick}
        onMouseDown={(e) => {
          dragRef.current = { active: true, x: e.clientX - pan.x, y: e.clientY - pan.y };
        }}
        onMouseMove={(e) => {
          if (dragRef.current.active) {
            setPan({ x: e.clientX - dragRef.current.x, y: e.clientY - dragRef.current.y });
          }
        }}
        onMouseUp={() => {
          dragRef.current.active = false;
        }}
        onMouseLeave={() => {
          dragRef.current.active = false;
        }}
      />

      {/* Legend */}
      <div className="absolute bottom-3 left-3 flex flex-wrap items-center gap-3 px-2.5 py-1.5 rounded bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 text-[11px] font-mono text-slate-700 dark:text-slate-300">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-1.5 rounded-xs bg-cyan-500 inline-block" /> Car
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-1 rounded-xs bg-emerald-500 inline-block" /> Bike
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-1.5 rounded-xs bg-rose-400 inline-block" /> Queued
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-1.5 rounded-xs bg-amber-500 inline-block" /> Bus
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-1.5 rounded-xs bg-red-500 inline-block" /> Emergency
        </span>
      </div>

      {/* Zoom controls */}
      <div className="absolute top-3 right-3 flex items-center gap-1 bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded p-1">
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(2.2, z + 0.2))}
          title="Zoom in"
          className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(0.5, z - 0.2))}
          title="Zoom out"
          className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
          title="Reset view"
          className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// Deterministic interactive demo snapshot for the public landing page
function buildDemoSnapshot(t: number): SimSnapshot {
  const cycle = Math.floor(t) % 24;
  const phase = cycle < 11 ? 0 : cycle < 13 ? 0 : cycle < 22 ? 2 : 2;
  const lightState: 'GREEN' | 'YELLOW' =
    cycle === 11 || cycle === 23 ? 'YELLOW' : 'GREEN';

  const vehicles: SimSnapshot['vehicles'] = [];
  for (let i = 0; i < 6; i++) {
    const nPos = ((t * 18 + i * 28) % 190) - 145;
    const sPos = ((t * 16 + i * 31) % 190) - 145;
    vehicles.push({
      id: `dn_${i}`,
      j: 'J1',
      a: 'N',
      l: i % 2,
      m: 'straight',
      t: i === 2 ? 'bus' : 'car',
      p: phase === 0 ? nPos : Math.min(-5 - i * 11, nPos),
      s: phase === 0 ? 12 : 0,
      w: phase === 0 ? 0 : 6,
      st: phase !== 0 && nPos > -65,
    });
    vehicles.push({
      id: `ds_${i}`,
      j: 'J1',
      a: 'S',
      l: i % 2,
      m: 'straight',
      t: 'car',
      p: phase === 0 ? sPos : Math.min(-5 - i * 11, sPos),
      s: phase === 0 ? 12 : 0,
      w: phase === 0 ? 0 : 6,
      st: phase !== 0 && sPos > -65,
    });
  }
  for (let i = 0; i < 5; i++) {
    const ePos = ((t * 17 + i * 32) % 190) - 145;
    const wPos = ((t * 15 + i * 34) % 190) - 145;
    vehicles.push({
      id: `de_${i}`,
      j: 'J1',
      a: 'E',
      l: i % 2,
      m: 'straight',
      t: i === 4 ? 'emergency' : 'car',
      p: phase === 2 ? ePos : Math.min(-5 - i * 11, ePos),
      s: phase === 2 ? 12 : 0,
      w: phase === 2 ? 0 : 5,
      st: phase !== 2 && ePos > -65,
    });
    vehicles.push({
      id: `dw_${i}`,
      j: 'J1',
      a: 'W',
      l: i % 2,
      m: 'straight',
      t: 'car',
      p: phase === 2 ? wPos : Math.min(-5 - i * 11, wPos),
      s: phase === 2 ? 12 : 0,
      w: phase === 2 ? 0 : 5,
      st: phase !== 2 && wPos > -65,
    });
  }

  return {
    sim_time: Math.round(t),
    vehicles_in_network: vehicles.length,
    avg_wait_time_s: 8.4,
    avg_queue_length: 2.3,
    max_queue_length: 5,
    throughput_vph: 1420,
    total_arrivals: 180,
    total_departures: 158,
    co2_emissions_g: 4120,
    active_incidents: 0,
    emergency_active: true,
    reward_breakdown: {
      wait_penalty: -0.4,
      queue_penalty: -0.25,
      throughput_bonus: 1.4,
      fairness_bonus: 0.35,
      pedestrian_penalty: -0.1,
      emergency_bonus: 0.8,
      switch_penalty: 0,
      emission_penalty: -0.15,
      total_reward: 1.65,
    },
    junctions: [
      {
        junction_id: 'J1',
        current_phase: phase,
        phase_name: phase === 0 ? 'NS_THROUGH' : 'EW_THROUGH',
        light_state: lightState,
        phase_elapsed_s: cycle % 12,
        min_hold_s: 8,
        countdown_s: 12 - (cycle % 12),
        queues: { N: phase === 0 ? 1 : 4, S: phase === 0 ? 1 : 3, E: phase === 2 ? 1 : 4, W: phase === 2 ? 0 : 3 },
        wait_by_approach: { N: 6, S: 5, E: 9, W: 8 },
        pedestrians_waiting: 3,
        switches: 4,
      },
    ],
    vehicles,
    step_overrides: [],
    total_safety_overrides: 0,
  };
}
