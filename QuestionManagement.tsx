import { useState } from "react";
import { Search, Plus, Edit2, Trash2, Copy, Eye, ChevronDown, X, Filter } from "lucide-react";

interface Question {
  id: string;
  dimension: string;
  subDimension: string;
  label: string;
  type: string;
  weight: number;
  status: string;
  version: string;
  lastModified: string;
}

const mockQuestions: Question[] = [
  { id: "Q-001", dimension: "Stratégie Data", subDimension: "Alignement Business", label: "Votre organisation dispose-t-elle d'une stratégie data formalisée et alignée avec la stratégie business ?", type: "Échelle de maturité", weight: 8, status: "Active", version: "v2.1", lastModified: "01/06/2026" },
  { id: "Q-002", dimension: "Stratégie Data", subDimension: "Alignement Business", label: "Existe-t-il un sponsor exécutif identifié pour les initiatives data ?", type: "Oui/Non", weight: 6, status: "Active", version: "v2.1", lastModified: "01/06/2026" },
  { id: "Q-003", dimension: "Gouvernance des données", subDimension: "Politiques & Standards", label: "Votre organisation dispose-t-elle d'une politique de gouvernance des données documentée ?", type: "Échelle de maturité", weight: 9, status: "Active", version: "v2.1", lastModified: "05/06/2026" },
  { id: "Q-004", dimension: "Gouvernance des données", subDimension: "Data Ownership", label: "Des data owners sont-ils formellement désignés pour chaque domaine de données critique ?", type: "Choix unique", weight: 8, status: "Active", version: "v2.1", lastModified: "05/06/2026" },
  { id: "Q-005", dimension: "Qualité des données", subDimension: "Mesure de la qualité", label: "Des indicateurs de qualité des données (KQI) sont-ils définis et suivis régulièrement ?", type: "Échelle de maturité", weight: 9, status: "Active", version: "v2.1", lastModified: "03/06/2026" },
  { id: "Q-006", dimension: "Qualité des données", subDimension: "Remédiation", label: "Existe-t-il un processus formel de remédiation des anomalies de données ?", type: "Choix multiple", weight: 7, status: "Active", version: "v2.1", lastModified: "03/06/2026" },
  { id: "Q-007", dimension: "Architecture & Technologies", subDimension: "Plateforme Data", label: "Décrivez l'architecture de votre plateforme data actuelle (Data Lake, Data Warehouse, etc.)", type: "Texte libre", weight: 6, status: "Active", version: "v2.1", lastModified: "28/05/2026" },
  { id: "Q-008", dimension: "Architecture & Technologies", subDimension: "Intégration des données", label: "À quelle fréquence vos données sont-elles mises à jour dans vos systèmes analytiques ?", type: "Choix unique", weight: 7, status: "Active", version: "v2.1", lastModified: "28/05/2026" },
  { id: "Q-009", dimension: "Sécurité & Conformité", subDimension: "RGPD", label: "Votre organisation maintient-elle un registre des traitements de données à jour ?", type: "Oui/Non", weight: 10, status: "Active", version: "v2.1", lastModified: "02/06/2026" },
  { id: "Q-010", dimension: "Sécurité & Conformité", subDimension: "Contrôle d'accès", label: "Comment gérez-vous les accès aux données sensibles dans votre organisation ?", type: "Choix multiple", weight: 9, status: "Active", version: "v2.1", lastModified: "02/06/2026" },
  { id: "Q-011", dimension: "Analytics & Valorisation", subDimension: "Cas d'usage", label: "Combien de cas d'usage analytiques avez-vous mis en production sur les 12 derniers mois ?", type: "Choix unique", weight: 8, status: "Active", version: "v2.1", lastModified: "04/06/2026" },
  { id: "Q-012", dimension: "Organisation & Culture", subDimension: "Compétences data", label: "Votre organisation dispose-t-elle d'un programme de formation data pour ses collaborateurs ?", type: "Échelle de maturité", weight: 7, status: "Inactive", version: "v2.0", lastModified: "15/04/2026" },
];

const dimensions = ["Toutes les dimensions", "Stratégie Data", "Gouvernance des données", "Qualité des données", "Architecture & Technologies", "Sécurité & Conformité", "Analytics & Valorisation", "Organisation & Culture"];
const types = ["Tous les types", "Oui/Non", "Échelle de maturité", "Choix unique", "Choix multiple", "Texte libre"];
const statuses = ["Tous les statuts", "Active", "Inactive"];

