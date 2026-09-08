/**
 * Paramètres, ce que la plateforme sait réellement configurer.
 *
 * La page ne propose plus que des réglages ayant quelque chose derrière eux,
 * chacun avec sa propre source de vérité :
 *
 * - **Sécurité** est stockée par Keycloak sur le realm (durée de session,
 *   politique de mot de passe, action requise TOTP). Rien n'est recopié ici :
 *   une copie locale serait la version qui se désynchronise pendant que le
 *   realm continue de décider du comportement réel ;
 * - **Notifications** relèvent de l'application, donc de sa table
 *   `platform_settings`.
 *
 * Ont été retirés les réglages sans implémentation possible côté application :
 * restriction par IP (relève du reverse proxy, pas de Keycloak), bascule de
 * journalisation (le journal d'audit est inconditionnel, et un journal qu'on
 * peut éteindre n'est plus une preuve), versions multiples simultanées
 * (contredit l'index unique partiel sur `is_active`), exports par format et
 * anonymisation, rapport hebdomadaire (aucun ordonnanceur) et branding.
 */

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Shield, Bell, Save, Loader2, AlertTriangle,
  ChevronRight, UserRound, type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  getSettings,
  updateSettings,
  type NotificationSettings,
  type PlatformSettings,
  type SecuritySettings,
} from "@/lib/adminSettings";
import { AdminLoader } from "@/components/AdminLoader";
import { AccountSection } from "./AdminAccount";
import { Section, SettingRow, Toggle, numInput } from "./settingsUi";

type SettingsSection = "security" | "notifications" | "profile";

interface SectionTab {
  id: SettingsSection;
  label: string;
  icon: LucideIcon;
}

const tabs: SectionTab[] = [
  { id: "profile",       label: "Mon compte",    icon: UserRound },
  { id: "security",      label: "Sécurité",      icon: Shield },
  { id: "notifications", label: "Notifications", icon: Bell },
];

const TAB_IDS: SettingsSection[] = ["profile", "security", "notifications"];
// Premier onglet de la liste, donc celui qui s'ouvre sans paramètre d'URL.
const DEFAULT_TAB: SettingsSection = TAB_IDS[0];

