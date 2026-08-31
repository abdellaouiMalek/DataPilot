import Keycloak from "keycloak-js";

const keycloak = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL,
  realm: import.meta.env.VITE_KEYCLOAK_REALM,
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID,
});


export const logout = () =>
  keycloak.logout({
    redirectUri: window.location.origin + import.meta.env.BASE_URL,
  });

export const login = () =>
  keycloak.login({
    redirectUri: window.location.origin + import.meta.env.BASE_URL,
  });

/**
 * Realm role granting access to the back-office.
 * Note: "admin" is now a plain business role (like consultant/validateur)
 * and grants NO back-office access — only "super_admin" does.
 */
export const SUPER_ADMIN_ROLE = "super_admin";

/**
 * Rôle back-office restreint : tableau de bord + gestion des utilisateurs.
 * Ne peut ni voir ni attribuer le rôle `super_admin`.
 */
export const ADMIN_ROLE = "admin";

/** True if the current user is authenticated and holds the super_admin realm role. */
export function isSuperAdmin(): boolean {
  return !!keycloak.authenticated && keycloak.hasRealmRole(SUPER_ADMIN_ROLE);
}

/** True si l'utilisateur a le rôle `admin` (back-office restreint). */
export function isAdmin(): boolean {
  return !!keycloak.authenticated && keycloak.hasRealmRole(ADMIN_ROLE);
}

/**
 * Accès au back-office, quel qu'en soit le périmètre.
 * Un super admin garde accès à l'espace admin (sur-ensemble).
 */
export function hasBackOffice(): boolean {
  return isSuperAdmin() || isAdmin();
}

export interface CurrentUser {
  /** Keycloak `sub` — stable account id, used to scope per-user client state. */
  sub?: string;
  name: string;
  email?: string;
  username?: string;
  isSuperAdmin: boolean;
  isAdmin: boolean;
}

/** Infos de l'utilisateur connecté, ou null si non authentifié. */
export function getCurrentUser(): CurrentUser | null {
  const t = keycloak.tokenParsed;
  if (!keycloak.authenticated || !t) return null;
  return {
    sub: t.sub,
    name: t.name || t.preferred_username || t.email || "Utilisateur",
    email: t.email,
    username: t.preferred_username,
    isSuperAdmin: keycloak.hasRealmRole(SUPER_ADMIN_ROLE),
    isAdmin: keycloak.hasRealmRole(ADMIN_ROLE),
  };
}

export default keycloak;
