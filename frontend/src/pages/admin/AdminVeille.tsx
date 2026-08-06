import { useEffect, useRef, useState } from "react";
import {
  Upload, FileText, ChevronRight, Check, Edit2, XCircle,
  BookOpen, ExternalLink, RefreshCw, CheckCircle2,
  Sparkles, X, ShieldCheck, Clock, ArrowUpRight, Loader2, AlertTriangle, Scale, ListPlus, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  regulatoryApi,
  type Circular, type CircularDetail, type Impact, type ImpactAction,
} from "../../lib/regulatory";

function formatDate(iso: string | null): string {
  if (!iso) return "Date non détectée";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

// ── Shared ────────────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  backgroundColor: "#fff",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.07)",
  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
};

function StatutBadge({ statut }: { statut: string }) {
  const active = statut === "En vigueur";
  const draft = statut === "Brouillon";
  const color = active ? "#2E7D32" : draft ? "#E65100" : "#9B9B9B";
  const bg = active ? "#E8F5E9" : draft ? "#FFF3E0" : "#F5F5F5";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, backgroundColor: bg, color, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 600 }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: color }} />
      {statut}
    </span>
  );
}

const IMPACT_LABEL: Record<string, string> = {
  "question:ajouter": "Nouvelle question",
  "question:modifier": "Question à modifier",
  "question:desactiver": "Question à rendre obsolète",
  "recommandation:ajouter": "Nouvelle recommandation",
  "recommandation:modifier": "Recommandation à modifier",
  "recommandation:desactiver": "Recommandation à rendre obsolète",
  "recommandation:activer_flag": "Activation indicateur réglementaire",
};

const IMPACT_COLOR: Record<string, { bg: string; color: string }> = {
  "question:ajouter":                  { bg: "#EEF2FF", color: "#3730A3" },
  "question:modifier":                 { bg: "#EEF2FF", color: "#3730A3" },
  "question:desactiver":               { bg: "#FFEBEE", color: "#B91C1C" },
  "recommandation:ajouter":            { bg: "#F0FDF4", color: "#166534" },
  "recommandation:modifier":           { bg: "#FFF7ED", color: "#9A3412" },
  "recommandation:desactiver":         { bg: "#FFEBEE", color: "#B91C1C" },
  "recommandation:activer_flag":       { bg: "#FDF4FF", color: "#6B21A8" },
};

function impactKey(impact: Impact): string {
  return `${impact.entityType}:${impact.proposedAction}`;
}

function TypeBadge({ impact }: { impact: Impact }) {
  const key = impactKey(impact);
  const c = IMPACT_COLOR[key] ?? { bg: "#F5F5F5", color: "#6B6B6B" };
  return <span style={{ backgroundColor: c.bg, color: c.color, borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>{IMPACT_LABEL[key] ?? key}</span>;
}

function EffortDots({ effort }: { effort: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }} title={`Effort estimé : ${effort}/3`}>
      {[1, 2, 3].map(n => (
        <span key={n} style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: n <= effort ? "#6B6B6B" : "#E0E0E0" }} />
      ))}
    </span>
  );
}

function WeightRecalcNote({ impact }: { impact: Impact }) {
  const w = impact.proposedData.weight_recalc;
  if (!w) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 10px", backgroundColor: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 6, fontSize: 11, color: "#92400E" }}>
      <Scale size={12} style={{ flexShrink: 0 }} />
      <span>
        Recalcul du poids intra-dimension ({w.dimension}) : {w.questions_actives_avant} → {w.questions_actives_apres} question{w.questions_actives_apres !== 1 ? "s" : ""} actives,
        {" "}poids {w.poids_avant != null ? `${w.poids_avant} → ` : ""}{w.poids_apres}.
      </span>
    </div>
  );
}

function AssociatedRecommendations({ impact }: { impact: Impact }) {
  const list = impact.proposedData.associated_recommendations;
  if (!list || list.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#4A4A4A", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        Recommandations par palier ({list.length})
      </div>
      {list.map((r, i) => (
        <div key={i} style={{ padding: "8px 10px", backgroundColor: "#F7F7F7", borderRadius: 6, border: r.is_placeholder ? "1px dashed rgba(0,0,0,0.15)" : "1px solid rgba(0,0,0,0.08)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#6B6B6B" }}>Palier {r.trigger_level} → {r.trigger_level + 1}</span>
            {r.is_placeholder && <span style={{ fontSize: 9, fontWeight: 700, color: "#9A5B00", backgroundColor: "#FFF3E0", padding: "1px 6px", borderRadius: 3 }}>À rédiger</span>}
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#1A1A1A" }}>{r.title}</div>
          {r.recommendation_text && <p style={{ fontSize: 11, color: "#6B6B6B", margin: "3px 0 0" }}>{r.recommendation_text}</p>}
        </div>
      ))}
    </div>
  );
}

/** Reference box for an EXISTING catalog element (question or
 * recommandation) that a proposal targets by code -- always shows what
 * the code actually IS (title, and dimension/category context), never
 * just the bare code alone. Falls back to the bare code if the backend
 * couldn't resolve it (referential changed since the analysis ran). */
