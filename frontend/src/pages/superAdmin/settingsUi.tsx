/**
 * Briques d'interface communes à la page Paramètres et à ses sections.
 *
 * Extraites dans leur propre module plutôt que laissées dans `AdminSettings` :
 * la section « Mon compte » les utilise aussi, et l'importer depuis la page qui
 * l'importe elle-même créerait un cycle.
 */

export const inp: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 4,
  border: "1px solid rgba(0,0,0,0.15)", fontSize: 13, outline: "none",
  boxSizing: "border-box", color: "var(--ey-black)", backgroundColor: "#fff",
};

export const numInput: React.CSSProperties = {
  width: 74, padding: "6px 10px", borderRadius: 4,
  border: "1px solid rgba(0,0,0,0.15)", fontSize: 13, textAlign: "center", outline: "none",
};

export function Toggle({ enabled, onChange, disabled }: { enabled: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      style={{
        width: 40, height: 22, borderRadius: 11, border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        backgroundColor: enabled ? "var(--ey-black)" : "#D0D0D0",
        position: "relative", transition: "background 0.2s", flexShrink: 0,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span style={{
        position: "absolute", top: 3, left: enabled ? 20 : 3,
        width: 16, height: 16, borderRadius: "50%", backgroundColor: "white",
        transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
      }} />
    </button>
  );
}

export function SettingRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
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

export function Section({ title, subtitle, children, noPadding, style }: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /** Pour une section dont le contenu gère lui-même ses marges (listes, tableaux). */
  noPadding?: boolean;
  /** Surcharge du conteneur — sert à annuler `marginBottom` quand c'est une
   *  grille parente qui gère déjà l'espacement. */
  style?: React.CSSProperties;
}) {
  return (
    <div style={{
      backgroundColor: "var(--ey-white)", border: "1px solid rgba(0,0,0,0.07)",
      borderRadius: 6, marginBottom: 18, overflow: "hidden",
      ...style,
    }}>
      <div style={{
        padding: noPadding ? "20px 24px 14px" : "20px 24px 0",
        marginBottom: noPadding ? 0 : 4,
      }}>
        <div style={{ paddingBottom: 14, borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ey-black)" }}>{title}</div>
          {subtitle && <div style={{ fontSize: 11.5, color: "var(--ey-gray-mid)", marginTop: 3 }}>{subtitle}</div>}
        </div>
      </div>
      <div style={{ padding: noPadding ? 0 : "0 24px 20px" }}>{children}</div>
    </div>
  );
}
