import React, { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Radio,
  BrainCircuit,
  FlaskConical,
  Map as MapIcon,
  BarChart3,
  ShieldAlert,
  Leaf,
  Microscope,
  Database,
  Bell,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  Moon,
  Menu,
  X,
  HelpCircle,
  MapPin,
} from 'lucide-react';
import { NexusLogo } from './NexusLogo';
import { useNexus } from '../context/NexusContext';

const NAV_ITEMS = [
  { to: '/app/overview', label: 'Overview', icon: LayoutDashboard },
  { to: '/app/live', label: 'Live Traffic', icon: Radio },
  { to: '/app/ai-controller', label: 'AI Controller', icon: BrainCircuit },
  { to: '/app/sim-lab', label: 'Simulation Lab', icon: FlaskConical },
  { to: '/app/city-map', label: 'City Map', icon: MapIcon },
  { to: '/app/analytics', label: 'Traffic Analytics', icon: BarChart3 },
  { to: '/app/emergency', label: 'Emergency & Incidents', icon: ShieldAlert },
  { to: '/app/environmental', label: 'Environmental Impact', icon: Leaf },
  { to: '/app/research', label: 'Research & Experiments', icon: Microscope },
  { to: '/app/data', label: 'Data Explorer', icon: Database },
  { to: '/app/alerts', label: 'Alerts & Reports', icon: Bell },
  { to: '/app/settings', label: 'Settings & Integrations', icon: Settings },
];

