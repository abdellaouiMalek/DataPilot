import { useState } from "react";
import { Plus, Edit2, ChevronDown, ChevronRight, X, Check, Eye, Trash2, ArrowRight, ArrowLeft } from "lucide-react";

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

// ── Data ──────────────────────────────────────────────────────────────────────

const initialDimensions: Dimension[] = [
  {
    id: "D1", name: "Stratégie Data & Alignement Business", weight: 15, status: "Active", color: "#1A1A1A",
    description: "Vision stratégique data alignée avec les objectifs business.",
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
    description: "Politiques, standards et responsabilités liés à la gestion des données.",
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
    description: "Mesure, contrôle et amélioration continue de la qualité des données.",
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
    description: "Maturité de l'infrastructure technique et des plateformes data.",
    subDimensions: [
      { id: "SD4-1", name: "Plateforme Data", status: "Active", questions: [
        { id: "Q-030", label: "Décrivez l'architecture de votre plateforme data actuelle.", type: "Texte libre", weight: 6, status: "Active" },
      ]},
    ],
  },
  {
    id: "D5", name: "Sécurité, Conformité & Contrôle", weight: 14, status: "Active", color: "#C4550A",
    description: "Maîtrise des risques data et conformité réglementaire.",
    subDimensions: [
      { id: "SD5-1", name: "RGPD & Conformité", status: "Active", questions: [
        { id: "Q-040", label: "Votre organisation maintient-elle un registre des traitements à jour ?", type: "Oui/Non", weight: 10, status: "Active" },
      ]},
    ],
  },
];

const responseTypes = ["Oui/Non", "Échelle de maturité", "Choix unique", "Choix multiple", "Texte libre"];

const maturityLevels = [
  { num: 1, name: "Initial",          defaultLabel: "Aucune pratique formalisée, approche ad-hoc." },
  { num: 2, name: "En développement", defaultLabel: "Des initiatives émergent mais restent isolées." },
  { num: 3, name: "Défini",           defaultLabel: "Des politiques et standards sont documentés." },
  { num: 4, name: "Maîtrisé",         defaultLabel: "Les pratiques sont mesurées et contrôlées." },
  { num: 5, name: "Optimisé",         defaultLabel: "Amélioration continue, culture data ancrée." },
];

// ── Shared styles ──────────────────────────────────────────────────────────────

const inp: React.CSSProperties = {
  width: "100%", padding: "8px 11px", borderRadius: 5,
  border: "1px solid rgba(0,0,0,0.13)", fontSize: 13,
  outline: "none", boxSizing: "border-box",
  color: "#1A1A1A", backgroundColor: "#fff",
};
const lbl: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 600,
  color: "#6B6B6B", marginBottom: 5, letterSpacing: "0.02em",
  textTransform: "uppercase",
};

// ── Type badge ────────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  const map: Record<string, string> = {
    "Oui/Non": "#3730A3",
    "Échelle de maturité": "#9A3412",
    "Choix unique": "#166534",
    "Choix multiple": "#6B21A8",
    "Texte libre": "#0C4A6E",
  };
  const color = map[type] || "#6B6B6B";
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, color,
      backgroundColor: `${color}15`,
      borderRadius: 3, padding: "2px 7px",
    }}>{type}</span>
  );
}

// ── Step bar ──────────────────────────────────────────────────────────────────

