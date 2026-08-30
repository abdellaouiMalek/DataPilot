import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2, AlertTriangle } from "lucide-react";
import { versionsApi } from "../../lib/versions";
import { getMaturityLevels, type MaturityLevel } from "../../lib/config";
import { buildVersionSnapshot, setVersionSnapshot } from "../shared/versionChanges";
import { VersionDetail } from "./VersionDetail";

/**
 * Bridges the real, async `/api/versions/{id}` fetch to VersionDetail.tsx's
 * synchronous prop/lookup design (kept exactly as given, see its own
 * docstring) : fetches the published circular, builds its snapshot, seeds
 * `versionSnapshots` with it, THEN renders `<VersionDetail>` -- which
 * finds it via a plain lookup, same as if it had always been there.
 *
 * Mounted at both `/super-admin/versions/:circularId` (the "Consulter"
 * action on the versions list) and `/admin/versions/:circularId` (where an
 * `admin`-role user lands after clicking their "nouvelle version publiée"
 * notification) -- both routes point at this same component, gated
 * differently (RequireSuperAdmin / RequireAdmin), same underlying
 * `/api/versions` endpoint (readable by both roles, see
 * backend/app/routers/versions.py).
 */
export function VersionDetailRoute() {
  const { circularId } = useParams<{ circularId: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<{ status: "loading" } | { status: "error"; message: string } | { status: "ready"; versionId: string; versionNumber: string; versionName: string }>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!circularId) return;
      setState({ status: "loading" });
      try {
        const [circular, maturityLevels] = await Promise.all([
          versionsApi.get(Number(circularId)),
          getMaturityLevels().catch((): MaturityLevel[] => []),
        ]);
        if (cancelled) return;
        setVersionSnapshot(String(circular.id), buildVersionSnapshot(circular, maturityLevels));
        setState({
          status: "ready",
          versionId: String(circular.id),
          versionNumber: circular.version,
          versionName: circular.theme || circular.reference,
        });
      } catch (e) {
        if (cancelled) return;
        setState({ status: "error", message: e instanceof Error ? e.message : "Échec du chargement de la version" });
      }
    }
    load();
    return () => { cancelled = true; };
  }, [circularId]);

  if (state.status === "loading") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 10, color: "#9B9B9B" }}>
        <Loader2 size={22} className="animate-spin" />
        <span style={{ fontSize: 13 }}>Chargement de la version…</span>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 10, padding: 24, textAlign: "center" }}>
        <AlertTriangle size={22} style={{ color: "#CC0000" }} />
        <span style={{ fontSize: 13, color: "#4A4A4A" }}>{state.message}</span>
        <button onClick={() => navigate(-1)} style={{ marginTop: 6, padding: "8px 18px", borderRadius: 6, fontSize: 13, fontWeight: 600, border: "1px solid rgba(0,0,0,0.12)", backgroundColor: "#fff", cursor: "pointer", color: "#4A4A4A" }}>
          Retour
        </button>
      </div>
    );
  }

  return (
    <VersionDetail
      versionId={state.versionId}
      versionNumber={state.versionNumber}
      versionName={state.versionName}
      onBack={() => navigate(-1)}
    />
  );
}
