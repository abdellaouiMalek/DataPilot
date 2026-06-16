import { LogOut, LogIn } from 'lucide-react';
import eyLogo from '../assets/EY_logo2.png';
import { login, logout, getCurrentUser } from '../lib/keycloak';

/** Initiales (max 2 lettres) à partir du nom affiché. */
function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

/** Barre de navigation commune : logo + slogan + identité de l'utilisateur. */
export function Navbar() {
  const user = getCurrentUser();

  return (
    <header className="h-16 border-b border-gray-200 px-6 md:px-8 flex items-center justify-between shrink-0 bg-white sticky top-0 z-50">
      <div className="flex items-center gap-4">
        <img
          src={eyLogo}
          alt="EY Logo"
          className="h-7 w-auto object-contain select-none pointer-events-none"
        />
        <div className="flex flex-col border-l border-gray-300 pl-4">
          <span className="text-xs font-bold tracking-[0.2em] text-gray-900 leading-none">
            DATA MATURITY
          </span>
          <span className="text-[10px] text-gray-500 tracking-widest mt-1">
            ASSESSMENT PLATFORM
          </span>
        </div>
      </div>

      {user ? (
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-sm bg-black text-[#FFE600] flex items-center justify-center text-xs font-black tracking-wide select-none"
              aria-hidden="true"
            >
              {initials(user.name)}
            </div>
            <div className="hidden sm:flex flex-col leading-tight">
              <span className="text-xs font-bold text-gray-900">{user.name}</span>
              {user.email && (
                <span className="text-[10px] text-gray-500 tracking-wide">{user.email}</span>
              )}
            </div>
          </div>

          <div className="h-6 w-px bg-gray-200 hidden sm:block" />

          <button
            onClick={() => logout()}
            className="flex items-center gap-2 text-sm font-bold text-gray-700 hover:text-red-600 transition-colors outline-none cursor-pointer"
            aria-label="Se déconnecter"
            title="Se déconnecter"
          >
            <span className="bg-gray-100 p-1.5 rounded-sm">
              <LogOut className="w-4 h-4 text-black" />
            </span>
            DÉCONNEXION
          </button>
        </div>
      ) : (
        <button
          onClick={() => login()}
          className="flex items-center gap-2 text-sm font-bold text-white bg-black hover:bg-[#FFE600] hover:text-black transition-colors outline-none cursor-pointer px-4 py-2 rounded-sm border border-black"
          aria-label="Se connecter"
          title="Se connecter"
        >
          <LogIn className="w-4 h-4" />
          CONNEXION
        </button>
      )}
    </header>
  );
}
