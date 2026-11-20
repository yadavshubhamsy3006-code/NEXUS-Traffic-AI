import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { CityNetwork, SimSnapshot } from '../context/NexusContext';

interface Props {
  cityNetwork: CityNetwork | null;
  snapshot: SimSnapshot | null;
  height?: number;
  selectedJunctionId?: string;
  onSelectJunction?: (jid: string) => void;
  theme?: 'dark' | 'light';
}

export function CityMapCanvas({
  cityNetwork,
  snapshot,
  height = 420,
  selectedJunctionId = 'J1',
  onSelectJunction,
  theme = 'dark',
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const roadLayerRef = useRef<L.LayerGroup | null>(null);
  const junctionLayerRef = useRef<L.LayerGroup | null>(null);
  const vehicleLayerRef = useRef<L.LayerGroup | null>(null);

  // Initialize Leaflet map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [12.9756, 77.6066],
      zoom: 16,
      zoomControl: true,
    });

    const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;
    tileLayerRef.current = tiles;
    roadLayerRef.current = L.layerGroup().addTo(map);
    junctionLayerRef.current = L.layerGroup().addTo(map);
    vehicleLayerRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Recenter & redraw real OSM roads when city changes
  useEffect(() => {
    const map = mapRef.current;
    const roadLayer = roadLayerRef.current;
    if (!map || !roadLayer || !cityNetwork) return;

    map.setView([cityNetwork.lat, cityNetwork.lon], 16, { animate: true });
    roadLayer.clearLayers();

    for (const road of cityNetwork.roads) {
      L.polyline(road.coords, {
        color: theme === 'dark' ? '#38BDF8' : '#0284C7',
        weight: road.highway === 'primary' || road.highway === 'trunk' ? 4 : 2.5,
        opacity: theme === 'dark' ? 0.52 : 0.65,
      })
        .bindTooltip(`${road.name} (${road.lanes} lanes · ${road.maxspeed} km/h)`, { sticky: true })
        .addTo(roadLayer);
    }
  }, [cityNetwork, theme]);

  // Draw traffic signal junctions & live simulated vehicles moving along OSM approach roads
  useEffect(() => {
    const jLayer = junctionLayerRef.current;
    const vLayer = vehicleLayerRef.current;
    if (!jLayer || !vLayer || !cityNetwork) return;

    jLayer.clearLayers();
    vLayer.clearLayers();

    const simJunctions = snapshot?.junctions || [];

    cityNetwork.junctions.forEach((osmJ, idx) => {
      const simJ = simJunctions[idx] || simJunctions[0];
      const isNSGreen = simJ ? simJ.current_phase === 0 || simJ.current_phase === 1 : true;
      const totalQ = simJ ? simJ.queues.N + simJ.queues.S + simJ.queues.E + simJ.queues.W : 0;
      const isSelected = osmJ.id === selectedJunctionId;

      // Congestion ring proportional to queue length
      if (totalQ > 0) {
        L.circle([osmJ.lat, osmJ.lon], {
          radius: 18 + totalQ * 2.5,
          color: totalQ > 12 ? '#EF4444' : totalQ > 5 ? '#F59E0B' : '#10B981',
          fillColor: totalQ > 12 ? '#EF4444' : totalQ > 5 ? '#F59E0B' : '#10B981',
          fillOpacity: 0.16,
          weight: 1.5,
        }).addTo(jLayer);
      }

      const marker = L.circleMarker([osmJ.lat, osmJ.lon], {
        radius: isSelected ? 10 : 7.5,
        color: isSelected ? '#06B6D4' : '#FFFFFF',
        weight: isSelected ? 3 : 1.5,
        fillColor: simJ?.light_state === 'YELLOW' ? '#F59E0B' : isNSGreen ? '#10B981' : '#06B6D4',
        fillOpacity: 0.95,
      }).addTo(jLayer);

      marker.bindTooltip(
        `${osmJ.id}: ${osmJ.name}${simJ ? ` · ${simJ.phase_name} (${simJ.light_state}) · Queue: ${totalQ}` : ''}`,
        { direction: 'top' }
      );
      if (onSelectJunction) {
        marker.on('click', () => onSelectJunction(osmJ.id));
      }
    });

    // Plot simulated vehicles directly onto the selected city's OSM approach segments
    const vehicles = snapshot?.vehicles || [];
    for (const v of vehicles) {
      const jIdx = Math.max(0, parseInt(v.j.replace('J', ''), 10) - 1);
      const osmJ = cityNetwork.junctions[jIdx] || cityNetwork.junctions[0];
      if (!osmJ) continue;

      const seg = osmJ.approaches[v.a];
      if (!seg || seg.length < 2) continue;
      // seg[0] = outer approach (-160m), seg[1] = junction stop-line (0m)
      // map v.p (-160..+48) -> t (0..1.25)
      const frac = Math.max(-0.05, Math.min(1.22, (v.p + 160) / 160));
      const lat = seg[0][0] + (seg[1][0] - seg[0][0]) * frac;
      const lon = seg[0][1] + (seg[1][1] - seg[0][1]) * frac;

      // Slight lateral lane offset perpendicular to segment
      const dLat = seg[1][0] - seg[0][0];
      const dLon = seg[1][1] - seg[0][1];
      const len = Math.hypot(dLat, dLon) || 1;
      const laneShift = (v.l === 0 ? 0.000035 : 0.000075);
      const vLat = lat - (dLon / len) * laneShift;
      const vLon = lon + (dLat / len) * laneShift;

      const color =
        v.t === 'emergency'
          ? '#EF4444'
          : v.t === 'bus'
            ? '#F59E0B'
            : v.st
              ? '#FB7185'
              : '#06B6D4';

      L.circleMarker([vLat, vLon], {
        radius: v.t === 'bus' ? 5.5 : v.t === 'emergency' ? 6 : 4,
        color: '#0B1120',
        weight: 1,
        fillColor: color,
        fillOpacity: 0.95,
      })
        .bindTooltip(`${v.id} (${v.t}) · ${Math.round(v.s * 3.6)} km/h · wait ${v.w}s`)
        .addTo(vLayer);
    }
  }, [cityNetwork, snapshot, selectedJunctionId, onSelectJunction]);

  return (
    <div className="relative w-full rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800">
      <div
        ref={containerRef}
        style={{ height }}
        className={`w-full z-0 ${theme === 'dark' ? '[&_.leaflet-tile-pane]:brightness-75 [&_.leaflet-tile-pane]:invert [&_.leaflet-tile-pane]:hue-rotate-180 [&_.leaflet-tile-pane]:contrast-90' : ''}`}
      />
      <div className="absolute bottom-3 left-3 z-[400] px-2.5 py-1.5 rounded bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-800 text-[11px] font-mono text-slate-700 dark:text-slate-300 flex flex-wrap items-center gap-2">
        <span className="font-semibold text-cyan-600 dark:text-cyan-400">
          {cityNetwork?.displayName || 'Bengaluru'}
        </span>
        <span aria-hidden="true">·</span>
        <span>{cityNetwork?.sourceStatus || 'Loading OSM...'}</span>
        <span aria-hidden="true">·</span>
        <span>Real OSM Road Geometry + Simulated Vehicles</span>
      </div>
    </div>
  );
}
