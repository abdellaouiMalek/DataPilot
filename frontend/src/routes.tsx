import { createBrowserRouter } from 'react-router-dom';
import { RequireAuth } from './components/RequireAuth';
import { RequireAdmin } from './components/RequireAdmin';
import { LandingPage } from './pages/LandingPage';
import { QuestionnairePage } from './pages/QuestionnairePage';
import { ResultsPage } from './pages/ResultsPage';
import { DashboardPage } from './pages/DashboardPage';
import { RecommendationsPage } from './pages/RecommendationsPage';
import { SimulationPage } from './pages/SimulationPage';
import { AdminPage } from './pages/AdminPage';

export const router = createBrowserRouter([
  // Public — accessible sans authentification
  { path: '/', Component: LandingPage },

  // Protégées — redirigent vers Keycloak si non connecté
  { path: '/questionnaire', element: <RequireAuth><QuestionnairePage /></RequireAuth> },
  { path: '/results', element: <RequireAuth><ResultsPage /></RequireAuth> },
  { path: '/dashboard', element: <RequireAuth><DashboardPage /></RequireAuth> },
  { path: '/recommendations', element: <RequireAuth><RecommendationsPage /></RequireAuth> },
  { path: '/simulation', element: <RequireAuth><SimulationPage /></RequireAuth> },

  // Admin back-office — requires the `admin` realm role
  { path: '/admin', element: <RequireAdmin><AdminPage /></RequireAdmin> },

], {
  basename: import.meta.env.BASE_URL,
});
