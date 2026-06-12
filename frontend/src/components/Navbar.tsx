import { LogOut } from 'lucide-react';
import eyLogo from '../assets/EY_logo2.png';
import { logout } from '../lib/keycloak';

/** Barre de navigation commune : logo + slogan + bouton de déconnexion. */
export function Navbar() {
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
    </header>
  );
}
