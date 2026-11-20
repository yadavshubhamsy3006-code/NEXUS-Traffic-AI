import { db } from './db.ts';

export interface CityPreset {
  id: string;
  name: string;
  country: string;
  focusIntersection: string;
  lat: number;
  lon: number;
  defaultLanes: number;
  defaultSpeedKmh: number;
}

export const TOP_CITIES: CityPreset[] = [
  {
    id: 'bengaluru',
    name: 'Bengaluru',
    country: 'India',
    focusIntersection: 'MG Road & Brigade Rd / Silk Board Corridor',
    lat: 12.9756,
    lon: 77.6066,
    defaultLanes: 2,
    defaultSpeedKmh: 45,
  },
  {
    id: 'mumbai',
    name: 'Mumbai',
    country: 'India',
    focusIntersection: 'Haji Ali & Dr. Annie Besant Rd',
    lat: 18.9827,
    lon: 72.8118,
    defaultLanes: 2,
    defaultSpeedKmh: 45,
  },
  {
    id: 'delhi',
    name: 'New Delhi',
    country: 'India',
    focusIntersection: 'Connaught Place & Janpath Radial',
    lat: 28.6315,
    lon: 77.2167,
    defaultLanes: 3,
    defaultSpeedKmh: 50,
  },
  {
    id: 'london',
    name: 'London',
    country: 'United Kingdom',
    focusIntersection: 'Oxford Circus & Regent St',
    lat: 51.5152,
    lon: -0.1419,
    defaultLanes: 2,
    defaultSpeedKmh: 40,
  },
  {
    id: 'tokyo',
    name: 'Tokyo',
    country: 'Japan',
    focusIntersection: 'Shibuya Scramble Crossing',
    lat: 35.6595,
    lon: 139.7004,
    defaultLanes: 3,
    defaultSpeedKmh: 45,
  },
  {
    id: 'newyork',
    name: 'New York',
    country: 'United States',
    focusIntersection: '42nd St & 6th Ave Midtown Grid',
    lat: 40.7549,
    lon: -73.9840,
    defaultLanes: 3,
    defaultSpeedKmh: 40,
  },
  {
    id: 'sanfrancisco',
    name: 'San Francisco',
    country: 'United States',
    focusIntersection: 'Market St & Van Ness Ave',
    lat: 37.7751,
    lon: -122.4193,
    defaultLanes: 2,
    defaultSpeedKmh: 45,
  },
  {
    id: 'singapore',
    name: 'Singapore',
    country: 'Singapore',
    focusIntersection: 'Orchard Rd & Scotts Rd',
    lat: 1.3048,
    lon: 103.8318,
    defaultLanes: 3,
    defaultSpeedKmh: 50,
  },
];

export interface OsmJunction {
  id: string;
  name: string;
  lat: number;
  lon: number;
  lanes: number;
  phases: string[];
  approaches: {
    N: [number, number][];
    S: [number, number][];
    E: [number, number][];
    W: [number, number][];
  };
}

export interface OsmRoad {
  id: string;
  name: string;
  highway: string;
  lanes: number;
  maxspeed: number;
  coords: [number, number][];
}

