import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Eye, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { versionsApi } from "../../lib/versions";
import type { Circular } from "../../lib/regulatory";

const PER_PAGE = 5;

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ── Main ──────────────────────────────────────────────────────────────────────

/**
 * "Versions du questionnaire" -- une version = une circulaire "Veille
 * réglementaire" PUBLIÉE (voir backend/app/routers/versions.py), pas un
 * concept de brouillon/archive séparé : publier une circulaire est un
 * acte réel, permanent (voir la règle de non-suppression d'une
 * circulaire publiée dans regulatory.py) -- il n'existe donc pas de
 * "Publier / Archiver / Restaurer" à faire agir ici, ni de "Nouvelle
 * version" créée depuis cette page (une version naît uniquement de la
 * publication d'une circulaire, dans Veille réglementaire).
 *
 * Montée à la fois sous `/super-admin/versions` et `/admin/versions`
 * (même composant, mêmes données réelles -- `/api/versions` est lisible
 * par les deux rôles, voir backend/app/routers/versions.py) : "Consulter"
 * doit rester dans l'espace courant, d'où `basePath` déduit du chemin
 * actuel plutôt que codé en dur (même pattern que AdminTopbar.tsx pour
 * le clic sur une notification de version).
 */
export function QuestionnaireVersions() {
  const navigate = useNavigate();
  const location = useLocation();
  const basePath = location.pathname.startsWith("/admin") ? "/admin" : "/super-admin";
  const [versions, setVersions] = useState<Circular[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    versionsApi.list()
      .then(v => { if (!cancelled) setVersions(v); })
      .catch(e => { if (!cancelled) { setLoadError(true); toast.error(e instanceof Error ? e.message : "Échec du chargement"); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const totalPages = Math.max(1, Math.ceil(versions.length / PER_PAGE));
  const pageItems = versions.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const activeVersion = versions[0]; // la plus récente publiée (voir list_versions, order_by published_at desc)

  function consult(id: number) {
    navigate(`${basePath}/versions/${id}`);
  }

  return (
    <div style={{ padding: "28px 32px 40px", backgroundColor: "#F2F2F2", minHeight: "100%" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: "#1A1A1A", margin: 0, letterSpacing: "-0.02em" }}>Versions du questionnaire</h1>
          <p style={{ fontSize: 13, color: "#9B9B9B", margin: "4px 0 0" }}>
            {versions.length} version{versions.length !== 1 ? "s" : ""} publiée{versions.length !== 1 ? "s" : ""} · une version par circulaire réglementaire publiée
          </p>
        </div>
      </div>

      {loading && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 60, color: "#9B9B9B" }}>
          <Loader2 size={20} className="animate-spin" />
        </div>
      )}

      {!loading && loadError && (
        <div style={{ backgroundColor: "#fff", border: "1px solid #FFCDD2", borderRadius: 10, padding: "32px 24px", textAlign: "center" }}>
          <AlertTriangle size={22} style={{ color: "#CC0000", marginBottom: 8 }} />
          <div style={{ fontSize: 13, color: "#4A4A4A" }}>Échec du chargement des versions.</div>
        </div>
      )}

      {!loading && !loadError && versions.length === 0 && (
        <div style={{ backgroundColor: "#fff", border: "1px dashed rgba(0,0,0,0.15)", borderRadius: 10, padding: 48, textAlign: "center", fontSize: 13, color: "#9B9B9B" }}>
          Aucune version publiée pour le moment. Une version apparaît ici dès qu'une circulaire est publiée depuis Veille réglementaire.
        </div>
      )}

      {!loading && !loadError && versions.length > 0 && (
        <>
          {/* Active version banner */}
          <div style={{ backgroundColor: "#1A1A1A", borderRadius: 12, padding: "20px 26px", marginBottom: 18, display: "flex", alignItems: "center", gap: 20, boxShadow: "0 4px 16px rgba(0,0,0,0.15)" }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: "#FFE600", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <CheckCircle2 size={22} style={{ color: "#1A1A1A" }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>Version actuellement publiée</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {activeVersion.version} — {activeVersion.theme || activeVersion.reference}
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 3 }}>
                {activeVersion.impactCount} exigence{activeVersion.impactCount !== 1 ? "s" : ""} · Publiée le {formatDate(activeVersion.publishedAt)}{activeVersion.publishedBy ? ` par ${activeVersion.publishedBy}` : ""}
              </div>
            </div>
            <button onClick={() => consult(activeVersion.id)}
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
                  {["Version", "Circulaire & thème", "Exigences", "Publié par", "Publié le", "Actions"].map(h => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#9B9B9B", letterSpacing: "0.07em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageItems.map((v, i) => {
                  const isActive = v.id === activeVersion.id;
                  return (
                    <tr key={v.id}
                      style={{ borderBottom: i < pageItems.length - 1 ? "1px solid rgba(0,0,0,0.05)" : "none", backgroundColor: isActive ? "#FAFFF9" : "transparent", transition: "background 0.1s" }}
                      onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLTableRowElement).style.backgroundColor = "#FAFAFA"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = isActive ? "#FAFFF9" : "transparent"; }}
                    >
                      <td style={{ padding: "12px 14px" }}>
                        <span style={{ display: "inline-block", backgroundColor: isActive ? "#1A1A1A" : "#F5F5F5", color: isActive ? "#FFE600" : "#6B6B6B", borderRadius: 5, padding: "3px 10px", fontSize: 12, fontWeight: 700 }}>
                          {v.version}
                        </span>
                      </td>
                      <td style={{ padding: "12px 14px", maxWidth: 320 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#1A1A1A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.reference}</div>
                        <div style={{ fontSize: 11, color: "#9B9B9B", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.theme || "—"}</div>
                      </td>
                      <td style={{ padding: "12px 14px", fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>{v.impactCount}</td>
                      <td style={{ padding: "12px 14px", fontSize: 12, color: "#9B9B9B" }}>{v.publishedBy || "—"}</td>
                      <td style={{ padding: "12px 14px", fontSize: 12, color: "#9B9B9B", whiteSpace: "nowrap" }}>{formatDate(v.publishedAt)}</td>
                      <td style={{ padding: "12px 14px" }}>
                        <button title="Consulter" onClick={() => consult(v.id)}
                          style={{ width: 28, height: 28, borderRadius: 5, border: "1px solid rgba(0,0,0,0.10)", backgroundColor: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#4A4A4A", transition: "all 0.15s" }}
                          onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#1A1A1A"; b.style.color = "#FFE600"; }}
                          onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "#fff"; b.style.color = "#4A4A4A"; }}
                        >
                          <Eye size={12} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {versions.length > PER_PAGE && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", backgroundColor: "#fff", borderRadius: 9, border: "1px solid rgba(0,0,0,0.07)", padding: "12px 20px", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
              <span style={{ fontSize: 12, color: "#9B9B9B" }}>
                <strong style={{ color: "#1A1A1A" }}>{(page - 1) * PER_PAGE + 1}</strong>–<strong style={{ color: "#1A1A1A" }}>{Math.min(page * PER_PAGE, versions.length)}</strong> sur <strong style={{ color: "#1A1A1A" }}>{versions.length}</strong> versions
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
        </>
      )}
    </div>
  );
}
