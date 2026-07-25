"""Tests manuels pour la regle d'affichage du plan d'action prioritaire.

Ce module ne touche ni la base, ni le LTR, ni SHAP -- ces tests
construisent donc des candidats deja "classes" a la main (score LTR
choisi arbitrairement) plutot que d'appeler le vrai pipeline. Pas de
pytest ici, comme le reste du projet : ce script s'execute directement.

    python backend/tests/test_action_plan.py
"""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass

# Rend `app` importable quel que soit le repertoire courant d'ou ce
# script est lance.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.services.action_plan import (  # noqa: E402
    TOP_N,
    RankedCandidate,
    build_priority_plan,
)


@dataclass
class FakeReco:
    code: str
    regulatory_flag: bool = False


def _candidate(
    code: str, dimension_id: int, ltr_score: float, regulatory: bool = False
) -> RankedCandidate:
    return RankedCandidate(
        reco=FakeReco(code=code, regulatory_flag=regulatory),
        dimension_id=dimension_id,
        ltr_score=ltr_score,
        shap_factors=[],
    )


def test_garde_fou_reglementaire() -> None:
    """Une reco reglementaire dans une dimension FORTE doit quand meme
    apparaitre dans le plan prioritaire."""
    dimension_scores = {1: 4.5, 2: 2.0}  # dim 1 forte, dim 2 faible
    global_score = 3.0
    candidates = [
        _candidate("D2-1", dimension_id=2, ltr_score=0.9),
        _candidate("D2-2", dimension_id=2, ltr_score=0.8),
        _candidate("D1-REG", dimension_id=1, ltr_score=0.1, regulatory=True),
    ]
    plan, _ = build_priority_plan(
        candidates, dimension_scores, global_score, {1: "Dim1", 2: "Dim2"}
    )
    codes = {c.reco.code for c in plan}
    assert "D1-REG" in codes, "la reco reglementaire doit etre dans le plan"
    print("OK: garde-fou reglementaire respecte")


def test_plafond_top_n() -> None:
    """Le plan ne depasse jamais TOP_N, sauf si les reglementaires seules
    le depassent."""
    dimension_scores = {1: 2.0}
    global_score = 3.0
    # 15 candidats non reglementaires dans une seule dimension faible.
    candidates = [
        _candidate(f"D1-{i}", dimension_id=1, ltr_score=1.0 - i * 0.01)
        for i in range(15)
    ]
    plan, _ = build_priority_plan(
        candidates,
        dimension_scores,
        global_score,
        {1: "Dim1"},
        max_per_dimension=15,  # pour ne pas etre limite avant le plafond
    )
    assert len(plan) <= TOP_N
    print(f"OK: plafond respecte ({len(plan)} <= {TOP_N})")

    # Avec plus de reglementaires que TOP_N, elles doivent TOUTES etre
    # conservees, meme au-dela de TOP_N.
    reg_candidates = [
        _candidate(f"REG-{i}", dimension_id=1, ltr_score=0.5, regulatory=True)
        for i in range(TOP_N + 5)
    ]
    plan2, _ = build_priority_plan(
        reg_candidates, dimension_scores, global_score, {1: "Dim1"}
    )
    assert len(plan2) == TOP_N + 5, "toutes les reglementaires doivent rester"
    print("OK: les reglementaires depassent TOP_N sans etre coupees")


def test_dimensions_faibles_et_notes_a_niveau() -> None:
    """Les dimensions faibles doivent etre representees ; les dimensions
    fortes sans reco reglementaire dans le plan produisent une note."""
    dimension_scores = {1: 2.0, 2: 4.5}  # 1 faible, 2 forte
    global_score = 3.0
    candidates = [
        _candidate("D1-1", dimension_id=1, ltr_score=0.9),
        _candidate("D2-1", dimension_id=2, ltr_score=0.95),  # non reglemente
    ]
    plan, notes = build_priority_plan(
        candidates,
        dimension_scores,
        global_score,
        {1: "Dimension Faible", 2: "Dimension Forte"},
    )
    codes = {c.reco.code for c in plan}
    assert "D1-1" in codes, "la dimension faible doit etre representee"
    assert "D2-1" not in codes, "dimension forte sans garde-fou -> hors plan"
    note_dims = {n.dimension_id for n in notes}
    assert 2 in note_dims, "la dimension forte doit produire une note"
    assert 1 not in note_dims, "la dimension faible ne doit pas avoir de note"
    print("OK: dimensions faibles representees, notes 'a niveau' correctes")


