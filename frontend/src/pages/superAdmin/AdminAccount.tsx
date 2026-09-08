/**
 * « Mon compte », section de la page Paramètres, et non page autonome.
 *
 * Distincte du profil client (`/profile`) pour deux raisons de fond :
 *
 * - un super administrateur n'est rattaché à aucune banque : `get_bank_scope`
 *   lui renvoie `None`, son accès aux données n'est pas restreint. Le champ
 *   « Banque » du profil client n'a donc aucun sens ici et n'est pas repris ;
 * - un compte back-office a en revanche une histoire que le profil client n'a
 *   pas : ce qu'il a modifié sur la plateforme. Le journal d'audit est relu
 *   ici, rattaché au `sub` Keycloak et non au nom, pour qu'un changement de
 *   nom ne détache jamais quelqu'un de ses propres actions.
 *
 * L'édition des informations personnelles passe par `/api/profile`, le même
 * endpoint que le profil client : c'est le seul endroit qui écrit l'identité
 * d'une personne dans Keycloak. Cette section a donc son propre bouton
 * d'enregistrement, le « Enregistrer les paramètres » global de la page vise
 * le realm et la table des paramètres, ce qui n'a rien à voir.
 */

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ShieldCheck, Check, Loader2, KeyRound, AlertTriangle, Activity,
} from "lucide-react";
import { toast } from "sonner";
import keycloak from "@/lib/keycloak";
import { AdminLoader } from "@/components/AdminLoader";
import { getProfile, updateProfile, type UserProfile } from "@/lib/profile";
import {
  getAdminProfile,
  resetOwnPassword,
  type AdminProfileOverview,
} from "@/lib/adminProfile";
import { ROLE_LABELS } from "@/lib/adminUsers";
import type { BusinessRole } from "@/lib/adminUsers";
import { modCfg } from "@/lib/auditModules";
import { Section, inp } from "./settingsUi";

const EY = { black: "#1A1A1A", yellow: "#FFE600", mid: "#6B6B6B" };

const FALLBACK_MODULE = { color: EY.mid, bg: "#F5F5F5", Icon: Activity };

const STATUS_COLORS: Record<string, string> = {
  "Succès": "#2E7D32",
  "Échec": "#CC0000",
  "Avertissement": "#E65100",
};

const dateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }) : "-";

const dateOnly = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("fr-FR") : "-";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#4A4A4A", marginBottom: 5 }}>
        {label}
      </span>
      {children}
    </label>
  );
}

/** Ligne « libellé → valeur » : un fait sur le compte, pas un réglage. */
function Fact({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 14, padding: "10px 0", borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
      <span style={{ fontSize: 12.5, color: "var(--ey-gray-mid)" }}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: tone || EY.black, textAlign: "right" }}>{value}</span>
    </div>
  );
}

