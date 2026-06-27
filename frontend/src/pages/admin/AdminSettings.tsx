import { useState } from "react";
import { Shield, Users, FileQuestion, Download, Bell, Palette, ChevronRight, Save, ToggleLeft } from "lucide-react";

type SettingsSection = "security" | "roles" | "questionnaire" | "export" | "notifications" | "branding";

interface SectionTab {
  id: SettingsSection;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
}

const tabs: SectionTab[] = [
  { id: "security", label: "Sécurité", icon: Shield },
  { id: "roles", label: "Rôles & permissions", icon: Users },
  { id: "questionnaire", label: "Questionnaire actif", icon: FileQuestion },
  { id: "export", label: "Export", icon: Download },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "branding", label: "Branding", icon: Palette },
];

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: () => void }) {
  return (
    <button onClick={onChange} style={{
      width: 40, height: 22, borderRadius: 11, border: "none", cursor: "pointer",
      backgroundColor: enabled ? "var(--ey-black)" : "#D0D0D0",
      position: "relative", transition: "background 0.2s", flexShrink: 0
    }}>
      <span style={{
        position: "absolute", top: 3, left: enabled ? 20 : 3,
        width: 16, height: 16, borderRadius: "50%", backgroundColor: "white",
        transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)"
      }} />
    </button>
  );
}

function SettingRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "16px 0", borderBottom: "1px solid rgba(0,0,0,0.05)", gap: 20 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ey-black)" }}>{label}</div>
        {description && <div style={{ fontSize: 12, color: "var(--ey-gray-mid)", marginTop: 3 }}>{description}</div>}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ backgroundColor: "var(--ey-white)", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 6, padding: "20px 24px", marginBottom: 18 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ey-black)", marginBottom: 4, paddingBottom: 14, borderBottom: "1px solid rgba(0,0,0,0.06)" }}>{title}</div>
      {children}
    </div>
  );
}