export function WorkspaceLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showDocsModal, setShowDocsModal] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const {
    theme,
    toggleTheme,
    wsConnected,
    simState,
    snapshot,
    topCities,
    cityNetwork,
    cityLoading,
    selectCity,
    health,
  } = useNexus();

  const currentNav = NAV_ITEMS.find((n) => location.pathname.startsWith(n.to)) || NAV_ITEMS[0];

  const handleTopCityChange = async (cityId: string) => {
    await selectCity(cityId);
  };

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900 dark:bg-[#0B1120] dark:text-slate-100">
      {/* Desktop Collapsible Left Sidebar */}
      <aside
        className={`hidden lg:flex flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] shrink-0 transition-all duration-200 ${
          collapsed ? 'w-[68px]' : 'w-[248px]'
        }`}
      >
        <div className="h-14 px-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex items-center gap-2.5 overflow-hidden whitespace-nowrap"
          >
            <NexusLogo className="w-6 h-6 shrink-0" />
            {!collapsed && (
              <span className="font-display font-bold text-sm tracking-tight text-slate-900 dark:text-white">
                NEXUS Traffic AI
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
          >
            {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </NavLink>
            );
          })}
        </nav>

        {!collapsed && (
          <div className="p-3 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 space-y-1">
            <div className="font-medium text-slate-700 dark:text-slate-300">
              {health?.sumo?.sumo_installed ? 'SUMO + TraCI Ready' : 'Local Python 3.11 Engine'}
            </div>
            <div>
              DB: {health?.database?.supabaseConfigured ? 'SQLite + Supabase' : 'SQLite Local (WAL)'}
            </div>
            <div className="text-[10px] leading-snug pt-1 text-slate-400">
              Research & simulation only. Not for live public-road signal hardware.
            </div>
          </div>
        )}
      </aside>

      {/* Mobile Drawer Sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-64 max-w-[80vw] bg-white dark:bg-[#111827] border-r border-slate-200 dark:border-slate-800 flex flex-col z-10">
            <div className="h-14 px-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <NexusLogo className="w-6 h-6" />
                <span className="font-display font-bold text-sm">NEXUS Traffic AI</span>
              </div>
              <button type="button" onClick={() => setMobileOpen(false)} className="p-1.5 rounded">
                <X className="w-4 h-4" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${
                        isActive
                          ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400'
                          : 'text-slate-600 dark:text-slate-400'
                      }`
                    }
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Command Header */}
        <header className="h-14 px-4 sm:px-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-1.5 rounded border border-slate-200 dark:border-slate-700"
              aria-label="Open navigation"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 text-sm truncate">
              <span className="text-slate-400 hidden sm:inline">Workspace</span>
              <span className="text-slate-400 hidden sm:inline">/</span>
              <span className="font-display font-semibold text-slate-900 dark:text-white truncate">
                {currentNav.label}
              </span>
            </div>
          </div>

          {/* Right Operational Telemetry & Controls */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Top City Selector (Live OSM Map + Vehicle Overlay) */}
            <div className="hidden md:flex items-center gap-1.5 text-xs">
              <MapPin className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
              <select
                aria-label="Select top city for real-time OpenStreetMap simulation"
                value={simState.cityKey}
                onChange={(e) => handleTopCityChange(e.target.value)}
                disabled={cityLoading}
                className="h-8 px-2.5 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-xs font-medium"
              >
                {(topCities.length
                  ? topCities
                  : [{ id: 'bengaluru', name: 'Bengaluru', country: 'India' }]
                ).map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name}, {c.country}
                  </option>
                ))}
              </select>
            </div>

            {/* Real Stream Clock & Simulation Status */}
            <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-slate-600 dark:text-slate-300 border-l border-slate-200 dark:border-slate-800 pl-3">
              {simState.status === 'running' && wsConnected && (
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="Live WebSocket stream active" />
              )}
              <span className="uppercase">{simState.status}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">t={snapshot ? `${snapshot.sim_time.toFixed(0)}s` : '0s'}</span>
            </div>

            <button
              type="button"
              onClick={() => navigate('/app/alerts')}
              title="Alerts & Reports"
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Bell className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              title="Toggle Dark / Light Theme"
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => setShowDocsModal(true)}
              title="Methodology & Documentation"
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Sub-bar showing active city weather & data source transparently */}
        <div className="px-4 sm:px-6 py-2 border-b border-slate-200 dark:border-slate-800/70 bg-slate-100/70 dark:bg-[#0D1526] flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
          <div className="flex flex-wrap items-center gap-2 font-mono">
            <span>
              City: <strong className="text-slate-900 dark:text-slate-200">{cityNetwork?.displayName || simState.cityName}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>Map: {cityLoading ? 'Fetching Overpass API...' : cityNetwork?.sourceStatus || 'OSM Ready'}</span>
            {cityNetwork?.weather && (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  Weather: {cityNetwork.weather.condition} ({cityNetwork.weather.temperature_c}°C, friction{' '}
                  {(cityNetwork.weather.weather_factor * 100).toFixed(0)}%)
                </span>
              </>
            )}
            {(snapshot?.aqi_telemetry || cityNetwork?.aqi) && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-emerald-600 dark:text-emerald-400">
                  AQI: {snapshot?.aqi_telemetry?.local_junction_aqi ?? cityNetwork?.aqi?.us_aqi} (
                  {snapshot?.aqi_telemetry?.category ?? cityNetwork?.aqi?.category})
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 font-mono">
            <span>Controller: {simState.controllerType.toUpperCase()}</span>
            <span aria-hidden="true">·</span>
            <span>Engine: {simState.simMode === 'sumo_traci' ? 'SUMO TraCI' : 'Python 3.11 Microscopic'}</span>
          </div>
        </div>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 max-w-[1440px] w-full mx-auto">
          <Outlet />
        </main>
      </div>

      {/* Help & Methodology Modal */}
      {showDocsModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="max-w-lg w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold">NEXUS Documentation & Safety Notice</h3>
              <button type="button" onClick={() => setShowDocsModal(false)} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="text-sm text-slate-600 dark:text-slate-300 space-y-2.5 leading-relaxed">
              <p>
                <strong>Simulation Modes:</strong> All live vehicles, queues, and signal states are computed step-by-step in Python 3.11 (<code className="text-xs">engine/nexus_rl.py</code>), or via Eclipse SUMO + TraCI when installed locally.
              </p>
              <p>
                <strong>Geospatial Data:</strong> Top-city maps fetch live road networks and signal nodes from OpenStreetMap Overpass API and weather conditions from Open-Meteo. Vehicle movements on the map are simulated flows mapped onto real OSM approach vectors—not live street camera feeds.
              </p>
              <p>
                <strong>Safety Disclaimer:</strong> Every RL action passes through the deterministic Safety Guard layer. This software is strictly for research and education and must never be connected to public traffic-signal hardware.
              </p>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowDocsModal(false)}
                className="px-4 py-2 rounded-lg bg-cyan-600 text-white text-sm font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
