"""Regle d'affichage : plan d'action prioritaire resserre.

Le LTR (ranking.py) et SHAP (explain.py) classent et expliquent DEJA
toutes les recommandations candidates -- ce module ne modifie ni l'un ni
l'autre, ni la base. Il applique uniquement une regle de selection et
d'affichage APRES coup, pour resserrer un scenario qui peut renvoyer 25 a
30 recommandations en un "plan d'action prioritaire" plus court, tout en
conservant la liste complete classee pour un lien "voir tout" cote front.

Regle (deterministe : a memes entrees, meme plan) :
1. Une dimension est "faible" si son score < score global de la banque
   (WEAK_THRESHOLD_MODE == "global_average" -- seuil adaptatif, pas fixe).
2. Pour chaque dimension faible, on retient ses MAX_PER_DIMENSION
   meilleures recommandations (score LTR decroissant).
3. Garde-fou reglementaire : toute recommandation avec regulatory_flag
   est TOUJOURS incluse, quelle que soit la force de sa dimension -- une
   obligation reglementaire n'est jamais masquee.
4. Le tout est deduplique puis trie par score LTR decroissant.
5. Plafond TOP_N : il s'applique uniquement aux recommandations NON
   reglementaires -- les reglementaires sont toujours toutes conservees,
   meme si leur nombre depasse TOP_N a lui seul. Avant ce plafonnage par
   score, une place est reservee au meilleur candidat non reglementaire
   de CHAQUE dimension representee, pour garantir qu'aucune dimension
   faible ne disparaisse entierement du plan quand il y en a beaucoup --
   ces reservations sont elles aussi toujours conservees, meme si leur
   nombre depasse la place restante sous TOP_N.
6. Cas limite : si aucune dimension n'est faible, le plan reste non vide
   -- il contient les reglementaires plus les TOP_N_IF_NO_WEAK_DIMENSION
   meilleures recommandations toutes dimensions confondues.

En complement, une note "a niveau" est produite pour chaque dimension non
faible qui n'a pas de recommandation reglementaire dans le plan final
(sinon la note contredirait l'action reglementaire deja affichee pour
cette dimension).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

WEAK_THRESHOLD_MODE = "global_average"
MAX_PER_DIMENSION = 2
TOP_N = 10
TOP_N_IF_NO_WEAK_DIMENSION = 3

_LEVEL_MESSAGE = (
    "Vous etes a niveau sur cette dimension, maintenez vos pratiques."
)


@dataclass(frozen=True)
class RankedCandidate:
    """Une recommandation candidate, deja classee par le LTR et deja
    expliquee par SHAP -- ce module se contente de la lire, jamais de la
    recalculer."""

    reco: Any
    dimension_id: int
    ltr_score: float
    shap_factors: list[dict[str, Any]]


@dataclass(frozen=True)
class DimensionNote:
    """Note informative pour une dimension non faible et sans
    recommandation reglementaire dans le plan prioritaire."""

    dimension_id: int
    dimension_name: str
    dimension_score: float
    message: str


def _weak_dimensions(
    dimension_scores: dict[int, float],
    global_score: float,
    weak_threshold_mode: str,
) -> set[int]:
    """Determine les dimensions dont le score est sous le seuil adaptatif
    (la moyenne globale de la banque, pas un seuil fixe)."""
    if weak_threshold_mode != "global_average":
        raise ValueError(
            f"WEAK_THRESHOLD_MODE non supporte : {weak_threshold_mode!r}"
        )
    return {
        dim_id
        for dim_id, score in dimension_scores.items()
        if score < global_score
    }


def _is_regulatory(candidate: RankedCandidate) -> bool:
    return bool(getattr(candidate.reco, "regulatory_flag", False))


def _deduplicate(
    candidates: list[RankedCandidate],
) -> list[RankedCandidate]:
    """Deduplique par code de recommandation, en gardant la premiere
    occurrence rencontree -- l'ordre d'entree pilote donc le resultat,
    ce qui garde la fonction deterministe."""
    seen: dict[str, RankedCandidate] = {}
    for candidate in candidates:
        seen.setdefault(candidate.reco.code, candidate)
    return list(seen.values())


def build_priority_plan(
    ranked_candidates: list[RankedCandidate],
    dimension_scores: dict[int, float],
    global_score: float,
    dimension_names: dict[int, str],
    *,
    weak_threshold_mode: str = WEAK_THRESHOLD_MODE,
    max_per_dimension: int = MAX_PER_DIMENSION,
    top_n: int = TOP_N,
) -> tuple[list[RankedCandidate], list[DimensionNote]]:
    """Construit le plan d'action prioritaire resserre a partir des
    recommandations DEJA classees par le LTR -- cette fonction ne
    reclasse rien, elle selectionne et filtre (voir le docstring du
    module pour la regle complete).

    ``ranked_candidates`` est normalement deja trie par ``ltr_score``
    decroissant (sortie du LTR), mais cette fonction retrie quand meme
    par securite -- la logique par dimension ci-dessous (compteur "les
    N premiers rencontres") depend entierement de cet ordre, et une
    fonction publique ne devrait pas silencieusement donner un resultat
    faux si un appelant lui passe une liste non triee.
    Retourne ``(plan_prioritaire, notes_dimensions)``. A entrees egales,
    le resultat est toujours identique (deterministe).
    """
    ranked_candidates = sorted(
        ranked_candidates, key=lambda c: c.ltr_score, reverse=True
    )
    weak_dims = _weak_dimensions(
        dimension_scores, global_score, weak_threshold_mode
    )
    regulatory = [c for c in ranked_candidates if _is_regulatory(c)]

    if weak_dims:
        # Etape 1 : les max_per_dimension meilleures de chaque dimension
        # faible. ranked_candidates est deja trie par score LTR
        # decroissant, un simple compteur par dimension suffit donc --
        # pas besoin de retrier par dimension.
        per_dimension_count: dict[int, int] = {}
        weak_dimension_picks = []
        for candidate in ranked_candidates:
            if candidate.dimension_id not in weak_dims:
                continue
            count_so_far = per_dimension_count.get(candidate.dimension_id, 0)
            if count_so_far >= max_per_dimension:
                continue
            weak_dimension_picks.append(candidate)
            per_dimension_count[candidate.dimension_id] = count_so_far + 1
        base = weak_dimension_picks + regulatory
    else:
        # Etape 6 : cas limite, banque forte partout -- le plan ne doit
        # jamais etre vide : reglementaires + les meilleures toutes
        # dimensions confondues.
        base = regulatory + ranked_candidates[:TOP_N_IF_NO_WEAK_DIMENSION]

    base = _deduplicate(base)
    base.sort(key=lambda c: c.ltr_score, reverse=True)

    # Etape 5 : le plafond ne s'applique qu'aux non-reglementaires -- une
    # obligation reglementaire n'est jamais masquee par TOP_N, meme si
    # leur nombre depasse TOP_N a lui seul.
    final_regulatory = [c for c in base if _is_regulatory(c)]
    non_regulatory = [c for c in base if not _is_regulatory(c)]
    remaining_slots = max(0, top_n - len(final_regulatory))

    # Garantie de couverture : avant de plafonner par score, on reserve
    # le meilleur candidat non reglementaire de CHAQUE dimension
    # representee (non_regulatory est deja trie par score decroissant,
    # donc le premier candidat rencontre pour une dimension est son
    # meilleur). Sans cela, une dimension faible aux scores un peu plus
    # bas que les autres peut disparaitre entierement du plan des qu'il
    # y a plus de dimensions faibles que de places -- exactement comme
    # pour le garde-fou reglementaire, la couverture passe avant le
    # compte exact : si les reservations depassent remaining_slots,
    # elles sont quand meme toutes conservees.
    reserved = []
    covered_by_reservation: set[int] = set()
    for candidate in non_regulatory:
        if candidate.dimension_id in covered_by_reservation:
            continue
        reserved.append(candidate)
        covered_by_reservation.add(candidate.dimension_id)

    reserved_codes = {c.reco.code for c in reserved}
    remaining_pool = [
        c for c in non_regulatory if c.reco.code not in reserved_codes
    ]
    extra_slots = max(0, remaining_slots - len(reserved))
    non_regulatory_final = reserved + remaining_pool[:extra_slots]

    plan = final_regulatory + non_regulatory_final
    plan.sort(key=lambda c: c.ltr_score, reverse=True)

    dims_covered_by_regulatory = {
        c.dimension_id for c in plan if _is_regulatory(c)
    }
    notes = [
        DimensionNote(
            dimension_id=dim_id,
            dimension_name=dimension_names.get(dim_id, str(dim_id)),
            dimension_score=score,
            message=_LEVEL_MESSAGE,
        )
        for dim_id, score in dimension_scores.items()
        if dim_id not in weak_dims and dim_id not in dims_covered_by_regulatory
    ]

    return plan, notes