function StepBar({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", marginBottom: 28 }}>
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", flex: i < steps.length - 1 ? 1 : "none" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
              <div style={{
                width: 26, height: 26, borderRadius: "50%",
                backgroundColor: done || active ? "#1A1A1A" : "#F0F0F0",
                display: "flex", alignItems: "center", justifyContent: "center",
                outline: active ? "3px solid #FFE600" : "none",
                outlineOffset: 1,
              }}>
                {done
                  ? <Check size={12} style={{ color: "#FFE600" }} />
                  : <span style={{ fontSize: 11, fontWeight: 700, color: active ? "#FFE600" : "#9B9B9B" }}>{i + 1}</span>
                }
              </div>
              <span style={{ fontSize: 10, fontWeight: active ? 700 : 400, color: active ? "#1A1A1A" : "#9B9B9B", whiteSpace: "nowrap" }}>{s}</span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: 1, backgroundColor: done ? "#1A1A1A" : "#E0E0E0", margin: "0 10px", marginBottom: 14 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Maturity responses editor ─────────────────────────────────────────────────

function MaturityEditor({ responses, onChange }: {
  responses: { score: number; label: string }[];
  onChange: (r: { score: number; label: string }[]) => void;
}) {
  return (
    <div>
      <label style={lbl}>Réponses par niveau</label>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {maturityLevels.map((level, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", backgroundColor: "#F7F7F7", borderRadius: 6, border: "1px solid rgba(0,0,0,0.06)" }}>
            <div style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: "#1A1A1A", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: "#FFE600" }}>{level.num}</span>
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#4A4A4A", width: 105, flexShrink: 0 }}>{level.name}</span>
            <input
              value={responses[i]?.label ?? ""}
              onChange={e => {
                const updated = [...responses];
                updated[i] = { ...updated[i], label: e.target.value };
                onChange(updated);
              }}
              placeholder="Libellé de la réponse..."
              style={{ ...inp, flex: 1, fontSize: 12, padding: "6px 10px" }}
            />
            <input
              type="number" value={responses[i]?.score ?? i + 1} min={0} max={10}
              onChange={e => {
                const updated = [...responses];
                updated[i] = { ...updated[i], score: +e.target.value };
                onChange(updated);
              }}
              style={{ width: 50, padding: "5px 8px", borderRadius: 5, border: "1px solid rgba(0,0,0,0.13)", fontSize: 12, textAlign: "center", outline: "none" }}
            />
            <span style={{ fontSize: 11, color: "#9B9B9B", flexShrink: 0 }}>pts</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Choice options editor ─────────────────────────────────────────────────────

function ChoiceEditor({ options, onChange }: {
  options: { label: string; score: number }[];
  onChange: (o: { label: string; score: number }[]) => void;
}) {
  return (
    <div>
      <label style={lbl}>Options de réponse</label>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {options.map((opt, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", backgroundColor: "#F7F7F7", borderRadius: 6, border: "1px solid rgba(0,0,0,0.06)" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#9B9B9B", width: 18, flexShrink: 0 }}>{String.fromCharCode(65 + i)}</span>
            <input
              value={opt.label}
              onChange={e => { const u = [...options]; u[i] = { ...u[i], label: e.target.value }; onChange(u); }}
              placeholder={`Option ${String.fromCharCode(65 + i)}...`}
              style={{ ...inp, flex: 1, fontSize: 12, padding: "6px 10px" }}
            />
            <input
              type="number" value={opt.score} min={0} max={10}
              onChange={e => { const u = [...options]; u[i] = { ...u[i], score: +e.target.value }; onChange(u); }}
              style={{ width: 50, padding: "5px 8px", borderRadius: 5, border: "1px solid rgba(0,0,0,0.13)", fontSize: 12, textAlign: "center", outline: "none" }}
            />
            <span style={{ fontSize: 11, color: "#9B9B9B", flexShrink: 0 }}>pts</span>
            {options.length > 2 && (
              <button onClick={() => onChange(options.filter((_, j) => j !== i))} style={{ background: "none", border: "none", cursor: "pointer", color: "#CC0000", padding: 2, flexShrink: 0 }}><X size={12} /></button>
            )}
          </div>
        ))}
      </div>
      <button
        onClick={() => onChange([...options, { label: "", score: options.length + 1 }])}
        style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 7, fontSize: 11, fontWeight: 600, color: "#6B6B6B", background: "none", border: "1px dashed rgba(0,0,0,0.18)", borderRadius: 5, padding: "5px 10px", cursor: "pointer" }}
      >
        <Plus size={11} /> Ajouter une option
      </button>
    </div>
  );
}

// ── Question form ─────────────────────────────────────────────────────────────

function QuestionForm({ dimName, subDimName, onBack, onSave, isLast }: {
  dimName: string; subDimName: string;
  onBack: () => void; onSave: () => void; isLast?: boolean;
}) {
  const [form, setForm] = useState({ label: "", description: "", type: "Échelle de maturité", weight: 5, required: true, status: "Active" });
  const [maturityResponses, setMaturityResponses] = useState(
    maturityLevels.map((l, i) => ({ score: i + 1, label: l.defaultLabel }))
  );
  const [choiceOptions, setChoiceOptions] = useState([{ label: "", score: 1 }, { label: "", score: 2 }]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 11, color: "#9B9B9B" }}>{dimName} › <strong style={{ color: "#4A4A4A" }}>{subDimName}</strong></div>

      <div>
        <label style={lbl}>Libellé de la question *</label>
        <textarea value={form.label} onChange={e => setForm(p => ({ ...p, label: e.target.value }))} rows={3} placeholder="Entrez le libellé de la question..." style={{ ...inp, resize: "vertical" }} />
      </div>

      <div>
        <label style={lbl}>Aide à la réponse</label>
        <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2} placeholder="Informations complémentaires pour guider la réponse..." style={{ ...inp, resize: "vertical" }} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label style={lbl}>Type de réponse</label>
          <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} style={{ ...inp, cursor: "pointer" }}>
            {responseTypes.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Poids (1–10)</label>
          <input type="number" min={1} max={10} value={form.weight} onChange={e => setForm(p => ({ ...p, weight: +e.target.value }))} style={inp} />
        </div>
      </div>

      {form.type === "Échelle de maturité" && (
        <MaturityEditor responses={maturityResponses} onChange={setMaturityResponses} />
      )}

      {(form.type === "Choix unique" || form.type === "Choix multiple") && (
        <ChoiceEditor options={choiceOptions} onChange={setChoiceOptions} />
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 4 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 500, color: "#4A4A4A", cursor: "pointer" }}>
          <button onClick={() => setForm(p => ({ ...p, required: !p.required }))} style={{ width: 34, height: 18, borderRadius: 9, border: "none", cursor: "pointer", backgroundColor: form.required ? "#1A1A1A" : "#D0D0D0", position: "relative", flexShrink: 0 }}>
            <span style={{ position: "absolute", top: 2, left: form.required ? 16 : 2, width: 14, height: 14, borderRadius: "50%", backgroundColor: "white", transition: "left 0.2s" }} />
          </button>
          Obligatoire
        </label>
        <div style={{ display: "flex", gap: 6 }}>
          {["Active", "Inactive"].map(s => (
            <button key={s} onClick={() => setForm(p => ({ ...p, status: s }))} style={{ padding: "4px 12px", borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: "pointer", border: form.status === s ? "1.5px solid #1A1A1A" : "1px solid rgba(0,0,0,0.12)", backgroundColor: form.status === s ? "#1A1A1A" : "#fff", color: form.status === s ? "#FFE600" : "#6B6B6B" }}>{s}</button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 12, borderTop: "1px solid rgba(0,0,0,0.06)", marginTop: 4 }}>
        <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 6, fontSize: 13, fontWeight: 500, border: "1px solid rgba(0,0,0,0.12)", backgroundColor: "#fff", cursor: "pointer", color: "#4A4A4A" }}>
          <ArrowLeft size={13} /> Retour
        </button>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onSave} style={{ padding: "8px 14px", borderRadius: 6, fontSize: 12, fontWeight: 500, border: "1px dashed rgba(0,0,0,0.2)", backgroundColor: "#fff", cursor: "pointer", color: "#4A4A4A" }}>
            + Autre question
          </button>
          <button onClick={onSave} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 18px", borderRadius: 6, fontSize: 13, fontWeight: 700, border: "none", backgroundColor: "#1A1A1A", color: "#FFE600", cursor: "pointer" }}>
            {isLast ? "Terminer" : "Enregistrer"} <Check size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Question edit modal ───────────────────────────────────────────────────────

