/**
 * Back-office page keys → routes.
 *
 * The backend refers to a destination by key (`target: "users"`) rather than
 * by URL, so paths stay a front-end concern. Shared because three surfaces
 * navigate by key, the dashboard alert buttons, the topbar notification
 * bell, and the quick-search results, and a fourth copy would be the one
 * that goes stale.
 */

export const pageRoutes: Record<string, string> = {
  banks: "/super-admin/banks",
  logs: "/super-admin/logs",
  users: "/super-admin/users",
  dimensions: "/super-admin/dimensions",
  scoring: "/super-admin/scoring",
  versions: "/super-admin/versions",
  veille: "/super-admin/veille",
  settings: "/super-admin/settings",
};

export const routeFor = (target: string) =>
  pageRoutes[target] ?? "/super-admin";