def test_banque_forte_partout() -> None:
    """Si aucune dimension n'est faible, le plan n'est jamais vide :
    reglementaires + les 3 meilleures toutes dimensions confondues."""
    dimension_scores = {1: 4.0, 2: 4.2, 3: 4.5}  # toutes fortes
    global_score = 3.0  # aucune dimension < 3.0
    candidates = [
        _candidate("A", dimension_id=1, ltr_score=0.9),
        _candidate("B", dimension_id=2, ltr_score=0.8),
        _candidate("C", dimension_id=3, ltr_score=0.7),
        _candidate("D", dimension_id=1, ltr_score=0.6),
        _candidate("E-REG", dimension_id=2, ltr_score=0.1, regulatory=True),
    ]
    plan, _ = build_priority_plan(
        candidates,
        dimension_scores,
        global_score,
        {1: "Dim1", 2: "Dim2", 3: "Dim3"},
    )
    assert len(plan) > 0, "le plan ne doit jamais etre vide"
    codes = {c.reco.code for c in plan}
    assert "E-REG" in codes, "la reglementaire doit etre presente"
    assert {"A", "B", "C"}.issubset(codes), "les 3 meilleures doivent y etre"
    print(f"OK: banque forte partout -> plan non vide ({len(codes)} recos)")


def test_couverture_avec_nombreuses_dimensions_faibles() -> None:
    """Quand il y a plus de dimensions faibles que de places sous
    TOP_N, aucune dimension faible ne doit disparaitre entierement du
    plan -- meme si ca fait depasser le plafond, comme pour les
    reglementaires (regression : ce cas faisait disparaitre une
    dimension entiere avant la reservation par dimension)."""
    dimension_scores = {i: 2.0 for i in range(1, 7)}  # 6 dimensions faibles
    global_score = 3.0
    candidates = []
    for dim in range(1, 7):
        base_score = 0.9 - (dim - 1) * 0.02
        candidates.append(_candidate(f"D{dim}-A", dim, base_score))
        candidates.append(_candidate(f"D{dim}-B", dim, base_score - 0.005))

    plan, _ = build_priority_plan(
        candidates,
        dimension_scores,
        global_score,
        {i: f"Dim{i}" for i in range(1, 7)},
    )
    dims_in_plan = {c.dimension_id for c in plan}
    assert dims_in_plan == set(dimension_scores), (
        f"dimensions manquantes : {set(dimension_scores) - dims_in_plan}"
    )
    print(f"OK: {len(dims_in_plan)} dimensions faibles toutes representees")


def test_determinisme() -> None:
    """A memes entrees, le plan et les notes doivent etre identiques."""
    dimension_scores = {1: 2.0, 2: 4.5}
    global_score = 3.0
    candidates = [
        _candidate("D1-1", dimension_id=1, ltr_score=0.9),
        _candidate("D1-2", dimension_id=1, ltr_score=0.85),
        _candidate("D2-REG", dimension_id=2, ltr_score=0.2, regulatory=True),
    ]
    names = {1: "Dim1", 2: "Dim2"}
    plan1, notes1 = build_priority_plan(
        candidates, dimension_scores, global_score, names
    )
    plan2, notes2 = build_priority_plan(
        candidates, dimension_scores, global_score, names
    )
    assert [c.reco.code for c in plan1] == [c.reco.code for c in plan2]
    assert notes1 == notes2
    print("OK: resultat deterministe (deux appels identiques -> meme sortie)")


def main() -> int:
    test_garde_fou_reglementaire()
    test_plafond_top_n()
    test_dimensions_faibles_et_notes_a_niveau()
    test_banque_forte_partout()
    test_couverture_avec_nombreuses_dimensions_faibles()
    test_determinisme()
    print("\nTOUS LES TESTS DU PLAN PRIORITAIRE SONT PASSES")
    return 0


if __name__ == "__main__":
    sys.exit(main())