function StatusBadge({ status }: { status: string }) {
  const active = status === "Active";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      backgroundColor: active ? "#E8F5E9" : "#F5F5F5",
      color: active ? "#2E7D32" : "#6B6B6B",
      borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 500
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: active ? "#2E7D32" : "#9E9E9E", display: "inline-block" }} />
      {status}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, { bg: string; color: string }> = {
    "Oui/Non": { bg: "#EEF2FF", color: "#3730A3" },
    "Échelle de maturité": { bg: "#FFF7ED", color: "#9A3412" },
    "Choix unique": { bg: "#F0FDF4", color: "#166534" },
    "Choix multiple": { bg: "#FDF4FF", color: "#6B21A8" },
    "Texte libre": { bg: "#F0F9FF", color: "#0C4A6E" },
  };
  const c = colors[type] || { bg: "#F5F5F5", color: "#6B6B6B" };
  return <span style={{ backgroundColor: c.bg, color: c.color, borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 500 }}>{type}</span>;
}

interface QuestionModalProps {
  question?: Question | null;
  onClose: () => void;
}

function QuestionModal({ question, onClose }: QuestionModalProps) {
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [formData, setFormData] = useState({
    dimension: question?.dimension || "Stratégie Data",
    subDimension: question?.subDimension || "",
    label: question?.label || "",
    description: "",
    type: question?.type || "Échelle de maturité",
    weight: question?.weight || 5,
    required: true,
    order: 1,
    status: question?.status || "Active",
  });

  const maturityLevels = ["Initial (1)", "En développement (2)", "Défini (3)", "Maîtrisé (4)", "Optimisé (5)"];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ backgroundColor: "white", borderRadius: 8, width: 620, maxWidth: "92vw", maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}>
        <div style={{ padding: "18px 24px", borderBottom: "1px solid rgba(0,0,0,0.08)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ey-black)" }}>{question ? "Modifier la question" : "Ajouter une question"}</div>
            <div style={{ fontSize: 12, color: "var(--ey-gray-mid)", marginTop: 2 }}>{question?.id || "Nouvelle question"}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ display: "flex", borderRadius: 4, overflow: "hidden", border: "1px solid rgba(0,0,0,0.12)" }}>
              {[["edit", "Édition"], ["preview", "Prévisualisation"]].map(([t, l]) => (
                <button key={t} onClick={() => setTab(t as any)} style={{
                  padding: "5px 14px", fontSize: 12, fontWeight: 500, border: "none", cursor: "pointer",
                  backgroundColor: tab === t ? "var(--ey-black)" : "white",
                  color: tab === t ? "white" : "var(--ey-gray-mid)"
                }}>{l}</button>
              ))}
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ey-gray-mid)" }}><X size={18} /></button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
          {tab === "edit" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--ey-gray-dark)", marginBottom: 6 }}>Dimension *</label>
                  <select value={formData.dimension} onChange={e => setFormData(p => ({ ...p, dimension: e.target.value }))} style={{ width: "100%", padding: "8px 12px", borderRadius: 4, border: "1px solid rgba(0,0,0,0.15)", fontSize: 13, outline: "none", backgroundColor: "white", boxSizing: "border-box" }}>
                    {dimensions.slice(1).map(d => <option key={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--ey-gray-dark)", marginBottom: 6 }}>Sous-dimension *</label>
                  <input value={formData.subDimension} onChange={e => setFormData(p => ({ ...p, subDimension: e.target.value }))} placeholder="ex. Politiques & Standards" style={{ width: "100%", padding: "8px 12px", borderRadius: 4, border: "1px solid rgba(0,0,0,0.15)", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                </div>
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--ey-gray-dark)", marginBottom: 6 }}>Libellé de la question *</label>
                <textarea value={formData.label} onChange={e => setFormData(p => ({ ...p, label: e.target.value }))} placeholder="Entrez le libellé de la question..." rows={3} style={{ width: "100%", padding: "8px 12px", borderRadius: 4, border: "1px solid rgba(0,0,0,0.15)", fontSize: 13, outline: "none", resize: "vertical", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--ey-gray-dark)", marginBottom: 6 }}>Description / Aide à la réponse</label>
                <textarea value={formData.description} onChange={e => setFormData(p => ({ ...p, description: e.target.value }))} placeholder="Informations complémentaires pour guider la réponse..." rows={2} style={{ width: "100%", padding: "8px 12px", borderRadius: 4, border: "1px solid rgba(0,0,0,0.15)", fontSize: 13, outline: "none", resize: "vertical", boxSizing: "border-box" }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--ey-gray-dark)", marginBottom: 6 }}>Type de réponse</label>
                  <select value={formData.type} onChange={e => setFormData(p => ({ ...p, type: e.target.value }))} style={{ width: "100%", padding: "8px 12px", borderRadius: 4, border: "1px solid rgba(0,0,0,0.15)", fontSize: 13, outline: "none", backgroundColor: "white", boxSizing: "border-box" }}>
                    {types.slice(1).map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--ey-gray-dark)", marginBottom: 6 }}>Poids (1-10)</label>
                  <input type="number" min={1} max={10} value={formData.weight} onChange={e => setFormData(p => ({ ...p, weight: +e.target.value }))} style={{ width: "100%", padding: "8px 12px", borderRadius: 4, border: "1px solid rgba(0,0,0,0.15)", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--ey-gray-dark)", marginBottom: 6 }}>Ordre d'affichage</label>
                  <input type="number" min={1} value={formData.order} onChange={e => setFormData(p => ({ ...p, order: +e.target.value }))} style={{ width: "100%", padding: "8px 12px", borderRadius: 4, border: "1px solid rgba(0,0,0,0.15)", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                </div>
              </div>
              {formData.type === "Échelle de maturité" && (
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--ey-gray-dark)", marginBottom: 8 }}>Scores par niveau</label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {maturityLevels.map((level, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", backgroundColor: "var(--ey-gray-bg)", borderRadius: 4 }}>
                        <span style={{ fontSize: 12, color: "var(--ey-black)", flex: 1 }}>{level}</span>
                        <input type="number" defaultValue={i + 1} min={0} max={10} style={{ width: 60, padding: "4px 8px", borderRadius: 3, border: "1px solid rgba(0,0,0,0.15)", fontSize: 12, textAlign: "center", outline: "none" }} />
                        <span style={{ fontSize: 11, color: "var(--ey-gray-mid)" }}>pts</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <label style={{ fontSize: 12, fontWeight: 500, color: "var(--ey-gray-dark)" }}>Question obligatoire</label>
                  <button onClick={() => setFormData(p => ({ ...p, required: !p.required }))} style={{
                    width: 36, height: 20, borderRadius: 10, border: "none", cursor: "pointer",
                    backgroundColor: formData.required ? "var(--ey-black)" : "#D0D0D0",
                    position: "relative", transition: "background 0.2s"
                  }}>
                    <span style={{ position: "absolute", top: 2, left: formData.required ? 18 : 2, width: 16, height: 16, borderRadius: "50%", backgroundColor: "white", transition: "left 0.2s" }} />
                  </button>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {["Active", "Inactive"].map(s => (
                    <button key={s} onClick={() => setFormData(p => ({ ...p, status: s }))} style={{
                      padding: "5px 12px", borderRadius: 4, fontSize: 12, fontWeight: 500, cursor: "pointer",
                      border: formData.status === s ? "2px solid var(--ey-black)" : "1px solid rgba(0,0,0,0.15)",
                      backgroundColor: formData.status === s ? "var(--ey-black)" : "white",
                      color: formData.status === s ? "white" : "var(--ey-gray-dark)"
                    }}>{s}</button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ backgroundColor: "var(--ey-gray-bg)", borderRadius: 8, padding: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--ey-gray-mid)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
                {formData.dimension} · {formData.subDimension}
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ey-black)", marginBottom: 12, lineHeight: 1.5 }}>
                {formData.label || "Libellé de la question..."}
              </div>
              {formData.description && (
                <div style={{ fontSize: 12, color: "var(--ey-gray-mid)", marginBottom: 16, padding: "10px 14px", backgroundColor: "#EFF6FF", borderRadius: 4, borderLeft: "3px solid #3B82F6" }}>
                  {formData.description}
                </div>
              )}
              {formData.type === "Échelle de maturité" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {maturityLevels.map((level, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", backgroundColor: "white", borderRadius: 4, border: "1px solid rgba(0,0,0,0.08)", cursor: "pointer" }}>
                      <div style={{ width: 20, height: 20, borderRadius: "50%", border: "2px solid rgba(0,0,0,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <span style={{ fontSize: 10, fontWeight: 700 }}>{i + 1}</span>
                      </div>
                      <span style={{ fontSize: 13, color: "var(--ey-black)" }}>{level}</span>
                    </div>
                  ))}
                </div>
              )}
              {formData.type === "Oui/Non" && (
                <div style={{ display: "flex", gap: 10 }}>
                  {["Oui", "Non"].map(opt => (
                    <div key={opt} style={{ flex: 1, padding: "12px 16px", backgroundColor: "white", borderRadius: 4, border: "1px solid rgba(0,0,0,0.08)", textAlign: "center", cursor: "pointer", fontSize: 13, fontWeight: 500 }}>{opt}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ padding: "16px 24px", borderTop: "1px solid rgba(0,0,0,0.08)", display: "flex", justifyContent: "flex-end", gap: 10, flexShrink: 0 }}>
          <button onClick={onClose} style={{ padding: "8px 18px", borderRadius: 4, fontSize: 13, fontWeight: 500, border: "1px solid rgba(0,0,0,0.15)", backgroundColor: "white", cursor: "pointer", color: "var(--ey-gray-dark)" }}>Annuler</button>
          <button style={{ padding: "8px 18px", borderRadius: 4, fontSize: 13, fontWeight: 600, border: "none", backgroundColor: "var(--ey-black)", color: "white", cursor: "pointer" }}>
            {question ? "Enregistrer" : "Ajouter la question"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function QuestionManagement() {
  const [search, setSearch] = useState("");
  const [dimFilter, setDimFilter] = useState("Toutes les dimensions");
  const [typeFilter, setTypeFilter] = useState("Tous les types");
  const [statusFilter, setStatusFilter] = useState("Tous les statuts");
  const [showModal, setShowModal] = useState(false);
  const [editingQ, setEditingQ] = useState<Question | null>(null);

  const filtered = mockQuestions.filter(q => {
    const matchSearch = q.label.toLowerCase().includes(search.toLowerCase()) || q.id.toLowerCase().includes(search.toLowerCase());
    const matchDim = dimFilter === "Toutes les dimensions" || q.dimension === dimFilter;
    const matchType = typeFilter === "Tous les types" || q.type === typeFilter;
    const matchStatus = statusFilter === "Tous les statuts" || q.status === statusFilter;
    return matchSearch && matchDim && matchType && matchStatus;
  });

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--ey-black)", margin: 0, letterSpacing: "-0.02em" }}>Gestion du questionnaire</h2>
          <p style={{ fontSize: 13, color: "var(--ey-gray-mid)", margin: "4px 0 0" }}>{mockQuestions.length} questions · Version active : v2.1</p>
        </div>
        <button onClick={() => { setEditingQ(null); setShowModal(true); }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 16px", borderRadius: 4, fontSize: 13, fontWeight: 600, border: "none", backgroundColor: "var(--ey-black)", color: "white", cursor: "pointer" }}>
          <Plus size={15} /> Ajouter une question
        </button>
      </div>

      {/* Filters */}
      <div style={{ backgroundColor: "var(--ey-white)", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 6, padding: "12px 16px", marginBottom: 16, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 200px", display: "flex", alignItems: "center", gap: 8, backgroundColor: "var(--ey-gray-bg)", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 4, padding: "7px 12px" }}>
          <Search size={14} style={{ color: "var(--ey-gray-mid)", flexShrink: 0 }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher par libellé, ID..." style={{ background: "transparent", border: "none", outline: "none", fontSize: 13, width: "100%" }} />
        </div>
        {[
          { options: dimensions, value: dimFilter, setter: setDimFilter },
          { options: types, value: typeFilter, setter: setTypeFilter },
          { options: statuses, value: statusFilter, setter: setStatusFilter },
        ].map(({ options, value, setter }, i) => (
          <div key={i} style={{ position: "relative" }}>
            <select value={value} onChange={e => setter(e.target.value)} style={{ padding: "7px 30px 7px 12px", borderRadius: 4, fontSize: 13, border: "1px solid rgba(0,0,0,0.08)", backgroundColor: "white", cursor: "pointer", appearance: "none", outline: "none", maxWidth: 200 }}>
              {options.map(o => <option key={o}>{o}</option>)}
            </select>
            <ChevronDown size={12} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "var(--ey-gray-mid)", pointerEvents: "none" }} />
          </div>
        ))}
        <span style={{ fontSize: 12, color: "var(--ey-gray-mid)" }}>{filtered.length} résultat{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Table */}
      <div style={{ backgroundColor: "var(--ey-white)", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 6, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1000 }}>
          <thead>
            <tr style={{ backgroundColor: "var(--ey-gray-bg)", borderBottom: "1px solid rgba(0,0,0,0.07)" }}>
              {["ID", "Dimension", "Sous-dimension", "Libellé", "Type", "Poids", "Statut", "Version", "Modifié le", "Actions"].map(h => (
                <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "var(--ey-gray-mid)", letterSpacing: "0.05em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((q, i) => (
              <tr key={q.id} style={{ borderBottom: "1px solid rgba(0,0,0,0.04)", backgroundColor: i % 2 === 0 ? "white" : "#FAFAFA" }}
                onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = "#F5F5F5"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = i % 2 === 0 ? "white" : "#FAFAFA"; }}
              >
                <td style={{ padding: "10px 14px" }}>
                  <span style={{ fontFamily: "monospace", fontSize: 11, backgroundColor: "var(--ey-gray-bg)", padding: "2px 7px", borderRadius: 3, color: "var(--ey-gray-dark)", whiteSpace: "nowrap" }}>{q.id}</span>
                </td>
                <td style={{ padding: "10px 14px", fontSize: 12, color: "var(--ey-black)", whiteSpace: "nowrap", maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis" }}>{q.dimension}</td>
                <td style={{ padding: "10px 14px", fontSize: 12, color: "var(--ey-gray-mid)", whiteSpace: "nowrap" }}>{q.subDimension}</td>
                <td style={{ padding: "10px 14px", maxWidth: 280 }}>
                  <div style={{ fontSize: 12, color: "var(--ey-black)", lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{q.label}</div>
                </td>
                <td style={{ padding: "10px 14px" }}><TypeBadge type={q.type} /></td>
                <td style={{ padding: "10px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 30, height: 4, borderRadius: 2, backgroundColor: "var(--ey-gray-bg)" }}>
                      <div style={{ width: `${q.weight * 10}%`, height: "100%", backgroundColor: "var(--ey-yellow)", borderRadius: 2 }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ey-black)" }}>{q.weight}</span>
                  </div>
                </td>
                <td style={{ padding: "10px 14px" }}><StatusBadge status={q.status} /></td>
                <td style={{ padding: "10px 14px" }}>
                  <span style={{ fontSize: 11, backgroundColor: "#1A1A1A", color: "#FFE600", padding: "2px 7px", borderRadius: 3, fontWeight: 500 }}>{q.version}</span>
                </td>
                <td style={{ padding: "10px 14px", fontSize: 11, color: "var(--ey-gray-mid)", whiteSpace: "nowrap" }}>{q.lastModified}</td>
                <td style={{ padding: "10px 14px" }}>
                  <div style={{ display: "flex", gap: 3 }}>
                    {[
                      { icon: <Edit2 size={11} />, title: "Modifier", onClick: () => { setEditingQ(q); setShowModal(true); } },
                      { icon: <Copy size={11} />, title: "Dupliquer", onClick: () => {} },
                      { icon: <Eye size={11} />, title: "Prévisualiser", onClick: () => {} },
                      { icon: <Trash2 size={11} />, title: "Supprimer", onClick: () => {}, danger: true },
                    ].map((a, ai) => (
                      <button key={ai} onClick={a.onClick} title={a.title} style={{
                        width: 26, height: 26, borderRadius: 3, border: "1px solid rgba(0,0,0,0.1)",
                        backgroundColor: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                        color: (a as any).danger ? "#CC0000" : "var(--ey-gray-dark)"
                      }}>{a.icon}</button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && <QuestionModal question={editingQ} onClose={() => setShowModal(false)} />}
    </div>
  );
}
