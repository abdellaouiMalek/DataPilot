import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight } from 'lucide-react';

/**
 * Fil d'Ariane commun aux écrans ouverts depuis le tableau de bord.
 *
 * Le tableau de bord est le point de retour du parcours : chaque écran qui en
 * découle affiche le même chemin et le même retour, à la même place. Avant,
 * chacun faisait autrement -- « Évolution » avait son propre fil d'Ariane vers
 * l'accueil, « Recommandations » un `navigate(-1)` dont la destination
 * dépendait de la page précédente, les autres n'avaient rien.
 *
 * Volontairement sans titre : chaque page garde le sien, souvent porteur du
 * score ou du nom de la banque. Ce composant ne fournit que le repère de
 * position et la sortie.
 *
 * Le retour est un lien vers une adresse fixe, pas un `navigate(-1)` : la
 * destination doit être la même quel que soit le chemin parcouru, y compris
 * depuis un lien collé ou un rechargement, où l'historique est vide.
 */
export function FlowHeader({
  current,
  parent,
  action,
}: {
  /** Nom de l'écran courant, dernier maillon du fil. */
  current: string;
  /** Étape intermédiaire, pour un écran ouvert depuis un autre que le tableau de bord. */
  parent?: { label: string; to: string };
  /**
   * Contenu de la zone droite. Fourni, il remplace le bouton de retour : le
   * fil d'Ariane reste cliquable, la sortie n'est donc pas perdue, et la place
   * revient à l'action propre à la page.
   */
  action?: React.ReactNode;
}) {
  const navigate = useNavigate();
  const back = parent ?? { label: 'Tableau de bord', to: '/dashboard' };

  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <nav
        aria-label="Fil d'Ariane"
        className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.18em] uppercase text-gray-400 flex-wrap"
      >
        <button onClick={() => navigate('/dashboard')} className="hover:text-gray-700 transition-colors">
          Tableau de bord
        </button>
        {parent && (
          <>
            <ChevronRight className="w-3 h-3 shrink-0" />
            <button onClick={() => navigate(parent.to)} className="hover:text-gray-700 transition-colors">
              {parent.label}
            </button>
          </>
        )}
        <ChevronRight className="w-3 h-3 shrink-0" />
        <span className="text-gray-700">{current}</span>
      </nav>

      {action ?? (
        <button
          onClick={() => navigate(back.to)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {back.label}
        </button>
      )}
    </div>
  );
}