export function Settings() {
  // L'onglet vit dans l'URL : le menu compte du bandeau peut pointer
  // directement sur une section, et un rechargement ne la perd pas.
  const [params, setParams] = useSearchParams();
  const requested = params.get("tab") as SettingsSection | null;
  const activeTab: SettingsSection =
    requested && TAB_IDS.includes(requested) ? requested : DEFAULT_TAB;
  const setActiveTab = (tab: SettingsSection) =>
    setParams(tab === DEFAULT_TAB ? {} : { tab }, { replace: true });

  const [loaded, setLoaded] = useState<PlatformSettings | null>(null);
  const [security, setSecurity] = useState<SecuritySettings | null>(null);
  const [notifications, setNotifications] = useState<NotificationSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const apply = (data: PlatformSettings) => {
    setLoaded(data);
    setSecurity(data.security);
    setNotifications(data.notifications);
  };

  useEffect(() => {
    let cancelled = false;
    getSettings()
      .then(data => { if (!cancelled) { apply(data); setError(null); } })
      .catch(() => { if (!cancelled) setError("Impossible de charger les paramètres."); });
    return () => { cancelled = true; };
  }, []);

  const dirty = useMemo(() => {
    if (!loaded || !security || !notifications) return false;
    return (
      JSON.stringify(security) !== JSON.stringify(loaded.security) ||
      JSON.stringify(notifications) !== JSON.stringify(loaded.notifications)
    );
  }, [loaded, security, notifications]);

  async function handleSave() {
    if (!security || !notifications) return;
    setSaving(true);
    try {
      // Seules les sections réellement modifiées sont envoyées : écrire le
      // realm Keycloak pour rien est un aller-retour inutile.
      const payload = {
        ...(JSON.stringify(security) !== JSON.stringify(loaded?.security) ? { security } : {}),
        ...(JSON.stringify(notifications) !== JSON.stringify(loaded?.notifications) ? { notifications } : {}),
      };
      apply(await updateSettings(payload));
      toast.success("Paramètres enregistrés");
    } catch (err) {
      toast.error("Enregistrement impossible", {
        description: err instanceof Error ? err.message : "Veuillez réessayer.",
      });
    } finally {
      setSaving(false);
    }
  }

  if (error) {
    return (
      <div style={{ padding: 32 }}>
        <div style={{ backgroundColor: "#FFEBEE", color: "#CC0000", borderRadius: 10, padding: "14px 18px", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 10 }}>
          <AlertTriangle size={16} /> {error}
        </div>
      </div>
    );
  }

  if (!loaded || !security || !notifications) {
    return (
      <AdminLoader label="Chargement des paramètres…" />
    );
  }

  const notificationsOn = notifications.notify_on_assessment || notifications.notify_on_new_user;

  return (
    <div style={{ padding: 32 }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--ey-black)", margin: 0, letterSpacing: "-0.02em" }}>Paramètres</h2>
        <p style={{ fontSize: 13, color: "var(--ey-gray-mid)", margin: "4px 0 0" }}>Configuration générale de la plateforme EY DataMaturity</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 20 }}>
        {/* Tabs sidebar */}
        <div style={{ backgroundColor: "var(--ey-white)", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 6, overflow: "hidden", height: "fit-content" }}>
          {tabs.map((tab, i) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                padding: "12px 16px", textAlign: "left",
                border: "none", cursor: "pointer",
                backgroundColor: active ? "var(--ey-black)" : "transparent",
                color: active ? "white" : "var(--ey-gray-dark)",
                borderBottom: i < tabs.length - 1 ? "1px solid rgba(0,0,0,0.05)" : "none",
                fontSize: 13, fontWeight: active ? 600 : 400,
              }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--ey-gray-bg)"; }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
              >
                <Icon size={15} />
                {tab.label}
                {active && <ChevronRight size={13} style={{ marginLeft: "auto", opacity: 0.5 }} />}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div>
          {activeTab === "security" && (
            <Section
              title="Authentification & Accès"
              subtitle="Ces trois réglages sont appliqués par Keycloak sur l'ensemble du realm."
            >
              <SettingRow
                label="Authentification à deux facteurs (2FA)"
                description="Chaque compte devra configurer un second facteur à sa prochaine connexion. Le réglage est global : Keycloak ne sait pas l'imposer à un seul rôle."
              >
                <Toggle
                  enabled={security.two_factor_required}
                  onChange={() => setSecurity({ ...security, two_factor_required: !security.two_factor_required })}
                />
              </SettingRow>

              <SettingRow label="Délai d'expiration de session" description="Déconnexion automatique après cette durée d'inactivité.">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="number" min={1} max={10080}
                    value={security.session_idle_minutes}
                    onChange={e => setSecurity({ ...security, session_idle_minutes: Number(e.target.value) })}
                    style={numInput}
                  />
                  <span style={{ fontSize: 12, color: "var(--ey-gray-mid)" }}>minutes</span>
                </div>
              </SettingRow>

              <SettingRow
                label="Expiration des mots de passe"
                description="Renouvellement forcé après N jours. Vide = aucune règle d'expiration."
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="number" min={1} max={3650} placeholder="-"
                    value={security.password_expiry_days ?? ""}
                    onChange={e => setSecurity({
                      ...security,
                      password_expiry_days: e.target.value === "" ? null : Number(e.target.value),
                    })}
                    style={numInput}
                  />
                  <span style={{ fontSize: 12, color: "var(--ey-gray-mid)" }}>jours</span>
                </div>
              </SettingRow>
            </Section>
          )}

          {activeTab === "notifications" && (
            <Section
              title="Notifications administratives"
              subtitle="Emails envoyés après coup, et jamais à la personne qui vient d'agir. Un échec d'envoi n'interrompt pas l'action concernée."
            >
              {!loaded.smtp_configured && (
                <div style={{ display: "flex", gap: 9, margin: "12px 0 4px", padding: "11px 13px", backgroundColor: "#FFEBEE", border: "1px solid #F5C6C6", borderRadius: 5 }}>
                  <AlertTriangle size={13} style={{ color: "#CC0000", flexShrink: 0, marginTop: 1 }} />
                  <div style={{ fontSize: 11.5, color: "#CC0000", lineHeight: 1.5 }}>
                    SMTP n'est pas configuré côté serveur (<code>SMTP_USER</code> / <code>SMTP_PASSWORD</code>).
                    Les notifications activées ici ne partiront pas.
                  </div>
                </div>
              )}

              <SettingRow
                label="Adresse de réception"
                description="Sans adresse, aucune notification n'est envoyée."
              >
                <input
                  type="email"
                  placeholder="admin@exemple.com"
                  value={notifications.notify_email ?? ""}
                  onChange={e => setNotifications({ ...notifications, notify_email: e.target.value || null })}
                  style={{ width: 240, padding: "7px 12px", borderRadius: 4, border: "1px solid rgba(0,0,0,0.15)", fontSize: 13, outline: "none" }}
                />
              </SettingRow>

              <SettingRow
                label="Soumission d'une évaluation"
                description="Email dès qu'une banque soumet une évaluation, la seule action de la plateforme qu'un administrateur ne déclenche jamais lui-même."
              >
                <Toggle
                  enabled={notifications.notify_on_assessment}
                  onChange={() => setNotifications({ ...notifications, notify_on_assessment: !notifications.notify_on_assessment })}
                />
              </SettingRow>

              <SettingRow
                label="Création d'un compte"
                description="Email à chaque compte créé depuis le back-office, y compris par un admin. Les comptes que vous créez vous-même ne déclenchent rien."
              >
                <Toggle
                  enabled={notifications.notify_on_new_user}
                  onChange={() => setNotifications({ ...notifications, notify_on_new_user: !notifications.notify_on_new_user })}
                />
              </SettingRow>

              {notificationsOn && !notifications.notify_email && (
                <div style={{ display: "flex", gap: 9, marginTop: 14, padding: "11px 13px", backgroundColor: "#FFF8E1", border: "1px solid #F5DFA0", borderRadius: 5 }}>
                  <AlertTriangle size={13} style={{ color: "#8A5300", flexShrink: 0, marginTop: 1 }} />
                  <div style={{ fontSize: 11.5, color: "#8A5300", lineHeight: 1.5 }}>
                    Renseignez une adresse de réception : l'enregistrement sera refusé sans elle.
                  </div>
                </div>
              )}
            </Section>
          )}

          {activeTab === "profile" && <AccountSection />}

          {activeTab !== "profile" && (
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, alignItems: "center" }}>
              {dirty && (
                <span style={{ fontSize: 11.5, color: "var(--ey-gray-mid)", marginRight: "auto" }}>
                  Modifications non enregistrées
                </span>
              )}
              <button
                onClick={() => apply(loaded)}
                disabled={!dirty || saving}
                style={{
                  padding: "9px 20px", borderRadius: 4, fontSize: 13, fontWeight: 500,
                  border: "1px solid rgba(0,0,0,0.15)", backgroundColor: "white",
                  cursor: dirty && !saving ? "pointer" : "not-allowed",
                  color: "var(--ey-gray-dark)", opacity: dirty && !saving ? 1 : 0.5,
                }}
              >
                Annuler les modifications
              </button>
              <button
                onClick={handleSave}
                disabled={!dirty || saving}
                style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "9px 20px",
                  borderRadius: 4, fontSize: 13, fontWeight: 600, border: "none",
                  backgroundColor: dirty && !saving ? "var(--ey-black)" : "#E8E8E8",
                  color: dirty && !saving ? "#FFE600" : "#9B9B9B",
                  cursor: dirty && !saving ? "pointer" : "not-allowed",
                }}
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Enregistrer les paramètres
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