export interface CityNetworkPayload {
  cityKey: string;
  displayName: string;
  country: string;
  lat: number;
  lon: number;
  sourceStatus: 'OSM Overpass Live' | 'OSM Cached' | 'Coordinate Grid Fallback';
  attribution: string;
  junctions: OsmJunction[];
  roads: OsmRoad[];
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

function buildApproachVectors(lat: number, lon: number): OsmJunction['approaches'] {
  // ~180m span in degrees around the junction
  const dLat = 0.0016;
  const dLon = 0.0018;
  return {
    N: [
      [lat + dLat, lon],
      [lat, lon],
    ],
    S: [
      [lat - dLat, lon],
      [lat, lon],
    ],
    E: [
      [lat, lon + dLon],
      [lat, lon],
    ],
    W: [
      [lat, lon - dLon],
      [lat, lon],
    ],
  };
}

function matchApproachSegments(
  jLat: number,
  jLon: number,
  roads: OsmRoad[]
): OsmJunction['approaches'] {
  const fallback = buildApproachVectors(jLat, jLon);
  const candidates: Record<'N' | 'S' | 'E' | 'W', [number, number][] | null> = {
    N: null,
    S: null,
    E: null,
    W: null,
  };

  for (const r of roads) {
    if (r.coords.length < 2) continue;
    for (let i = 0; i < r.coords.length; i++) {
      const [pLat, pLon] = r.coords[i];
      const dist = Math.hypot(pLat - jLat, pLon - jLon);
      if (dist < 0.00045) {
        // Check neighboring point to infer approach direction toward the junction
        const neighbor = r.coords[i + 1] || r.coords[i - 1];
        if (!neighbor) continue;
        const dLat = neighbor[0] - pLat;
        const dLon = neighbor[1] - pLon;
        const norm = Math.hypot(dLat, dLon);
        if (norm < 1e-6) continue;
        const scale = 0.0016 / norm;
        const outer: [number, number] = [pLat + dLat * scale, pLon + dLon * scale];
        if (Math.abs(dLat) >= Math.abs(dLon)) {
          if (dLat > 0 && !candidates.N) candidates.N = [outer, [jLat, jLon]];
          if (dLat < 0 && !candidates.S) candidates.S = [outer, [jLat, jLon]];
        } else {
          if (dLon > 0 && !candidates.E) candidates.E = [outer, [jLat, jLon]];
          if (dLon < 0 && !candidates.W) candidates.W = [outer, [jLat, jLon]];
        }
      }
    }
  }

  return {
    N: candidates.N || fallback.N,
    S: candidates.S || fallback.S,
    E: candidates.E || fallback.E,
    W: candidates.W || fallback.W,
  };
}

export async function fetchLiveWeather(lat: number, lon: number) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&current=temperature_2m,precipitation,wind_speed_10m,weather_code`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(4500) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = (await resp.json()) as any;
    const cur = data.current || {};
    const precip = Number(cur.precipitation ?? 0);
    const code = Number(cur.weather_code ?? 0);
    let condition = 'Clear / Dry';
    let factor = 1.0;
    if (precip > 2.5 || code >= 63) {
      condition = 'Heavy Rain';
      factor = 0.72;
    } else if (precip > 0.2 || (code >= 51 && code <= 62)) {
      condition = 'Light Rain / Wet Road';
      factor = 0.85;
    } else if (code >= 1 && code <= 3) {
      condition = 'Partly Cloudy';
      factor = 1.0;
    }
    return {
      temperature_c: Number(cur.temperature_2m ?? 24),
      precipitation_mm: precip,
      wind_kmh: Number(cur.wind_speed_10m ?? 8),
      condition,
      weather_factor: factor,
      source: 'Open-Meteo Live API',
    };
  } catch {
    return null;
  }
}

export function classifyAqi(usAqi: number): string {
  if (usAqi <= 50) return 'Good';
  if (usAqi <= 100) return 'Moderate';
  if (usAqi <= 150) return 'Sensitive Groups';
  if (usAqi <= 200) return 'Unhealthy';
  return 'Very Unhealthy';
}

export async function fetchLiveAQI(lat: number, lon: number) {
  try {
    const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&current=us_aqi,european_aqi,pm2_5,pm10,nitrogen_dioxide,carbon_monoxide`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(4500) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = (await resp.json()) as any;
    const cur = data.current || {};
    const usAqi = Number(cur.us_aqi ?? 65);
    return {
      us_aqi: Math.round(usAqi),
      european_aqi: Math.round(Number(cur.european_aqi ?? 45)),
      pm2_5: Number((cur.pm2_5 ?? 18.5).toFixed(1)),
      pm10: Number((cur.pm10 ?? 32.0).toFixed(1)),
      no2: Number((cur.nitrogen_dioxide ?? 22.0).toFixed(1)),
      co: Number((cur.carbon_monoxide ?? 260.0).toFixed(0)),
      category: classifyAqi(usAqi),
      source: 'Open-Meteo Air Quality API',
    };
  } catch {
    return null;
  }
}

