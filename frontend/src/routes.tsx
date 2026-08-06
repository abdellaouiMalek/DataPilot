import { createBrowserRouter } from 'react-router-dom';
import { RequireAuth } from './components/RequireAuth';
import { RequireSuperAdmin } from './components/RequireSuperAdmin';
import { RequireAdmin } from './components/RequireAdmin';
import { AdminLayout as RestrictedAdminLayout } from './pages/admin/AdminLayout';
import { AdminDashboard as RestrictedAdminDashboard } from './pages/admin/AdminDashboard';
import { LandingPage } from './pages/LandingPage';
import { QuestionnairePage } from './pages/QuestionnairePage';
import { ResultsPage } from './pages/ResultsPage';
import { DashboardPage } from './pages/DashboardPage';
import { RecommendationsPage } from './pages/RecommendationsPage';
import { SimulationPage } from './pages/SimulationPage';
import { HistoriquePage } from './pages/HistoriquePage';
import { EvolutionPage } from './pages/EvolutionPage';
import { ProfilePage } from './pages/ProfilePage';
import { AdminLayout } from './pages/superAdmin/AdminLayout';
import { AdminDashboard } from './pages/superAdmin/AdminDashboard';
import { VeilleReglementaire } from './pages/superAdmin/AdminVeille';
import { UserManagement } from './pages/superAdmin/AdminUsers';
import { BankManagement } from './pages/superAdmin/AdminBanks';
import { DimensionsManagement } from './pages/superAdmin/AdminDimensions';
import { ScoringReferential } from './pages/superAdmin/AdminScoring';
import { QuestionnaireVersions } from './pages/superAdmin/AdminVersions';
import { AuditLogs } from './pages/superAdmin/AdminLogs';
import { Settings } from './pages/superAdmin/AdminSettings';

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

  // Espace admin — rôle `admin` (ou `super_admin`, sur-ensemble).
  // Périmètre volontairement réduit : tableau de bord + utilisateurs.
  {
    path: '/admin',
    element: <RequireAdmin><RestrictedAdminLayout /></RequireAdmin>,
    children: [
      { index: true,   Component: RestrictedAdminDashboard },
      { path: 'users', Component: UserManagement },
    ],
  },

  // Back-office — requires the `super_admin` realm role
  {
    path: '/super-admin',
    element: <RequireSuperAdmin><AdminLayout /></RequireSuperAdmin>,
    children: [
      { index: true,        Component: AdminDashboard },
      { path: 'veille',     Component: VeilleReglementaire },
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