function CatalogRefBox({ kind, code, title, subtitle, text }: {
  kind: "question" | "recommandation";
  code?: string;
  title?: string;
  subtitle?: string;
  text?: string;
}) {
  if (!title) {
    return code ? (
      <span style={{ fontSize: 11, fontWeight: 700, color: "#6B6B6B", backgroundColor: "#F5F5F5", padding: "2px 8px", borderRadius: 4, alignSelf: "flex-start" }}>{code}</span>
    ) : null;
  }
  const c = kind === "question" ? { bg: "#EEF2FF", border: "#C7D2FE", text: "#3730A3" } : { bg: "#FFF7ED", border: "#FED7AA", text: "#9A3412" };
  return (
    <div style={{ padding: "9px 11px", backgroundColor: c.bg, border: `1px solid ${c.border}`, borderRadius: 7 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: c.text, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          {kind === "question" ? "Question existante" : "Recommandation existante"}
        </span>
        {code && <span style={{ fontSize: 9, fontWeight: 600, color: c.text, opacity: 0.65 }}>· {code}</span>}
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#1A1A1A", lineHeight: 1.4 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 10, color: "#6B6B6B", marginTop: 2 }}>{subtitle}</div>}
      {text && <p style={{ fontSize: 11, color: "#4A4A4A", margin: "5px 0 0", lineHeight: 1.5 }}>{text}</p>}
    </div>
  );
}

/** Renders the (entityType, proposedAction)-specific fields of a proposed
 * impact (see llm/regulatory_analysis.py for what proposedData carries per
 * combination). Existing-element references (reco_title, question_title,
 * etc.) come from the backend's own catalog lookup at analysis time (see
 * app/services/regulatory.py::_enrich_impact) -- never invented by the LLM,
 * always the real current content, so a bare code is never shown alone. */
function ProposedDetails({ impact }: { impact: Impact }) {
  const p = impact.proposedData;
  const key = impactKey(impact);

  if (key === "question:ajouter") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ padding: "10px 12px", backgroundColor: "#EEF2FF", border: "1px solid #C7D2FE", borderRadius: 8 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: "#3730A3", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
            Nouvelle question proposée
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#1A1A1A", lineHeight: 1.4 }}>{p.title}</div>
          {p.dimension && (
            <div style={{ fontSize: 11, fontWeight: 600, color: "#3730A3", marginTop: 4 }}>Dimension : {p.dimension}</div>
          )}
        </div>

        {p.level_labels && p.level_labels.length > 0 && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#6B6B6B", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 5 }}>
              Échelle de maturité proposée (réponses possibles)
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {p.level_labels.map((lbl, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <span style={{ flexShrink: 0, width: 18, height: 18, marginTop: 1, borderRadius: "50%", backgroundColor: "#1A1A1A", color: "#FFE600", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {i + 1}
                  </span>
                  <span style={{ fontSize: 12, color: "#4A4A4A", lineHeight: 1.5 }}>{lbl}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <WeightRecalcNote impact={impact} />
        <AssociatedRecommendations impact={impact} />
      </div>
    );
  }

  if (key === "question:modifier" || key === "recommandation:modifier") {
    const isQuestion = key === "question:modifier";
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <CatalogRefBox
          kind={isQuestion ? "question" : "recommandation"}
          code={isQuestion ? p.question_code : p.reco_code}
          title={isQuestion ? p.question_title : p.reco_title}
          subtitle={isQuestion ? p.question_dimension : [p.reco_category, p.question_title].filter(Boolean).join(" · ")}
          text={isQuestion ? undefined : p.reco_text}
        />
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#9A3412", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 3 }}>
            Modification proposée
          </div>
          <p style={{ fontSize: 12, color: "#4A4A4A", lineHeight: 1.6, margin: 0 }}>{p.modification}</p>
        </div>
      </div>
    );
  }

  if (key === "question:desactiver" || key === "recommandation:desactiver") {
    const isQuestion = key === "question:desactiver";
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <CatalogRefBox
          kind={isQuestion ? "question" : "recommandation"}
          code={isQuestion ? p.question_code : p.reco_code}
          title={isQuestion ? p.question_title : p.reco_title}
          subtitle={isQuestion ? p.question_dimension : [p.reco_category, p.question_title].filter(Boolean).join(" · ")}
          text={isQuestion ? undefined : p.reco_text}
        />
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#B91C1C", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 3 }}>
            Motif de désactivation
          </div>
          <p style={{ fontSize: 12, color: "#4A4A4A", lineHeight: 1.6, margin: 0 }}>{p.justification}</p>
        </div>
        <span style={{ fontSize: 11, color: "#9B9B9B", fontStyle: "italic" }}>Passera au statut « obsolète » (jamais supprimé) à la publication.</span>
        <WeightRecalcNote impact={impact} />
      </div>
    );
  }

  if (key === "recommandation:ajouter") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ padding: "10px 12px", backgroundColor: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 8 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: "#166534", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
            Nouvelle recommandation proposée
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A", lineHeight: 1.4 }}>{p.title}</div>
          <p style={{ fontSize: 12, color: "#4A4A4A", lineHeight: 1.6, margin: "5px 0 0" }}>{p.recommendation_text}</p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {p.category && <span style={{ fontSize: 11, color: "#6B6B6B", backgroundColor: "#F5F5F5", padding: "2px 8px", borderRadius: 4 }}>{p.category}</span>}
          {typeof p.effort === "number" && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "#6B6B6B" }}>Effort <EffortDots effort={p.effort} /></span>
          )}
          {typeof p.trigger_level === "number" && (
            <span style={{ fontSize: 11, color: "#6B6B6B" }}>Palier {p.trigger_level} → {p.trigger_level + 1}</span>
          )}
        </div>

        {(p.question_title || p.question_code) && (
          <div style={{ fontSize: 12, color: "#4A4A4A", lineHeight: 1.5 }}>
            Rattachée à la question <strong style={{ color: "#1A1A1A" }}>{p.question_title || p.question_code}</strong>
            {p.question_dimension && <> — dimension <strong style={{ color: "#1A1A1A" }}>{p.question_dimension}</strong></>}
          </div>
        )}
      </div>
    );
  }

  // recommandation:activer_flag
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <CatalogRefBox
        kind="recommandation"
        code={p.reco_code}
        title={p.reco_title}
        subtitle={[p.reco_category, p.question_title].filter(Boolean).join(" · ")}
        text={p.reco_text}
      />
      <div style={{ display: "flex", alignItems: "flex-start", gap: 7, padding: "8px 10px", backgroundColor: "#FDF4FF", border: "1px solid #F3E8FF", borderRadius: 6 }}>
        <ShieldCheck size={13} style={{ color: "#6B21A8", flexShrink: 0, marginTop: 1 }} />
        <span style={{ fontSize: 12, color: "#6B21A8", lineHeight: 1.5 }}>
          Cette recommandation existante couvre déjà l'exigence de la circulaire — elle sera marquée comme <strong>obligation réglementaire</strong> (indicateur activé), sans changer son contenu.
        </span>
      </div>
    </div>
  );
}

