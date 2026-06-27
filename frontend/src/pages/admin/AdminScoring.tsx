import { useState } from "react";
import { Edit2, RotateCcw, X, AlertCircle } from "lucide-react";

interface MaturityLevel {
  id: string;
  level: number;
  name: string;
  minScore: number;
  maxScore: number;
  description: string;
  color: string;
  badgeBg: string;
}

const defaultLevels: MaturityLevel[] = [
  { id: "L1", level: 1, name: "Initial", minScore: 0, maxScore: 19, description: "Les pratiques data sont ad-hoc et peu documentées. Aucune stratégie formelle n'est en place. Les processus dépendent d'initiatives individuelles.", color: "#CC0000", badgeBg: "#FFEBEE" },
  { id: "L2", level: 2, name: "En développement", minScore: 20, maxScore: 39, description: "Des initiatives data émergent mais restent dispersées. Une prise de conscience croissante existe, mais les processus ne sont pas standardisés.", color: "#E65100", badgeBg: "#FFF3E0" },
  { id: "L3", level: 3, name: "Défini", minScore: 40, maxScore: 59, description: "Des politiques et standards data sont définis et documentés. Les pratiques sont plus cohérentes et la gouvernance commence à se structurer.", color: "#F57F17", badgeBg: "#FFFDE7" },
  { id: "L4", level: 4, name: "Maîtrisé", minScore: 60, maxScore: 79, description: "La gestion des données est mesurée et contrôlée. Des KPIs data sont suivis et des processus d'amélioration continue sont en place.", color: "#2E7D32", badgeBg: "#E8F5E9" },
  { id: "L5", level: 5, name: "Optimisé", minScore: 80, maxScore: 100, description: "La maturité data est au plus haut niveau. L'organisation innove en continu et la culture data-driven est ancrée à tous les niveaux.", color: "#1565C0", badgeBg: "#E3F2FD" },
];

const weightsByDimension = [
  { name: "Gouvernance des données", weight: 18, questions: 21 },
  { name: "Qualité des données", weight: 16, questions: 21 },
  { name: "Stratégie Data & Alignement Business", weight: 15, questions: 19 },
  { name: "Architecture & Technologies Data", weight: 15, questions: 19 },
  { name: "Sécurité, Conformité & Contrôle", weight: 14, questions: 24 },
  { name: "Analytics & Valorisation des données", weight: 12, questions: 18 },
  { name: "Organisation, Rôles & Culture Data", weight: 10, questions: 15 },
];

const responseTypes = [
  { type: "Échelle de maturité", levels: "5 niveaux (1→5)", scoring: "Score = valeur sélectionnée × poids", example: "Niveau 3 sélectionné, poids 8 → score = 3 × 8 = 24 pts" },
  { type: "Oui/Non", levels: "Oui = max, Non = 0", scoring: "Score = 0 ou valeur maximale du poids", example: "Oui, poids 6 → score = 6 pts" },
  { type: "Choix unique", levels: "Score configuré par option", scoring: "Score = valeur assignée à l'option choisie", example: "Option B = 3 pts, poids 7 → score pondéré" },
  { type: "Choix multiple", levels: "Score cumulatif plafonné", scoring: "Score = somme des options × poids, plafonné au max", example: "2 options sur 4 cochées" },
];

