import { useState } from "react";
import {
  Plus, Edit2, ChevronDown, ChevronRight, GripVertical, X,
  Check, Copy, Eye, Trash2, HelpCircle, Layers, SlidersHorizontal,
  ArrowRight, ArrowLeft,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Question {
  id: string;
  label: string;
  type: string;
  weight: number;
  status: "Active" | "Inactive";
}

interface SubDimension {
  id: string;
  name: string;
  status: "Active" | "Inactive";
  questions: Question[];
}

interface Dimension {
  id: string;
  name: string;
  description: string;
  weight: number;
  status: "Active" | "Inactive";
  color: string;
  subDimensions: SubDimension[];
}

// ── Mock data ─────────────────────────────────────────────────────────────────

const initialDimensions: Dimension[] = [
  {
    id: "D1", name: "Stratégie Data & Alignement Business", weight: 15, status: "Active", color: "#1A1A1A",
    description: "Évalue l'existence et la maturité d'une vision stratégique data alignée avec les objectifs business.",
    subDimensions: [
      { id: "SD1-1", name: "Vision & Feuille de route data", status: "Active", questions: [
        { id: "Q-001", label: "Votre organisation dispose-t-elle d'une stratégie data formalisée ?", type: "Échelle de maturité", weight: 8, status: "Active" },
        { id: "Q-002", label: "Existe-t-il un sponsor exécutif identifié pour les initiatives data ?", type: "Oui/Non", weight: 6, status: "Active" },
      ]},
      { id: "SD1-2", name: "Alignement avec la stratégie business", status: "Active", questions: [
        { id: "Q-003", label: "Les KPIs data sont-ils alignés avec les objectifs stratégiques de la banque ?", type: "Échelle de maturité", weight: 7, status: "Active" },
      ]},
    ],
  },
  {
    id: "D2", name: "Gouvernance des données", weight: 18, status: "Active", color: "#0277BD",
    description: "Évalue les politiques, standards, processus et responsabilités liés à la gestion des données.",
    subDimensions: [
      { id: "SD2-1", name: "Politiques & Standards", status: "Active", questions: [
        { id: "Q-010", label: "Votre organisation dispose-t-elle d'une politique de gouvernance documentée ?", type: "Échelle de maturité", weight: 9, status: "Active" },
        { id: "Q-011", label: "Un comité de gouvernance data est-il en place ?", type: "Oui/Non", weight: 8, status: "Active" },
      ]},
      { id: "SD2-2", name: "Data Ownership & Stewardship", status: "Active", questions: [
        { id: "Q-012", label: "Des data owners sont-ils formellement désignés pour chaque domaine critique ?", type: "Choix unique", weight: 8, status: "Active" },
      ]},
    ],
  },
  {
    id: "D3", name: "Qualité des données", weight: 16, status: "Active", color: "#2E7D32",
    description: "Évalue les processus de mesure, contrôle et amélioration continue de la qualité des données.",
    subDimensions: [
      { id: "SD3-1", name: "Mesure & KQI", status: "Active", questions: [
        { id: "Q-020", label: "Des indicateurs de qualité (KQI) sont-ils définis et suivis régulièrement ?", type: "Échelle de maturité", weight: 9, status: "Active" },
      ]},
      { id: "SD3-2", name: "Processus de remédiation", status: "Active", questions: [
        { id: "Q-021", label: "Existe-t-il un processus formel de remédiation des anomalies de données ?", type: "Choix multiple", weight: 7, status: "Active" },
        { id: "Q-022", label: "Le délai moyen de correction des anomalies est-il mesuré ?", type: "Oui/Non", weight: 6, status: "Inactive" },
      ]},
    ],
  },
  {
    id: "D4", name: "Architecture & Technologies Data", weight: 15, status: "Active", color: "#7B2D8B",
    description: "Évalue la maturité de l'infrastructure technique et des plateformes data.",
    subDimensions: [
      { id: "SD4-1", name: "Plateforme Data", status: "Active", questions: [
        { id: "Q-030", label: "Décrivez l'architecture de votre plateforme data actuelle.", type: "Texte libre", weight: 6, status: "Active" },
      ]},
    ],
  },
  {
    id: "D5", name: "Sécurité, Conformité & Contrôle", weight: 14, status: "Active", color: "#C4550A",
    description: "Évalue le niveau de maîtrise des risques data et la conformité réglementaire.",
    subDimensions: [
      { id: "SD5-1", name: "RGPD & Conformité", status: "Active", questions: [
        { id: "Q-040", label: "Votre organisation maintient-elle un registre des traitements à jour ?", type: "Oui/Non", weight: 10, status: "Active" },
      ]},
    ],
  },
];

const responseTypes = ["Oui/Non", "Échelle de maturité", "Choix unique", "Choix multiple", "Texte libre"];
const maturityLevels = ["Initial (1)", "En développement (2)", "Défini (3)", "Maîtrisé (4)", "Optimisé (5)"];

// ── Badges ────────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const active = status === "Active";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, backgroundColor: active ? "#E8F5E9" : "#F5F5F5", color: active ? "#2E7D32" : "#9B9B9B", borderRadius: 20, padding: "2px 9px", fontSize: 11, fontWeight: 600 }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: active ? "#2E7D32" : "#9E9E9E" }} />
      {status}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, { bg: string; color: string }> = {
    "Oui/Non":            { bg: "#EEF2FF", color: "#3730A3" },
    "Échelle de maturité":{ bg: "#FFF7ED", color: "#9A3412" },
    "Choix unique":       { bg: "#F0FDF4", color: "#166534" },
    "Choix multiple":     { bg: "#FDF4FF", color: "#6B21A8" },
    "Texte libre":        { bg: "#F0F9FF", color: "#0C4A6E" },
  };
  const c = colors[type] || { bg: "#F5F5F5", color: "#6B6B6B" };
  return <span style={{ backgroundColor: c.bg, color: c.color, borderRadius: 4, padding: "1px 7px", fontSize: 10, fontWeight: 600 }}>{type}</span>;
}

// ── Step indicator ─────────────────────────────────────────────────────────────

