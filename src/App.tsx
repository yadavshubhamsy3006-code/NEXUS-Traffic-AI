import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NexusProvider } from './context/NexusContext';
import { WorkspaceLayout } from './components/WorkspaceLayout';
import { LandingPage } from './pages/LandingPage';
import { OverviewPage } from './pages/OverviewPage';
import { LiveTrafficPage } from './pages/LiveTrafficPage';
import { AIControllerPage } from './pages/AIControllerPage';
import { SimulationLabPage } from './pages/SimulationLabPage';
import { CityMapPage } from './pages/CityMapPage';
import { TrafficAnalyticsPage } from './pages/TrafficAnalyticsPage';
import { EmergencyIncidentsPage } from './pages/EmergencyIncidentsPage';
import { EnvironmentalImpactPage } from './pages/EnvironmentalImpactPage';
import { ResearchExperimentsPage } from './pages/ResearchExperimentsPage';
import { DataExplorerPage } from './pages/DataExplorerPage';
import { AlertsReportsPage } from './pages/AlertsReportsPage';
import { SettingsIntegrationsPage } from './pages/SettingsIntegrationsPage';

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <NexusProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/app" element={<WorkspaceLayout />}>
              <Route index element={<Navigate to="/app/overview" replace />} />
              <Route path="overview" element={<OverviewPage />} />
              <Route path="live" element={<LiveTrafficPage />} />
              <Route path="ai-controller" element={<AIControllerPage />} />
              <Route path="sim-lab" element={<SimulationLabPage />} />
              <Route path="city-map" element={<CityMapPage />} />
              <Route path="analytics" element={<TrafficAnalyticsPage />} />
              <Route path="emergency" element={<EmergencyIncidentsPage />} />
              <Route path="environmental" element={<EnvironmentalImpactPage />} />
              <Route path="research" element={<ResearchExperimentsPage />} />
              <Route path="data" element={<DataExplorerPage />} />
              <Route path="alerts" element={<AlertsReportsPage />} />
              <Route path="settings" element={<SettingsIntegrationsPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </NexusProvider>
    </QueryClientProvider>
  );
}