// ── PDF Icon SVG (3D-style) ───────────────────────────────────────────────────

function PdfIcon3D({ size = 100 }: { size?: number }) {
  return (
    <svg width={size} height={size * 1.2} viewBox="0 0 100 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="50" cy="115" rx="30" ry="5" fill="rgba(0,0,0,0.08)" />
      <rect x="12" y="8" width="66" height="86" rx="7" fill="#F0F0F0" />
      <path d="M62 8 L78 24 L62 24 Z" fill="#D8D8D8" />
      <path d="M62 8 L78 24 H62 V8Z" fill="#E4E4E4" />
      <rect x="22" y="36" width="36" height="3.5" rx="1.75" fill="#D0D0D0" />
      <rect x="22" y="46" width="46" height="3.5" rx="1.75" fill="#D0D0D0" />
      <rect x="22" y="56" width="40" height="3.5" rx="1.75" fill="#D0D0D0" />
      <rect x="22" y="66" width="30" height="3.5" rx="1.75" fill="#D0D0D0" />
      <rect x="14" y="18" width="28" height="14" rx="3" fill="#CC0000" />
      <text x="28" y="29" textAnchor="middle" fill="white" fontSize="8" fontWeight="800" fontFamily="sans-serif">PDF</text>
    </svg>
  );
}

function SpinnerIcon({ size = 100 }: { size?: number }) {
  return (
    <svg width={size} height={size * 1.2} viewBox="0 0 100 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <style>{`@keyframes vspin { to { transform: rotate(360deg); transform-origin: 50px 55px; } }`}</style>
      <ellipse cx="50" cy="115" rx="30" ry="5" fill="rgba(0,0,0,0.08)" />
      <circle cx="50" cy="55" r="38" stroke="#F0F0F0" strokeWidth="6" />
      <circle cx="50" cy="55" r="38" stroke="#1A1A1A" strokeWidth="6" strokeLinecap="round"
        strokeDasharray="60 180"
        style={{ transformOrigin: "50px 55px", animation: "vspin 0.9s linear infinite" }}
      />
      <rect x="34" y="40" width="32" height="30" rx="4" fill="#F5F5F5" />
      <rect x="34" y="46" width="12" height="7" rx="2" fill="#CC0000" />
      <text x="40" y="52" textAnchor="middle" fill="white" fontSize="5" fontWeight="800" fontFamily="sans-serif">PDF</text>
    </svg>
  );
}

// ── Upload Modal ──────────────────────────────────────────────────────────────