export function ScoringReferential() {
  const [levels, setLevels] = useState(mockLevels());
  const [editingLevel, setEditingLevel] = useState<MaturityLevel | null>(null);

  function mockLevels() { return [...defaultLevels]; }

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--ey-black)", margin: 0, letterSpacing: "-0.02em" }}>Référentiel de scoring</h2>
          <p style={{ fontSize: 13, color: "var(--ey-gray-mid)", margin: "4px 0 0" }}>Paramétrage des niveaux de maturité, seuils et pondérations</p>
        </div>
        <button style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 16px", borderRadius: 4, fontSize: 13, fontWeight: 500, border: "1px solid rgba(0,0,0,0.15)", backgroundColor: "white", cursor: "pointer", color: "var(--ey-gray-dark)" }}>
          <RotateCcw size={14} /> Restaurer les défauts
        </button>
      </div>

      {/* Score scale visual */}
      <div style={{ backgroundColor: "var(--ey-white)", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 6, padding: "18px 22px", marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ey-gray-dark)", marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Échelle de score globale (0 — 100)
        </div>
        <div style={{ position: "relative", height: 20, borderRadius: 4, overflow: "hidden", display: "flex" }}>
          {levels.map(l => (
            <div key={l.id} style={{
              flex: l.maxScore - l.minScore + (l.level === 5 ? 1 : 0),
              backgroundColor: l.color,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, fontWeight: 700, color: "white"
            }}>
              {l.minScore}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", marginTop: 8, gap: 16 }}>
          {levels.map(l => (
            <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: l.color, display: "inline-block" }} />
              <span style={{ fontSize: 11, color: "var(--ey-gray-mid)" }}>{l.name} ({l.minScore}–{l.maxScore})</span>
            </div>
          ))}
        </div>
      </div>

      {/* Maturity levels table */}
      <div style={{ backgroundColor: "var(--ey-white)", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 6, overflow: "hidden", marginBottom: 20 }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(0,0,0,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ey-black)" }}>Niveaux de maturité</div>
          <span style={{ fontSize: 11, color: "var(--ey-gray-mid)" }}>5 niveaux configurés</span>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ backgroundColor: "var(--ey-gray-bg)", borderBottom: "1px solid rgba(0,0,0,0.07)" }}>
              {["Niveau", "Nom", "Score min", "Score max", "Description", "Badge", "Actions"].map(h => (
                <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "var(--ey-gray-mid)", letterSpacing: "0.05em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {levels.map((l, i) => (
              <tr key={l.id} style={{ borderBottom: "1px solid rgba(0,0,0,0.04)", backgroundColor: i % 2 === 0 ? "white" : "#FAFAFA" }}>
                <td style={{ padding: "14px 16px" }}>
                  <div style={{ width: 30, height: 30, borderRadius: "50%", backgroundColor: l.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "white" }}>
                    {l.level}
                  </div>
                </td>
                <td style={{ padding: "14px 16px", fontSize: 13, fontWeight: 600, color: "var(--ey-black)" }}>{l.name}</td>
                <td style={{ padding: "14px 16px" }}>
                  <div style={{ display: "inline-flex", alignItems: "center", backgroundColor: "var(--ey-gray-bg)", borderRadius: 4, padding: "4px 10px", fontSize: 13, fontWeight: 700, color: "var(--ey-black)" }}>{l.minScore}</div>
                </td>
                <td style={{ padding: "14px 16px" }}>
                  <div style={{ display: "inline-flex", alignItems: "center", backgroundColor: "var(--ey-gray-bg)", borderRadius: 4, padding: "4px 10px", fontSize: 13, fontWeight: 700, color: "var(--ey-black)" }}>{l.maxScore}</div>
                </td>
                <td style={{ padding: "14px 16px", maxWidth: 300 }}>
                  <p style={{ fontSize: 12, color: "var(--ey-gray-mid)", margin: 0, lineHeight: 1.5 }}>{l.description}</p>
                </td>
                <td style={{ padding: "14px 16px" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, backgroundColor: l.badgeBg, color: l.color, borderRadius: 4, padding: "3px 10px", fontSize: 12, fontWeight: 600 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: l.color }} />
                    {l.name}
                  </span>
                </td>
                <td style={{ padding: "14px 16px" }}>
                  <button onClick={() => setEditingLevel(l)} style={{ width: 28, height: 28, borderRadius: 4, border: "1px solid rgba(0,0,0,0.1)", backgroundColor: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ey-gray-dark)" }}>
                    <Edit2 size={12} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Dimension weights */}
        <div style={{ backgroundColor: "var(--ey-white)", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 6, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ey-black)" }}>Pondérations par dimension</div>
          </div>
          <div>
            {weightsByDimension.map((d, i) => (
              <div key={i} style={{ padding: "12px 20px", borderBottom: i < weightsByDimension.length - 1 ? "1px solid rgba(0,0,0,0.04)" : "none", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: "var(--ey-black)", marginBottom: 4 }}>{d.name}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1, height: 4, backgroundColor: "var(--ey-gray-bg)", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ width: `${d.weight}%`, height: "100%", backgroundColor: "var(--ey-yellow)" }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ey-black)", minWidth: 30, textAlign: "right" }}>{d.weight}%</span>
                  </div>
                </div>
                <span style={{ fontSize: 11, color: "var(--ey-gray-mid)", minWidth: 70, textAlign: "right" }}>{d.questions} questions</span>
                <button style={{ width: 24, height: 24, borderRadius: 3, border: "1px solid rgba(0,0,0,0.1)", backgroundColor: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ey-gray-dark)" }}>
                  <Edit2 size={11} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Scoring rules */}
        <div style={{ backgroundColor: "var(--ey-white)", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 6, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ey-black)" }}>Règles de calcul par type de réponse</div>
          </div>
          <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
            {responseTypes.map((rt, i) => (
              <div key={i} style={{ padding: "12px 14px", backgroundColor: "var(--ey-gray-bg)", borderRadius: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ey-black)" }}>{rt.type}</span>
                  <span style={{ fontSize: 10, color: "var(--ey-gray-mid)", backgroundColor: "white", padding: "1px 7px", borderRadius: 3 }}>{rt.levels}</span>
                </div>
                <div style={{ fontSize: 11, color: "var(--ey-gray-mid)", marginBottom: 4 }}>{rt.scoring}</div>
                <div style={{ fontSize: 11, color: "var(--ey-gray-dark)", fontStyle: "italic" }}>ex. {rt.example}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {editingLevel && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ backgroundColor: "white", borderRadius: 8, width: 500, boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}>
            <div style={{ padding: "18px 24px", borderBottom: "1px solid rgba(0,0,0,0.08)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ey-black)" }}>Modifier le niveau — {editingLevel.name}</div>
              <button onClick={() => setEditingLevel(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ey-gray-mid)" }}><X size={18} /></button>
            </div>
            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--ey-gray-dark)", marginBottom: 6 }}>Libellé du niveau</label>
                <input defaultValue={editingLevel.name} style={{ width: "100%", padding: "8px 12px", borderRadius: 4, border: "1px solid rgba(0,0,0,0.15)", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--ey-gray-dark)", marginBottom: 6 }}>Score minimum</label>
                  <input type="number" defaultValue={editingLevel.minScore} style={{ width: "100%", padding: "8px 12px", borderRadius: 4, border: "1px solid rgba(0,0,0,0.15)", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--ey-gray-dark)", marginBottom: 6 }}>Score maximum</label>
                  <input type="number" defaultValue={editingLevel.maxScore} style={{ width: "100%", padding: "8px 12px", borderRadius: 4, border: "1px solid rgba(0,0,0,0.15)", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                </div>
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--ey-gray-dark)", marginBottom: 6 }}>Description</label>
                <textarea defaultValue={editingLevel.description} rows={3} style={{ width: "100%", padding: "8px 12px", borderRadius: 4, border: "1px solid rgba(0,0,0,0.15)", fontSize: 13, outline: "none", resize: "vertical", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--ey-gray-dark)", marginBottom: 6 }}>Couleur du badge</label>
                <input type="color" defaultValue={editingLevel.color} style={{ width: "100%", height: 38, borderRadius: 4, border: "1px solid rgba(0,0,0,0.15)", cursor: "pointer", padding: 4 }} />
              </div>
            </div>
            <div style={{ padding: "16px 24px", borderTop: "1px solid rgba(0,0,0,0.08)", display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={() => setEditingLevel(null)} style={{ padding: "8px 18px", borderRadius: 4, fontSize: 13, fontWeight: 500, border: "1px solid rgba(0,0,0,0.15)", backgroundColor: "white", cursor: "pointer", color: "var(--ey-gray-dark)" }}>Annuler</button>
              <button style={{ padding: "8px 18px", borderRadius: 4, fontSize: 13, fontWeight: 600, border: "none", backgroundColor: "var(--ey-black)", color: "white", cursor: "pointer" }}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