function QuestionEditModal({ question, dimName, subDimName, onClose }: {
  question: Question; dimName: string; subDimName: string; onClose: () => void;
}) {
  const [form, setForm] = useState({ ...question });
  const [maturityResponses, setMaturityResponses] = useState(
    maturityLevels.map((l, i) => ({ score: i + 1, label: l.defaultLabel }))
  );
  const [choiceOptions, setChoiceOptions] = useState([{ label: "", score: 1 }, { label: "", score: 2 }]);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1100, backgroundColor: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ backgroundColor: "#fff", borderRadius: 10, width: 600, maxWidth: "94vw", maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.14)" }}>

        <div style={{ padding: "18px 22px", borderBottom: "1px solid rgba(0,0,0,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1A1A1A" }}>{question.id === "" ? "Nouvelle question" : "Modifier la question"}</div>
            <div style={{ fontSize: 11, color: "#9B9B9B", marginTop: 2 }}>{dimName} › {subDimName}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9B9B", padding: 4 }}><X size={16} /></button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "22px", display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={lbl}>Libellé de la question *</label>
            <textarea value={form.label} onChange={e => setForm(p => ({ ...p, label: e.target.value }))} rows={3} style={{ ...inp, resize: "vertical" }} placeholder="Entrez le libellé..." />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div>
              <label style={lbl}>Type de réponse</label>
              <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} style={{ ...inp, cursor: "pointer" }}>
                {responseTypes.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Poids (1–10)</label>
              <input type="number" min={1} max={10} value={form.weight} onChange={e => setForm(p => ({ ...p, weight: +e.target.value }))} style={inp} />
            </div>
            <div>
              <label style={lbl}>Statut</label>
              <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value as any }))} style={{ ...inp, cursor: "pointer" }}>
                <option>Active</option><option>Inactive</option>
              </select>
            </div>
          </div>

          {form.type === "Échelle de maturité" && (
            <MaturityEditor responses={maturityResponses} onChange={setMaturityResponses} />
          )}
          {(form.type === "Choix unique" || form.type === "Choix multiple") && (
            <ChoiceEditor options={choiceOptions} onChange={setChoiceOptions} />
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

// ── Add Dimension Modal ───────────────────────────────────────────────────────

function AddDimensionModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [dimForm, setDimForm] = useState({ name: "", description: "", weight: 10, color: "#1A1A1A" });
  const [subForms, setSubForms] = useState([{ name: "" }]);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, backgroundColor: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ backgroundColor: "#fff", borderRadius: 10, width: 560, maxWidth: "94vw", maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.14)" }}>

        <div style={{ padding: "18px 22px", borderBottom: "1px solid rgba(0,0,0,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#1A1A1A" }}>Nouvelle dimension</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9B9B", padding: 4 }}><X size={16} /></button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "22px" }}>
          <StepBar steps={["Dimension", "Sous-dimensions", "Questions"]} current={step} />

          {step === 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={lbl}>Nom *</label>
                <input value={dimForm.name} onChange={e => setDimForm(p => ({ ...p, name: e.target.value }))} placeholder="ex. Gouvernance des données" style={inp} />
              </div>
              <div>
                <label style={lbl}>Description</label>
                <textarea value={dimForm.description} onChange={e => setDimForm(p => ({ ...p, description: e.target.value }))} rows={2} placeholder="Description courte..." style={{ ...inp, resize: "vertical" }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={lbl}>Poids (%)</label>
                  <input type="number" min={1} max={100} value={dimForm.weight} onChange={e => setDimForm(p => ({ ...p, weight: +e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Couleur</label>
                  <input type="color" value={dimForm.color} onChange={e => setDimForm(p => ({ ...p, color: e.target.value }))} style={{ ...inp, height: 38, padding: 4, cursor: "pointer" }} />
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div>
              <div style={{ fontSize: 12, color: "#9B9B9B", marginBottom: 14 }}>Sous-dimensions pour <strong style={{ color: "#1A1A1A" }}>{dimForm.name}</strong></div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {subForms.map((sf, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#9B9B9B", width: 20, flexShrink: 0, textAlign: "center" }}>{i + 1}</span>
                    <input value={sf.name} onChange={e => { const s = [...subForms]; s[i].name = e.target.value; setSubForms(s); }} placeholder={`Nom de la sous-dimension ${i + 1}`} style={inp} />
                    {subForms.length > 1 && (
                      <button onClick={() => setSubForms(s => s.filter((_, j) => j !== i))} style={{ background: "none", border: "none", cursor: "pointer", color: "#CC0000", flexShrink: 0 }}><X size={14} /></button>
                    )}
                  </div>
                ))}
              </div>
              <button onClick={() => setSubForms(s => [...s, { name: "" }])} style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 10, fontSize: 12, fontWeight: 600, color: dimForm.color, background: "none", border: `1px dashed ${dimForm.color}`, borderRadius: 5, padding: "6px 12px", cursor: "pointer" }}>
                <Plus size={12} /> Ajouter
              </button>
            </div>
          )}

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

        {step < 2 && (
          <div style={{ padding: "14px 22px", borderTop: "1px solid rgba(0,0,0,0.07)", display: "flex", justifyContent: "space-between", flexShrink: 0 }}>
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

// ── Add Sub-dimension Modal ───────────────────────────────────────────────────

function AddSubDimModal({ dim, onClose }: { dim: Dimension; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, backgroundColor: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ backgroundColor: "#fff", borderRadius: 10, width: 560, maxWidth: "94vw", maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.14)" }}>

        <div style={{ padding: "18px 22px", borderBottom: "1px solid rgba(0,0,0,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1A1A1A" }}>Nouvelle sous-dimension</div>
            <div style={{ fontSize: 11, color: "#9B9B9B", marginTop: 2 }}>{dim.name}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9B9B", padding: 4 }}><X size={16} /></button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "22px" }}>
          <StepBar steps={["Sous-dimension", "Questions"]} current={step} />

          {step === 0 && (
            <div>
              <label style={lbl}>Nom *</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="ex. Politiques & Standards" style={inp} />
            </div>
          )}

          {step === 1 && (
            <QuestionForm dimName={dim.name} subDimName={name} onBack={() => setStep(0)} onSave={onClose} isLast />
          )}
        </div>

        {step === 0 && (
          <div style={{ padding: "14px 22px", borderTop: "1px solid rgba(0,0,0,0.07)", display: "flex", justifyContent: "space-between", flexShrink: 0 }}>
            <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: 6, fontSize: 13, fontWeight: 500, border: "1px solid rgba(0,0,0,0.12)", backgroundColor: "#fff", cursor: "pointer", color: "#4A4A4A" }}>Annuler</button>
            <button onClick={() => setStep(1)} disabled={!name.trim()} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 20px", borderRadius: 6, fontSize: 13, fontWeight: 700, border: "none", backgroundColor: !name.trim() ? "#E0E0E0" : "#1A1A1A", color: !name.trim() ? "#9B9B9B" : "#FFE600", cursor: !name.trim() ? "not-allowed" : "pointer" }}>
              Suivant <ArrowRight size={13} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Questions list ────────────────────────────────────────────────────────────

function QuestionsList({ questions, dim, sub, onUpdate }: {
  questions: Question[]; dim: Dimension; sub: SubDimension;
  onUpdate: (qs: Question[]) => void;
}) {
  const [editQ, setEditQ] = useState<Question | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const remove = (id: string) => onUpdate(questions.filter(q => q.id !== id));
  const toggleStatus = (id: string) => onUpdate(questions.map(q =>
    q.id === id ? { ...q, status: q.status === "Active" ? "Inactive" : "Active" } : q
  ));

  return (
    <>
      <div style={{ padding: "6px 16px 10px 52px", display: "flex", flexDirection: "column", gap: 4 }}>
        {questions.map((q, qi) => (
          <div key={q.id} style={{
            display: "flex", alignItems: "center", gap: 10,
            backgroundColor: "#fff",
            border: "1px solid rgba(0,0,0,0.07)",
            borderRadius: 7, padding: "10px 14px",
            opacity: q.status === "Inactive" ? 0.5 : 1,
          }}>
            {/* Index */}
            <span style={{ fontSize: 11, fontWeight: 700, color: dim.color, width: 18, flexShrink: 0 }}>{qi + 1}</span>

            {/* Label + type */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: "#1A1A1A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.label}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                <TypeBadge type={q.type} />
                <span style={{ fontSize: 10, color: "#B0B0B0" }}>poids {q.weight}</span>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
              <button title="Modifier" onClick={() => setEditQ(q)} style={iconBtn}
                onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#1A1A1A"; b.style.color = "#FFE600"; }}
                onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#F5F5F5"; b.style.color = "#6B6B6B"; }}>
                <Edit2 size={12} />
              </button>
              <button
                title={q.status === "Active" ? "Désactiver" : "Activer"}
                onClick={() => toggleStatus(q.id)}
                style={{ ...iconBtn, backgroundColor: q.status === "Active" ? "#1A1A1A" : "#F5F5F5", color: q.status === "Active" ? "#FFE600" : "#9B9B9B" }}
                onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; if (q.status !== "Active") { b.style.backgroundColor = "#1A1A1A"; b.style.color = "#FFE600"; } }}
                onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; if (q.status !== "Active") { b.style.backgroundColor = "#F5F5F5"; b.style.color = "#9B9B9B"; } }}
              >
                <Eye size={12} />
              </button>
              <button title="Supprimer" onClick={() => remove(q.id)} style={{ ...iconBtn, color: "#CC0000" }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#FFEBEE"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#F5F5F5"; }}>
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}

        <button
          onClick={() => setAddOpen(true)}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px", borderRadius: 7, border: `1px dashed ${dim.color}40`, backgroundColor: "transparent", cursor: "pointer", fontSize: 12, fontWeight: 500, color: dim.color, marginTop: 2 }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = `${dim.color}08`; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
        >
          <Plus size={12} /> Ajouter une question
        </button>
      </div>

      {editQ && <QuestionEditModal question={editQ} dimName={dim.name} subDimName={sub.name} onClose={() => setEditQ(null)} />}
      {addOpen && <QuestionEditModal question={{ id: "", label: "", type: "Échelle de maturité", weight: 5, status: "Active" }} dimName={dim.name} subDimName={sub.name} onClose={() => setAddOpen(false)} />}
    </>
  );
}

const iconBtn: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 6,
  border: "1px solid rgba(0,0,0,0.08)",
  backgroundColor: "#F5F5F5",
  cursor: "pointer", display: "flex",
  alignItems: "center", justifyContent: "center",
  color: "#6B6B6B", transition: "all 0.12s",
};

// ── Main ──────────────────────────────────────────────────────────────────────

export function DimensionsManagement() {
  const [dimensions, setDimensions] = useState<Dimension[]>(initialDimensions);
  const [expandedDims, setExpandedDims] = useState<string[]>([]);
  const [expandedSubs, setExpandedSubs] = useState<string[]>([]);
  const [showAddDim,   setShowAddDim]   = useState(false);
  const [addSubFor,    setAddSubFor]    = useState<Dimension | null>(null);
  const [editDim,      setEditDim]      = useState<Dimension | null>(null);
  const [editSub,      setEditSub]      = useState<{ dim: Dimension; sub: SubDimension } | null>(null);

  const toggleDim = (id: string) => setExpandedDims(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const toggleSub = (id: string) => setExpandedSubs(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  const updateQuestions = (dimId: string, subId: string, qs: Question[]) =>
    setDimensions(prev => prev.map(d => d.id !== dimId ? d : {
      ...d, subDimensions: d.subDimensions.map(s => s.id !== subId ? s : { ...s, questions: qs })
    }));

  const totalQ = dimensions.reduce((a, d) => a + d.subDimensions.reduce((b, s) => b + s.questions.length, 0), 0);
  const totalS = dimensions.reduce((a, d) => a + d.subDimensions.length, 0);

  return (
    <div style={{ padding: "28px 32px 48px", backgroundColor: "#F2F2F2", minHeight: "100%" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: "#1A1A1A", margin: 0 }}>Gestion du framework</h1>
          <p style={{ fontSize: 13, color: "#9B9B9B", margin: "4px 0 0" }}>
            {dimensions.length} dimensions · {totalS} sous-dimensions · {totalQ} questions
          </p>
        </div>
        <button
          onClick={() => setShowAddDim(true)}
          style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 18px", borderRadius: 6, fontSize: 13, fontWeight: 700, border: "none", backgroundColor: "#1A1A1A", color: "#FFE600", cursor: "pointer" }}
          onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#2D2D2D"}
          onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#1A1A1A"}
        >
          <Plus size={14} /> Nouvelle dimension
        </button>
      </div>

      {/* Weight bar */}
      <div style={{ backgroundColor: "#fff", borderRadius: 8, border: "1px solid rgba(0,0,0,0.07)", padding: "16px 20px", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>Pondérations par dimension</span>
          <span style={{ fontSize: 11, color: "#9B9B9B" }}>{dimensions.reduce((a, d) => a + d.weight, 0)}% répartis sur {dimensions.length} dimensions</span>
        </div>
        {/* Tall segmented bar — pourcentage centré dans chaque segment */}
        <div style={{ display: "flex", height: 42, borderRadius: 6, overflow: "hidden", gap: 3, marginBottom: 12 }}>
          {dimensions.map(d => (
            <div
              key={d.id}
              title={d.name}
              onClick={() => toggleDim(d.id)}
              style={{ flex: d.weight, backgroundColor: d.color, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "filter 0.15s" }}
              onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.filter = "brightness(1.12)"}
              onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.filter = "brightness(1)"}
            >
              <span style={{ fontSize: 13, fontWeight: 700, color: "#fff", userSelect: "none" }}>{d.weight}%</span>
            </div>
          ))}
        </div>
        {/* Legend */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "5px 24px" }}>
          {dimensions.map(d => (
            <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer" }} onClick={() => toggleDim(d.id)}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: d.color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: "#4A4A4A" }}>{d.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Dimensions */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {dimensions.map(dim => {
          const isOpenDim = expandedDims.includes(dim.id);
          const totalQDim = dim.subDimensions.reduce((a, s) => a + s.questions.length, 0);

          return (
            <div key={dim.id} style={{ backgroundColor: "#fff", borderRadius: 8, border: "1px solid rgba(0,0,0,0.07)", overflow: "hidden" }}>

              {/* Dimension row */}
              <div
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", cursor: "pointer", borderLeft: `3px solid ${dim.color}` }}
                onClick={() => toggleDim(dim.id)}
              >
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#1A1A1A" }}>{dim.name}</span>
                  <div style={{ fontSize: 12, color: "#9B9B9B", marginTop: 2 }}>{dim.description}</div>
                </div>

                {/* Stats */}
                <div style={{ display: "flex", gap: 18, alignItems: "center", flexShrink: 0 }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: dim.color }}>{dim.weight}%</div>
                    <div style={{ fontSize: 10, color: "#9B9B9B", textTransform: "uppercase", letterSpacing: "0.05em" }}>poids</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#1A1A1A" }}>{totalQDim}</div>
                    <div style={{ fontSize: 10, color: "#9B9B9B", textTransform: "uppercase", letterSpacing: "0.05em" }}>questions</div>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={e => { e.stopPropagation(); setEditDim(dim); }} style={iconBtn}
                    onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#1A1A1A"; b.style.color = "#FFE600"; }}
                    onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#F5F5F5"; b.style.color = "#6B6B6B"; }}>
                    <Edit2 size={12} />
                  </button>
                  <button onClick={e => { e.stopPropagation(); setAddSubFor(dim); }} style={iconBtn}
                    onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#1A1A1A"; b.style.color = "#fff"; }}
                    onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#F5F5F5"; b.style.color = "#6B6B6B"; }}>
                    <Plus size={12} />
                  </button>
                </div>

                {isOpenDim ? <ChevronDown size={15} style={{ color: "#9B9B9B", flexShrink: 0 }} /> : <ChevronRight size={15} style={{ color: "#C0C0C0", flexShrink: 0 }} />}
              </div>

              {/* Sub-dimensions */}
              {isOpenDim && (
                <div style={{ borderTop: "1px solid rgba(0,0,0,0.05)" }}>
                  {dim.subDimensions.map((sub, si) => {
                    const isOpenSub = expandedSubs.includes(sub.id);
                    return (
                      <div key={sub.id} style={{ borderBottom: si < dim.subDimensions.length - 1 ? "1px solid rgba(0,0,0,0.04)" : "none" }}>
                        <div
                          style={{
                            display: "flex", alignItems: "center", gap: 10,
                            padding: "11px 18px 11px 46px", cursor: "pointer",
                            backgroundColor: isOpenSub ? "#FAFAFA" : "#fff",
                            borderLeft: isOpenSub ? `2px solid ${dim.color}` : "2px solid transparent",
                            transition: "background 0.12s",
                          }}
                          onClick={() => toggleSub(sub.id)}
                        >
                          <span style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: isOpenSub ? dim.color : "#D0D0D0", flexShrink: 0 }} />
                          <span style={{ flex: 1, fontSize: 13, fontWeight: isOpenSub ? 600 : 400, color: isOpenSub ? "#1A1A1A" : "#4A4A4A" }}>{sub.name}</span>
                          <span style={{ fontSize: 11, color: "#9B9B9B", backgroundColor: "#F0F0F0", padding: "1px 7px", borderRadius: 10 }}>
                            {sub.questions.length} question{sub.questions.length !== 1 ? "s" : ""}
                          </span>
                          <button onClick={e => { e.stopPropagation(); setEditSub({ dim, sub }); }} style={{ ...iconBtn, width: 24, height: 24 }}
                            onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#1A1A1A"; b.style.color = "#FFE600"; }}
                            onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#F5F5F5"; b.style.color = "#6B6B6B"; }}>
                            <Edit2 size={11} />
                          </button>
                          {isOpenSub ? <ChevronDown size={14} style={{ color: "#9B9B9B" }} /> : <ChevronRight size={14} style={{ color: "#C0C0C0" }} />}
                        </div>

                        {isOpenSub && (
                          <div style={{ backgroundColor: "#FAFAFA", borderTop: "1px solid rgba(0,0,0,0.04)", paddingBottom: 8 }}>
                            <QuestionsList questions={sub.questions} dim={dim} sub={sub} onUpdate={qs => updateQuestions(dim.id, sub.id, qs)} />
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Add sub-dim */}
                  <div style={{ padding: "8px 18px 12px 56px" }}>
                    <button
                      onClick={() => setAddSubFor(dim)}
                      style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 5, border: "1px solid rgba(0,0,0,0.10)", backgroundColor: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 500, color: "#6B6B6B", transition: "all 0.12s" }}
                      onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = "#1A1A1A"; b.style.color = "#1A1A1A"; }}
                      onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = "rgba(0,0,0,0.10)"; b.style.color = "#6B6B6B"; }}
                    >
                      <Plus size={11} /> Ajouter une sous-dimension
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Modals */}
      {showAddDim && <AddDimensionModal onClose={() => setShowAddDim(false)} />}
      {addSubFor  && <AddSubDimModal dim={addSubFor} onClose={() => setAddSubFor(null)} />}

      {editDim && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, backgroundColor: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ backgroundColor: "#fff", borderRadius: 10, width: 480, maxWidth: "92vw", boxShadow: "0 20px 60px rgba(0,0,0,0.14)", overflow: "hidden" }}>
            <div style={{ padding: "18px 22px", borderBottom: "1px solid rgba(0,0,0,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#1A1A1A" }}>Modifier — {editDim.name}</div>
              <button onClick={() => setEditDim(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9B9B" }}><X size={16} /></button>
            </div>
            <div style={{ padding: "22px", display: "flex", flexDirection: "column", gap: 14 }}>
              <div><label style={lbl}>Nom *</label><input defaultValue={editDim.name} style={inp} /></div>
              <div><label style={lbl}>Description</label><textarea defaultValue={editDim.description} rows={2} style={{ ...inp, resize: "vertical" }} /></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div><label style={lbl}>Poids (%)</label><input type="number" defaultValue={editDim.weight} min={1} max={100} style={inp} /></div>
                <div><label style={lbl}>Couleur</label><input type="color" defaultValue={editDim.color} style={{ ...inp, height: 38, padding: 4, cursor: "pointer" }} /></div>
              </div>
            </div>
            <div style={{ padding: "14px 22px", borderTop: "1px solid rgba(0,0,0,0.07)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setEditDim(null)} style={{ padding: "8px 16px", borderRadius: 6, fontSize: 13, fontWeight: 500, border: "1px solid rgba(0,0,0,0.12)", backgroundColor: "#fff", cursor: "pointer", color: "#4A4A4A" }}>Annuler</button>
              <button onClick={() => setEditDim(null)} style={{ padding: "8px 20px", borderRadius: 6, fontSize: 13, fontWeight: 700, border: "none", backgroundColor: "#1A1A1A", color: "#FFE600", cursor: "pointer" }}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}

      {editSub && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, backgroundColor: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ backgroundColor: "#fff", borderRadius: 10, width: 420, maxWidth: "92vw", boxShadow: "0 20px 60px rgba(0,0,0,0.14)", overflow: "hidden" }}>
            <div style={{ padding: "18px 22px", borderBottom: "1px solid rgba(0,0,0,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#1A1A1A" }}>Modifier la sous-dimension</div>
                <div style={{ fontSize: 11, color: "#9B9B9B", marginTop: 2 }}>{editSub.dim.name}</div>
              </div>
              <button onClick={() => setEditSub(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9B9B" }}><X size={16} /></button>
            </div>
            <div style={{ padding: "22px", display: "flex", flexDirection: "column", gap: 14 }}>
              <div><label style={lbl}>Nom *</label><input defaultValue={editSub.sub.name} style={inp} /></div>
              <div>
                <label style={lbl}>Statut</label>
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  {["Active", "Inactive"].map(s => (
                    <button key={s} style={{ padding: "6px 14px", borderRadius: 5, fontSize: 12, fontWeight: 600, cursor: "pointer", border: editSub.sub.status === s ? "1.5px solid #1A1A1A" : "1px solid rgba(0,0,0,0.12)", backgroundColor: editSub.sub.status === s ? "#1A1A1A" : "#fff", color: editSub.sub.status === s ? "#FFE600" : "#6B6B6B" }}>{s}</button>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ padding: "14px 22px", borderTop: "1px solid rgba(0,0,0,0.07)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setEditSub(null)} style={{ padding: "8px 16px", borderRadius: 6, fontSize: 13, fontWeight: 500, border: "1px solid rgba(0,0,0,0.12)", backgroundColor: "#fff", cursor: "pointer", color: "#4A4A4A" }}>Annuler</button>
              <button onClick={() => setEditSub(null)} style={{ padding: "8px 20px", borderRadius: 6, fontSize: 13, fontWeight: 700, border: "none", backgroundColor: "#1A1A1A", color: "#FFE600", cursor: "pointer" }}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