function UploadModal({ onClose, onDone }: { onClose: () => void; onDone: (circular: CircularDetail) => void }) {
  const [step, setStep] = useState<"form" | "analyzing" | "done" | "error">("form");
  const [tab, setTab] = useState<"file" | "link">("file");
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const [result, setResult] = useState<CircularDetail | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function afterSubmit(circular: CircularDetail) {
    if (circular.analysisStatus !== "en_cours") {
      finishWith(circular);
      return;
    }
    setStep("analyzing");
    const resolved = await regulatoryApi.pollCircular(circular.id);
    finishWith(resolved);
  }

  function finishWith(circular: CircularDetail) {
    if (circular.analysisStatus === "en_cours") {
      // Polling gave up (maxAttempts reached) but the analysis is still
      // running server-side -- must NOT report this as "done" with
      // whatever impact_count happens to exist yet (0), or the admin sees
      // a false "0 exigences détectées" even though the real result shows
      // up later in the list (which polls its own live status).
      toast.info("L'analyse prend plus de temps que prévu — elle continue en arrière-plan. Retrouvez cette circulaire dans la liste une fois terminée.");
      onClose();
      return;
    }
    if (circular.analysisStatus === "erreur") {
      setErrorMsg(circular.analysisError || "Échec de l'analyse du document.");
      setStep("error");
      return;
    }
    setResult(circular);
    setStep("done");
  }

  async function handleFile(file: File) {
    setFileName(file.name);
    setStep("analyzing");
    try {
      const circular = await regulatoryApi.importFile(file);
      await afterSubmit(circular);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Échec de l'import du document.");
      setStep("error");
    }
  }

  async function handleLink() {
    if (!linkValue.trim()) return;
    setFileName(linkValue.trim());
    setStep("analyzing");
    try {
      const circular = await regulatoryApi.importUrl(linkValue.trim());
      await afterSubmit(circular);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Échec de l'import du document.");
      setStep("error");
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2000, backgroundColor: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <style>{`
        @keyframes fade-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes indeterminate { 0% { transform: translateX(-100%); } 100% { transform: translateX(250%); } }
      `}</style>
      <div style={{ backgroundColor: "#fff", borderRadius: 16, width: 480, maxWidth: "94vw", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 32px 80px rgba(0,0,0,0.22)" }}>

        <div style={{ padding: "20px 24px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#1A1A1A" }}>
            {step === "form" ? "Importer une circulaire" : step === "analyzing" ? "Analyse IA en cours…" : step === "error" ? "Échec de l'analyse" : "Analyse terminée"}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9B9B", padding: 4, borderRadius: 6 }}><X size={18} /></button>
        </div>

        <div style={{ padding: "20px 24px 24px" }}>

          {step === "form" && (
            <>
              <div style={{ display: "flex", gap: 0, backgroundColor: "#F5F5F5", borderRadius: 8, padding: 3, marginBottom: 20 }}>
                {(["file", "link"] as const).map(t => (
                  <button key={t} onClick={() => setTab(t)}
                    style={{ flex: 1, padding: "7px 0", borderRadius: 6, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", transition: "all 0.15s",
                      backgroundColor: tab === t ? "#fff" : "transparent",
                      color: tab === t ? "#1A1A1A" : "#9B9B9B",
                      boxShadow: tab === t ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                    }}>
                    {t === "file" ? "Fichier PDF" : "Lien URL"}
                  </button>
                ))}
              </div>

              {tab === "file" ? (
                <div
                  onDragOver={e => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: `2px dashed ${dragging ? "#1A1A1A" : "rgba(0,0,0,0.13)"}`,
                    borderRadius: 14,
                    padding: "36px 24px 28px",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 0,
                    backgroundColor: dragging ? "#F7F7F7" : "#FAFAFA",
                    cursor: "pointer", transition: "all 0.15s",
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    style={{ display: "none" }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                  />
                  <div style={{ marginBottom: 4 }}>
                    <PdfIcon3D size={88} />
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#1A1A1A", marginBottom: 6, textAlign: "center" }}>
                    Déposez votre circulaire ici
                  </div>
                  <div style={{ fontSize: 13, color: "#9B9B9B", textAlign: "center", lineHeight: 1.5 }}>
                    Glissez-déposez votre fichier, ou{" "}
                    <span style={{ color: "#1A1A1A", fontWeight: 600, textDecoration: "underline" }}>parcourir</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#C0C0C0", marginTop: 8 }}>Formats supportés : .pdf</div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "8px 0 4px" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "28px 0 20px" }}>
                    <div style={{ width: 60, height: 60, borderRadius: 14, backgroundColor: "#F5F5F5", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <ExternalLink size={26} style={{ color: "#9B9B9B" }} />
                    </div>
                    <div style={{ fontSize: 13, color: "#6B6B6B", textAlign: "center", lineHeight: 1.5 }}>
                      Collez le lien vers la circulaire publiée sur le site de la BCT ou autre source officielle.
                    </div>
                  </div>
                  <input
                    value={linkValue}
                    onChange={e => setLinkValue(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleLink(); }}
                    placeholder="https://www.bct.gov.tn/circulaire-2024-03.pdf"
                    style={{ width: "100%", padding: "11px 14px", borderRadius: 8, border: "1.5px solid rgba(0,0,0,0.13)", fontSize: 13, color: "#1A1A1A", outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
                    onFocus={e => (e.target as HTMLInputElement).style.borderColor = "#1A1A1A"}
                    onBlur={e => (e.target as HTMLInputElement).style.borderColor = "rgba(0,0,0,0.13)"}
                  />
                  <button
                    onClick={handleLink}
                    disabled={!linkValue.trim()}
                    style={{ padding: "10px 0", borderRadius: 8, fontSize: 13, fontWeight: 700, border: "none", backgroundColor: linkValue.trim() ? "#1A1A1A" : "#E0E0E0", color: linkValue.trim() ? "#FFE600" : "#9B9B9B", cursor: linkValue.trim() ? "pointer" : "not-allowed", transition: "background 0.15s" }}
                  >
                    Importer et analyser
                  </button>
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center", marginTop: 16 }}>
                <Sparkles size={12} style={{ color: "#6366F1" }} />
                <span style={{ fontSize: 11, color: "#9B9B9B" }}>Données extraites automatiquement par intelligence artificielle</span>
              </div>
            </>
          )}

          {step === "analyzing" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, padding: "16px 0 8px", animation: "fade-in 0.2s ease" }}>
              <SpinnerIcon size={88} />
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#1A1A1A", marginBottom: 4 }}>
                  Lecture du document…
                </div>
                <div style={{ fontSize: 12, color: "#9B9B9B", maxWidth: 320 }}>
                  L'IA analyse le contenu (texte ou OCR, français ou arabe) et identifie les exigences réglementaires en arrière-plan. Cela peut prendre une à quelques minutes sur ce modèle local — vous pouvez fermer cette fenêtre, l'analyse continue.
                </div>
              </div>
              <div style={{ width: "100%", height: 4, backgroundColor: "#F0F0F0", borderRadius: 2, overflow: "hidden", position: "relative" }}>
                <div style={{ position: "absolute", top: 0, left: 0, width: "40%", height: "100%", backgroundColor: "#1A1A1A", borderRadius: 2, animation: "indeterminate 1.4s ease-in-out infinite" }} />
              </div>
              <div style={{ fontSize: 11, color: "#C0C0C0", fontStyle: "italic" }}>{fileName}</div>
            </div>
          )}

          {step === "error" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "16px 0 8px", animation: "fade-in 0.2s ease" }}>
              <div style={{ width: 64, height: 64, borderRadius: "50%", backgroundColor: "#FFEBEE", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <AlertTriangle size={28} style={{ color: "#CC0000" }} />
              </div>
              <div style={{ fontSize: 13, color: "#6B6B6B", textAlign: "center", maxWidth: 340 }}>{errorMsg}</div>
              <button onClick={() => setStep("form")} style={{ padding: "8px 18px", borderRadius: 6, fontSize: 13, fontWeight: 600, border: "1px solid rgba(0,0,0,0.12)", backgroundColor: "#fff", cursor: "pointer", color: "#4A4A4A" }}>
                Réessayer
              </button>
            </div>
          )}

          {step === "done" && result && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, animation: "fade-in 0.25s ease" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", backgroundColor: "#E8F5E9", borderRadius: 10, border: "1px solid #C8E6C9" }}>
                <CheckCircle2 size={22} style={{ color: "#2E7D32", flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#1B5E20" }}>Analyse terminée</div>
                  <div style={{ fontSize: 12, color: "#2E7D32" }}>
                    {result.impactCount} exigence{result.impactCount !== 1 ? "s" : ""} détectée{result.impactCount !== 1 ? "s" : ""}
                    {result.detectedLanguage && result.detectedLanguage !== "unknown" ? ` · document en ${result.detectedLanguage === "ar" ? "arabe" : "français"}` : ""}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[
                  { label: "Référence", value: result.reference },
                  { label: "Date d'import", value: formatDate(result.publicationDate) },
                  { label: "Thème", value: result.theme || "—" },
                ].map(({ label, value }) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", backgroundColor: "#F7F7F7", borderRadius: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#9B9B9B", textTransform: "uppercase", letterSpacing: "0.04em", width: 130, flexShrink: 0 }}>{label}</span>
                    <span style={{ fontSize: 13, fontWeight: 500, color: "#1A1A1A" }}>{value}</span>
                  </div>
                ))}
              </div>
              {result.impactCount === 0 ? (
                <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 14px", backgroundColor: "#FFF3E0", borderRadius: 8, border: "1px solid #FFE0B2" }}>
                  <AlertTriangle size={13} style={{ color: "#9A5B00", flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: "#9A5B00" }}>Aucune exigence exploitable n'a été détectée dans ce document.</span>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 14px", backgroundColor: "#EEF2FF", borderRadius: 8, border: "1px solid #C7D2FE" }}>
                  <Sparkles size={13} style={{ color: "#3730A3", flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: "#3730A3" }}>L'analyse des impacts sur le référentiel est prête à être validée.</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ padding: "14px 24px", borderTop: "1px solid rgba(0,0,0,0.07)", display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} style={{ padding: "9px 18px", borderRadius: 6, fontSize: 13, fontWeight: 500, border: "1px solid rgba(0,0,0,0.12)", backgroundColor: "#fff", cursor: "pointer", color: "#4A4A4A" }}>
            {step === "done" ? "Fermer" : "Annuler"}
          </button>
          {step === "done" && result && (
            <button
              onClick={() => { onClose(); onDone(result); }}
              style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 20px", borderRadius: 6, fontSize: 13, fontWeight: 700, border: "none", backgroundColor: "#1A1A1A", color: "#FFE600", cursor: "pointer" }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#2D2D2D"}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#1A1A1A"}
            >
              <ShieldCheck size={15} /> Consulter l'analyse d'impact
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Impact Analysis ───────────────────────────────────────────────────────────

function ImpactAnalysis({ circular, onBack, onPublished }: {
  circular: CircularDetail; onBack: () => void; onPublished: (updated: Circular) => void;
}) {
  const [impacts, setImpacts] = useState<Impact[]>(circular.impacts);
  const [published, setPublished] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");

  async function setAction(id: string | number, action: ImpactAction, editedText?: string) {
    const prev = impacts;
    setImpacts(p => p.map(c => c.id === id ? { ...c, action, editedText: editedText ?? null } : c));
    try {
      await regulatoryApi.updateImpact(Number(id), { action, editedText });
    } catch (e) {
      setImpacts(prev);
      toast.error(e instanceof Error ? e.message : "Échec de la mise à jour");
    }
  }

  function startEdit(impact: Impact) {
    setEditingId(impact.id);
    setEditText(impact.editedText ?? impact.requirementText);
  }

  async function saveEdit(id: number) {
    await setAction(id, "modifié", editText);
    setEditingId(null);
  }

  const done = impacts.filter(c => c.action !== null).length;
  const total = impacts.length;
  const accepted = impacts.filter(c => c.action === "accepté").length;
  const allActioned = total > 0 && done === total;

  async function handlePublish() {
    if (!allActioned || publishing) return;
    setPublishing(true);
    try {
      const updated = await regulatoryApi.publishCircular(circular.id);
      setPublished(true);
      onPublished(updated);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de la publication");
    } finally {
      setPublishing(false);
    }
  }

  if (published) {
    return (
      <div style={{ padding: "80px 32px", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", backgroundColor: "#E8F5E9", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <CheckCircle2 size={32} style={{ color: "#2E7D32" }} />
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#1A1A1A" }}>Référentiel mis à jour</div>
        <div style={{ fontSize: 13, color: "#6B6B6B", textAlign: "center", maxWidth: 380, lineHeight: 1.6 }}>
          {accepted} modification{accepted > 1 ? "s" : ""} intégrée{accepted > 1 ? "s" : ""} au référentiel. Les banques concernées seront notifiées pour se réévaluer.
        </div>
        <button onClick={onBack} style={{ marginTop: 8, padding: "9px 22px", borderRadius: 6, fontSize: 13, fontWeight: 700, border: "none", backgroundColor: "#1A1A1A", color: "#FFE600", cursor: "pointer" }}>
          Retour à la veille
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px 130px" }}>

        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#9B9B9B", marginBottom: 22 }}>
          <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#9B9B9B", padding: 0 }}
            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = "#1A1A1A"}
            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = "#9B9B9B"}
          >Veille réglementaire</button>
          <ChevronRight size={13} />
          <span style={{ color: "#1A1A1A", fontWeight: 600 }}>Analyse — {circular.reference}</span>
        </div>

        <div style={{ display: "flex", gap: 10, padding: "12px 16px", backgroundColor: "#EEF2FF", borderRadius: 8, border: "1px solid #C7D2FE", marginBottom: 22 }}>
          <Sparkles size={15} style={{ color: "#3730A3", flexShrink: 0, marginTop: 1 }} />
          <div>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#3730A3" }}>Analyse générée par IA</span>
            <span style={{ fontSize: 13, color: "#4338CA" }}> — à valider par un expert avant publication.</span>
            <div style={{ fontSize: 12, color: "#6366F1", marginTop: 2 }}>Acceptez, modifiez ou rejetez chaque exigence détectée pour mettre à jour le référentiel.</div>
          </div>
        </div>

        <div style={{ ...card, padding: "14px 20px", marginBottom: 22, display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#1A1A1A" }}>Validation des exigences</span>
              <span style={{ fontSize: 12, color: "#9B9B9B" }}>{done}/{total}</span>
            </div>
            <div style={{ height: 5, backgroundColor: "#F0F0F0", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: total ? `${(done / total) * 100}%` : "0%", backgroundColor: "#1A1A1A", borderRadius: 3, transition: "width 0.3s" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 16, flexShrink: 0 }}>
            {[
              { label: "Acceptés",  n: impacts.filter(c => c.action === "accepté").length,  color: "#2E7D32" },
              { label: "À modifier",n: impacts.filter(c => c.action === "modifié").length,  color: "#E65100" },
              { label: "Rejetés",   n: impacts.filter(c => c.action === "rejeté").length,   color: "#CC0000" },
            ].map(s => (
              <div key={s.label} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: s.color }}>{s.n}</div>
                <div style={{ fontSize: 10, color: "#9B9B9B", textTransform: "uppercase", letterSpacing: "0.05em" }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.35fr", gap: 20, alignItems: "start" }}>

          <div style={{ ...card, overflow: "hidden", position: "sticky", top: 0 }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(0,0,0,0.06)", display: "flex", alignItems: "center", gap: 8 }}>
              <BookOpen size={13} style={{ color: "#6B6B6B" }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: "#1A1A1A" }}>Document source</span>
              {circular.detectedLanguage && circular.detectedLanguage !== "unknown" && (
                <span style={{ fontSize: 10, fontWeight: 700, color: "#6B6B6B", backgroundColor: "#F5F5F5", padding: "1px 6px", borderRadius: 4 }}>
                  {circular.detectedLanguage === "ar" ? "AR" : "FR"}
                </span>
              )}
              {circular.sourceUrl && (
                <a href={circular.sourceUrl} target="_blank" rel="noreferrer" style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#6B6B6B", textDecoration: "none" }}>
                  <ExternalLink size={11} /> Ouvrir
                </a>
              )}
            </div>
            <div style={{ padding: "16px", fontSize: 12, color: "#4A4A4A", lineHeight: 1.8, maxHeight: 520, overflowY: "auto" }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#1A1A1A", marginBottom: 2 }}>{circular.reference}</div>
              <div style={{ fontSize: 11, color: "#9B9B9B", marginBottom: 12 }}>
                {formatDate(circular.publicationDate)}{circular.sourceFilename ? ` · ${circular.sourceFilename}` : ""}
              </div>
              {circular.theme && (
                <div style={{ fontWeight: 600, color: "#1A1A1A", marginBottom: 10, fontSize: 12 }}>{circular.theme}</div>
              )}
              {circular.rawText ? (
                <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{circular.rawText}</p>
              ) : (
                <p style={{ color: "#9B9B9B", fontStyle: "italic" }}>Texte source indisponible.</p>
              )}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A", marginBottom: 2 }}>
              Impacts proposés <span style={{ fontSize: 12, fontWeight: 400, color: "#9B9B9B" }}>· {total} exigence{total !== 1 ? "s" : ""}</span>
            </div>

            {impacts.map(c => (
              <div key={c.id} style={{
                ...card, padding: "16px 18px",
                borderLeft: c.action === "accepté" ? "3px solid #2E7D32"
                  : c.action === "rejeté"  ? "3px solid #CC0000"
                  : c.action === "modifié" ? "3px solid #E65100"
                  : "3px solid rgba(0,0,0,0.07)",
                opacity: c.action === "rejeté" ? 0.55 : 1,
                transition: "all 0.18s",
              }}>
                <p style={{ fontSize: 13, color: "#1A1A1A", lineHeight: 1.55, margin: "0 0 6px", fontWeight: 600 }}>
                  {c.editedText || c.requirementText}
                </p>
                {c.excerpt && (
                  <p style={{ fontSize: 11, color: "#9B9B9B", fontStyle: "italic", lineHeight: 1.5, margin: c.excerptOriginal ? "0 0 4px" : "0 0 10px", borderLeft: "2px solid #E0E0E0", paddingLeft: 8 }}>
                    « {c.excerpt} »
                  </p>
                )}
                {c.excerptOriginal && (
                  <p
                    dir="rtl"
                    title="Texte original de la circulaire (avant traduction)"
                    style={{ fontSize: 11, color: "#B0B0B0", fontStyle: "italic", lineHeight: 1.6, margin: "0 0 10px", borderLeft: "2px solid #E0E0E0", paddingLeft: 8, textAlign: "right" }}
                  >
                    « {c.excerptOriginal} »
                  </p>
                )}

                <div style={{ marginBottom: 14 }}>
                  <div style={{ marginBottom: 8 }}>
                    <TypeBadge impact={c} />
                  </div>
                  <ProposedDetails impact={c} />
                </div>

                {editingId === c.id ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <textarea
                      value={editText}
                      onChange={e => setEditText(e.target.value)}
                      rows={3}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1.5px solid rgba(0,0,0,0.13)", fontSize: 12, outline: "none", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" }}
                      autoFocus
                    />
                    <div style={{ display: "flex", gap: 7, justifyContent: "flex-end" }}>
                      <button onClick={() => setEditingId(null)} style={{ padding: "6px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, border: "1px solid rgba(0,0,0,0.12)", backgroundColor: "#fff", cursor: "pointer", color: "#6B6B6B" }}>Annuler</button>
                      <button onClick={() => saveEdit(c.id)} style={{ padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 700, border: "none", backgroundColor: "#E65100", color: "#fff", cursor: "pointer" }}>Enregistrer</button>
                    </div>
                  </div>
                ) : c.action !== null ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, borderRadius: 20, padding: "3px 10px",
                      backgroundColor: c.action === "accepté" ? "#E8F5E9" : c.action === "rejeté" ? "#FFEBEE" : "#FFF3E0",
                      color:           c.action === "accepté" ? "#2E7D32" : c.action === "rejeté" ? "#CC0000"  : "#E65100",
                    }}>
                      {c.action === "accepté" ? "✓ Accepté" : c.action === "rejeté" ? "✕ Rejeté" : "✎ Modifié"}
                    </span>
                    <button onClick={() => setAction(c.id, null)} style={{ fontSize: 11, color: "#9B9B9B", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                      Annuler
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 7 }}>
                    <button
                      onClick={() => setAction(c.id, "accepté")}
                      style={{ display: "flex", alignItems: "center", gap: 5, flex: 1, justifyContent: "center", padding: "7px 0", borderRadius: 6, fontSize: 12, fontWeight: 600, border: "1.5px solid #2E7D32", backgroundColor: "#fff", color: "#2E7D32", cursor: "pointer", transition: "all 0.12s" }}
                      onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#2E7D32"; b.style.color = "#fff"; }}
                      onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#fff"; b.style.color = "#2E7D32"; }}
                    ><Check size={12} /> Accepter</button>
                    <button
                      onClick={() => startEdit(c)}
                      style={{ display: "flex", alignItems: "center", gap: 5, flex: 1, justifyContent: "center", padding: "7px 0", borderRadius: 6, fontSize: 12, fontWeight: 600, border: "1.5px solid #E65100", backgroundColor: "#fff", color: "#E65100", cursor: "pointer", transition: "all 0.12s" }}
                      onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#E65100"; b.style.color = "#fff"; }}
                      onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#fff"; b.style.color = "#E65100"; }}
                    ><Edit2 size={12} /> Modifier</button>
                    <button
                      onClick={() => setAction(c.id, "rejeté")}
                      style={{ display: "flex", alignItems: "center", gap: 5, flex: 1, justifyContent: "center", padding: "7px 0", borderRadius: 6, fontSize: 12, fontWeight: 600, border: "1.5px solid #CC0000", backgroundColor: "#fff", color: "#CC0000", cursor: "pointer", transition: "all 0.12s" }}
                      onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#CC0000"; b.style.color = "#fff"; }}
                      onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#fff"; b.style.color = "#CC0000"; }}
                    ><XCircle size={12} /> Rejeter</button>
                  </div>
                )}
              </div>
            ))}

            {total === 0 && (
              <div style={{ ...card, padding: "24px 18px", textAlign: "center", fontSize: 13, color: "#9B9B9B" }}>
                Aucun impact n'a été détecté pour cette circulaire.
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ position: "sticky", bottom: 0, backgroundColor: "#fff", borderTop: "1px solid rgba(0,0,0,0.08)", padding: "14px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "0 -4px 20px rgba(0,0,0,0.06)", zIndex: 10 }}>
        <div style={{ fontSize: 12, color: allActioned ? "#2E7D32" : "#9B9B9B" }}>
          {allActioned
            ? "✓ Toutes les exigences traitées — prêt à publier. Les banques concernées seront invitées à se réévaluer."
            : `${total - done} exigence${total - done > 1 ? "s" : ""} en attente de validation.`}
        </div>
        <button
          onClick={handlePublish}
          disabled={!allActioned || publishing}
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 22px", borderRadius: 6, fontSize: 13, fontWeight: 700, border: "none", backgroundColor: allActioned ? "#1A1A1A" : "#E0E0E0", color: allActioned ? "#FFE600" : "#9B9B9B", cursor: allActioned && !publishing ? "pointer" : "not-allowed", transition: "background 0.15s" }}
          onMouseEnter={e => { if (allActioned) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#2D2D2D"; }}
          onMouseLeave={e => { if (allActioned) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#1A1A1A"; }}
        >
          {publishing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Valider et publier la nouvelle version
        </button>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function VeilleReglementaire() {
  const [circulars, setCirculars] = useState<Circular[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState<CircularDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState<number | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  async function reindex() {
    setReindexing(true);
    try {
      const result = await regulatoryApi.reindexCatalog();
      toast.success(`Index mis à jour : ${result.questions} question(s), ${result.recommandations} recommandation(s).`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de la réindexation");
    } finally {
      setReindexing(false);
    }
  }

  async function load() {
    setLoading(true);
    setLoadError(false);
    try {
      setCirculars(await regulatoryApi.listCirculars());
    } catch (e) {
      setLoadError(true);
      toast.error(e instanceof Error ? e.message : "Échec du chargement");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function openCircular(id: number) {
    setLoadingDetail(id);
    try {
      let circular = await regulatoryApi.getCircular(id);
      if (circular.analysisStatus === "en_cours") {
        toast.info("Analyse encore en cours pour cette circulaire — patientez…");
        circular = await regulatoryApi.pollCircular(id);
      }
      setSelected(circular);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec du chargement de la circulaire");
    } finally {
      setLoadingDetail(null);
    }
  }

  async function handleDelete(c: Circular) {
    if (!window.confirm(`Supprimer la circulaire « ${c.reference} » ? Cette action est irréversible.`)) return;
    setDeletingId(c.id);
    try {
      await regulatoryApi.deleteCircular(c.id);
      setCirculars(prev => prev.filter(x => x.id !== c.id));
      toast.success("Circulaire supprimée.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de la suppression");
    } finally {
      setDeletingId(null);
    }
  }

  if (selected) {
    return (
      <ImpactAnalysis
        circular={selected}
        onBack={() => { setSelected(null); load(); }}
        onPublished={() => { load(); }}
      />
    );
  }

  const enVigueur = circulars.filter(c => c.status === "En vigueur").length;
  const abrogees = circulars.filter(c => c.status === "Abrogée").length;

  return (
    <div style={{ padding: "28px 32px 48px", backgroundColor: "#F2F2F2", minHeight: "100%" }}>

      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
              <ShieldCheck size={12} style={{ color: "#B0B0B0" }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: "#B0B0B0", letterSpacing: "0.1em", textTransform: "uppercase", whiteSpace: "nowrap" }}>Banque Centrale de Tunisie</span>
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1A1A1A", margin: "0 0 3px", letterSpacing: "-0.02em" }}>
              Veille réglementaire
            </h1>
            <p style={{ fontSize: 12, color: "#9B9B9B", margin: 0 }}>
              {circulars.length} circulaire{circulars.length !== 1 ? "s" : ""} importée{circulars.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, flexShrink: 0, marginLeft: 24 }}>
            <button
              onClick={reindex}
              disabled={reindexing}
              title="Ré-encode le référentiel (questions + recommandations) pour la recherche RAG"
              style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, border: "1px solid rgba(0,0,0,0.12)", backgroundColor: "#fff", color: "#4A4A4A", cursor: reindexing ? "wait" : "pointer", whiteSpace: "nowrap" }}
            >
              {reindexing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Réindexer le référentiel
            </button>
            <button
              onClick={() => setShowUpload(true)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", borderRadius: 8, fontSize: 13, fontWeight: 700, border: "none", backgroundColor: "#1A1A1A", color: "#FFE600", cursor: "pointer", whiteSpace: "nowrap" }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#2D2D2D"}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#1A1A1A"}
            >
              <Upload size={14} /> Importer une circulaire
            </button>
          </div>
        </div>

        {circulars.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {[
              { value: circulars.length, label: "circulaires intégrées", dot: "#1A1A1A" },
              { value: enVigueur,        label: "en vigueur",            dot: "#16A34A" },
              { value: abrogees,         label: "abrogées",              dot: "#C0C0C0" },
            ].map((s, i, arr) => (
              <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, backgroundColor: "#fff", borderRadius: 20, padding: "5px 12px", border: "1px solid rgba(0,0,0,0.08)" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: s.dot, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>{s.value}</span>
                  <span style={{ fontSize: 12, color: "#9B9B9B" }}>{s.label}</span>
                </div>
                {i < arr.length - 1 && <span style={{ color: "#D0D0D0", fontSize: 14 }}>·</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {loading && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: 60, color: "#9B9B9B" }}>
          <Loader2 size={20} className="animate-spin" /> Chargement de la veille réglementaire…
        </div>
      )}

      {!loading && loadError && (
        <div style={{ textAlign: "center", padding: 50 }}>
          <p style={{ fontSize: 13, color: "#6B6B6B", marginBottom: 14 }}>Impossible de charger les circulaires.</p>
          <button onClick={load} style={{ padding: "9px 18px", borderRadius: 6, fontSize: 13, fontWeight: 700, border: "none", backgroundColor: "#1A1A1A", color: "#FFE600", cursor: "pointer" }}>Réessayer</button>
        </div>
      )}

      {!loading && !loadError && circulars.length === 0 && (
        <div style={{ border: "1px dashed rgba(0,0,0,0.15)", borderRadius: 10, padding: 48, textAlign: "center", fontSize: 13, color: "#9B9B9B", backgroundColor: "#fff" }}>
          Aucune circulaire importée. Commencez par en importer une.
        </div>
      )}

      {!loading && !loadError && circulars.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {circulars.map(c => (
            <div key={c.id} style={{
              ...card, padding: "16px 20px",
              display: "flex", alignItems: "center", gap: 16,
              borderLeft: `3px solid ${c.status === "En vigueur" ? "#2E7D32" : c.status === "Brouillon" ? "#E65100" : "#D0D0D0"}`,
              transition: "box-shadow 0.15s",
            }}
              onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)"}
              onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.boxShadow = "0 1px 3px rgba(0,0,0,0.04)"}
            >
              <div style={{ width: 42, height: 42, borderRadius: 10, backgroundColor: c.status === "En vigueur" ? "#F0F7FF" : "#F5F5F5", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <FileText size={20} style={{ color: c.status === "En vigueur" ? "#0277BD" : "#C0C0C0" }} />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#1A1A1A" }}>{c.reference}</span>
                  <StatutBadge statut={c.status} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#3730A3", backgroundColor: "#EEF2FF", padding: "2px 7px", borderRadius: 4 }}>{c.version}</span>
                  {c.analysisStatus === "en_cours" && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, color: "#6366F1", backgroundColor: "#EEF2FF", padding: "2px 7px", borderRadius: 4 }}>
                      <Loader2 size={10} className="animate-spin" /> Analyse en cours
                    </span>
                  )}
                  {c.analysisStatus === "erreur" && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, color: "#CC0000", backgroundColor: "#FFEBEE", padding: "2px 7px", borderRadius: 4 }}>
                      <AlertTriangle size={10} /> Échec de l'analyse
                    </span>
                  )}
                  {c.pendingCount > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#9A5B00", backgroundColor: "#FFF3E0", padding: "2px 7px", borderRadius: 4 }}>{c.pendingCount} en attente</span>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12, color: "#6B6B6B" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <Clock size={11} /> {formatDate(c.publicationDate)}
                  </span>
                  <span>·</span>
                  <span>{c.theme || "Thème non qualifié"}</span>
                  <span>·</span>
                  <span>{c.impactCount} exigence{c.impactCount !== 1 ? "s" : ""}</span>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                <button
                  onClick={() => openCircular(c.id)}
                  disabled={loadingDetail === c.id}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, border: "1px solid rgba(0,0,0,0.10)", backgroundColor: "#fff", cursor: loadingDetail === c.id ? "wait" : "pointer", color: "#4A4A4A", transition: "all 0.12s", whiteSpace: "nowrap" }}
                  onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#1A1A1A"; b.style.color = "#FFE600"; b.style.borderColor = "#1A1A1A"; }}
                  onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#fff"; b.style.color = "#4A4A4A"; b.style.borderColor = "rgba(0,0,0,0.10)"; }}
                >
                  {loadingDetail === c.id ? <Loader2 size={13} className="animate-spin" /> : <>Voir l'analyse <ArrowUpRight size={13} /></>}
                </button>
                <button
                  onClick={() => handleDelete(c)}
                  disabled={deletingId === c.id}
                  title={c.isPublished ? "Circulaire publiée : suppression impossible" : "Supprimer"}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 6, border: "1px solid rgba(0,0,0,0.10)", backgroundColor: "#fff", cursor: deletingId === c.id ? "wait" : "pointer", color: "#9B9B9B", transition: "all 0.12s" }}
                  onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#FFEBEE"; b.style.color = "#CC0000"; b.style.borderColor = "#FFCDD2"; }}
                  onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#fff"; b.style.color = "#9B9B9B"; b.style.borderColor = "rgba(0,0,0,0.10)"; }}
                >
                  {deletingId === c.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 24, textAlign: "right" }}>
        <span style={{ fontSize: 11, color: "#C0C0C0", fontStyle: "italic" }}>Usage interne EY — confidentiel</span>
      </div>

      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onDone={(circular) => { setShowUpload(false); setSelected(circular); load(); }}
        />
      )}
    </div>
  );
}
