import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getMaturityLevels, type MaturityLevel as ApiMaturityLevel } from "../../lib/config";
import { adminApi, type Dimension } from "../../lib/admin";

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Une erreur est survenue";
}

/** Fond clair du badge, dérivé de la couleur du niveau (stockée en base,
 * voir backend/app/models/maturity_level.py) -- la table ne stocke qu'une
 * seule couleur par niveau, pas de variante "fond clair" séparée. */
function badgeBg(color: string): string {
  return `${color}1A`;
}

const responseTypes = [
  { type: "Échelle de maturité", levels: "5 niveaux (1→5)", scoring: "Score = valeur sélectionnée × poids", example: "Niveau 3 sélectionné, poids 8 → score = 3 × 8 = 24 pts" },
  { type: "Oui/Non", levels: "Oui = max, Non = 0", scoring: "Score = 0 ou valeur maximale du poids", example: "Oui, poids 6 → score = 6 pts" },
  { type: "Choix unique", levels: "Score configuré par option", scoring: "Score = valeur assignée à l'option choisie", example: "Option B = 3 pts, poids 7 → score pondéré" },
  { type: "Choix multiple", levels: "Score cumulatif plafonné", scoring: "Score = somme des options × poids, plafonné au max", example: "2 options sur 4 cochées" },
];

/**
 * "Référentiel de scoring" -- lecture seule pour les deux espaces
 * (super-admin ET admin, voir routes.tsx) : les niveaux de maturité
 * viennent de `/api/maturity-levels` (public, voir
 * backend/app/routers/config.py) et les pondérations par dimension de
 * `/api/super-admin/dimensions` (ouvert en lecture aux deux rôles, voir
 * backend/app/routers/admin.py). Aucune des deux ne peut être modifiée
 * depuis ici : il n'existe pas d'endpoint d'écriture pour les niveaux de
 * maturité côté backend -- l'ancienne UI d'édition (Modifier / Restaurer
 * les défauts) ne faisait déjà rien de réel, elle a été retirée plutôt
 * que laissée comme un bouton qui ne marche pas.
 */