export function AccountSection({ layout = "stack" }: {
  /**
   * `"stack"` : les trois sections l'une sous l'autre, la colonne d'onglets
   * du super admin est trop étroite pour autre chose.
   * `"columns"` : identité et sécurité côte à côte, activité en pleine
   *  largeur dessous, pour une page qui dispose de toute la largeur.
   */
  layout?: "stack" | "columns";
} = {}) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [overview, setOverview] = useState<AdminProfileOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [organization, setOrganization] = useState("");
  const [saving, setSaving] = useState(false);

  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getProfile(), getAdminProfile()])
      .then(([self, admin]) => {
        if (cancelled) return;
        setProfile(self);
        setOverview(admin);
        setFirstName(self.first_name ?? "");
        setLastName(self.last_name ?? "");
        setEmail(self.email ?? "");
        setOrganization(self.organization ?? "");
      })
      .catch(() => { if (!cancelled) setError("Impossible de charger votre compte."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const dirty = useMemo(() => !!profile && (
    firstName.trim() !== (profile.first_name ?? "") ||
    lastName.trim()  !== (profile.last_name ?? "") ||
    email.trim()     !== (profile.email ?? "") ||
    organization.trim() !== (profile.organization ?? "")
  ), [firstName, lastName, email, organization, profile]);

  const initials =
    `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() ||
    (overview?.username ?? "AD").slice(0, 2).toUpperCase();

  const roleLabel = overview?.role
    ? ROLE_LABELS[overview.role as BusinessRole] ?? overview.role
    : "Aucun rôle métier";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      toast.error("Informations incomplètes", {
        description: "Le prénom, le nom et l'adresse email sont obligatoires.",
      });
      return;
    }
    setSaving(true);
    try {
      const updated = await updateProfile({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        organization: organization.trim() || null,
      });
      setProfile(updated);
      // Le bandeau affiche le nom porté par le jeton : sans rafraîchissement
      // il continuerait d'afficher l'ancien jusqu'à la prochaine connexion.
      await keycloak.updateToken(-1).catch(() => undefined);
      toast.success("Profil mis à jour");
    } catch (err) {
      toast.error("Mise à jour impossible", {
        description: err instanceof Error ? err.message : "Veuillez réessayer.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    setResetting(true);
    try {
      const result = await resetOwnPassword();
      setConfirmReset(false);
      toast.success("Mot de passe réinitialisé", {
        description: `Un mot de passe temporaire a été envoyé à ${result.email}.`,
      });
    } catch (err) {
      toast.error("Réinitialisation impossible", {
        description: err instanceof Error ? err.message : "Veuillez réessayer.",
      });
    } finally {
      setResetting(false);
    }
  }

  if (loading) {
    return (
      <AdminLoader variant="inline" label="Chargement de votre compte…" />
    );
  }

  if (error || !overview) {
    return (
      <div style={{ backgroundColor: "#FFEBEE", color: "#CC0000", borderRadius: 6, padding: "14px 18px", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 10 }}>
        <AlertTriangle size={16} /> {error ?? "Compte indisponible."}
      </div>
    );
  }

  const columns = layout === "columns";
  const flush = columns ? { marginBottom: 0 } : undefined;
  // `alignItems: start` : sans lui, la carte la plus courte s'étire à la
  // hauteur de sa voisine et son fond blanc flotte sous son contenu.
  const grid: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.25fr) minmax(0, 1fr)",
    gap: 18,
    alignItems: "start",
  };

  // Pas de composant conteneur défini ici : React le recréerait à chaque
  // rendu, démonterait le formulaire et lui ferait perdre le focus à chaque
  // frappe. Un simple `div` conditionnel garde le même arbre.
  const content = (
    <>
      <Section title="Identité" subtitle="Votre compte tel que la plateforme le connaît." style={flush}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 0 4px" }}>
          <div style={{
            width: 52, height: 52, borderRadius: 12, backgroundColor: EY.black,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, fontWeight: 800, color: EY.yellow, flexShrink: 0,
          }}>
            {initials}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: EY.black }}>
              {[firstName, lastName].filter(Boolean).join(" ") || overview.username || "Administrateur"}
            </div>
            <div style={{ fontSize: 12, color: "var(--ey-gray-mid)", marginTop: 2 }}>{overview.email || "-"}</div>
          </div>
          <div style={{
            marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6,
            backgroundColor: "#FFFBE6", border: "1px solid #F0E08A",
            borderRadius: 20, padding: "4px 12px", flexShrink: 0,
          }}>
            <ShieldCheck size={12} style={{ color: "#8A7300" }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: "#8A7300" }}>{roleLabel}</span>
          </div>
        </div>

        <div style={{ marginTop: 8 }}>
          <Fact label="Identifiant" value={overview.username || "-"} />
          <Fact label="Compte créé le" value={dateOnly(overview.created_at)} />
          <Fact label="Dernière connexion" value={dateTime(overview.last_login)} />
          <Fact
            label="Email vérifié"
            value={overview.email_verified ? "Oui" : "Non"}
            tone={overview.email_verified ? "#2E7D32" : "#E65100"}
          />
        </div>

        <form onSubmit={handleSubmit} style={{ marginTop: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Field label="Prénom *">
              <input value={firstName} onChange={e => setFirstName(e.target.value)} required style={inp} />
            </Field>
            <Field label="Nom *">
              <input value={lastName} onChange={e => setLastName(e.target.value)} required style={inp} />
            </Field>
            <Field label="Adresse email *">
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required style={inp} />
            </Field>
            <Field label="Organisation">
              <input value={organization} onChange={e => setOrganization(e.target.value)} placeholder="EY" style={inp} />
            </Field>
          </div>
          <div style={{ marginTop: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
            <span style={{ fontSize: 11, color: "var(--ey-gray-mid)" }}>
              Modifier votre adresse email change aussi votre identifiant de connexion.
            </span>
            <button
              type="submit"
              disabled={!dirty || saving}
              style={{
                display: "flex", alignItems: "center", gap: 7, padding: "9px 20px",
                borderRadius: 4, fontSize: 13, fontWeight: 600, border: "none",
                backgroundColor: dirty && !saving ? "var(--ey-black)" : "#E8E8E8",
                color: dirty && !saving ? EY.yellow : "#9B9B9B",
                cursor: dirty && !saving ? "pointer" : "not-allowed",
              }}
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              Enregistrer mon profil
            </button>
          </div>
        </form>
      </Section>

      <Section title="Sécurité du compte" subtitle="Votre mot de passe n'est jamais visible depuis la plateforme." style={flush}>
        <div style={{ paddingTop: 16 }}>
          {!confirmReset ? (
            <>
              <p style={{ fontSize: 12, color: "var(--ey-gray-mid)", lineHeight: 1.5, margin: "0 0 12px" }}>
                Le réinitialiser vous envoie un mot de passe temporaire par email,
                à changer à la connexion suivante.
              </p>
              <button
                onClick={() => setConfirmReset(true)}
                style={{
                  display: "flex", alignItems: "center", gap: 7, padding: "8px 16px",
                  borderRadius: 4, fontSize: 12.5, fontWeight: 600,
                  border: "1px solid rgba(0,0,0,0.15)", backgroundColor: "#fff",
                  cursor: "pointer", color: EY.black,
                }}
              >
                <KeyRound size={13} /> Réinitialiser mon mot de passe
              </button>
            </>
          ) : (
            <div style={{ backgroundColor: "#FFF8E1", border: "1px solid #F5DFA0", borderRadius: 5, padding: "12px 14px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 11 }}>
                <AlertTriangle size={14} style={{ color: "#8A5300", flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontSize: 12, color: "#8A5300", lineHeight: 1.5 }}>
                  Votre mot de passe actuel cessera d'être valide. Un mot de passe
                  temporaire sera envoyé à <strong>{overview.email}</strong>.
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={handleReset}
                  disabled={resetting}
                  style={{
                    display: "flex", alignItems: "center", gap: 6, padding: "7px 14px",
                    borderRadius: 4, fontSize: 12, fontWeight: 700, border: "none",
                    backgroundColor: EY.black, color: EY.yellow,
                    cursor: resetting ? "default" : "pointer", opacity: resetting ? 0.6 : 1,
                  }}
                >
                  {resetting ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                  Confirmer
                </button>
                <button
                  onClick={() => setConfirmReset(false)}
                  disabled={resetting}
                  style={{
                    padding: "7px 14px", borderRadius: 4, fontSize: 12, fontWeight: 500,
                    border: "1px solid rgba(0,0,0,0.15)", backgroundColor: "#fff",
                    cursor: "pointer", color: "#4A4A4A",
                  }}
                >
                  Annuler
                </button>
              </div>
            </div>
          )}
        </div>
      </Section>

      <div style={columns ? { gridColumn: "1 / -1" } : undefined}>
      <Section
        title="Mon activité"
        subtitle="Vos actions dans le journal d'audit, rattachées à votre compte."
        noPadding
        style={flush}
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, backgroundColor: "rgba(0,0,0,0.05)", borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
          {[
            { label: "Actions totales", value: String(overview.actions_total) },
            { label: "Sur 30 jours",    value: String(overview.actions_30d) },
            { label: "Dernière action", value: dateOnly(overview.last_action_at) },
          ].map(stat => (
            <div key={stat.label} style={{ backgroundColor: "#fff", padding: "14px 24px" }}>
              <div style={{ fontSize: 10, color: "var(--ey-gray-mid)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                {stat.label}
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: EY.black, letterSpacing: "-0.02em" }}>
                {stat.value}
              </div>
            </div>
          ))}
        </div>

        {overview.recent_actions.length === 0 ? (
          <div style={{ padding: "26px 24px", textAlign: "center", fontSize: 12, color: "var(--ey-gray-mid)" }}>
            Aucune action enregistrée pour ce compte.
          </div>
        ) : (
          overview.recent_actions.map((entry, i) => {
            const cfg = modCfg[entry.module] ?? FALLBACK_MODULE;
            const Icon = cfg.Icon;
            return (
              <div key={entry.id} style={{
                display: "flex", alignItems: "flex-start", gap: 11, padding: "12px 24px",
                borderBottom: i < overview.recent_actions.length - 1 ? "1px solid rgba(0,0,0,0.04)" : "none",
              }}>
                <div style={{ width: 28, height: 28, borderRadius: 7, backgroundColor: cfg.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon size={13} style={{ color: cfg.color }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500, color: EY.black, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={entry.action}>
                    {entry.action}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 3 }}>
                    <span style={{ fontSize: 10.5, color: "var(--ey-gray-mid)" }}>{entry.module}</span>
                    {entry.entity_label && (
                      <span style={{ fontSize: 10.5, color: "#C0C0C0" }}>· {entry.entity_label}</span>
                    )}
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: STATUS_COLORS[entry.status] ?? EY.mid }}>
                      · {entry.status}
                    </span>
                  </div>
                </div>
                <span style={{ fontSize: 10.5, color: "#C0C0C0", flexShrink: 0, marginTop: 2 }}>
                  {dateTime(entry.created_at)}
                </span>
              </div>
            );
          })
        )}
      </Section>
      </div>
    </>
  );

  return columns ? <div style={grid}>{content}</div> : content;
}
