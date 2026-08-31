import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Users } from "lucide-react";
import { listUsers, countUsers } from "@/lib/adminUsers";
import { AdminLoader } from "@/components/AdminLoader";
import { buildKpiCards, KpiCard } from "../superAdmin/AdminUsers";
import type { KpiStats } from "../superAdmin/AdminUsers";

/**
 * Tableau de bord de l'espace admin — volontairement limité aux
 * indicateurs utilisateurs.
 *
 * Le tableau de bord super admin agrège aussi banques, dimensions, logs et
 * paramètres : autant de sections auxquelles l'admin n'a pas accès, d'où
 * une version dédiée plutôt qu'un filtrage de l'original.
 *
 * Les comptes super admin sont exclus côté serveur (`list_users` filtre sur
 * le rôle de l'appelant), donc les compteurs ci-dessous reflètent déjà le
 * périmètre autorisé — aucun filtrage supplémentaire ici.
 */
export function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<KpiStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([listUsers({ max: 100 }), countUsers()])
      .then(([list, count]) => {
        if (cancelled) return;

        const DAY = 24 * 3600 * 1000;
        const now = Date.now();
        const pendingAges = list
          .filter(u => u.status === "En attente" && u.created_at)
          .map(u => Math.floor((now - Date.parse(u.created_at as string)) / DAY));

        setStats({
          total: count.count,
          active: list.filter(u => u.status === "Actif").length,
          // Non affiché ici (buildKpiCards + includeAdmins: false) : requis
          // par le type KpiStats, partagé avec le tableau de bord super admin.
          admins: 0,
          pending: list.filter(u => u.status === "En attente").length,
          createdThisWeek: list.filter(
            u => u.created_at && now - Date.parse(u.created_at) < 7 * DAY,
          ).length,
          connected30: list.filter(
            u => u.last_login && now - Date.parse(u.last_login) < 30 * DAY,
          ).length,
          oldestPendingDays: pendingAges.length ? Math.max(...pendingAges) : -1,
        });
      })
      .catch(() => {
        if (!cancelled) setError("Impossible de charger les statistiques utilisateurs.");
      });

    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ padding: "28px 32px" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#1A1A1A", letterSpacing: "-0.02em" }}>
          Tableau de bord
        </h1>
        <p style={{ fontSize: 13, color: "#6B6B6B", marginTop: 4 }}>
          Vue d'ensemble des comptes utilisateurs.
        </p>
      </div>

      {error && (
        <div style={{
          backgroundColor: "#FFEBEE", color: "#CC0000", borderRadius: 10,
          padding: "12px 16px", fontSize: 13, fontWeight: 600, marginBottom: 20,
        }}>
          {error}
        </div>
      )}

      {!stats && !error ? (
        <AdminLoader variant="inline" label="Chargement des statistiques…" />
      ) : stats ? (
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 28 }}>
          {buildKpiCards(stats, { includeAdmins: false }).map(
            (card, i) => <KpiCard key={i} card={card} />,
          )}
        </div>
      ) : null}

      <button
        onClick={() => navigate("/admin/users")}
        style={{
          display: "inline-flex", alignItems: "center", gap: 10,
          backgroundColor: "#1A1A1A", color: "#fff",
          border: "none", borderRadius: 10,
          padding: "12px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer",
        }}
      >
        <Users size={16} />
        Gérer les utilisateurs
        <ArrowRight size={15} />
      </button>
    </div>
  );
}
