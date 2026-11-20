import React, { useState } from 'react';
import { Search, RefreshCw, Play, CloudRain, Sun, Wind } from 'lucide-react';
import { useNexus } from '../context/NexusContext';
import { CityMapCanvas } from '../components/CityMapCanvas';

export function CityMapPage() {
  const {
    theme,
    topCities,
    cityNetwork,
    cityLoading,
    simState,
    snapshot,
    selectCity,
    startSim,
  } = useNexus();

  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedJunction, setSelectedJunction] = useState('J1');

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim().length < 2) return;
    setSearching(true);
    try {
      const r = await fetch(`/api/geo/search?q=${encodeURIComponent(query.trim())}`);
      if (r.ok) setSearchResults(await r.json());
    } finally {
      setSearching(false);
    }
  };

  const handlePickResult = async (item: any) => {
    setSearchResults([]);
    const shortName = item.display_name.split(',')[0];
    await selectCity(shortName.toLowerCase().replace(/\s+/g, '_'), {
      lat: item.lat,
      lon: item.lon,
      name: shortName,
    });
  };

  const selectedOsmJunction =
    cityNetwork?.junctions?.find((j) => j.id === selectedJunction) || cityNetwork?.junctions?.[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            OpenStreetMap City Network & Live Vehicle Overlay
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Select a top city or search any global city via Nominatim & Overpass API. Vehicles shown on roads come from the live simulation engine.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {simState.status !== 'running' && (
            <button
              type="button"
              onClick={() => startSim({ scenarioId: simState.scenarioId })}
              className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5" /> Run Simulation on City Map
            </button>
          )}
          <button
            type="button"
            disabled={cityLoading}
            onClick={() =>
              cityNetwork &&
              selectCity(
                simState.cityKey,
                { lat: cityNetwork.lat, lon: cityNetwork.lon, name: cityNetwork.displayName },
                true
              )
            }
            className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${cityLoading ? 'animate-spin' : ''}`} /> Refresh Overpass
          </button>
        </div>
      </div>

      {/* Top Cities Quick Selector + Global Nominatim Search */}
      <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {topCities.map((c: any) => (
              <button
                key={c.id}
                type="button"
                onClick={() => selectCity(c.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  simState.cityKey === c.id
                    ? 'bg-cyan-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>

          <form onSubmit={handleSearch} className="relative flex items-center gap-2">
            <input
              type="text"
              placeholder="Search any city (e.g. Pune, Paris)..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-9 w-64 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs"
            />
            <button
              type="submit"
              disabled={searching}
              className="h-9 px-3 rounded-lg bg-slate-900 dark:bg-slate-700 text-white text-xs font-medium flex items-center gap-1"
            >
              <Search className="w-3.5 h-3.5" /> Search
            </button>

            {searchResults.length > 0 && (
              <div className="absolute top-10 left-0 right-0 z-[500] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg divide-y divide-slate-100 dark:divide-slate-800">
                {searchResults.map((item) => (
                  <button
                    key={item.place_id}
                    type="button"
                    onClick={() => handlePickResult(item)}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-slate-100 dark:hover:bg-slate-800 truncate"
                  >
                    {item.display_name}
                  </button>
                ))}
              </div>
            )}
          </form>
        </div>
      </div>

      {/* Main Map + Geospatial Inspector */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <div className="xl:col-span-8">
          <CityMapCanvas
            cityNetwork={cityNetwork}
            snapshot={snapshot}
            selectedJunctionId={selectedJunction}
            onSelectJunction={setSelectedJunction}
            height={500}
            theme={theme}
          />
        </div>

        <div className="xl:col-span-4 space-y-4">
          {/* Open-Meteo Weather Card */}
          <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold">Live City Weather (Open-Meteo)</h2>
              {cityNetwork?.weather && cityNetwork.weather.precipitation_mm > 0 ? (
                <CloudRain className="w-4 h-4 text-cyan-500" />
              ) : (
                <Sun className="w-4 h-4 text-amber-500" />
              )}
            </div>
            {cityNetwork?.weather ? (
              <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-1">
                <div>
                  <span className="text-slate-400 block">Condition</span>
                  <span className="font-semibold">{cityNetwork.weather.condition}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Temp / Precip</span>
                  <span className="font-semibold tabular-nums">
                    {cityNetwork.weather.temperature_c}°C · {cityNetwork.weather.precipitation_mm} mm
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Wind Speed</span>
                  <span className="font-semibold tabular-nums">{cityNetwork.weather.wind_kmh} km/h</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Sim Friction Factor</span>
                  <span className="font-semibold tabular-nums text-cyan-600 dark:text-cyan-400">
                    {(cityNetwork.weather.weather_factor * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-500">Weather data unavailable right now.</div>
            )}
          </div>

          {/* Open-Meteo Air Quality Card */}
          <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold">Live Air Quality (Open-Meteo AQI)</h2>
              <Wind className="w-4 h-4 text-cyan-500" />
            </div>
            {cityNetwork?.aqi ? (
              <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-1">
                <div>
                  <span className="text-slate-400 block">US AQI · Category</span>
                  <span className="font-semibold tabular-nums">
                    {cityNetwork.aqi.us_aqi} · {cityNetwork.aqi.category}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">PM2.5 / PM10</span>
                  <span className="font-semibold tabular-nums">
                    {cityNetwork.aqi.pm2_5} / {cityNetwork.aqi.pm10} µg/m³
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">NO2 / CO</span>
                  <span className="font-semibold tabular-nums">
                    {cityNetwork.aqi.no2} / {cityNetwork.aqi.co} µg/m³
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Local Sim AQI</span>
                  <span className="font-semibold tabular-nums text-cyan-600 dark:text-cyan-400">
                    {snapshot?.aqi_telemetry?.local_junction_aqi?.toFixed(0) ?? cityNetwork.aqi.us_aqi} US AQI
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-500">AQI telemetry unavailable right now.</div>
            )}
          </div>

          {/* Selected OSM Junction Inspector */}
          <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-3">
            <h2 className="font-display text-sm font-semibold">
              Detected Signalized Junctions ({cityNetwork?.junctions?.length || 0})
            </h2>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {(cityNetwork?.junctions || []).map((j) => (
                <button
                  key={j.id}
                  type="button"
                  onClick={() => setSelectedJunction(j.id)}
                  className={`w-full text-left px-3 py-2 rounded border text-xs transition-colors ${
                    selectedJunction === j.id
                      ? 'border-cyan-500 bg-cyan-500/10'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="font-semibold">{j.id}: {j.name}</div>
                  <div className="font-mono text-[11px] text-slate-400 tabular-nums">
                    {j.lat.toFixed(5)}, {j.lon.toFixed(5)} · {j.lanes} lanes
                  </div>
                </button>
              ))}
            </div>

            {selectedOsmJunction && (
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 text-xs space-y-1.5">
                <div className="text-slate-500 dark:text-slate-400">Supported Signal Phases</div>
                <div className="font-mono text-[11px] leading-relaxed text-slate-700 dark:text-slate-300">
                  {selectedOsmJunction.phases.join(' · ')}
                </div>
                <div className="text-[11px] text-slate-400 pt-1">
                  Road geometry fetched from OpenStreetMap Overpass API ({cityNetwork?.roads.length || 0} arterial ways).
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
