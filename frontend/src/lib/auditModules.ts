/**
 * Icône et couleurs par module du journal d'audit.
 *
 * Vit dans `lib/` plutôt que dans la page « Historique & logs » : le tableau de
 * bord, le bandeau et « Mon compte » habillent les mêmes entrées. Tant que
 * cette table était exportée par la page, l'importer depuis le bandeau, chargé
 * d'emblée avec la mise en page, tirait toute la page dans le bundle initial
 * et annulait son chargement à la demande.
 */

import {
  Activity, BarChart2, Building2, ClipboardList, GitBranch, Layers,
  Settings, Users, type LucideIcon,
} from "lucide-react";

export interface ModuleStyle {
  color: string;
  bg: string;
  Icon: LucideIcon;
}

/** Clés = libellés français des modules, tels que le backend les renvoie. */
export const modCfg: Record<string, ModuleStyle> = {
  "Framework":    { color: "#6B21A8", bg: "#F5F0FF", Icon: Layers        },
  "Versions":     { color: "#1565C0", bg: "#EBF3FF", Icon: GitBranch     },
  "Utilisateurs": { color: "#166534", bg: "#EDFAF3", Icon: Users         },
  "Banques":      { color: "#9A3412", bg: "#FFF3ED", Icon: Building2     },
  "Scoring":      { color: "#B45309", bg: "#FFFBEB", Icon: BarChart2     },
  "Évaluations":  { color: "#0F766E", bg: "#ECFDF8", Icon: ClipboardList },
  "Paramètres":   { color: "#3730A3", bg: "#EEF2FF", Icon: Settings      },
};

/** Pour un module inconnu, un libellé ajouté côté backend, par exemple. */
export const FALLBACK_MODULE: ModuleStyle = {
  color: "#6B6B6B",
  bg: "#F5F5F5",
  Icon: Activity,
};