export function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsSection>("security");
  const [settings, setSettings] = useState({
    twoFactor: true,
    sessionTimeout: "60",
    passwordExpiry: "90",
    ipWhitelist: false,
    auditLogs: true,
    autoLogout: true,
    defaultVersionActive: "v2.1",
    allowMultipleVersions: false,
    exportPDF: true,
    exportExcel: true,
    exportCSV: true,
    exportAnonymized: true,
    notifyOnPublish: true,
    notifyOnNewUser: true,
    notifyOnError: true,
    notifyWeeklyReport: false,
    notifyEmail: "admin@ey.com",
    brandName: "EY DataMaturity",
    brandTagline: "Back Office Administration",
  });

  const toggle = (key: keyof typeof settings) => setSettings(p => ({ ...p, [key]: !p[key] }));

  const permissions = [
    { role: "Admin EY", permissions: ["Lecture", "Écriture", "Suppression", "Publication", "Administration"] },
    { role: "Consultant EY", permissions: ["Lecture", "Écriture"] },
    { role: "Répondant Banque", permissions: ["Lecture"] },
    { role: "Validateur Banque", permissions: ["Lecture", "Validation"] },
  ];

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
            <>
              <Section title="Authentification & Accès">
                <SettingRow label="Authentification à deux facteurs (2FA)" description="Exiger un second facteur pour tous les comptes Admin et Consultant EY">
                  <Toggle enabled={settings.twoFactor} onChange={() => toggle("twoFactor")} />
                </SettingRow>
                <SettingRow label="Délai d'expiration de session" description="Déconnexion automatique après inactivité">
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input value={settings.sessionTimeout} onChange={e => setSettings(p => ({ ...p, sessionTimeout: e.target.value }))} style={{ width: 70, padding: "6px 10px", borderRadius: 4, border: "1px solid rgba(0,0,0,0.15)", fontSize: 13, textAlign: "center", outline: "none" }} />
                    <span style={{ fontSize: 12, color: "var(--ey-gray-mid)" }}>minutes</span>
                  </div>
                </SettingRow>
                <SettingRow label="Expiration des mots de passe" description="Forcer le renouvellement du mot de passe après N jours">
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input value={settings.passwordExpiry} onChange={e => setSettings(p => ({ ...p, passwordExpiry: e.target.value }))} style={{ width: 70, padding: "6px 10px", borderRadius: 4, border: "1px solid rgba(0,0,0,0.15)", fontSize: 13, textAlign: "center", outline: "none" }} />
                    <span style={{ fontSize: 12, color: "var(--ey-gray-mid)" }}>jours</span>
                  </div>
                </SettingRow>
                <SettingRow label="Restriction par adresse IP" description="Limiter l'accès admin à des plages IP autorisées">
                  <Toggle enabled={settings.ipWhitelist} onChange={() => toggle("ipWhitelist")} />
                </SettingRow>
                <SettingRow label="Journalisation des actions (audit logs)" description="Enregistrer toutes les actions administratives">
                  <Toggle enabled={settings.auditLogs} onChange={() => toggle("auditLogs")} />
                </SettingRow>
              </Section>
            </>
          )}

          {activeTab === "roles" && (
            <Section title="Rôles & Permissions">
              <div style={{ marginTop: 8 }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ backgroundColor: "var(--ey-gray-bg)" }}>
                      <th style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "var(--ey-gray-mid)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Rôle</th>
                      {["Lecture", "Écriture", "Suppression", "Publication", "Validation", "Administration"].map(p => (
                        <th key={p} style={{ padding: "10px 14px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "var(--ey-gray-mid)", letterSpacing: "0.05em", textTransform: "uppercase" }}>{p}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {permissions.map((r, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
                        <td style={{ padding: "12px 14px", fontSize: 13, fontWeight: 600, color: "var(--ey-black)" }}>{r.role}</td>
                        {["Lecture", "Écriture", "Suppression", "Publication", "Validation", "Administration"].map(p => (
                          <td key={p} style={{ padding: "12px 14px", textAlign: "center" }}>
                            {r.permissions.includes(p)
                              ? <span style={{ fontSize: 16, color: "#2E7D32" }}>✓</span>
                              : <span style={{ fontSize: 14, color: "#D0D0D0" }}>—</span>
                            }
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ marginTop: 16, padding: "12px 14px", backgroundColor: "var(--ey-gray-bg)", borderRadius: 4, fontSize: 12, color: "var(--ey-gray-mid)" }}>
                  Les permissions Admin EY ne sont pas modifiables. Les rôles Consultant, Répondant et Validateur peuvent être personnalisés.
                </div>
              </div>
            </Section>
          )}

          {activeTab === "questionnaire" && (
            <Section title="Questionnaire actif">
              <SettingRow label="Version du questionnaire actif" description="Version actuellement présentée aux utilisateurs Front Office">
                <select value={settings.defaultVersionActive} onChange={e => setSettings(p => ({ ...p, defaultVersionActive: e.target.value }))} style={{ padding: "7px 30px 7px 12px", borderRadius: 4, fontSize: 13, border: "1px solid rgba(0,0,0,0.15)", backgroundColor: "white", outline: "none", appearance: "none" }}>
                  <option>v2.1</option><option>v2.2 (Brouillon)</option>
                </select>
              </SettingRow>
              <SettingRow label="Plusieurs versions actives simultanément" description="Permettre à différentes banques d'utiliser des versions différentes">
                <Toggle enabled={settings.allowMultipleVersions} onChange={() => toggle("allowMultipleVersions")} />
              </SettingRow>
              <SettingRow label="Visibilité publique du questionnaire" description="Les utilisateurs Front Office peuvent consulter le questionnaire sans être connectés">
                <Toggle enabled={false} onChange={() => {}} />
              </SettingRow>
            </Section>
          )}

          {activeTab === "export" && (
            <Section title="Paramètres d'export">
              <SettingRow label="Export au format PDF" description="Permettre l'export des résultats en PDF"><Toggle enabled={settings.exportPDF} onChange={() => toggle("exportPDF")} /></SettingRow>
              <SettingRow label="Export au format Excel / XLSX" description="Permettre l'export des données brutes en Excel"><Toggle enabled={settings.exportExcel} onChange={() => toggle("exportExcel")} /></SettingRow>
              <SettingRow label="Export au format CSV" description="Permettre l'export des données au format CSV"><Toggle enabled={settings.exportCSV} onChange={() => toggle("exportCSV")} /></SettingRow>
              <SettingRow label="Anonymisation des exports" description="Supprimer les données personnelles des exports destinés aux tiers"><Toggle enabled={settings.exportAnonymized} onChange={() => toggle("exportAnonymized")} /></SettingRow>
            </Section>
          )}

          {activeTab === "notifications" && (
            <Section title="Paramètres de notification">
              <SettingRow label="Email de réception des notifications admin" description="Adresse pour les alertes système et récapitulatifs">
                <input value={settings.notifyEmail} onChange={e => setSettings(p => ({ ...p, notifyEmail: e.target.value }))} style={{ width: 240, padding: "7px 12px", borderRadius: 4, border: "1px solid rgba(0,0,0,0.15)", fontSize: 13, outline: "none" }} />
              </SettingRow>
              <SettingRow label="Notification lors d'une publication" description="Email envoyé à l'admin lors de chaque publication de questionnaire"><Toggle enabled={settings.notifyOnPublish} onChange={() => toggle("notifyOnPublish")} /></SettingRow>
              <SettingRow label="Notification lors d'un nouvel utilisateur" description="Email envoyé à l'admin lors de chaque création de compte"><Toggle enabled={settings.notifyOnNewUser} onChange={() => toggle("notifyOnNewUser")} /></SettingRow>
              <SettingRow label="Alerte en cas d'erreur système" description="Email immédiat en cas d'erreur critique"><Toggle enabled={settings.notifyOnError} onChange={() => toggle("notifyOnError")} /></SettingRow>
              <SettingRow label="Rapport hebdomadaire automatique" description="Envoi d'un récapitulatif chaque lundi matin"><Toggle enabled={settings.notifyWeeklyReport} onChange={() => toggle("notifyWeeklyReport")} /></SettingRow>
            </Section>
          )}

          {activeTab === "branding" && (
            <Section title="Branding de la plateforme">
              <SettingRow label="Nom de la plateforme" description="Nom affiché dans la topbar et les emails">
                <input value={settings.brandName} onChange={e => setSettings(p => ({ ...p, brandName: e.target.value }))} style={{ width: 220, padding: "7px 12px", borderRadius: 4, border: "1px solid rgba(0,0,0,0.15)", fontSize: 13, outline: "none" }} />
              </SettingRow>
              <SettingRow label="Sous-titre / Tagline" description="Texte affiché sous le nom dans la sidebar">
                <input value={settings.brandTagline} onChange={e => setSettings(p => ({ ...p, brandTagline: e.target.value }))} style={{ width: 220, padding: "7px 12px", borderRadius: 4, border: "1px solid rgba(0,0,0,0.15)", fontSize: 13, outline: "none" }} />
              </SettingRow>
              <SettingRow label="Couleur d'accent principale" description="Couleur utilisée pour les actions primaires et les accents visuels">
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input type="color" defaultValue="#FFE600" style={{ width: 38, height: 32, borderRadius: 4, border: "1px solid rgba(0,0,0,0.15)", cursor: "pointer", padding: 3 }} />
                  <span style={{ fontSize: 12, color: "var(--ey-gray-mid)", fontFamily: "monospace" }}>#FFE600</span>
                </div>
              </SettingRow>
              <SettingRow label="Logo de la plateforme" description="Fichier PNG/SVG, recommandé 48×48px">
                <button style={{ padding: "7px 14px", borderRadius: 4, border: "1px solid rgba(0,0,0,0.15)", backgroundColor: "white", cursor: "pointer", fontSize: 12, color: "var(--ey-gray-dark)" }}>
                  Importer un logo
                </button>
              </SettingRow>
            </Section>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button style={{ padding: "9px 20px", borderRadius: 4, fontSize: 13, fontWeight: 500, border: "1px solid rgba(0,0,0,0.15)", backgroundColor: "white", cursor: "pointer", color: "var(--ey-gray-dark)" }}>Annuler les modifications</button>
            <button style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 20px", borderRadius: 4, fontSize: 13, fontWeight: 600, border: "none", backgroundColor: "var(--ey-black)", color: "white", cursor: "pointer" }}>
              <Save size={14} /> Enregistrer les paramètres
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
