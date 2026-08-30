import { useState } from "react";
import {
  Plus, Eye, Archive, Upload,
  RotateCcw, X, CheckCircle2, Clock, AlertTriangle,
  ChevronRight,
} from "lucide-react";
import { VersionDetail } from "./VersionDetail";

interface Version {
  id: string;
  number: string;
  name: string;
  status: "Publié" | "Brouillon" | "Archivé";
  questions: number;
  createdBy: string;
  createdAt: string;
  modifiedAt: string;
  changelog: string;
}

const allVersions: Version[] = [
  { id: "V1",  number: "v2.1", name: "Questionnaire Maturité Data — Edition 2026",        status: "Publié",   questions: 84, createdBy: "A. Dupont",  createdAt: "28/05/2026", modifiedAt: "01/06/2026", changelog: "Ajout de 6 nouvelles questions sur l'IA/ML. Refonte des questions RGPD. Mise à jour des seuils de scoring." },
  { id: "V2",  number: "v2.2", name: "Questionnaire Maturité Data — Edition 2026 Rev. B", status: "Brouillon", questions: 87, createdBy: "M. Bernard", createdAt: "05/06/2026", modifiedAt: "10/06/2026", changelog: "En cours : ajout dimension Cloud & IA. Révision pondérations." },
  { id: "V3",  number: "v2.0", name: "Questionnaire Maturité Data — Edition 2025",        status: "Archivé",  questions: 78, createdBy: "A. Dupont",  createdAt: "15/01/2026", modifiedAt: "28/05/2026", changelog: "Version initiale 2025. Archivée lors du passage à v2.1." },
  { id: "V4",  number: "v1.5", name: "Questionnaire Pilote — Banques Retail",             status: "Archivé",  questions: 52, createdBy: "L. Petit",   createdAt: "10/09/2025", modifiedAt: "15/01/2026", changelog: "Version pilote pour les banques de détail." },
  { id: "V5",  number: "v1.0", name: "Questionnaire Initial EY Data Maturity",            status: "Archivé",  questions: 40, createdBy: "A. Dupont",  createdAt: "01/06/2025", modifiedAt: "10/09/2025", changelog: "Version initiale proof of concept." },
  { id: "V6",  number: "v0.9", name: "Prototype Data Maturity Banking",                   status: "Archivé",  questions: 28, createdBy: "A. Dupont",  createdAt: "01/03/2025", modifiedAt: "01/06/2025", changelog: "Prototype interne avant première version officielle." },
  { id: "V7",  number: "v0.5", name: "Prototype Gouvernance Data",                        status: "Archivé",  questions: 18, createdBy: "A. Dupont",  createdAt: "01/01/2025", modifiedAt: "01/03/2025", changelog: "Première maquette du questionnaire de gouvernance." },
];

const PER_PAGE = 5;

// ── Shared button style ───────────────────────────────────────────────────────

function Btn({ label, icon, onClick, variant = "ghost" }: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  variant?: "primary" | "ghost" | "danger";
}) {
  const base: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 5,
    padding: "5px 12px", borderRadius: 5, fontSize: 12, fontWeight: 600,
    cursor: "pointer", border: "none", transition: "all 0.15s",
  };
  const styles = {
    primary: { backgroundColor: "#1A1A1A", color: "#FFE600" },
    ghost:   { backgroundColor: "#fff",    color: "#1A1A1A", border: "1px solid rgba(0,0,0,0.12)" } as React.CSSProperties,
    danger:  { backgroundColor: "#FFF5F5", color: "#CC0000", border: "1px solid #FFCDD2" } as React.CSSProperties,
  };
  return (
    <button style={{ ...base, ...styles[variant] }} onClick={onClick}
      onMouseEnter={e => {
        const b = e.currentTarget as HTMLButtonElement;
        if (variant === "primary") b.style.backgroundColor = "#2D2D2D";
        else if (variant === "ghost") { b.style.backgroundColor = "#1A1A1A"; b.style.color = "#FFE600"; }
        else { b.style.backgroundColor = "#FFEBEE"; }
      }}
      onMouseLeave={e => {
        const b = e.currentTarget as HTMLButtonElement;
        if (variant === "primary") b.style.backgroundColor = "#1A1A1A";
        else if (variant === "ghost") { b.style.backgroundColor = "#fff"; b.style.color = "#1A1A1A"; }
        else { b.style.backgroundColor = "#FFF5F5"; }
      }}
    >
      {icon} {label}
    </button>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: "Publié" | "Brouillon" | "Archivé" }) {
  const cfg = {
    "Publié":   { bg: "#E8F5E9", color: "#2E7D32", icon: <CheckCircle2 size={10} /> },
    "Brouillon":{ bg: "#FFF8E1", color: "#E65100", icon: <Clock        size={10} /> },
    "Archivé":  { bg: "#F5F5F5", color: "#6B6B6B", icon: <Archive      size={10} /> },
  };
  const c = cfg[status];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, backgroundColor: c.bg, color: c.color, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 600 }}>
      {c.icon} {status}
    </span>
  );
}

