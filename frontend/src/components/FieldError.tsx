import { AlertCircle } from "lucide-react";

/**
 * Message d'erreur sous un champ de formulaire. Composant "feuille"
 * autonome (styles inline) -- fonctionne aussi bien sur une page en
 * `style={}` (ex. AdminBanks.tsx) qu'une page en classes Tailwind, sans
 * dépendre de laquelle des deux conventions la page utilise.
 *
 * Reprend la palette "danger" déjà utilisée ailleurs dans l'app
 * (VersionDetail.tsx) et sur le thème de connexion EY : texte #B91C1C,
 * icône AlertCircle -- pas une nouvelle couleur.
 */
export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      style={{
        marginTop: 4,
        fontSize: 12,
        color: "#B91C1C",
        display: "flex",
        alignItems: "center",
        gap: 4,
      }}
    >
      <AlertCircle size={12} />
      {message}
    </p>
  );
}