export async function searchCityNominatim(query: string) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=6&q=${encodeURIComponent(query)}`;
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'NEXUS-Traffic-AI-Research-Platform/1.0',
        'Accept-Language': 'en',
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return [];
    const results = (await resp.json()) as any[];
    return results.map((r) => ({
      place_id: String(r.place_id),
      display_name: String(r.display_name),
      lat: parseFloat(r.lat),
      lon: parseFloat(r.lon),
      type: String(r.type || 'city'),
    }));
  } catch {
    return [];
  }
}

export async function getCityNetwork(
  cityKey: string,
  overrideLat?: number,
  overrideLon?: number,
  overrideName?: string,
  forceRefresh = false
): Promise<CityNetworkPayload> {
  const preset = TOP_CITIES.find((c) => c.id === cityKey.toLowerCase());
  const lat = overrideLat ?? preset?.lat ?? 12.9756;
  const lon = overrideLon ?? preset?.lon ?? 77.6066;
  const displayName = overrideName ?? preset?.name ?? cityKey;
  const country = preset?.country ?? 'OpenStreetMap Region';
  const cacheKey = `${cityKey.toLowerCase()}_${lat.toFixed(3)}_${lon.toFixed(3)}`;

  // Check cache first (valid for 24h)
  if (!forceRefresh) {
    const cached = db.prepare('SELECT * FROM osm_city_cache WHERE city_key = ?').get(cacheKey) as any;
    if (cached) {
      const [weather, aqi] = await Promise.all([fetchLiveWeather(lat, lon), fetchLiveAQI(lat, lon)]);
      return {
        cityKey: cacheKey,
        displayName: cached.display_name,
        country: cached.country,
        lat: cached.lat,
        lon: cached.lon,
        sourceStatus: 'OSM Cached',
        attribution: '© OpenStreetMap contributors · Overpass API',
        junctions: JSON.parse(cached.junctions_json),
        roads: JSON.parse(cached.roads_json),
        weather: weather || (cached.weather_json ? JSON.parse(cached.weather_json) : null),
        aqi,
      };
    }
  }

  // Query Overpass API for real traffic signal nodes & road geometry within 900m
  const overpassQuery = `
    [out:json][timeout:8];
    (
      node["highway"="traffic_signals"](around:850,${lat},${lon});
      way["highway"~"^(primary|secondary|tertiary|trunk)$"](around:850,${lat},${lon});
    );
    out body;
    >;
    out skel qt;
  `;

  let roads: OsmRoad[] = [];
  let junctions: OsmJunction[] = [];
  let sourceStatus: CityNetworkPayload['sourceStatus'] = 'Coordinate Grid Fallback';

  try {
    const resp = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'NEXUS-Traffic-AI-Research-Platform/1.0',
      },
      body: `data=${encodeURIComponent(overpassQuery)}`,
      signal: AbortSignal.timeout(8500),
    });

    if (resp.ok) {
      const osmData = (await resp.json()) as { elements: any[] };
      const nodesById = new Map<number, [number, number]>();
      const signalNodes: any[] = [];
      const ways: any[] = [];

      for (const el of osmData.elements || []) {
        if (el.type === 'node') {
          nodesById.set(el.id, [el.lat, el.lon]);
          if (el.tags && el.tags.highway === 'traffic_signals') {
            signalNodes.push(el);
          }
        } else if (el.type === 'way' && Array.isArray(el.nodes)) {
          ways.push(el);
        }
      }

      roads = ways
        .slice(0, 65)
        .map((w) => {
          const coords = (w.nodes as number[])
            .map((nid) => nodesById.get(nid))
            .filter((c): c is [number, number] => Boolean(c));
          const maxspeedRaw = parseInt(String(w.tags?.maxspeed || '50'), 10);
          const lanesRaw = parseInt(String(w.tags?.lanes || '2'), 10);
          return {
            id: `way_${w.id}`,
            name: w.tags?.name || w.tags?.ref || `${w.tags?.highway || 'urban'} road`,
            highway: w.tags?.highway || 'secondary',
            lanes: Number.isFinite(lanesRaw) ? Math.max(1, Math.min(4, lanesRaw)) : 2,
            maxspeed: Number.isFinite(maxspeedRaw) ? maxspeedRaw : 50,
            coords,
          };
        })
        .filter((r) => r.coords.length >= 2);

      // Pick up to 4 real signalized junctions near center
      signalNodes.sort(
        (a, b) => Math.hypot(a.lat - lat, a.lon - lon) - Math.hypot(b.lat - lat, b.lon - lon)
      );

      junctions = signalNodes.slice(0, 4).map((sn, idx) => ({
        id: `J${idx + 1}`,
        name: sn.tags?.name || `${displayName} Signal #${sn.id.toString().slice(-4)}`,
        lat: sn.lat,
        lon: sn.lon,
        lanes: preset?.defaultLanes ?? 2,
        phases: ['NS_THROUGH', 'NS_LEFT', 'EW_THROUGH', 'EW_LEFT', 'PEDESTRIAN_ALL_WALK'],
        approaches: matchApproachSegments(sn.lat, sn.lon, roads),
      }));

      if (roads.length > 0 || junctions.length > 0) {
        sourceStatus = 'OSM Overpass Live';
      }
    }
  } catch {
    // Graceful fallback below
  }

  // Ensure at least 1 primary junction exists centered on the city coordinates
  if (junctions.length === 0) {
    junctions = [
      {
        id: 'J1',
        name: preset?.focusIntersection || `${displayName} Primary Junction`,
        lat,
        lon,
        lanes: preset?.defaultLanes ?? 2,
        phases: ['NS_THROUGH', 'NS_LEFT', 'EW_THROUGH', 'EW_LEFT', 'PEDESTRIAN_ALL_WALK'],
        approaches: matchApproachSegments(lat, lon, roads),
      },
      {
        id: 'J2',
        name: `${displayName} East Corridor`,
        lat,
        lon: lon + 0.0032,
        lanes: preset?.defaultLanes ?? 2,
        phases: ['NS_THROUGH', 'NS_LEFT', 'EW_THROUGH', 'EW_LEFT', 'PEDESTRIAN_ALL_WALK'],
        approaches: buildApproachVectors(lat, lon + 0.0032),
      },
    ];
  }

  if (roads.length === 0) {
    const j0 = junctions[0];
    roads = [
      {
        id: 'fallback_ns',
        name: `${displayName} North-South Arterial`,
        highway: 'primary',
        lanes: 2,
        maxspeed: 50,
        coords: [
          [j0.lat + 0.0025, j0.lon],
          [j0.lat - 0.0025, j0.lon],
        ],
      },
      {
        id: 'fallback_ew',
        name: `${displayName} East-West Corridor`,
        highway: 'primary',
        lanes: 2,
        maxspeed: 50,
        coords: [
          [j0.lat, j0.lon - 0.0035],
          [j0.lat, j0.lon + 0.0045],
        ],
      },
    ];
  }

  const [weather, aqi] = await Promise.all([fetchLiveWeather(lat, lon), fetchLiveAQI(lat, lon)]);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO osm_city_cache (
      city_key, display_name, country, lat, lon, source_status,
      junctions_json, roads_json, weather_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(city_key) DO UPDATE SET
      display_name = excluded.display_name,
      source_status = excluded.source_status,
      junctions_json = excluded.junctions_json,
      roads_json = excluded.roads_json,
      weather_json = excluded.weather_json,
      updated_at = excluded.updated_at
  `).run(
    cacheKey,
    displayName,
    country,
    lat,
    lon,
    sourceStatus,
    JSON.stringify(junctions),
    JSON.stringify(roads),
    weather ? JSON.stringify(weather) : null,
    now
  );

  return {
    cityKey: cacheKey,
    displayName,
    country,
    lat,
    lon,
    sourceStatus,
    attribution: '© OpenStreetMap contributors · Overpass API',
    junctions,
    roads,
    weather,
    aqi,
  };
}