// ── New version modal ─────────────────────────────────────────────────────────

function NewVersionModal({ onClose }: { onClose: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, backgroundColor: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ backgroundColor: "#fff", borderRadius: 12, width: 500, maxWidth: "92vw", boxShadow: "0 24px 64px rgba(0,0,0,0.16)", overflow: "hidden" }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid rgba(0,0,0,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1A1A1A" }}>Créer une nouvelle version</div>
            <div style={{ fontSize: 12, color: "#9B9B9B", marginTop: 2 }}>La version sera créée en statut Brouillon</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9B9B" }}><X size={18} /></button>
        </div>
        <div style={{ padding: "22px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ padding: "10px 14px", backgroundColor: "#FFF8E1", border: "1px solid #FDE68A", borderRadius: 7, display: "flex", gap: 8 }}>
            <AlertTriangle size={14} style={{ color: "#D97706", flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 12, color: "#92400E" }}>La nouvelle version n'affectera pas le questionnaire publié actuel.</span>
          </div>
          {[
            { label: "Numéro de version *", placeholder: "ex. v2.3" },
            { label: "Nom de la version *",  placeholder: "ex. Questionnaire Maturité Data — Edition 2026 Rev. C" },
          ].map(f => (
            <div key={f.label}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#4A4A4A", marginBottom: 5 }}>{f.label}</label>
              <input placeholder={f.placeholder} style={{ width: "100%", padding: "8px 11px", borderRadius: 6, border: "1px solid rgba(0,0,0,0.13)", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            </div>
          ))}
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#4A4A4A", marginBottom: 5 }}>Basée sur</label>
            <select style={{ width: "100%", padding: "8px 11px", borderRadius: 6, border: "1px solid rgba(0,0,0,0.13)", fontSize: 13, outline: "none", backgroundColor: "#fff" }}>
              {allVersions.map(v => <option key={v.id}>{v.number} — {v.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#4A4A4A", marginBottom: 5 }}>Description des modifications</label>
            <textarea rows={2} placeholder="Décrivez les changements prévus…" style={{ width: "100%", padding: "8px 11px", borderRadius: 6, border: "1px solid rgba(0,0,0,0.13)", fontSize: 13, outline: "none", resize: "vertical", boxSizing: "border-box" }} />
          </div>
        </div>
        <div style={{ padding: "16px 24px", borderTop: "1px solid rgba(0,0,0,0.07)", display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} style={{ padding: "8px 18px", borderRadius: 6, fontSize: 13, fontWeight: 500, border: "1px solid rgba(0,0,0,0.12)", backgroundColor: "#fff", cursor: "pointer", color: "#4A4A4A" }}>Annuler</button>
          <button onClick={onClose} style={{ padding: "8px 20px", borderRadius: 6, fontSize: 13, fontWeight: 700, border: "none", backgroundColor: "#1A1A1A", color: "#FFE600", cursor: "pointer" }}
            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#2D2D2D"}
            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#1A1A1A"}
          >Créer la version</button>
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function QuestionnaireVersions() {
  const [showModal,    setShowModal]    = useState(false);
  const [page,         setPage]         = useState(1);
  const [published,    setPublished]    = useState("V1");
  const [detailVersion, setDetailVersion] = useState<Version | null>(null);
  const [statuses,     setStatuses]     = useState<Record<string, Version["status"]>>(
    Object.fromEntries(allVersions.map(v => [v.id, v.status]))
  );

  const totalPages = Math.max(1, Math.ceil(allVersions.length / PER_PAGE));
  const versions   = allVersions.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const publish  = (id: string) => { setStatuses(p => ({ ...p, [published]: "Archivé", [id]: "Publié" })); setPublished(id); };
  const archive  = (id: string) => { if (id === published) return; setStatuses(p => ({ ...p, [id]: "Archivé" })); };
  const restore  = (id: string) => setStatuses(p => ({ ...p, [id]: "Brouillon" }));

  const activeVersion = allVersions.find(v => v.id === published)!;

  if (detailVersion) {
    return (
      <VersionDetail
        versionId={detailVersion.id}
        versionNumber={detailVersion.number}
        versionName={detailVersion.name}
        onBack={() => setDetailVersion(null)}
      />
    );
  }

  return (
    <div style={{ padding: "28px 32px 40px", backgroundColor: "#F2F2F2", minHeight: "100%" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: "#1A1A1A", margin: 0, letterSpacing: "-0.02em" }}>Versions du questionnaire</h1>
          <p style={{ fontSize: 13, color: "#9B9B9B", margin: "4px 0 0" }}>
            {allVersions.length} versions · 1 publiée · {allVersions.filter(v => statuses[v.id] === "Brouillon").length} brouillon(s)
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => setShowModal(true)}
            style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 18px", borderRadius: 6, fontSize: 13, fontWeight: 700, border: "none", backgroundColor: "#1A1A1A", color: "#FFE600", cursor: "pointer", boxShadow: "0 4px 14px rgba(0,0,0,0.18)", transition: "all 0.15s" }}
            onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#2D2D2D"; b.style.transform = "translateY(-1px)"; }}
            onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#1A1A1A"; b.style.transform = "translateY(0)"; }}
          >
            <Plus size={14} /> Nouvelle version
          </button>
        </div>
      </div>

      {/* Active version banner */}
      <div style={{ backgroundColor: "#1A1A1A", borderRadius: 12, padding: "20px 26px", marginBottom: 18, display: "flex", alignItems: "center", gap: 20, boxShadow: "0 4px 16px rgba(0,0,0,0.15)" }}>
        <div style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: "#FFE600", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <CheckCircle2 size={22} style={{ color: "#1A1A1A" }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>Version actuellement publiée</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{activeVersion.number} — {activeVersion.name}</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 3 }}>{activeVersion.questions} questions · Publiée le {activeVersion.modifiedAt} par {activeVersion.createdBy}</div>
        </div>
        <button onClick={() => setDetailVersion(activeVersion)}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 6, fontSize: 12, fontWeight: 600, border: "1px solid rgba(255,255,255,0.2)", backgroundColor: "transparent", cursor: "pointer", color: "rgba(255,255,255,0.8)", transition: "all 0.15s" }}
          onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "rgba(255,255,255,0.1)"; }}
          onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "transparent"; }}
        >
          <Eye size={13} /> Consulter
        </button>
      </div>

      {/* Versions table */}
      <div style={{ backgroundColor: "#fff", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.05)", marginBottom: 14 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ backgroundColor: "#FAFAFA", borderBottom: "1px solid rgba(0,0,0,0.07)" }}>
              {["Version", "Nom & Changelog", "Statut", "Questions", "Créé par", "Créé le", "Modifié le", "Actions"].map(h => (
                <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#9B9B9B", letterSpacing: "0.07em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {versions.map((v, i) => {
              const st      = statuses[v.id] as Version["status"];
              const isActive = v.id === published;
              return (
                <tr key={v.id}
                  style={{ borderBottom: i < versions.length - 1 ? "1px solid rgba(0,0,0,0.05)" : "none", backgroundColor: isActive ? "#FAFFF9" : "transparent", transition: "background 0.1s" }}
                  onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLTableRowElement).style.backgroundColor = "#FAFAFA"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = isActive ? "#FAFFF9" : "transparent"; }}
                >
                  {/* Version number */}
                  <td style={{ padding: "12px 14px" }}>
                    <span style={{ display: "inline-block", backgroundColor: isActive ? "#1A1A1A" : st === "Brouillon" ? "#FFF3E0" : "#F5F5F5", color: isActive ? "#FFE600" : st === "Brouillon" ? "#E65100" : "#6B6B6B", borderRadius: 5, padding: "3px 10px", fontSize: 12, fontWeight: 700 }}>
                      {v.number}
                    </span>
                  </td>

                  {/* Name + changelog */}
                  <td style={{ padding: "12px 14px", maxWidth: 300 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#1A1A1A" }}>{v.name}</div>
                    <div style={{ fontSize: 11, color: "#9B9B9B", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.changelog}</div>
                  </td>

                  <td style={{ padding: "12px 14px" }}><StatusBadge status={st} /></td>
                  <td style={{ padding: "12px 14px", fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>{v.questions}</td>
                  <td style={{ padding: "12px 14px", fontSize: 12, color: "#9B9B9B" }}>{v.createdBy}</td>
                  <td style={{ padding: "12px 14px", fontSize: 12, color: "#9B9B9B", whiteSpace: "nowrap" }}>{v.createdAt}</td>
                  <td style={{ padding: "12px 14px", fontSize: 12, color: "#9B9B9B", whiteSpace: "nowrap" }}>{v.modifiedAt}</td>

                  {/* Actions */}
                  <td style={{ padding: "12px 14px" }}>
                    <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                      {st === "Brouillon" && (
                        <Btn label="Publier" icon={<Upload size={11} />} onClick={() => publish(v.id)} variant="primary" />
                      )}
                      {st === "Publié" && (
                        <Btn label="Archiver" icon={<Archive size={11} />} onClick={() => archive(v.id)} variant="ghost" />
                      )}
                      {st === "Archivé" && (
                        <Btn label="Restaurer" icon={<RotateCcw size={11} />} onClick={() => restore(v.id)} variant="ghost" />
                      )}
                      <button title="Consulter" onClick={() => setDetailVersion(v)}
                        style={{ width: 28, height: 28, borderRadius: 5, border: "1px solid rgba(0,0,0,0.10)", backgroundColor: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#4A4A4A", transition: "all 0.15s" }}
                        onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#1A1A1A"; b.style.color = "#FFE600"; }}
                        onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#fff"; b.style.color = "#4A4A4A"; }}
                      >
                        <Eye size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {allVersions.length > PER_PAGE && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", backgroundColor: "#fff", borderRadius: 9, border: "1px solid rgba(0,0,0,0.07)", padding: "12px 20px", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
          <span style={{ fontSize: 12, color: "#9B9B9B" }}>
            <strong style={{ color: "#1A1A1A" }}>{(page - 1) * PER_PAGE + 1}</strong>–<strong style={{ color: "#1A1A1A" }}>{Math.min(page * PER_PAGE, allVersions.length)}</strong> sur <strong style={{ color: "#1A1A1A" }}>{allVersions.length}</strong> versions
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              style={{ padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, border: "1px solid rgba(0,0,0,0.10)", backgroundColor: page === 1 ? "#F5F5F5" : "#fff", color: page === 1 ? "#C0C0C0" : "#1A1A1A", cursor: page === 1 ? "not-allowed" : "pointer" }}>
              ← Précédent
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button key={p} onClick={() => setPage(p)}
                style={{ width: 32, height: 32, borderRadius: 6, fontSize: 12, fontWeight: p === page ? 800 : 500, border: "1px solid rgba(0,0,0,0.10)", backgroundColor: p === page ? "#1A1A1A" : "#fff", color: p === page ? "#FFE600" : "#4A4A4A", cursor: "pointer" }}>
                {p}
              </button>
            ))}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              style={{ padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, border: "1px solid rgba(0,0,0,0.10)", backgroundColor: page === totalPages ? "#F5F5F5" : "#fff", color: page === totalPages ? "#C0C0C0" : "#1A1A1A", cursor: page === totalPages ? "not-allowed" : "pointer" }}>
              Suivant →
            </button>
          </div>
        </div>
      )}

      {showModal && <NewVersionModal onClose={() => setShowModal(false)} />}
    </div>
  );
}
