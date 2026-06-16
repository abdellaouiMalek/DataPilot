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

export interface CurrentUser {
  name: string;
  email?: string;
  username?: string;
}

/** Infos de l'utilisateur connecté, ou null si non authentifié. */
export function getCurrentUser(): CurrentUser | null {
  const t = keycloak.tokenParsed;
  if (!keycloak.authenticated || !t) return null;
  return {
    name: t.name || t.preferred_username || t.email || "Utilisateur",
    email: t.email,
    username: t.preferred_username,
  };
}

export default keycloak;
