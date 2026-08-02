import { useState } from "react";
import {
  Upload, FileText, ChevronRight, Check, Edit2, XCircle,
  AlertCircle, BookOpen, ExternalLink, RefreshCw, CheckCircle2,
  Sparkles, Loader, X, ShieldCheck, Clock, ArrowUpRight,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Statut = "En vigueur" | "Abrogée";
type ImpactAction = "accepté" | "modifié" | "rejeté" | null;

interface Circulaire {
  id: string;
  reference: string;
  datePublication: string;
  theme: string;
  statut: Statut;
  version: string;
  articles: number;
}

interface ImpactCard {
  id: string;
  exigence: string;
  element: string;
  type: "réglementaire" | "nouvelle question" | "recommandation";
  action: ImpactAction;
}

// ── Mock data ─────────────────────────────────────────────────────────────────

const circulairesData: Circulaire[] = [
  { id: "c1", reference: "BCT n°2024-03", datePublication: "15 mars 2024",  theme: "Cybersécurité & chiffrement",         statut: "En vigueur", version: "v4", articles: 12 },
  { id: "c2", reference: "BCT n°2023-06", datePublication: "12 avril 2023", theme: "Cybersécurité",                       statut: "En vigueur", version: "v3", articles: 9  },
  { id: "c3", reference: "BCT n°2022-11", datePublication: "03 sept. 2022", theme: "Protection des données personnelles", statut: "En vigueur", version: "v2", articles: 14 },
  { id: "c4", reference: "BCT n°2021-14", datePublication: "17 juin 2021",  theme: "Gouvernance des données",             statut: "Abrogée",    version: "v1", articles: 7  },
  { id: "c5", reference: "BCT n°2020-08", datePublication: "22 mars 2020",  theme: "Reporting prudentiel",               statut: "En vigueur", version: "v2", articles: 11 },
];

const impactCardsData: ImpactCard[] = [
  { id: "i1", exigence: "Chiffrement obligatoire des données sensibles au repos et en transit selon les normes AES-256.", element: "Question D4-Q4 — Sécurité et accès",        type: "réglementaire",    action: null },
  { id: "i2", exigence: "Nomination d'un Délégué à la Protection des Données (DPO) rattaché à la direction générale.", element: "Nouvelle question — Dimension Gouvernance", type: "nouvelle question", action: null },
  { id: "i3", exigence: "Test annuel obligatoire du Plan de Reprise d'Activité avec rapport transmis à la BCT.",        element: "Question D4-Q5 — Continuité d'activité",   type: "recommandation",   action: null },
  { id: "i4", exigence: "Journalisation systématique des accès aux données personnelles, conservation 5 ans minimum.",  element: "Question D2-Q3 — Traçabilité des accès",   type: "réglementaire",    action: null },
];

// ── Shared ────────────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  backgroundColor: "#fff",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.07)",
  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
};

function StatutBadge({ statut }: { statut: Statut }) {
  const active = statut === "En vigueur";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, backgroundColor: active ? "#E8F5E9" : "#F5F5F5", color: active ? "#2E7D32" : "#9B9B9B", borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 600 }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: active ? "#2E7D32" : "#C0C0C0" }} />
      {statut}
    </span>
  );
}

