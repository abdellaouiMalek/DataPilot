import { AccountSection } from '../superAdmin/AdminAccount';

/**
 * Paramètres de l'espace admin restreint.
 *
 * Réduits à « Mon compte », et c'est délibéré. La page Paramètres du super
 * admin gère deux autres domaines qui n'ont pas leur place ici :
 *
 * — la **Sécurité** écrit le realm Keycloak (durée de session, politique de
 *   mot de passe, 2FA). Ces réglages valent pour tout le monde, y compris les
 *   super administrateurs : les confier à un admin restreint reviendrait à lui
 *   donner, par un détour, un pouvoir que son rôle lui refuse ailleurs ;
 * — les **Notifications** décident qui reçoit les alertes de la plateforme,
 *   ce qui est également une décision d'échelle plateforme.
 *
 * Ne restait donc que le compte de la personne connectée — que le menu du
 * bandeau proposait déjà, mais en pointant vers `/super-admin/settings`, où
 * `RequireSuperAdmin` affichait « Accès refusé » à ce même admin.
 *
 * La section est celle du super admin (`AdminAccount`), sans copie : elle ne
 * lit rien de spécifique à un rôle, et son endpoint `/api/back-office/profile`
 * accepte les deux rôles back-office.
 */
export function Settings() {
  return (
    <div style={{ padding: 32 }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{
          fontSize: 18, fontWeight: 700, color: "var(--ey-black)",
          margin: 0, letterSpacing: "-0.02em",
        }}>
          Paramètres
        </h2>
        <p style={{ fontSize: 13, color: "var(--ey-gray-mid)", margin: "4px 0 0" }}>
          Votre compte administrateur
        </p>
      </div>

      {/* Pleine largeur et deux colonnes : cette page n'a qu'une section, elle
          n'a pas la colonne d'onglets qui contraint celle du super admin. */}
      <AccountSection layout="columns" />
    </div>
  );
}
