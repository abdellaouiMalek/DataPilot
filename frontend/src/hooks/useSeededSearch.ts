import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

/**
 * État du champ de filtre d'une page, pré-rempli par la recherche rapide du
 * bandeau d'administration.
 *
 * Ouvrir un résultat de recherche n'amène pas seulement sur la bonne page : la
 * ligne cherchée peut rester invisible derrière un filtre ou une pagination.
 * Le bandeau passe donc le texte à retrouver dans `state.q` (voir
 * `AdminTopbar`), et la page l'applique à son propre filtre.
 *
 * Le `key` de la localisation est dans les dépendances de l'effet, pas
 * seulement le texte : chercher deux fois la même chose depuis la page déjà
 * ouverte crée bien deux entrées d'historique distinctes, alors que le
 * composant, lui, n'est jamais remonté, sans ça la seconde recherche
 * n'aurait aucun effet visible.
 */
export function useSeededSearch(): [string, React.Dispatch<React.SetStateAction<string>>] {
  const { state, key } = useLocation();
  const seed =
    typeof (state as { q?: unknown } | null)?.q === "string"
      ? (state as { q: string }).q
      : "";

  const [search, setSearch] = useState(seed);

  useEffect(() => {
    // Une navigation sans `q` (retour arrière, lien de menu) ne doit pas
    // effacer ce que la personne est en train de taper.
    if (seed) setSearch(seed);
  }, [seed, key]);

  return [search, setSearch];
}