function StepBar({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 24 }}>
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", flex: i < steps.length - 1 ? 1 : "none" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%",
                backgroundColor: done ? "#1A1A1A" : active ? "#1A1A1A" : "#F0F0F0",
                display: "flex", alignItems: "center", justifyContent: "center",
                border: active ? "2px solid #FFE600" : "none",
                transition: "all 0.2s",
              }}>
                {done
                  ? <Check size={13} style={{ color: "#FFE600" }} />
                  : <span style={{ fontSize: 11, fontWeight: 700, color: active ? "#FFE600" : "#9B9B9B" }}>{i + 1}</span>
                }
              </div>
              <span style={{ fontSize: 10, fontWeight: active ? 700 : 400, color: active ? "#1A1A1A" : "#9B9B9B", whiteSpace: "nowrap" }}>{s}</span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: 1.5, backgroundColor: done ? "#1A1A1A" : "#E0E0E0", margin: "0 8px", marginBottom: 16, transition: "background 0.2s" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Question form (shared step) ────────────────────────────────────────────────

function QuestionForm({ subDimName, dimName, onBack, onSave, isLast }: {
  subDimName: string; dimName: string;
  onBack: () => void; onSave: () => void; isLast?: boolean;
}) {
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [form, setForm] = useState({ label: "", description: "", type: "Échelle de maturité", weight: 5, required: true, order: 1, status: "Active" });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 12, color: "#9B9B9B" }}>{dimName} › <strong style={{ color: "#1A1A1A" }}>{subDimName}</strong></div>
        </div>
        <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", border: "1px solid rgba(0,0,0,0.10)" }}>
          {[["edit", "Édition"], ["preview", "Aperçu"]].map(([t, l]) => (
            <button key={t} onClick={() => setTab(t as any)} style={{
              padding: "5px 14px", fontSize: 12, fontWeight: 500, border: "none", cursor: "pointer",
              backgroundColor: tab === t ? "#1A1A1A" : "#fff",
              color: tab === t ? "#FFE600" : "#9B9B9B",
            }}>{l}</button>
          ))}
        </div>
      </div>

      {tab === "edit" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={lbl}>Libellé de la question *</label>
            <textarea value={form.label} onChange={e => setForm(p => ({ ...p, label: e.target.value }))} rows={3} placeholder="Entrez le libellé de la question..." style={{ ...inp, resize: "vertical" }} />
          </div>
          <div>
            <label style={lbl}>Aide à la réponse</label>
            <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2} placeholder="Informations complémentaires pour guider la réponse..." style={{ ...inp, resize: "vertical" }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div>
              <label style={lbl}>Type de réponse</label>
              <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} style={{ ...inp, appearance: "none", cursor: "pointer" }}>
                {responseTypes.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Poids (1–10)</label>
              <input type="number" min={1} max={10} value={form.weight} onChange={e => setForm(p => ({ ...p, weight: +e.target.value }))} style={inp} />
            </div>
            <div>
              <label style={lbl}>Ordre</label>
              <input type="number" min={1} value={form.order} onChange={e => setForm(p => ({ ...p, order: +e.target.value }))} style={inp} />
            </div>
          </div>
          {form.type === "Échelle de maturité" && (
            <div>
              <label style={lbl}>Scores par niveau</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {maturityLevels.map((level, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 12px", backgroundColor: "#F7F7F7", borderRadius: 5 }}>
                    <span style={{ fontSize: 12, color: "#1A1A1A", flex: 1 }}>{level}</span>
                    <input type="number" defaultValue={i + 1} min={0} max={10} style={{ width: 56, padding: "4px 8px", borderRadius: 4, border: "1px solid rgba(0,0,0,0.13)", fontSize: 12, textAlign: "center", outline: "none" }} />
                    <span style={{ fontSize: 11, color: "#9B9B9B" }}>pts</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: "#4A4A4A" }}>Obligatoire</label>
              <button onClick={() => setForm(p => ({ ...p, required: !p.required }))} style={{ width: 36, height: 20, borderRadius: 10, border: "none", cursor: "pointer", backgroundColor: form.required ? "#1A1A1A" : "#D0D0D0", position: "relative" }}>
                <span style={{ position: "absolute", top: 2, left: form.required ? 18 : 2, width: 16, height: 16, borderRadius: "50%", backgroundColor: "white", transition: "left 0.2s" }} />
              </button>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {["Active", "Inactive"].map(s => (
                <button key={s} onClick={() => setForm(p => ({ ...p, status: s }))} style={{ padding: "4px 12px", borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: "pointer", border: form.status === s ? "2px solid #1A1A1A" : "1px solid rgba(0,0,0,0.12)", backgroundColor: form.status === s ? "#1A1A1A" : "#fff", color: form.status === s ? "#FFE600" : "#6B6B6B" }}>{s}</button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ backgroundColor: "#F7F7F7", borderRadius: 8, padding: 20, minHeight: 200 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: "#9B9B9B", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>{dimName} · {subDimName}</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A", lineHeight: 1.5, marginBottom: 14 }}>{form.label || "Libellé de la question..."}</div>
          {form.description && (
            <div style={{ fontSize: 12, color: "#6B6B6B", marginBottom: 14, padding: "8px 12px", backgroundColor: "#EFF6FF", borderRadius: 4, borderLeft: "3px solid #3B82F6" }}>{form.description}</div>
          )}
          {form.type === "Échelle de maturité" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {maturityLevels.map((l, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", backgroundColor: "#fff", borderRadius: 5, border: "1px solid rgba(0,0,0,0.07)" }}>
                  <div style={{ width: 20, height: 20, borderRadius: "50%", border: "2px solid #D0D0D0", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: "#9B9B9B" }}>{i + 1}</span>
                  </div>
                  <span style={{ fontSize: 12, color: "#1A1A1A" }}>{l}</span>
                </div>
              ))}
            </div>
          )}
          {form.type === "Oui/Non" && (
            <div style={{ display: "flex", gap: 10 }}>
              {["Oui", "Non"].map(o => (
                <div key={o} style={{ flex: 1, padding: "12px", backgroundColor: "#fff", borderRadius: 5, border: "1px solid rgba(0,0,0,0.07)", textAlign: "center", fontSize: 13, fontWeight: 500 }}>{o}</div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20, paddingTop: 16, borderTop: "1px solid rgba(0,0,0,0.06)" }}>
        <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 6, fontSize: 13, fontWeight: 500, border: "1px solid rgba(0,0,0,0.12)", backgroundColor: "#fff", cursor: "pointer", color: "#4A4A4A" }}>
          <ArrowLeft size={13} /> Retour
        </button>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onSave} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 6, fontSize: 12, fontWeight: 500, border: "1px dashed rgba(0,0,0,0.2)", backgroundColor: "#fff", cursor: "pointer", color: "#4A4A4A" }}>
            + Ajouter une autre
          </button>
          <button onClick={onSave} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 18px", borderRadius: 6, fontSize: 13, fontWeight: 700, border: "none", backgroundColor: "#1A1A1A", color: "#FFE600", cursor: "pointer" }}>
            {isLast ? "Terminer" : "Enregistrer"} <Check size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

const inp: React.CSSProperties = { width: "100%", padding: "8px 11px", borderRadius: 5, border: "1px solid rgba(0,0,0,0.13)", fontSize: 13, outline: "none", boxSizing: "border-box", color: "#1A1A1A", backgroundColor: "#fff" };
const lbl: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: "#4A4A4A", marginBottom: 5, letterSpacing: "0.02em" };

// ── Add Dimension Modal (3 steps) ─────────────────────────────────────────────

function AddDimensionModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [subStep, setSubStep] = useState(0); // 0 = sub-dim form, 1 = question form
  const [dimForm, setDimForm] = useState({ name: "", description: "", weight: 10, color: "#1A1A1A" });
  const [subForms, setSubForms] = useState([{ name: "", status: "Active" }]);

  const steps = ["Dimension", "Sous-dimensions", "Questions"];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, backgroundColor: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ backgroundColor: "#fff", borderRadius: 12, width: 600, maxWidth: "94vw", maxHeight: "92vh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(0,0,0,0.16)" }}>

        {/* Header */}
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid rgba(0,0,0,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1A1A1A" }}>Nouvelle dimension</div>
            <div style={{ fontSize: 12, color: "#9B9B9B", marginTop: 2 }}>Remplissez chaque étape pour structurer votre questionnaire</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9B9B" }}><X size={18} /></button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
          <StepBar steps={steps} current={step} />

          {/* Step 0: Dimension */}
          {step === 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={lbl}>Nom de la dimension *</label>
                <input value={dimForm.name} onChange={e => setDimForm(p => ({ ...p, name: e.target.value }))} placeholder="ex. Gouvernance des données" style={inp} />
              </div>
              <div>
                <label style={lbl}>Description</label>
                <textarea value={dimForm.description} onChange={e => setDimForm(p => ({ ...p, description: e.target.value }))} rows={2} placeholder="Description courte de la dimension..." style={{ ...inp, resize: "vertical" }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <label style={lbl}>Poids (%)</label>
                  <input type="number" min={1} max={100} value={dimForm.weight} onChange={e => setDimForm(p => ({ ...p, weight: +e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Couleur de la dimension</label>
                  <input type="color" value={dimForm.color} onChange={e => setDimForm(p => ({ ...p, color: e.target.value }))} style={{ ...inp, height: 38, padding: 4, cursor: "pointer" }} />
                </div>
              </div>
              <div style={{ padding: "12px 16px", backgroundColor: "#F7F7F7", borderRadius: 8, display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 14, height: 14, borderRadius: 3, backgroundColor: dimForm.color }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: "#1A1A1A" }}>{dimForm.name || "Aperçu de la dimension"}</span>
                <span style={{ fontSize: 11, color: "#9B9B9B", marginLeft: "auto" }}>{dimForm.weight}%</span>
              </div>
            </div>
          )}

          {/* Step 1: Sub-dimensions */}
          {step === 1 && (
            <div>
              <div style={{ fontSize: 12, color: "#9B9B9B", marginBottom: 16 }}>Ajoutez les sous-dimensions pour <strong style={{ color: "#1A1A1A" }}>{dimForm.name}</strong></div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {subForms.map((sf, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "14px 16px", backgroundColor: "#F7F7F7", borderRadius: 8, border: "1px solid rgba(0,0,0,0.06)" }}>
                    <div style={{ width: 24, height: 24, borderRadius: "50%", backgroundColor: dimForm.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff", flexShrink: 0, marginTop: 1 }}>
                      {i + 1}
                    </div>
                    <div style={{ flex: 1 }}>
                      <input value={sf.name} onChange={e => { const s = [...subForms]; s[i].name = e.target.value; setSubForms(s); }} placeholder={`Nom de la sous-dimension ${i + 1}`} style={{ ...inp, backgroundColor: "#fff" }} />
                    </div>
                    {subForms.length > 1 && (
                      <button onClick={() => setSubForms(s => s.filter((_, j) => j !== i))} style={{ background: "none", border: "none", cursor: "pointer", color: "#CC0000", marginTop: 6 }}><X size={14} /></button>
                    )}
                  </div>
                ))}
              </div>
              <button onClick={() => setSubForms(s => [...s, { name: "", status: "Active" }])} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12, fontSize: 12, fontWeight: 600, color: dimForm.color, background: "none", border: `1px dashed ${dimForm.color}`, borderRadius: 6, padding: "7px 14px", cursor: "pointer", opacity: 0.85 }}>
                <Plus size={13} /> Ajouter une sous-dimension
              </button>
            </div>
          )}

          {/* Step 2: Questions */}
          {step === 2 && (
            <QuestionForm
              dimName={dimForm.name}
              subDimName={subForms[0]?.name || "Sous-dimension 1"}
              onBack={() => setStep(1)}
              onSave={onClose}
              isLast
            />
          )}
        </div>

        {/* Footer (steps 0 & 1 only) */}
        {step < 2 && (
          <div style={{ padding: "16px 24px", borderTop: "1px solid rgba(0,0,0,0.07)", display: "flex", justifyContent: "space-between", flexShrink: 0 }}>
            {step > 0
              ? <button onClick={() => setStep(s => s - 1)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 6, fontSize: 13, fontWeight: 500, border: "1px solid rgba(0,0,0,0.12)", backgroundColor: "#fff", cursor: "pointer", color: "#4A4A4A" }}><ArrowLeft size={13} /> Retour</button>
              : <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: 6, fontSize: 13, fontWeight: 500, border: "1px solid rgba(0,0,0,0.12)", backgroundColor: "#fff", cursor: "pointer", color: "#4A4A4A" }}>Annuler</button>
            }
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={step === 0 && !dimForm.name.trim()}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 20px", borderRadius: 6, fontSize: 13, fontWeight: 700, border: "none", backgroundColor: (step === 0 && !dimForm.name.trim()) ? "#E0E0E0" : "#1A1A1A", color: (step === 0 && !dimForm.name.trim()) ? "#9B9B9B" : "#FFE600", cursor: (step === 0 && !dimForm.name.trim()) ? "not-allowed" : "pointer" }}
            >
              Suivant <ArrowRight size={13} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Add Sub-dimension Modal (2 steps) ─────────────────────────────────────────

function AddSubDimModal({ dim, onClose }: { dim: Dimension; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ name: "", status: "Active" });

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, backgroundColor: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ backgroundColor: "#fff", borderRadius: 12, width: 580, maxWidth: "94vw", maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(0,0,0,0.16)" }}>

        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid rgba(0,0,0,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1A1A1A" }}>Nouvelle sous-dimension</div>
            <div style={{ fontSize: 12, color: "#9B9B9B", marginTop: 2 }}>Dans <strong style={{ color: "#1A1A1A" }}>{dim.name}</strong></div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9B9B" }}><X size={18} /></button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
          <StepBar steps={["Sous-dimension", "Questions"]} current={step} />

          {step === 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={lbl}>Nom de la sous-dimension *</label>
                <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="ex. Politiques & Standards" style={inp} />
              </div>
              <div>
                <label style={lbl}>Statut</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {["Active", "Inactive"].map(s => (
                    <button key={s} onClick={() => setForm(p => ({ ...p, status: s }))} style={{ padding: "7px 16px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", border: form.status === s ? "2px solid #1A1A1A" : "1px solid rgba(0,0,0,0.12)", backgroundColor: form.status === s ? "#1A1A1A" : "#fff", color: form.status === s ? "#FFE600" : "#6B6B6B" }}>{s}</button>
                  ))}
                </div>
              </div>
              <div style={{ padding: "12px 16px", backgroundColor: "#F7F7F7", borderRadius: 8, display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: dim.color }} />
                <span style={{ fontSize: 12, color: "#9B9B9B" }}>{dim.name} ›</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#1A1A1A" }}>{form.name || "Aperçu"}</span>
              </div>
            </div>
          )}

          {step === 1 && (
            <QuestionForm
              dimName={dim.name}
              subDimName={form.name}
              onBack={() => setStep(0)}
              onSave={onClose}
              isLast
            />
          )}
        </div>

        {step === 0 && (
          <div style={{ padding: "16px 24px", borderTop: "1px solid rgba(0,0,0,0.07)", display: "flex", justifyContent: "space-between", flexShrink: 0 }}>
            <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: 6, fontSize: 13, fontWeight: 500, border: "1px solid rgba(0,0,0,0.12)", backgroundColor: "#fff", cursor: "pointer", color: "#4A4A4A" }}>Annuler</button>
            <button onClick={() => setStep(1)} disabled={!form.name.trim()} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 20px", borderRadius: 6, fontSize: 13, fontWeight: 700, border: "none", backgroundColor: !form.name.trim() ? "#E0E0E0" : "#1A1A1A", color: !form.name.trim() ? "#9B9B9B" : "#FFE600", cursor: !form.name.trim() ? "not-allowed" : "pointer" }}>
              Suivant <ArrowRight size={13} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Question Edit Modal ───────────────────────────────────────────────────────

function QuestionEditModal({ question, dimName, subDimName, onClose }: {
  question: Question; dimName: string; subDimName: string; onClose: () => void;
}) {
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [form, setForm] = useState({ ...question });

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1100, backgroundColor: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ backgroundColor: "#fff", borderRadius: 12, width: 580, maxWidth: "94vw", maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(0,0,0,0.16)" }}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid rgba(0,0,0,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1A1A1A" }}>Modifier la question</div>
            <div style={{ fontSize: 11, color: "#9B9B9B", marginTop: 2 }}>{dimName} › {subDimName} › <span style={{ fontFamily: "monospace" }}>{question.id}</span></div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", border: "1px solid rgba(0,0,0,0.10)" }}>
              {[["edit", "Édition"], ["preview", "Aperçu"]].map(([t, l]) => (
                <button key={t} onClick={() => setTab(t as any)} style={{ padding: "5px 14px", fontSize: 12, fontWeight: 500, border: "none", cursor: "pointer", backgroundColor: tab === t ? "#1A1A1A" : "#fff", color: tab === t ? "#FFE600" : "#9B9B9B" }}>{l}</button>
              ))}
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9B9B" }}><X size={17} /></button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 22 }}>
          {tab === "edit" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={lbl}>Libellé de la question *</label>
                <textarea value={form.label} onChange={e => setForm(p => ({ ...p, label: e.target.value }))} rows={3} style={{ ...inp, resize: "vertical" }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <div>
                  <label style={lbl}>Type de réponse</label>
                  <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} style={{ ...inp, appearance: "none", cursor: "pointer" }}>
                    {responseTypes.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Poids (1–10)</label>
                  <input type="number" min={1} max={10} value={form.weight} onChange={e => setForm(p => ({ ...p, weight: +e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Statut</label>
                  <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value as any }))} style={{ ...inp, appearance: "none", cursor: "pointer" }}>
                    <option>Active</option><option>Inactive</option>
                  </select>
                </div>
              </div>
              {form.type === "Échelle de maturité" && (
                <div>
                  <label style={lbl}>Scores par niveau</label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {maturityLevels.map((level, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 12px", backgroundColor: "#F7F7F7", borderRadius: 5 }}>
                        <span style={{ fontSize: 12, flex: 1, color: "#1A1A1A" }}>{level}</span>
                        <input type="number" defaultValue={i + 1} min={0} max={10} style={{ width: 52, padding: "3px 8px", borderRadius: 4, border: "1px solid rgba(0,0,0,0.13)", fontSize: 12, textAlign: "center", outline: "none" }} />
                        <span style={{ fontSize: 11, color: "#9B9B9B" }}>pts</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ backgroundColor: "#F7F7F7", borderRadius: 8, padding: 20 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "#9B9B9B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>{dimName} · {subDimName}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A", lineHeight: 1.5, marginBottom: 16 }}>{form.label}</div>
              {form.type === "Oui/Non" && (
                <div style={{ display: "flex", gap: 10 }}>
                  {["Oui", "Non"].map(o => <div key={o} style={{ flex: 1, padding: "11px", backgroundColor: "#fff", borderRadius: 5, border: "1px solid rgba(0,0,0,0.08)", textAlign: "center", fontSize: 13, fontWeight: 500 }}>{o}</div>)}
                </div>
              )}
              {form.type === "Échelle de maturité" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {maturityLevels.map((l, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", backgroundColor: "#fff", borderRadius: 5, border: "1px solid rgba(0,0,0,0.07)" }}>
                      <div style={{ width: 20, height: 20, borderRadius: "50%", border: "2px solid #D0D0D0", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: "#9B9B9B" }}>{i + 1}</span>
                      </div>
                      <span style={{ fontSize: 12, color: "#1A1A1A" }}>{l}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <div style={{ padding: "14px 22px", borderTop: "1px solid rgba(0,0,0,0.07)", display: "flex", justifyContent: "flex-end", gap: 8, flexShrink: 0 }}>
          <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: 6, fontSize: 13, fontWeight: 500, border: "1px solid rgba(0,0,0,0.12)", backgroundColor: "#fff", cursor: "pointer", color: "#4A4A4A" }}>Annuler</button>
          <button onClick={onClose} style={{ padding: "8px 20px", borderRadius: 6, fontSize: 13, fontWeight: 700, border: "none", backgroundColor: "#1A1A1A", color: "#FFE600", cursor: "pointer" }}>Enregistrer</button>
        </div>
      </div>
    </div>
  );
}

// ── Question Preview Modal ────────────────────────────────────────────────────

function QuestionPreviewModal({ question, dimName, subDimName, onClose }: {
  question: Question; dimName: string; subDimName: string; onClose: () => void;
}) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1100, backgroundColor: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ backgroundColor: "#fff", borderRadius: 12, width: 500, maxWidth: "92vw", boxShadow: "0 24px 64px rgba(0,0,0,0.16)" }}>
        <div style={{ padding: "16px 22px", borderBottom: "1px solid rgba(0,0,0,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>Aperçu — {question.id}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9B9B" }}><X size={17} /></button>
        </div>
        <div style={{ padding: "20px 22px" }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: "#9B9B9B", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>{dimName} · {subDimName}</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#1A1A1A", lineHeight: 1.5, marginBottom: 18 }}>{question.label}</div>
          {question.type === "Oui/Non" && (
            <div style={{ display: "flex", gap: 10 }}>
              {["Oui", "Non"].map(o => <div key={o} style={{ flex: 1, padding: "13px", backgroundColor: "#F7F7F7", borderRadius: 6, border: "1px solid rgba(0,0,0,0.08)", textAlign: "center", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>{o}</div>)}
            </div>
          )}
          {question.type === "Échelle de maturité" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {maturityLevels.map((l, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", backgroundColor: "#F7F7F7", borderRadius: 6, border: "1px solid rgba(0,0,0,0.07)", cursor: "pointer" }}>
                  <div style={{ width: 22, height: 22, borderRadius: "50%", border: "2px solid #D0D0D0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#9B9B9B" }}>{i + 1}</span>
                  </div>
                  <span style={{ fontSize: 13, color: "#1A1A1A" }}>{l}</span>
                </div>
              ))}
            </div>
          )}
          {(question.type === "Texte libre") && (
            <textarea placeholder="Votre réponse..." rows={3} disabled style={{ width: "100%", padding: "10px 12px", borderRadius: 6, border: "1px solid rgba(0,0,0,0.12)", fontSize: 13, backgroundColor: "#F7F7F7", resize: "none", boxSizing: "border-box" }} />
          )}
        </div>
        <div style={{ padding: "12px 22px", borderTop: "1px solid rgba(0,0,0,0.07)", display: "flex", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "8px 20px", borderRadius: 6, fontSize: 13, fontWeight: 700, border: "none", backgroundColor: "#1A1A1A", color: "#FFE600", cursor: "pointer" }}>Fermer</button>
        </div>
      </div>
    </div>
  );
}

// ── Questions inline list ─────────────────────────────────────────────────────

function QuestionsList({ questions, dim, sub, onUpdate }: {
  questions: Question[];
  dim: Dimension;
  sub: SubDimension;
  onUpdate: (qs: Question[]) => void;
}) {
  const [editQ,   setEditQ]   = useState<Question | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const remove       = (id: string) => onUpdate(questions.filter(q => q.id !== id));
  const toggleStatus = (id: string) => onUpdate(questions.map(q =>
    q.id === id ? { ...q, status: q.status === "Active" ? "Inactive" : "Active" } : q
  ));

  const newEmptyQ: Question = {
    id: `Q-NEW-${Date.now()}`, label: "", type: "Échelle de maturité", weight: 5, status: "Active"
  };

  return (
    <>
      <div style={{ padding: "8px 16px 10px 50px", display: "flex", flexDirection: "column", gap: 5 }}>
        {questions.map((q, qi) => (
          <div key={q.id} style={{
            display: "flex", alignItems: "center", gap: 12,
            backgroundColor: "#fff",
            border: "1px solid rgba(0,0,0,0.07)",
            borderRadius: 8, padding: "10px 14px",
            opacity: q.status === "Inactive" ? 0.55 : 1,
            transition: "box-shadow 0.15s",
          }}
            onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 10px rgba(0,0,0,0.07)"}
            onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.boxShadow = "none"}
          >
            {/* Index badge */}
            <div style={{ width: 26, height: 26, borderRadius: 7, backgroundColor: `${dim.color}15`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: dim.color }}>{qi + 1}</span>
            </div>

            {/* Label + meta */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "#1A1A1A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.label}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                <TypeBadge type={q.type} />
                <span style={{ fontSize: 10, color: "#C0C0C0" }}>·</span>
                <span style={{ fontSize: 10, color: "#9B9B9B" }}>Poids</span>
                <div style={{ display: "flex", gap: 2 }}>
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} style={{ width: 5, height: 5, borderRadius: 1, backgroundColor: i < q.weight ? dim.color : "#EBEBEB" }} />
                  ))}
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: dim.color }}>{q.weight}</span>
              </div>
            </div>

            {/* Action buttons — Edit | Eye (toggle) | Delete */}
            <div style={{ display: "flex", gap: 5, flexShrink: 0, alignItems: "center" }}>
              {/* Edit */}
              <button title="Modifier" onClick={() => setEditQ(q)}
                style={{ width: 30, height: 30, borderRadius: 7, border: "1px solid rgba(0,0,0,0.09)", backgroundColor: "#F7F7F7", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#4A4A4A", transition: "all 0.12s" }}
                onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#1A1A1A"; b.style.color = "#FFE600"; b.style.borderColor = "#1A1A1A"; }}
                onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#F7F7F7"; b.style.color = "#4A4A4A"; b.style.borderColor = "rgba(0,0,0,0.09)"; }}
              >
                <Edit2 size={13} />
              </button>

              {/* Eye = toggle active/inactive */}
              <button
                title={q.status === "Active" ? "Désactiver" : "Activer"}
                onClick={() => toggleStatus(q.id)}
                style={{
                  width: 30, height: 30, borderRadius: 7, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  border: q.status === "Active" ? "1px solid #1A1A1A" : "1px solid rgba(0,0,0,0.09)",
                  backgroundColor: q.status === "Active" ? "#1A1A1A" : "#F7F7F7",
                  color: q.status === "Active" ? "#FFE600" : "#9B9B9B",
                  transition: "all 0.15s",
                }}
                onMouseEnter={e => {
                  const b = e.currentTarget as HTMLButtonElement;
                  if (q.status === "Active") { b.style.backgroundColor = "#333"; }
                  else { b.style.backgroundColor = "#1A1A1A"; b.style.color = "#FFE600"; b.style.borderColor = "#1A1A1A"; }
                }}
                onMouseLeave={e => {
                  const b = e.currentTarget as HTMLButtonElement;
                  b.style.backgroundColor = q.status === "Active" ? "#1A1A1A" : "#F7F7F7";
                  b.style.color = q.status === "Active" ? "#FFE600" : "#9B9B9B";
                  b.style.borderColor = q.status === "Active" ? "#1A1A1A" : "rgba(0,0,0,0.09)";
                }}
              >
                <Eye size={13} />
              </button>

              {/* Delete */}
              <button title="Supprimer" onClick={() => remove(q.id)}
                style={{ width: 30, height: 30, borderRadius: 7, border: "1px solid rgba(0,0,0,0.09)", backgroundColor: "#F7F7F7", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#CC0000", transition: "all 0.12s" }}
                onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#FFEBEE"; b.style.borderColor = "#FFCDD2"; }}
                onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#F7F7F7"; b.style.borderColor = "rgba(0,0,0,0.09)"; }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}

        {/* Add question button */}
        <button
          onClick={() => setAddOpen(true)}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "10px", borderRadius: 8, border: `1.5px dashed ${dim.color}40`, backgroundColor: "transparent", cursor: "pointer", fontSize: 12, fontWeight: 600, color: dim.color, marginTop: 2, transition: "background 0.15s" }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = `${dim.color}08`; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
        >
          <Plus size={13} /> Ajouter une question
        </button>
      </div>

      {editQ && (
        <QuestionEditModal question={editQ} dimName={dim.name} subDimName={sub.name} onClose={() => setEditQ(null)} />
      )}
      {addOpen && (
        <QuestionEditModal question={newEmptyQ} dimName={dim.name} subDimName={sub.name} onClose={() => setAddOpen(false)} />
      )}
    </>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function DimensionsManagement() {
  const [dimensions, setDimensions] = useState<Dimension[]>(initialDimensions);

  const updateQuestions = (dimId: string, subId: string, qs: Question[]) => {
    setDimensions(prev => prev.map(d => d.id !== dimId ? d : {
      ...d, subDimensions: d.subDimensions.map(s => s.id !== subId ? s : { ...s, questions: qs })
    }));
  };
  const [expandedDims, setExpandedDims]     = useState<string[]>([]);
  const [expandedSubs, setExpandedSubs]     = useState<string[]>([]);
  const [showAddDim,   setShowAddDim]       = useState(false);
  const [addSubForDim, setAddSubForDim]     = useState<Dimension | null>(null);
  const [editDim,      setEditDim]          = useState<Dimension | null>(null);
  const [editSub,      setEditSub]          = useState<{ dim: Dimension; sub: SubDimension } | null>(null);

  const toggleDim = (id: string) => setExpandedDims(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const toggleSub = (id: string) => setExpandedSubs(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  const totalQ = dimensions.reduce((a, d) => a + d.subDimensions.reduce((b, s) => b + s.questions.length, 0), 0);
  const totalS = dimensions.reduce((a, d) => a + d.subDimensions.length, 0);

  return (
    <div style={{ padding: "28px 32px 40px", backgroundColor: "#F2F2F2", minHeight: "100%" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 22 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: "#1A1A1A", margin: 0, letterSpacing: "-0.02em" }}>Gestion du framework</h1>
          <p style={{ fontSize: 13, color: "#9B9B9B", margin: "4px 0 0" }}>
            {dimensions.length} dimensions · {totalS} sous-dimensions · {totalQ} questions
          </p>
        </div>
        <button
          onClick={() => setShowAddDim(true)}
          style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 18px", borderRadius: 6, fontSize: 13, fontWeight: 700, border: "none", backgroundColor: "#1A1A1A", color: "#FFE600", cursor: "pointer", boxShadow: "0 4px 14px rgba(0,0,0,0.18)", transition: "all 0.15s" }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#2D2D2D"; (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#1A1A1A"; (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)"; }}
        >
          <Plus size={15} /> Nouvelle dimension
        </button>
      </div>

      {/* Weight distribution */}
      <div style={{ backgroundColor: "#fff", borderRadius: 10, border: "1px solid rgba(0,0,0,0.06)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)", padding: "18px 20px", marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#1A1A1A" }}>Pondérations par dimension</span>
          <span style={{ fontSize: 11, color: "#9B9B9B" }}>{dimensions.reduce((a, d) => a + d.weight, 0)}% répartis sur {dimensions.length} dimensions</span>
        </div>

        {/* Stacked bar */}
        <div style={{ display: "flex", height: 36, borderRadius: 8, overflow: "hidden", gap: 2, marginBottom: 14 }}>
          {dimensions.map(d => (
            <div
              key={d.id}
              title={`${d.name} — ${d.weight}%`}
              onClick={() => toggleDim(d.id)}
              style={{
                flex: d.weight,
                backgroundColor: d.color,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer",
                transition: "opacity 0.15s, filter 0.15s",
              }}
              onMouseEnter={e => { const el = e.currentTarget as HTMLDivElement; el.style.filter = "brightness(1.2)"; }}
              onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.filter = "brightness(1)"; }}
            >
              {d.weight >= 12 && (
                <span style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.92)", letterSpacing: "0.01em" }}>
                  {d.weight}%
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 24px" }}>
          {dimensions.map(d => (
            <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer" }} onClick={() => toggleDim(d.id)}>
              <span style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: d.color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: "#1A1A1A", fontWeight: 400 }}>{d.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Dimensions list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {dimensions.map(dim => {
          const isOpenDim = expandedDims.includes(dim.id);
          const totalQDim = dim.subDimensions.reduce((a, s) => a + s.questions.length, 0);

          return (
            <div key={dim.id} style={{ backgroundColor: "#fff", borderRadius: 10, border: "1px solid rgba(0,0,0,0.06)", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>

              {/* Dimension row */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", cursor: "pointer", borderLeft: `4px solid ${dim.color}` }} onClick={() => toggleDim(dim.id)}>
                <GripVertical size={15} style={{ color: "#D0D0D0", flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#1A1A1A" }}>{dim.name}</span>
                    <StatusBadge status={dim.status} />
                  </div>
                  <div style={{ fontSize: 12, color: "#9B9B9B" }}>{dim.description}</div>
                </div>
                <div style={{ display: "flex", gap: 20, alignItems: "center", flexShrink: 0 }}>
                  {[
                    { v: dim.subDimensions.length, l: "sous-dim." },
                    { v: totalQDim,                l: "questions" },
                    { v: `${dim.weight}%`,         l: "poids",     bold: true, color: dim.color },
                  ].map((s, i) => (
                    <div key={i} style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: s.color || "#1A1A1A" }}>{s.v}</div>
                      <div style={{ fontSize: 10, color: "#9B9B9B", textTransform: "uppercase", letterSpacing: "0.05em" }}>{s.l}</div>
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 5 }}>
                    <button onClick={e => { e.stopPropagation(); setEditDim(dim); }} title="Modifier la dimension" style={{ width: 28, height: 28, borderRadius: 5, border: "1px solid rgba(0,0,0,0.10)", backgroundColor: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#6B6B6B", transition: "all 0.15s" }}
                      onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#1A1A1A"; b.style.color = "#FFE600"; }}
                      onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#fff"; b.style.color = "#6B6B6B"; }}>
                      <Edit2 size={12} />
                    </button>
                    <button onClick={e => { e.stopPropagation(); setAddSubForDim(dim); }} style={{ width: 28, height: 28, borderRadius: 5, border: "1px solid rgba(0,0,0,0.10)", backgroundColor: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#6B6B6B" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#1A1A1A"; (e.currentTarget as HTMLButtonElement).style.color = "#fff"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#fff"; (e.currentTarget as HTMLButtonElement).style.color = "#6B6B6B"; }}>
                      <Plus size={12} />
                    </button>
                  </div>
                  {isOpenDim ? <ChevronDown size={16} style={{ color: "#9B9B9B" }} /> : <ChevronRight size={16} style={{ color: "#9B9B9B" }} />}
                </div>
              </div>

              {/* Sub-dimensions */}
              {isOpenDim && (
                <div style={{ backgroundColor: "#FAFAFA", borderTop: "1px solid rgba(0,0,0,0.05)" }}>
                  {dim.subDimensions.map((sub, si) => {
                    const isOpenSub = expandedSubs.includes(sub.id);
                    return (
                      <div key={sub.id} style={{ borderBottom: si < dim.subDimensions.length - 1 ? "1px solid rgba(0,0,0,0.04)" : "none" }}>

                        {/* Sub-dim row */}
                        <div
                          style={{
                            display: "flex", alignItems: "center", gap: 10,
                            padding: "12px 18px 12px 44px", cursor: "pointer",
                            backgroundColor: isOpenSub ? "#fff" : "#FAFAFA",
                            borderLeft: isOpenSub ? `3px solid ${dim.color}` : "3px solid transparent",
                            transition: "background 0.15s, border-color 0.15s",
                          }}
                          onClick={() => toggleSub(sub.id)}
                          onMouseEnter={e => { if (!isOpenSub) (e.currentTarget as HTMLDivElement).style.backgroundColor = "#F0F0F0"; }}
                          onMouseLeave={e => { if (!isOpenSub) (e.currentTarget as HTMLDivElement).style.backgroundColor = "#FAFAFA"; }}
                        >
                          <GripVertical size={13} style={{ color: "#D0D0D0", flexShrink: 0 }} />
                          <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: isOpenSub ? dim.color : "#C0C0C0", flexShrink: 0, transition: "background 0.15s" }} />
                          <span style={{ flex: 1, fontSize: 13, fontWeight: isOpenSub ? 700 : 500, color: isOpenSub ? "#1A1A1A" : "#4A4A4A", transition: "font-weight 0.1s" }}>{sub.name}</span>
                          <span style={{ fontSize: 11, color: "#9B9B9B", marginRight: 10, backgroundColor: "#F0F0F0", padding: "2px 8px", borderRadius: 20 }}>
                            {sub.questions.length} question{sub.questions.length !== 1 ? "s" : ""}
                          </span>
                          <StatusBadge status={sub.status} />
                          <div style={{ display: "flex", gap: 4, marginLeft: 8 }}>
                            <button onClick={e => { e.stopPropagation(); setEditSub({ dim, sub }); }} title="Modifier la sous-dimension" style={{ width: 26, height: 26, borderRadius: 5, border: "1px solid rgba(0,0,0,0.09)", backgroundColor: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#6B6B6B", transition: "all 0.12s" }}
                              onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#1A1A1A"; b.style.color = "#FFE600"; }}
                              onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#fff"; b.style.color = "#6B6B6B"; }}>
                              <Edit2 size={11} />
                            </button>
                          </div>
                          <div style={{ width: 26, height: 26, borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: isOpenSub ? dim.color : "transparent" }}>
                            {isOpenSub
                              ? <ChevronDown size={14} style={{ color: "#fff" }} />
                              : <ChevronRight size={14} style={{ color: "#9B9B9B" }} />}
                          </div>
                        </div>

                        {/* Questions inline */}
                        {isOpenSub && (
                          <div style={{ backgroundColor: "#FAFAFA", borderTop: "1px solid rgba(0,0,0,0.04)", paddingBottom: 10 }}>
                            <QuestionsList
                              questions={sub.questions}
                              dim={dim}
                              sub={sub}
                              onUpdate={qs => updateQuestions(dim.id, sub.id, qs)}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Add sub-dimension */}
                  <div style={{ padding: "8px 18px 14px 56px" }}>
                    <button
                      onClick={() => setAddSubForDim(dim)}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        padding: "6px 14px", borderRadius: 6,
                        border: "1px solid rgba(0,0,0,0.12)",
                        backgroundColor: "#fff", cursor: "pointer",
                        fontSize: 12, fontWeight: 500, color: "#4A4A4A",
                        transition: "all 0.15s",
                      }}
                      onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = "#1A1A1A"; b.style.color = "#1A1A1A"; b.style.backgroundColor = "#F7F7F7"; }}
                      onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = "rgba(0,0,0,0.12)"; b.style.color = "#4A4A4A"; b.style.backgroundColor = "#fff"; }}
                    >
                      <Plus size={12} /> Ajouter une sous-dimension
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showAddDim   && <AddDimensionModal onClose={() => setShowAddDim(false)} />}
      {addSubForDim && <AddSubDimModal dim={addSubForDim} onClose={() => setAddSubForDim(null)} />}

      {/* Edit dimension modal */}
      {editDim && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, backgroundColor: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ backgroundColor: "#fff", borderRadius: 12, width: 500, maxWidth: "92vw", boxShadow: "0 24px 64px rgba(0,0,0,0.16)", overflow: "hidden" }}>
            <div style={{ padding: "18px 22px", borderBottom: "1px solid rgba(0,0,0,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#1A1A1A" }}>Modifier la dimension</div>
                <div style={{ fontSize: 12, color: "#9B9B9B", marginTop: 2 }}>{editDim.name}</div>
              </div>
              <button onClick={() => setEditDim(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9B9B" }}><X size={18} /></button>
            </div>
            <div style={{ padding: "22px", display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#4A4A4A", marginBottom: 5 }}>Nom de la dimension *</label>
                <input defaultValue={editDim.name} style={{ width: "100%", padding: "8px 11px", borderRadius: 6, border: "1px solid rgba(0,0,0,0.13)", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#4A4A4A", marginBottom: 5 }}>Description</label>
                <textarea defaultValue={editDim.description} rows={2} style={{ width: "100%", padding: "8px 11px", borderRadius: 6, border: "1px solid rgba(0,0,0,0.13)", fontSize: 13, outline: "none", resize: "vertical", boxSizing: "border-box" }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#4A4A4A", marginBottom: 5 }}>Poids (%)</label>
                  <input type="number" defaultValue={editDim.weight} min={1} max={100} style={{ width: "100%", padding: "8px 11px", borderRadius: 6, border: "1px solid rgba(0,0,0,0.13)", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#4A4A4A", marginBottom: 5 }}>Couleur</label>
                  <input type="color" defaultValue={editDim.color} style={{ width: "100%", height: 38, borderRadius: 6, border: "1px solid rgba(0,0,0,0.13)", cursor: "pointer", padding: 4, boxSizing: "border-box" }} />
                </div>
              </div>
            </div>
            <div style={{ padding: "14px 22px", borderTop: "1px solid rgba(0,0,0,0.07)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setEditDim(null)} style={{ padding: "8px 18px", borderRadius: 6, fontSize: 13, fontWeight: 500, border: "1px solid rgba(0,0,0,0.12)", backgroundColor: "#fff", cursor: "pointer", color: "#4A4A4A" }}>Annuler</button>
              <button onClick={() => setEditDim(null)} style={{ padding: "8px 20px", borderRadius: 6, fontSize: 13, fontWeight: 700, border: "none", backgroundColor: "#1A1A1A", color: "#FFE600", cursor: "pointer" }}
                onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#2D2D2D"}
                onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#1A1A1A"}
              >Enregistrer</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit sub-dimension modal */}
      {editSub && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, backgroundColor: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ backgroundColor: "#fff", borderRadius: 12, width: 460, maxWidth: "92vw", boxShadow: "0 24px 64px rgba(0,0,0,0.16)", overflow: "hidden" }}>
            <div style={{ padding: "18px 22px", borderBottom: "1px solid rgba(0,0,0,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#1A1A1A" }}>Modifier la sous-dimension</div>
                <div style={{ fontSize: 12, color: "#9B9B9B", marginTop: 2 }}>{editSub.dim.name} › {editSub.sub.name}</div>
              </div>
              <button onClick={() => setEditSub(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9B9B" }}><X size={18} /></button>
            </div>
            <div style={{ padding: "22px", display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#4A4A4A", marginBottom: 5 }}>Nom de la sous-dimension *</label>
                <input defaultValue={editSub.sub.name} style={{ width: "100%", padding: "8px 11px", borderRadius: 6, border: "1px solid rgba(0,0,0,0.13)", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#4A4A4A", marginBottom: 5 }}>Statut</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {["Active", "Inactive"].map(s => (
                    <button key={s} style={{ padding: "7px 16px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", border: editSub.sub.status === s ? "2px solid #1A1A1A" : "1px solid rgba(0,0,0,0.12)", backgroundColor: editSub.sub.status === s ? "#1A1A1A" : "#fff", color: editSub.sub.status === s ? "#FFE600" : "#6B6B6B" }}>{s}</button>
                  ))}
                </div>
              </div>
              <div style={{ padding: "10px 14px", backgroundColor: "#F7F7F7", borderRadius: 7, display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: editSub.dim.color }} />
                <span style={{ fontSize: 11, color: "#9B9B9B" }}>{editSub.dim.name} ›</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#1A1A1A" }}>{editSub.sub.name}</span>
              </div>
            </div>
            <div style={{ padding: "14px 22px", borderTop: "1px solid rgba(0,0,0,0.07)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setEditSub(null)} style={{ padding: "8px 18px", borderRadius: 6, fontSize: 13, fontWeight: 500, border: "1px solid rgba(0,0,0,0.12)", backgroundColor: "#fff", cursor: "pointer", color: "#4A4A4A" }}>Annuler</button>
              <button onClick={() => setEditSub(null)} style={{ padding: "8px 20px", borderRadius: 6, fontSize: 13, fontWeight: 700, border: "none", backgroundColor: "#1A1A1A", color: "#FFE600", cursor: "pointer" }}
                onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#2D2D2D"}
                onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#1A1A1A"}
              >Enregistrer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