export function ScoringReferential() {
  const [levels, setLevels] = useState<ApiMaturityLevel[]>([]);
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try {
      const [l, d] = await Promise.all([getMaturityLevels(), adminApi.listDimensions()]);
      setLevels(l);
      setDimensions(d);
    } catch (e) {
      setError(true);
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Seules les dimensions actives entrent réellement dans le score global
  // (voir backend/app/services/scoring.py) -- une dimension désactivée ne
  // doit pas apparaître dans une répartition qui prétend sommer à 100%.
  const activeDimensions = dimensions.filter(d => d.status === "Active");

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--ey-black)", margin: 0, letterSpacing: "-0.02em" }}>Référentiel de scoring</h2>
          <p style={{ fontSize: 13, color: "var(--ey-gray-mid)", margin: "4px 0 0" }}>Niveaux de maturité, seuils et pondérations du référentiel</p>
        </div>
      </div>

      {loading && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: 60, color: "var(--ey-gray-mid)" }}>
          <Loader2 size={20} className="animate-spin" /> Chargement du référentiel…
        </div>
      )}

      {!loading && error && (
        <div style={{ textAlign: "center", padding: 50 }}>
          <AlertCircle size={22} style={{ color: "#CC0000", marginBottom: 10 }} />
          <p style={{ fontSize: 13, color: "var(--ey-gray-mid)", marginBottom: 14 }}>Impossible de charger le référentiel de scoring.</p>
          <button onClick={load} style={{ padding: "8px 20px", borderRadius: 4, fontSize: 13, fontWeight: 600, border: "none", backgroundColor: "var(--ey-black)", color: "var(--ey-yellow)", cursor: "pointer" }}>Réessayer</button>
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Score scale visual */}
          {levels.length > 0 && (
            <div style={{ backgroundColor: "var(--ey-white)", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 6, padding: "18px 22px", marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ey-gray-dark)", marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Échelle de score globale ({levels[0].min_score} — {levels[levels.length - 1].max_score})
              </div>
              <div style={{ position: "relative", height: 20, borderRadius: 4, overflow: "hidden", display: "flex" }}>
                {levels.map((l, i) => (
                  <div key={l.id} style={{
                    flex: l.max_score - l.min_score + (i === levels.length - 1 ? 1 : 0),
                    backgroundColor: l.color,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, fontWeight: 700, color: "white"
                  }}>
                    {l.min_score}
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", marginTop: 8, gap: 16, flexWrap: "wrap" }}>
                {levels.map(l => (
                  <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: l.color, display: "inline-block" }} />
                    <span style={{ fontSize: 11, color: "var(--ey-gray-mid)" }}>{l.label} ({l.min_score}–{l.max_score})</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Maturity levels table */}
          <div style={{ backgroundColor: "var(--ey-white)", border: "1px solid rgba(0,0,0,0.07)", borderRadius: 6, overflow: "hidden", marginBottom: 20 }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(0,0,0,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ey-black)" }}>Niveaux de maturité</div>
              <span style={{ fontSize: 11, color: "var(--ey-gray-mid)" }}>{levels.length} niveau{levels.length !== 1 ? "x" : ""} configuré{levels.length !== 1 ? "s" : ""}</span>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ backgroundColor: "var(--ey-gray-bg)", borderBottom: "1px solid rgba(0,0,0,0.07)" }}>
                  {["Niveau", "Nom", "Score min", "Score max", "Description", "Badge"].map(h => (
                    <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "var(--ey-gray-mid)", letterSpacing: "0.05em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {levels.map((l, i) => (
                  <tr key={l.id} style={{ borderBottom: i < levels.length - 1 ? "1px solid rgba(0,0,0,0.04)" : "none", backgroundColor: i % 2 === 0 ? "white" : "#FAFAFA" }}>
                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ width: 30, height: 30, borderRadius: "50%", backgroundColor: l.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "white" }}>
                        {i + 1}
                      </div>
                    </td>
                    <td style={{ padding: "14px 16px", fontSize: 13, fontWeight: 600, color: "var(--ey-black)" }}>{l.label}</td>
                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ display: "inline-flex", alignItems: "center", backgroundColor: "var(--ey-gray-bg)", borderRadius: 4, padding: "4px 10px", fontSize: 13, fontWeight: 700, color: "var(--ey-black)" }}>{l.min_score}</div>
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ display: "inline-flex", alignItems: "center", backgroundColor: "var(--ey-gray-bg)", borderRadius: 4, padding: "4px 10px", fontSize: 13, fontWeight: 700, color: "var(--ey-black)" }}>{l.max_score}</div>
                    </td>
                    <td style={{ padding: "14px 16px", maxWidth: 300 }}>
                      <p style={{ fontSize: 12, color: "var(--ey-gray-mid)", margin: 0, lineHeight: 1.5 }}>{l.description}</p>
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, backgroundColor: badgeBg(l.color), color: l.color, borderRadius: 4, padding: "3px 10px", fontSize: 12, fontWeight: 600 }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: l.color }} />
                        {l.label}
                      </span>
                    </td>
                  </tr>
                ))}
                {levels.length === 0 && (
                  <tr><td colSpan={6} style={{ padding: "36px 20px", textAlign: "center", fontSize: 13, color: "var(--ey-gray-mid)" }}>Aucun niveau de maturité configuré.</td></tr>
                )}
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
                {activeDimensions.map((d, i) => {
                  const questionCount = d.subDimensions.reduce((a, s) => a + s.questions.length, 0);
                  return (
                    <div key={d.id} style={{ padding: "12px 20px", borderBottom: i < activeDimensions.length - 1 ? "1px solid rgba(0,0,0,0.04)" : "none", display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: "var(--ey-black)", marginBottom: 4 }}>{d.name}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ flex: 1, height: 4, backgroundColor: "var(--ey-gray-bg)", borderRadius: 2, overflow: "hidden" }}>
                            <div style={{ width: `${d.weight}%`, height: "100%", backgroundColor: d.color }} />
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ey-black)", minWidth: 30, textAlign: "right" }}>{d.weight}%</span>
                        </div>
                      </div>
                      <span style={{ fontSize: 11, color: "var(--ey-gray-mid)", minWidth: 70, textAlign: "right" }}>{questionCount} question{questionCount !== 1 ? "s" : ""}</span>
                    </div>
                  );
                })}
                {activeDimensions.length === 0 && (
                  <div style={{ padding: "24px 20px", textAlign: "center", fontSize: 12, color: "var(--ey-gray-mid)" }}>Aucune dimension active.</div>
                )}
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
        </>
      )}
    </div>
  );
}
