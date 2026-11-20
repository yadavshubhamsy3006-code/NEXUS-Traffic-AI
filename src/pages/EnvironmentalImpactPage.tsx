import React from 'react';
import { Wind, Fuel } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { useNexus } from '../context/NexusContext';

export function EnvironmentalImpactPage() {
  const { telemetry, snapshot, cityNetwork, setEcoIdle } = useNexus();

  const co2Kg = snapshot ? snapshot.co2_emissions_g / 1000 : 0;
  const estFuelMl = snapshot?.aqi_telemetry?.fuel_burned_ml ?? (co2Kg / 2.31) * 1000;
  const fuelSavedMl = snapshot?.aqi_telemetry?.fuel_saved_ml ?? 0;
  const co2SavedG = snapshot?.aqi_telemetry?.co2_saved_g ?? 0;
  const ecoOn = snapshot?.aqi_telemetry?.eco_idle_stop ?? true;
  const localAqi = snapshot?.aqi_telemetry?.local_junction_aqi ?? cityNetwork?.aqi?.us_aqi ?? 68;
  const aqiCat = snapshot?.aqi_telemetry?.category ?? cityNetwork?.aqi?.category ?? 'Moderate';
  const departures = snapshot?.total_departures ?? 0;
  const co2PerTripG = departures > 0 && snapshot ? snapshot.co2_emissions_g / departures : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            Environmental Impact, AQI Detection &amp; Fuel Conservation
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Live Open-Meteo city air quality combined with simulated junction micro-AQI, idling emissions, and last-priority engine-off fuel savings.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setEcoIdle(!ecoOn)}
          className={`px-3.5 py-2 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
            ecoOn
              ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'
          }`}
        >
          <Fuel className="w-3.5 h-3.5" />
          Last-Priority Eco Engine-Off: {ecoOn ? 'ENABLED' : 'DISABLED'}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827]">
          <div className="text-xs text-slate-500 dark:text-slate-400">Local Junction Micro-AQI</div>
          <div className="font-mono text-2xl font-semibold tabular-nums mt-1">
            {localAqi.toFixed(0)} <span className="text-xs font-normal text-slate-400">US AQI</span>
          </div>
          <div className="text-[11px] font-mono text-slate-400 mt-1">
            {aqiCat} · City Base {Math.round(cityNetwork?.aqi?.us_aqi ?? 68)}
          </div>
        </div>

        <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827]">
          <div className="text-xs text-slate-500 dark:text-slate-400">Fuel Saved (Stop Bikes &amp; Engines)</div>
          <div className="font-mono text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400 mt-1">
            {fuelSavedMl.toFixed(1)} mL
          </div>
          <div className="text-[11px] font-mono text-slate-400 mt-1">
            {co2SavedG.toFixed(0)} g CO2 avoided · Burned {estFuelMl.toFixed(1)} mL
          </div>
        </div>

        <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827]">
          <div className="text-xs text-slate-500 dark:text-slate-400">Cumulative CO2 Emissions</div>
          <div className="font-mono text-2xl font-semibold tabular-nums mt-1">{co2Kg.toFixed(2)} kg</div>
          <div className="text-[11px] font-mono text-slate-400 mt-1">
            {co2PerTripG.toFixed(1)} g/trip · {departures} completed
          </div>
        </div>

        <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827]">
          <div className="text-xs text-slate-500 dark:text-slate-400">City Weather Friction</div>
          <div className="font-mono text-2xl font-semibold tabular-nums mt-1">
            {cityNetwork?.weather ? `${(cityNetwork.weather.weather_factor * 100).toFixed(0)}%` : '100%'}
          </div>
          <div className="text-[11px] font-mono text-slate-400 mt-1">
            {cityNetwork?.weather?.condition || 'Open-Meteo Live'}
          </div>
        </div>
      </div>

      {/* Live City AQI Sensor Readout */}
      <div className="p-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-sm font-semibold flex items-center gap-2">
            <Wind className="w-4 h-4 text-cyan-500" />
            Live City Air Quality Telemetry · {cityNetwork?.displayName || 'Selected City'}
          </h2>
          <span className="font-mono text-[11px] text-slate-400">
            {cityNetwork?.aqi?.source || 'Open-Meteo Air Quality'}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs font-mono">
          <div className="p-3 rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="text-slate-400">US AQI</div>
            <div className="font-semibold tabular-nums mt-1">{cityNetwork?.aqi?.us_aqi ?? 68}</div>
          </div>
          <div className="p-3 rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="text-slate-400">Category</div>
            <div className="font-semibold mt-1">{cityNetwork?.aqi?.category ?? 'Moderate'}</div>
          </div>
          <div className="p-3 rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="text-slate-400">PM2.5</div>
            <div className="font-semibold tabular-nums mt-1">
              {(snapshot?.aqi_telemetry?.pm2_5_ugm3 ?? cityNetwork?.aqi?.pm2_5 ?? 18).toFixed(1)} µg/m³
            </div>
          </div>
          <div className="p-3 rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="text-slate-400">PM10</div>
            <div className="font-semibold tabular-nums mt-1">{(cityNetwork?.aqi?.pm10 ?? 34).toFixed(1)} µg/m³</div>
          </div>
          <div className="p-3 rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="text-slate-400">NO2</div>
            <div className="font-semibold tabular-nums mt-1">{(cityNetwork?.aqi?.no2 ?? 28).toFixed(1)} µg/m³</div>
          </div>
          <div className="p-3 rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="text-slate-400">CO</div>
            <div className="font-semibold tabular-nums mt-1">{(cityNetwork?.aqi?.co ?? 420).toFixed(0)} µg/m³</div>
          </div>
        </div>
      </div>

      <div className="p-5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold">Cumulative CO2 Trajectory Over Simulation Time</h2>
          <span className="font-mono text-[11px] text-slate-400">grams CO2 · Estimated</span>
        </div>
        <div className="h-[280px]">
          {telemetry.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-slate-500">
              Start a simulation to inspect cumulative CO2 estimates.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={telemetry}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                <XAxis dataKey="sim_time" tick={{ fontSize: 11 }} unit="s" />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Area type="monotone" dataKey="co2_emissions_g" name="CO2 (g)" stroke="#10B981" fill="#10B981" fillOpacity={0.2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
