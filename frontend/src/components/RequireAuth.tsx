import { useEffect } from 'react';
import type { ReactNode } from 'react';
import keycloak, { loginReplacingHistory } from '../lib/keycloak';

/**
 * Protège une route : si l'utilisateur n'est pas connecté, le redirige vers
 * Keycloak puis le ramène sur la page demandée après authentification.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (!keycloak.authenticated) {
      void loginReplacingHistory(window.location.href);
    }
  }, []);

  if (!keycloak.authenticated) {
    return null;
  }

  return <>{children}</>;
}
