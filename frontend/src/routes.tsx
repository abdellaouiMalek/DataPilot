/**
 * Routage de l'application.
 *
 * Chaque page est chargée à la demande via le `lazy` du routeur : sans cela,
 * tout (questionnaire, résultats, et les ~8 000 lignes du back-office)
 * partait dans un seul fichier JavaScript téléchargé dès la page d'accueil,
 * y compris pour un visiteur qui n'ouvrira jamais `/super-admin`.
 *
 * Seuls les gardes d'accès et les mises en page restent chargés d'emblée : les
 * gardes sont minuscules et un chargement différé retarderait la redirection
 * vers Keycloak ; les mises en page permettent au bandeau et au menu latéral
 * de s'afficher immédiatement pendant que seul le contenu attend son fichier.
 */

import { createBrowserRouter, Navigate } from 'react-router-dom';
import { RequireAuth } from './components/RequireAuth';
import { RequireSuperAdmin } from './components/RequireSuperAdmin';
import { RequireAdmin } from './components/RequireAdmin';
import { AdminLayout as RestrictedAdminLayout } from './pages/admin/AdminLayout';
import { AdminLayout } from './pages/superAdmin/AdminLayout';

/**
 * Adapte un import dynamique au format attendu par le routeur.
 *
 * Les pages exportent un composant nommé (`export function ResultsPage`), pas
 * un export par défaut : `pick` désigne lequel récupérer dans le module.
 */
const page = <M extends Record<string, unknown>>(
  load: () => Promise<M>,
  pick: keyof M,
) => async () => ({ Component: (await load())[pick] as React.ComponentType });

/** Page protégée : le garde reste synchrone, seul son contenu est différé. */
const guarded = <M extends Record<string, unknown>>(
  load: () => Promise<M>,
  pick: keyof M,
) => async () => {
  const Component = (await load())[pick] as React.ComponentType;
  return { element: <RequireAuth><Component /></RequireAuth> };
};

export const router = createBrowserRouter([
  // Public, accessible sans authentification
  // Différée comme les autres : la charger d'emblée tirait `motion` dans le
  // fichier initial (+150 Ko pour tout le monde, y compris un administrateur
  // qui ne verra jamais cette page) pour n'économiser qu'un aller-retour.
  { path: '/', lazy: page(() => import('./pages/LandingPage'), 'LandingPage') },

  // Protégées, redirigent vers Keycloak si non connecté
  { path: '/questionnaire',   lazy: guarded(() => import('./pages/QuestionnairePage'), 'QuestionnairePage') },
  { path: '/dashboard',       lazy: guarded(() => import('./pages/DashboardPage'), 'DashboardPage') },
  { path: '/historique',      lazy: guarded(() => import('./pages/HistoriquePage'), 'HistoriquePage') },
  { path: '/profile',         lazy: guarded(() => import('./pages/ProfilePage'), 'ProfilePage') },

  // L'évaluation concernée est dans le chemin, pas dans l'état du routeur.
  // Cet état ne survit ni à un rechargement, ni au détour par Keycloak :
  // ces pages affichaient alors un écran vide alors que la donnée existait.
  // Avec l'id dans l'URL, elles se reconstruisent seules (`getAssessment`).
  { path: '/results/:assessmentId',         lazy: guarded(() => import('./pages/ResultsPage'), 'ResultsPage') },
  { path: '/recommendations/:assessmentId', lazy: guarded(() => import('./pages/RecommendationsPage'), 'RecommendationsPage') },
  // Comparaison : les ids sont en query (`?ids=5,6`), leur nombre varie.
  { path: '/evolution',       lazy: guarded(() => import('./pages/EvolutionPage'), 'EvolutionPage') },

  // Anciennes adresses sans id : elles ne pouvaient de toute façon rien
  // afficher sans l'état du routeur. Renvoyées vers le point de départ
  // plutôt que sur un écran d'erreur.
  { path: '/results',         element: <Navigate to="/dashboard" replace /> },
  { path: '/recommendations', element: <Navigate to="/dashboard" replace /> },

  // Espace admin, rôle `admin` (ou `super_admin`, sur-ensemble).
  // Périmètre volontairement réduit : tableau de bord + utilisateurs.
  {
    path: '/admin',
    element: <RequireAdmin><RestrictedAdminLayout /></RequireAdmin>,
    children: [
      { index: true,   lazy: page(() => import('./pages/admin/AdminDashboard'), 'AdminDashboard') },
      { path: 'users',    lazy: page(() => import('./pages/superAdmin/AdminUsers'), 'UserManagement') },
      { path: 'evaluations', lazy: page(() => import('./pages/admin/AdminEvaluations'), 'AdminEvaluations') },
      { path: 'evaluations/:assessmentId', lazy: page(() => import('./pages/admin/AdminEvaluationDetail'), 'AdminEvaluationDetail') },
      { path: 'recommendations', lazy: page(() => import('./pages/superAdmin/AdminRecommendations'), 'RecommendationCatalog') },
      { path: 'dimensions', lazy: page(() => import('./pages/superAdmin/AdminDimensions'), 'FrameworkConsultation') },
      { path: 'scoring',    lazy: page(() => import('./pages/superAdmin/AdminScoring'), 'ScoringReferential') },
      { path: 'versions',   lazy: page(() => import('./pages/superAdmin/AdminVersions'), 'QuestionnaireVersions') },
      { path: 'versions/:circularId', lazy: page(() => import('./pages/superAdmin/VersionDetailRoute'), 'VersionDetailRoute') },
      { path: 'settings', lazy: page(() => import('./pages/admin/AdminSettings'), 'Settings') },
    ],
  },

  // Back-office, requires the `super_admin` realm role
  {
    path: '/super-admin',
    element: <RequireSuperAdmin><AdminLayout /></RequireSuperAdmin>,
    children: [
      { index: true,        lazy: page(() => import('./pages/superAdmin/AdminDashboard'), 'AdminDashboard') },
      { path: 'veille',     lazy: page(() => import('./pages/superAdmin/AdminVeille'), 'VeilleReglementaire') },
      { path: 'users',      lazy: page(() => import('./pages/superAdmin/AdminUsers'), 'UserManagement') },
      { path: 'banks',      lazy: page(() => import('./pages/superAdmin/AdminBanks'), 'BankManagement') },
      { path: 'dimensions', lazy: page(() => import('./pages/superAdmin/AdminDimensions'), 'DimensionsManagement') },
      { path: 'recommendations', lazy: page(() => import('./pages/superAdmin/AdminRecommendations'), 'RecommendationCatalog') },
      { path: 'scoring',    lazy: page(() => import('./pages/superAdmin/AdminScoring'), 'ScoringReferential') },
      { path: 'versions',   lazy: page(() => import('./pages/superAdmin/AdminVersions'), 'QuestionnaireVersions') },
      { path: 'versions/:circularId', lazy: page(() => import('./pages/superAdmin/VersionDetailRoute'), 'VersionDetailRoute') },
      { path: 'logs',       lazy: page(() => import('./pages/superAdmin/AdminLogs'), 'AuditLogs') },
      { path: 'settings',   lazy: page(() => import('./pages/superAdmin/AdminSettings'), 'Settings') },
    ],
  },

], {
  basename: import.meta.env.BASE_URL,
});
