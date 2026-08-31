/**
 * L'attente du back-office, centrée et unique.
 *
 * Deux détails qui font l'essentiel de l'effet :
 *
 * — **l'apparition est retardée.** Depuis que les appels Keycloak passent par
 *   un client partagé, les pages répondent en quelques dizaines de
 *   millisecondes ; un indicateur affiché immédiatement clignoterait à chaque
 *   navigation, ce qui se remarque bien plus qu'une brève page vide. Le voile
 *   ne se révèle donc qu'au-delà de `delay` (250 ms par défaut) : en dessous,
 *   la page arrive avant lui et rien ne clignote ;
 * — **il occupe la place de la page**, pas un coin de l'écran. Le châssis
 *   (menu latéral, bandeau) reste peint autour ; seul le contenu attend.
 */

const SIZE = 46;

export function AdminLoader({
  label = "Chargement…",
  /** Hauteur : `page` remplit la zone de contenu, `inline` s'insère dans une carte. */
  variant = "page",
  delay = 250,
}: {
  label?: string;
  variant?: "page" | "inline";
  delay?: number;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        width: "100%",
        minHeight: variant === "page" ? "min(62vh, 420px)" : 180,
        padding: 24,
        opacity: 0,
        animation: `dp-loader-in 220ms ease-out ${delay}ms forwards`,
      }}
    >
      <div style={{ position: "relative", width: SIZE, height: SIZE }}>
        {/* Anneau extérieur : arc noir sur piste claire. */}
        <div style={{
          position: "absolute", inset: 0, borderRadius: "50%",
          border: "3px solid #ECECEC",
          borderTopColor: "var(--ey-black, #1A1A1A)",
          animation: "dp-spin 760ms linear infinite",
        }} />
        {/* Anneau intérieur, plus lent et en sens inverse : l'accent EY. */}
        <div style={{
          position: "absolute", inset: 9, borderRadius: "50%",
          border: "2px solid transparent",
          borderTopColor: "#FFE600",
          animation: "dp-spin 1150ms linear infinite reverse",
        }} />
      </div>

      <span style={{
        fontSize: 12.5,
        fontWeight: 500,
        color: "var(--ey-gray-mid, #6B6B6B)",
        letterSpacing: "0.01em",
      }}>
        {label}
      </span>
    </div>
  );
}
