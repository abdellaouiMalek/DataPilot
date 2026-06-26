import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import keycloak, { isAdmin } from '../lib/keycloak';
import { Navbar } from './Navbar';

/**
 * Protège une route réservée aux administrateurs.
 * - Non connecté → redirige vers Keycloak.
 * - Connecté mais sans le rôle `admin` → affiche un écran « accès refusé ».
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!keycloak.authenticated) {
      keycloak.login({ redirectUri: window.location.href });
    }
  }, []);

  if (!keycloak.authenticated) {
    return null;
  }

  if (!isAdmin()) {
    return (
      <div className="min-h-screen bg-gray-50 font-sans flex flex-col">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <ShieldAlert className="w-10 h-10 text-red-500" />
          <div>
            <p className="text-base font-bold text-gray-900">Accès refusé</p>
            <p className="text-sm text-gray-500 mt-1 max-w-md">
              Cette section est réservée aux administrateurs. Contactez votre administrateur
              si vous pensez qu'il s'agit d'une erreur.
            </p>
          </div>
          <button
            onClick={() => navigate('/')}
            className="px-5 py-2.5 rounded-xl text-sm font-bold bg-gray-900 text-white hover:bg-black transition-colors"
          >
            Retour à l'accueil
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
