import { Settings2 } from 'lucide-react';
import { Navbar } from '../components/Navbar';

/**
 * Espace administrateur (back-office).
 * Placeholder — la gestion CRUD des dimensions, questions et listes
 * (banques / départements / rôles) arrive à la phase suivante.
 */
export function AdminPage() {
  return (
    <div className="min-h-screen bg-gray-50 font-sans flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-[1100px] w-full mx-auto px-6 md:px-8 py-12">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-[10px] font-extrabold tracking-[0.25em] text-[#FFE600] bg-black px-2.5 py-1 uppercase font-mono">
            ESPACE ADMIN
          </span>
        </div>
        <h1 className="text-3xl font-light tracking-tight text-gray-900">
          Back-office <span className="font-bold">DataPilot</span>
        </h1>
        <p className="text-sm text-gray-500 mt-2 max-w-xl">
          Gérez le contenu de l'évaluation : dimensions, questions, et les listes
          de banques, départements et rôles.
        </p>

        <div className="mt-10 border border-dashed border-gray-300 bg-white rounded-2xl p-10 flex flex-col items-center justify-center text-center gap-3">
          <Settings2 className="w-8 h-8 text-gray-400" />
          <p className="text-sm font-semibold text-gray-700">Modules de gestion à venir</p>
          <p className="text-xs text-gray-400 max-w-sm">
            L'interface de création / modification / suppression sera ajoutée ici.
          </p>
        </div>
      </main>
    </div>
  );
}
