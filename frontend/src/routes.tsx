import { createBrowserRouter } from 'react-router-dom';
import { RequireAuth } from './components/RequireAuth';
import { RequireAdmin } from './components/RequireAdmin';
import { LandingPage } from './pages/LandingPage';
import { QuestionnairePage } from './pages/QuestionnairePage';
import { ResultsPage } from './pages/ResultsPage';
import { DashboardPage } from './pages/DashboardPage';
import { RecommendationsPage } from './pages/RecommendationsPage';
import { SimulationPage } from './pages/SimulationPage';
import { HistoriquePage } from './pages/HistoriquePage';
import { EvolutionPage } from './pages/EvolutionPage';
import { ProfilePage } from './pages/ProfilePage';
import { AdminLayout } from './pages/admin/AdminLayout';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { UserManagement } from './pages/admin/AdminUsers';
import { BankManagement } from './pages/admin/AdminBanks';
import { DimensionsManagement } from './pages/admin/AdminDimensions';
import { ScoringReferential } from './pages/admin/AdminScoring';
import { QuestionnaireVersions } from './pages/admin/AdminVersions';
import { AuditLogs } from './pages/admin/AdminLogs';
import { Settings } from './pages/admin/AdminSettings';

export const router = createBrowserRouter([
  // Public — accessible sans authentification
  { path: '/', Component: LandingPage },

  // Protégées — redirigent vers Keycloak si non connecté
  { path: '/questionnaire', element: <RequireAuth><QuestionnairePage /></RequireAuth> },
  { path: '/results', element: <RequireAuth><ResultsPage /></RequireAuth> },
  { path: '/dashboard', element: <RequireAuth><DashboardPage /></RequireAuth> },
  { path: '/recommendations', element: <RequireAuth><RecommendationsPage /></RequireAuth> },
  { path: '/simulation', element: <RequireAuth><SimulationPage /></RequireAuth> },
  { path: '/historique', element: <RequireAuth><HistoriquePage /></RequireAuth> },
  { path: '/evolution', element: <RequireAuth><EvolutionPage /></RequireAuth> },
  { path: '/profile', element: <RequireAuth><ProfilePage /></RequireAuth> },

  // Admin back-office — requires the `admin` realm role
  {
    path: '/admin',
    element: <RequireAdmin><AdminLayout /></RequireAdmin>,
    children: [
      { index: true,        Component: AdminDashboard },
      { path: 'users',      Component: UserManagement },
      { path: 'banks',      Component: BankManagement },
      { path: 'dimensions', Component: DimensionsManagement },
      { path: 'scoring',    Component: ScoringReferential },
      { path: 'versions',   Component: QuestionnaireVersions },
      { path: 'logs',       Component: AuditLogs },
      { path: 'settings',   Component: Settings },
    ],
  },

], {
  basename: import.meta.env.BASE_URL,
});