function TypeBadge({ type }: { type: ImpactCard["type"] }) {
  const map = {
    "réglementaire":    { bg: "#EEF2FF", color: "#3730A3" },
    "nouvelle question":{ bg: "#FDF4FF", color: "#6B21A8" },
    "recommandation":   { bg: "#FFF7ED", color: "#9A3412" },
  };
  const c = map[type];
  return <span style={{ backgroundColor: c.bg, color: c.color, borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>{type}</span>;
}

// ── PDF Icon SVG (3D-style like the reference) ───────────────────────────────

function PdfIcon3D({ size = 100 }: { size?: number }) {
  return (
    <svg width={size} height={size * 1.2} viewBox="0 0 100 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Shadow */}
      <ellipse cx="50" cy="115" rx="30" ry="5" fill="rgba(0,0,0,0.08)" />
      {/* Page body */}
      <rect x="12" y="8" width="66" height="86" rx="7" fill="#F0F0F0" />
      {/* Page fold corner */}
      <path d="M62 8 L78 24 L62 24 Z" fill="#D8D8D8" />
      <path d="M62 8 L78 24 H62 V8Z" fill="#E4E4E4" />
      {/* Lines on page */}
      <rect x="22" y="36" width="36" height="3.5" rx="1.75" fill="#D0D0D0" />
      <rect x="22" y="46" width="46" height="3.5" rx="1.75" fill="#D0D0D0" />
      <rect x="22" y="56" width="40" height="3.5" rx="1.75" fill="#D0D0D0" />
      <rect x="22" y="66" width="30" height="3.5" rx="1.75" fill="#D0D0D0" />
      {/* PDF label tag */}
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
      {/* Spinner circle */}
      <circle cx="50" cy="55" r="38" stroke="#F0F0F0" strokeWidth="6" />
      <circle cx="50" cy="55" r="38" stroke="#1A1A1A" strokeWidth="6" strokeLinecap="round"
        strokeDasharray="60 180"
        style={{ transformOrigin: "50px 55px", animation: "vspin 0.9s linear infinite" }}
      />
      {/* PDF icon small in center */}
      <rect x="34" y="40" width="32" height="30" rx="4" fill="#F5F5F5" />
      <rect x="34" y="46" width="12" height="7" rx="2" fill="#CC0000" />
      <text x="40" y="52" textAnchor="middle" fill="white" fontSize="5" fontWeight="800" fontFamily="sans-serif">PDF</text>
    </svg>
  );
}

// ── Upload Modal ──────────────────────────────────────────────────────────────

function UploadModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [step, setStep] = useState<"drop" | "loading" | "done">("drop");
  const [tab, setTab] = useState<"file" | "link">("file");
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [linkValue, setLinkValue] = useState("");

  function handleFile(name: string) {
    setFileName(name);
    setStep("loading");
    setTimeout(() => setStep("done"), 2400);
  }

  function handleLink() {
    if (!linkValue.trim()) return;
    setFileName(linkValue.trim());
    setStep("loading");
    setTimeout(() => setStep("done"), 2400);
  }

  const extracted = {
    reference: "Circulaire BCT n°2024-03",
    date: "15 mars 2024",
    theme: "Cybersécurité & chiffrement des données",
    articles: 12,
    impacts: 4,
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2000, backgroundColor: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <style>{`
        @keyframes spin-ring { to { transform: rotate(360deg); } }
        @keyframes fill-bar { from { width: 0% } to { width: 100% } }
        @keyframes fade-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
      <div style={{ backgroundColor: "#fff", borderRadius: 16, width: 480, maxWidth: "94vw", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 32px 80px rgba(0,0,0,0.22)" }}>

        {/* Header */}
        <div style={{ padding: "20px 24px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#1A1A1A" }}>
            {step === "drop" ? "Importer une circulaire" : step === "loading" ? "Analyse IA en cours…" : "Extraction terminée"}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9B9B", padding: 4, borderRadius: 6 }}><X size={18} /></button>
        </div>

        <div style={{ padding: "20px 24px 24px" }}>

          {/* ── STEP 1: DROP ── */}
          {step === "drop" && (
            <>
              {/* Tabs */}
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
                /* Drop zone */
                <div
                  onDragOver={e => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f.name); }}
                  onClick={() => handleFile("Circulaire_BCT_2024-03.pdf")}
                  style={{
                    border: `2px dashed ${dragging ? "#1A1A1A" : "rgba(0,0,0,0.13)"}`,
                    borderRadius: 14,
                    padding: "36px 24px 28px",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 0,
                    backgroundColor: dragging ? "#F7F7F7" : "#FAFAFA",
                    cursor: "pointer", transition: "all 0.15s",
                  }}
                >
                  {/* 3D PDF Icon */}
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
                /* Link tab */
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

              {/* AI badge */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center", marginTop: 16 }}>
                <Sparkles size={12} style={{ color: "#6366F1" }} />
                <span style={{ fontSize: 11, color: "#9B9B9B" }}>Données extraites automatiquement par intelligence artificielle</span>
              </div>
            </>
          )}

          {/* ── STEP 2: LOADING ── */}
          {step === "loading" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, padding: "16px 0 8px", animation: "fade-in 0.2s ease" }}>
              <SpinnerIcon size={88} />
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#1A1A1A", marginBottom: 4 }}>
                  Lecture du document…
                </div>
                <div style={{ fontSize: 12, color: "#9B9B9B", maxWidth: 300 }}>
                  L'IA analyse le contenu et identifie les exigences réglementaires
                </div>
              </div>
              <div style={{ width: "100%", height: 4, backgroundColor: "#F0F0F0", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ height: "100%", backgroundColor: "#1A1A1A", borderRadius: 2, animation: "fill-bar 2.4s ease forwards" }} />
              </div>
              <div style={{ fontSize: 11, color: "#C0C0C0", fontStyle: "italic" }}>{fileName}</div>
            </div>
          )}

          {/* ── STEP 3: DONE ── */}
          {step === "done" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, animation: "fade-in 0.25s ease" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", backgroundColor: "#E8F5E9", borderRadius: 10, border: "1px solid #C8E6C9" }}>
                <CheckCircle2 size={22} style={{ color: "#2E7D32", flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#1B5E20" }}>Extraction réussie</div>
                  <div style={{ fontSize: 12, color: "#2E7D32" }}>{extracted.articles} articles analysés · {extracted.impacts} impacts détectés</div>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[
                  { label: "Référence", value: extracted.reference },
                  { label: "Date de publication", value: extracted.date },
                  { label: "Thème détecté", value: extracted.theme },
                ].map(({ label, value }) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", backgroundColor: "#F7F7F7", borderRadius: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#9B9B9B", textTransform: "uppercase", letterSpacing: "0.04em", width: 130, flexShrink: 0 }}>{label}</span>
                    <span style={{ fontSize: 13, fontWeight: 500, color: "#1A1A1A" }}>{value}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 14px", backgroundColor: "#EEF2FF", borderRadius: 8, border: "1px solid #C7D2FE" }}>
                <Sparkles size={13} style={{ color: "#3730A3", flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: "#3730A3" }}>L'analyse des impacts sur le référentiel est prête à être validée.</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 24px", borderTop: "1px solid rgba(0,0,0,0.07)", display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} style={{ padding: "9px 18px", borderRadius: 6, fontSize: 13, fontWeight: 500, border: "1px solid rgba(0,0,0,0.12)", backgroundColor: "#fff", cursor: "pointer", color: "#4A4A4A" }}>
            {step === "done" ? "Fermer" : "Annuler"}
          </button>
          {step === "done" && (
            <button
              onClick={() => { onClose(); onDone(); }}
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

function ImpactAnalysis({ onBack }: { onBack: () => void }) {
  const [impacts, setImpacts] = useState<ImpactCard[]>(impactCardsData);
  const [published, setPublished] = useState(false);

  const setAction = (id: string, action: ImpactAction) =>
    setImpacts(p => p.map(c => c.id === id ? { ...c, action } : c));

  const done    = impacts.filter(c => c.action !== null).length;
  const total   = impacts.length;
  const accepted = impacts.filter(c => c.action === "accepté").length;
  const allActioned = done === total;

  if (published) {
    return (
      <div style={{ padding: "80px 32px", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", backgroundColor: "#E8F5E9", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <CheckCircle2 size={32} style={{ color: "#2E7D32" }} />
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#1A1A1A" }}>Référentiel mis à jour</div>
        <div style={{ fontSize: 13, color: "#6B6B6B", textAlign: "center", maxWidth: 380, lineHeight: 1.6 }}>
          {accepted} modification{accepted > 1 ? "s" : ""} intégrée{accepted > 1 ? "s" : ""} au référentiel v4. Les banques concernées seront notifiées pour se réévaluer.
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

        {/* Breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#9B9B9B", marginBottom: 22 }}>
          <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#9B9B9B", padding: 0 }}
            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = "#1A1A1A"}
            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = "#9B9B9B"}
          >Veille réglementaire</button>
          <ChevronRight size={13} />
          <span style={{ color: "#1A1A1A", fontWeight: 600 }}>Analyse — Circulaire BCT n°2024-03</span>
        </div>

        {/* AI banner */}
        <div style={{ display: "flex", gap: 10, padding: "12px 16px", backgroundColor: "#EEF2FF", borderRadius: 8, border: "1px solid #C7D2FE", marginBottom: 22 }}>
          <Sparkles size={15} style={{ color: "#3730A3", flexShrink: 0, marginTop: 1 }} />
          <div>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#3730A3" }}>Analyse générée par IA</span>
            <span style={{ fontSize: 13, color: "#4338CA" }}> — à valider par un expert avant publication.</span>
            <div style={{ fontSize: 12, color: "#6366F1", marginTop: 2 }}>Acceptez, modifiez ou rejetez chaque exigence détectée pour mettre à jour le référentiel.</div>
          </div>
        </div>

        {/* Progress strip */}
        <div style={{ ...card, padding: "14px 20px", marginBottom: 22, display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#1A1A1A" }}>Validation des exigences</span>
              <span style={{ fontSize: 12, color: "#9B9B9B" }}>{done}/{total}</span>
            </div>
            <div style={{ height: 5, backgroundColor: "#F0F0F0", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(done / total) * 100}%`, backgroundColor: "#1A1A1A", borderRadius: 3, transition: "width 0.3s" }} />
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

        {/* Two columns */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.35fr", gap: 20, alignItems: "start" }}>

          {/* Left — PDF source */}
          <div style={{ ...card, overflow: "hidden", position: "sticky", top: 0 }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(0,0,0,0.06)", display: "flex", alignItems: "center", gap: 8 }}>
              <BookOpen size={13} style={{ color: "#6B6B6B" }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: "#1A1A1A" }}>Document source</span>
              <button style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#6B6B6B", background: "none", border: "none", cursor: "pointer" }}>
                <ExternalLink size={11} /> Ouvrir
              </button>
            </div>
            {/* Simulated PDF */}
            <div style={{ padding: "16px", fontSize: 12, color: "#4A4A4A", lineHeight: 1.8, maxHeight: 520, overflowY: "auto" }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#1A1A1A", marginBottom: 2 }}>Banque Centrale de Tunisie</div>
              <div style={{ fontSize: 11, color: "#9B9B9B", marginBottom: 12 }}>Circulaire n°2024-03 · 15 mars 2024</div>
              <div style={{ fontWeight: 600, color: "#1A1A1A", marginBottom: 10, fontSize: 12 }}>Renforcement des exigences en matière de cybersécurité et de protection des données</div>
              {[
                { art: "Art. 1", txt: "Les établissements de crédit et de paiement sont tenus de mettre en conformité leurs systèmes dans un délai de six (6) mois à compter de la date de publication." },
                { art: "Art. 3", txt: "Tout traitement de données à caractère personnel doit faire l'objet d'une journalisation systématique. Les journaux doivent être conservés pour une durée minimale de cinq (5) ans." },
                { art: "Art. 5", txt: "Les données sensibles stockées au repos et en transit doivent être chiffrées conformément aux standards AES-256 ou équivalents reconnus par l'ANSSI." },
                { art: "Art. 7", txt: "Chaque établissement désigne un Délégué à la Protection des Données (DPO) rattaché hiérarchiquement à la direction générale." },
                { art: "Art. 9", txt: "Le Plan de Reprise d'Activité doit faire l'objet d'un test annuel. Le rapport est transmis à la BCT dans les trente (30) jours suivant sa réalisation." },
              ].map(({ art, txt }) => (
                <p key={art} style={{ marginBottom: 10 }}><strong style={{ color: "#1A1A1A" }}>{art} :</strong> {txt}</p>
              ))}
            </div>
          </div>

          {/* Right — Impact cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A", marginBottom: 2 }}>
              Impacts proposés <span style={{ fontSize: 12, fontWeight: 400, color: "#9B9B9B" }}>· {total} exigences</span>
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
                <p style={{ fontSize: 13, color: "#1A1A1A", lineHeight: 1.55, margin: "0 0 10px" }}>{c.exigence}</p>

                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 14, flexWrap: "wrap" }}>
                  <TypeBadge type={c.type} />
                  <span style={{ fontSize: 11, color: "#6B6B6B", backgroundColor: "#F5F5F5", padding: "2px 8px", borderRadius: 4 }}>{c.element}</span>
                </div>

                {c.action !== null ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, borderRadius: 20, padding: "3px 10px",
                      backgroundColor: c.action === "accepté" ? "#E8F5E9" : c.action === "rejeté" ? "#FFEBEE" : "#FFF3E0",
                      color:           c.action === "accepté" ? "#2E7D32" : c.action === "rejeté" ? "#CC0000"  : "#E65100",
                    }}>
                      {c.action === "accepté" ? "✓ Accepté" : c.action === "rejeté" ? "✕ Rejeté" : "✎ À modifier"}
                    </span>
                    <button onClick={() => setAction(c.id, null)} style={{ fontSize: 11, color: "#9B9B9B", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                      Annuler
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 7 }}>
                    {([
                      { label: "Accepter", action: "accepté"  as ImpactAction, color: "#2E7D32", icon: Check    },
                      { label: "Modifier", action: "modifié"  as ImpactAction, color: "#E65100", icon: Edit2    },
                      { label: "Rejeter",  action: "rejeté"   as ImpactAction, color: "#CC0000", icon: XCircle  },
                    ] as { label: string; action: ImpactAction; color: string; icon: any }[]).map(btn => (
                      <button
                        key={btn.label}
                        onClick={() => setAction(c.id, btn.action)}
                        style={{ display: "flex", alignItems: "center", gap: 5, flex: 1, justifyContent: "center", padding: "7px 0", borderRadius: 6, fontSize: 12, fontWeight: 600, border: `1.5px solid ${btn.color}`, backgroundColor: "#fff", color: btn.color, cursor: "pointer", transition: "all 0.12s" }}
                        onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = btn.color; b.style.color = "#fff"; }}
                        onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#fff"; b.style.color = btn.color; }}
                      >
                        <btn.icon size={12} /> {btn.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Fixed publish bar */}
      <div style={{ position: "sticky", bottom: 0, backgroundColor: "#fff", borderTop: "1px solid rgba(0,0,0,0.08)", padding: "14px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "0 -4px 20px rgba(0,0,0,0.06)", zIndex: 10 }}>
        <div style={{ fontSize: 12, color: allActioned ? "#2E7D32" : "#9B9B9B" }}>
          {allActioned
            ? "✓ Toutes les exigences traitées — prêt à publier. Les banques concernées seront invitées à se réévaluer."
            : `${total - done} exigence${total - done > 1 ? "s" : ""} en attente de validation.`}
        </div>
        <button
          onClick={() => { if (allActioned) setPublished(true); }}
          disabled={!allActioned}
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 22px", borderRadius: 6, fontSize: 13, fontWeight: 700, border: "none", backgroundColor: allActioned ? "#1A1A1A" : "#E0E0E0", color: allActioned ? "#FFE600" : "#9B9B9B", cursor: allActioned ? "pointer" : "not-allowed", transition: "background 0.15s" }}
          onMouseEnter={e => { if (allActioned) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#2D2D2D"; }}
          onMouseLeave={e => { if (allActioned) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#1A1A1A"; }}
        >
          <RefreshCw size={14} /> Valider et publier la nouvelle version
        </button>
      </div>
    </div>
  );
}

// ── Frame 1 — List (new design) ───────────────────────────────────────────────

export function VeilleReglementaire() {
  const [view, setView] = useState<"list" | "analysis">("list");
  const [showUpload, setShowUpload] = useState(false);

  if (view === "analysis") return <ImpactAnalysis onBack={() => setView("list")} />;

  const enVigueur = circulairesData.filter(c => c.statut === "En vigueur").length;

  return (
    <div style={{ padding: "28px 32px 48px", backgroundColor: "#F2F2F2", minHeight: "100%" }}>

      {/* Page header — no card */}
      <div style={{ marginBottom: 28 }}>
        {/* Row 1: title + button */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
              <ShieldCheck size={12} style={{ color: "#B0B0B0" }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: "#B0B0B0", letterSpacing: "0.1em", textTransform: "uppercase", whiteSpace: "nowrap" }}>Banque Centrale de Tunisie</span>
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1A1A1A", margin: "0 0 3px", letterSpacing: "-0.02em" }}>
              Veille réglementaire
            </h1>
            <p style={{ fontSize: 12, color: "#9B9B9B", margin: 0, whiteSpace: "nowrap" }}>
              Référentiel <strong style={{ color: "#1A1A1A" }}>v4</strong> · Mis à jour en avril 2024
            </p>
          </div>
          <button
            onClick={() => setShowUpload(true)}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", borderRadius: 8, fontSize: 13, fontWeight: 700, border: "none", backgroundColor: "#1A1A1A", color: "#FFE600", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, marginLeft: 24 }}
            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#2D2D2D"}
            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#1A1A1A"}
          >
            <Upload size={14} /> Importer une circulaire
          </button>
        </div>

        {/* Row 2: stat chips */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {[
            { value: circulairesData.length, label: "circulaires intégrées", dot: "#1A1A1A" },
            { value: enVigueur,              label: "en vigueur",            dot: "#16A34A" },
            { value: circulairesData.length - enVigueur, label: "abrogées", dot: "#C0C0C0" },
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
      </div>

      {/* Circulaires list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {circulairesData.map(c => (
          <div key={c.id} style={{
            ...card, padding: "16px 20px",
            display: "flex", alignItems: "center", gap: 16,
            borderLeft: `3px solid ${c.statut === "En vigueur" ? "#2E7D32" : "#D0D0D0"}`,
            transition: "box-shadow 0.15s",
          }}
            onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)"}
            onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.boxShadow = "0 1px 3px rgba(0,0,0,0.04)"}
          >
            {/* Icon */}
            <div style={{ width: 42, height: 42, borderRadius: 10, backgroundColor: c.statut === "En vigueur" ? "#F0F7FF" : "#F5F5F5", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <FileText size={20} style={{ color: c.statut === "En vigueur" ? "#0277BD" : "#C0C0C0" }} />
            </div>

            {/* Main info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#1A1A1A" }}>{c.reference}</span>
                <StatutBadge statut={c.statut} />
                <span style={{ fontSize: 10, fontWeight: 700, color: "#3730A3", backgroundColor: "#EEF2FF", padding: "2px 7px", borderRadius: 4 }}>{c.version}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12, color: "#6B6B6B" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <Clock size={11} /> {c.datePublication}
                </span>
                <span>·</span>
                <span>{c.theme}</span>
                <span>·</span>
                <span>{c.articles} articles</span>
              </div>
            </div>

            {/* Action */}
            <button
              onClick={() => setView("analysis")}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, border: "1px solid rgba(0,0,0,0.10)", backgroundColor: "#fff", cursor: "pointer", color: "#4A4A4A", flexShrink: 0, transition: "all 0.12s", whiteSpace: "nowrap" }}
              onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#1A1A1A"; b.style.color = "#FFE600"; b.style.borderColor = "#1A1A1A"; }}
              onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#fff"; b.style.color = "#4A4A4A"; b.style.borderColor = "rgba(0,0,0,0.10)"; }}
            >
              Voir l'analyse <ArrowUpRight size={13} />
            </button>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ marginTop: 24, textAlign: "right" }}>
        <span style={{ fontSize: 11, color: "#C0C0C0", fontStyle: "italic" }}>Usage interne EY — confidentiel</span>
      </div>

      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onDone={() => { setShowUpload(false); setView("analysis"); }}
        />
      )}
    </div>
  );
}
