import { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";
import type { LucideIcon } from "lucide-react";

// ── Confirm dialog ───────────────────────────────────────────────────────────
// Styled replacement for window.confirm(): the browser's native dialog can't
// be themed and looks out of place next to the rest of the app. Visual
// language matches the delete dialogs already used in Veille réglementaire /
// Recommendations (white card, colored icon circle, Annuler + filled action
// button). Rendered via the useConfirm() hook (see ../hooks/useConfirm) --
// this file only holds the presentational piece so Fast Refresh can treat it
// as an ordinary component module.

export type ConfirmVariant = "danger" | "warning";

export interface ConfirmOptions {
  title: string;
  /** Supports blank lines (rendered as paragraph breaks), like the messages window.confirm() used to take. */
  description?: string;
  /** "danger" (red) for irreversible data loss, "warning" (amber) for anything reversible or lower-stakes. Defaults to "warning". */
  variant?: ConfirmVariant;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Overrides the default AlertTriangle icon in the header circle. */
  icon?: LucideIcon;
}

export interface PendingConfirm {
  title: string;
  description: string;
  variant: ConfirmVariant;
  confirmLabel: string;
  cancelLabel: string;
  icon?: LucideIcon;
  resolve: (value: boolean) => void;
}

const VARIANT_STYLES: Record<ConfirmVariant, {
  iconBg: string; iconColor: string;
  confirmBg: string; confirmHoverBg: string; confirmColor: string;
}> = {
  danger: { iconBg: "#FFEBEE", iconColor: "#CC0000", confirmBg: "#CC0000", confirmHoverBg: "#A30000", confirmColor: "#fff" },
  warning: { iconBg: "#FFF8E1", iconColor: "#9A7300", confirmBg: "#1A1A1A", confirmHoverBg: "#2D2D2D", confirmColor: "#FFE600" },
};

export function ConfirmDialogView({ pending, onCancel, onConfirm }: {
  pending: PendingConfirm;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const styles = VARIANT_STYLES[pending.variant];
  const Icon = pending.icon ?? AlertTriangle;
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { confirmRef.current?.focus(); }, []);

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 3000, backgroundColor: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={onCancel}
    >
      <style>{`@keyframes confirm-dialog-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        style={{ backgroundColor: "#fff", borderRadius: 16, width: 440, maxWidth: "94vw", overflow: "hidden", boxShadow: "0 32px 80px rgba(0,0,0,0.22)", animation: "confirm-dialog-in 0.18s ease-out" }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ padding: "28px 26px 20px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
          <div style={{ width: 52, height: 52, borderRadius: "50%", backgroundColor: styles.iconBg, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16, flexShrink: 0 }}>
            <Icon size={24} style={{ color: styles.iconColor }} />
          </div>
          <div id="confirm-dialog-title" style={{ fontSize: 16, fontWeight: 700, color: "#1A1A1A", marginBottom: pending.description ? 8 : 0 }}>
            {pending.title}
          </div>
          {pending.description && (
            <div style={{ fontSize: 13, color: "#6B6B6B", lineHeight: 1.55, whiteSpace: "pre-line" }}>
              {pending.description}
            </div>
          )}
        </div>
        <div style={{ padding: "16px 26px 24px", display: "flex", gap: 10 }}>
          <button
            onClick={onCancel}
            style={{ flex: 1, padding: "10px 0", borderRadius: 8, fontSize: 13, fontWeight: 600, border: "1px solid rgba(0,0,0,0.13)", backgroundColor: "#fff", color: "#4A4A4A", cursor: "pointer", transition: "background 0.15s" }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#F7F7F7")}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = "#fff")}
          >
            {pending.cancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            style={{ flex: 1, padding: "10px 0", borderRadius: 8, fontSize: 13, fontWeight: 700, border: "none", backgroundColor: styles.confirmBg, color: styles.confirmColor, cursor: "pointer", transition: "background 0.15s" }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = styles.confirmHoverBg)}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = styles.confirmBg)}
          >
            {pending.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
