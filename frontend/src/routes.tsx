import { createBrowserRouter } from 'react-router-dom';
import { LandingPage } from './pages/LandingPage';
import { QuestionnairePage } from './pages/QuestionnairePage';
import { ResultsPage } from './pages/ResultsPage';
import { DashboardPage } from './pages/DashboardPage';
import { RecommendationsPage } from './pages/RecommendationsPage';
import { SimulationPage } from './pages/SimulationPage';
import LoginPage from './pages/LoginPage';

export const router = createBrowserRouter([
  { path: '/', Component: LandingPage },
  { path: '/questionnaire', Component: QuestionnairePage },
  { path: '/results', Component: ResultsPage },
  { path: '/dashboard', Component: DashboardPage },
  { path: '/recommendations', Component: RecommendationsPage },
  { path: '/simulation', Component: SimulationPage },
  { path: '/login', Component: LoginPage }
], {
  basename: import.meta.env.BASE_URL,
});
