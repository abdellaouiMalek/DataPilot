import { LogOut, LogIn, Shield, User, UserRound, History } from 'lucide-react';
import { Link } from 'react-router-dom';
import { DropdownMenu } from 'radix-ui';
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
          {user.isAdmin && (
            <>
              <Link
                to="/admin"
                className="flex items-center gap-2 text-sm font-bold text-gray-700 hover:text-black transition-colors outline-none"
                title="Espace administrateur"
              >
                <span className="bg-gray-100 p-1.5 rounded-sm">
                  <Shield className="w-4 h-4 text-black" />
                </span>
                <span className="hidden sm:inline">ADMIN</span>
              </Link>
              <div className="h-6 w-px bg-gray-200 hidden sm:block" />
            </>
          )}

          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                className="flex items-center justify-center w-10 h-10 rounded-full bg-black text-[#FFE600] outline-none focus:outline-none focus-visible:outline-none transition-colors hover:bg-gray-800 cursor-pointer data-[state=open]:bg-gray-800"
                aria-label="Menu du profil"
              >
                <User className="w-5 h-5" />
              </button>
            </DropdownMenu.Trigger>

            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={8}
                className="z-[60] min-w-[240px] rounded-md border border-gray-200 bg-white p-1.5 shadow-lg"
              >
                {/* En-tête profil */}
                <div className="flex items-center gap-3 px-3 py-3">
                  <div className="w-10 h-10 rounded-sm bg-black text-[#FFE600] flex items-center justify-center text-sm font-black tracking-wide select-none shrink-0">
                    {initials(user.name)}
                  </div>
                  <div className="flex flex-col leading-tight min-w-0">
                    <span className="text-sm font-bold text-gray-900 truncate">{user.name}</span>
                    {user.email && (
                      <span className="text-[11px] text-gray-500 tracking-wide truncate">
                        {user.email}
                      </span>
                    )}
                    {user.isAdmin && (
                      <span className="mt-1 w-fit inline-flex items-center text-[9px] font-bold tracking-widest text-black bg-[#FFE600] px-1.5 py-0.5 rounded-sm uppercase">
                        Admin
                      </span>
                    )}
                  </div>
                </div>

                <DropdownMenu.Separator className="h-px bg-gray-100 my-1" />

                <DropdownMenu.Item asChild>
                  <Link
                    to="/profile"
                    className="flex items-center gap-2 px-3 py-2 text-sm font-bold text-gray-700 rounded-sm cursor-pointer outline-none transition-colors hover:bg-gray-100 hover:text-black"
                  >
                    <UserRound className="w-4 h-4" />
                    Mon profil
                  </Link>
                </DropdownMenu.Item>

                <DropdownMenu.Item asChild>
                  <Link
                    to="/historique"
                    className="flex items-center gap-2 px-3 py-2 text-sm font-bold text-gray-700 rounded-sm cursor-pointer outline-none transition-colors hover:bg-gray-100 hover:text-black"
                  >
                    <History className="w-4 h-4" />
                    Mes évaluations
                  </Link>
                </DropdownMenu.Item>

                <DropdownMenu.Item
                  onSelect={() => logout()}
                  className="flex items-center gap-2 px-3 py-2 text-sm font-bold text-gray-700 rounded-sm cursor-pointer outline-none transition-colors data-[highlighted]:bg-red-50 data-[highlighted]:text-red-600"
                >
                  <LogOut className="w-4 h-4" />
                  Déconnexion
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
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
