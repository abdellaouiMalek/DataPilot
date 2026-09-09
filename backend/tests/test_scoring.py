"""Tests pour le moteur de scoring (app/services/scoring.py).

Tout est pur ici (pas de DB, pas de reseau) : moyenne ponderee, mapping
vers un niveau de maturite, calcul de score par dimension puis global, et
les deux scenarios de selection de recommandations (+1 par dimension /
cible personnalisee sur une dimension).

    pytest backend/tests/test_scoring.py
"""

from __future__ import annotations

import pytest

from app.services.scoring import (
    DimensionInput,
    MaturityBand,
    QuestionInput,
    compute_scores,
    map_to_maturity_level,
    select_recommendations_custom_target,
    select_recommendations_dimension_plus_one,
    weighted_average,
)


# ── weighted_average ────────────────────────────────────────────────────

def test_weighted_average_vide() -> None:
    assert weighted_average([]) == 0.0


def test_weighted_average_poids_normaux() -> None:
    # (4*1 + 2*3) / (1+3) = 10/4 = 2.5
    assert weighted_average([(4.0, 1.0), (2.0, 3.0)]) == 2.5


def test_weighted_average_poids_tous_nuls() -> None:
    """Repli sur la moyenne simple quand tous les poids sont a zero,
    plutot qu'une division par zero."""
    assert weighted_average([(2.0, 0.0), (4.0, 0.0)]) == 3.0


# ── map_to_maturity_level ────────────────────────────────────────────────

BANDS = [
    MaturityBand(label="Initial", min_score=0.0, max_score=1.99),
    MaturityBand(label="En cours", min_score=2.0, max_score=3.49),
    MaturityBand(label="Avance", min_score=3.5, max_score=5.0),
]


def test_map_to_maturity_level_aucune_bande() -> None:
    assert map_to_maturity_level(3.0, []) is None


def test_map_to_maturity_level_score_dans_une_bande() -> None:
    assert map_to_maturity_level(2.5, BANDS) == "En cours"


def test_map_to_maturity_level_bornes_incluses() -> None:
    assert map_to_maturity_level(2.0, BANDS) == "En cours"
    assert map_to_maturity_level(3.49, BANDS) == "En cours"


def test_map_to_maturity_level_hors_de_toute_bande() -> None:
    """Un score entre deux bandes non contigues (ex. trou de couverture
    dans le referentiel) ne doit pas etre rattache a une bande voisine."""
    gapped_bands = [
        MaturityBand(label="Bas", min_score=0.0, max_score=1.0),
        MaturityBand(label="Haut", min_score=2.0, max_score=5.0),
    ]
    assert map_to_maturity_level(1.5, gapped_bands) is None


def test_map_to_maturity_level_ordre_des_bandes_indifferent() -> None:
    """La fonction trie elle-meme les bandes -- l'ordre d'entree ne doit
    rien changer au resultat."""
    shuffled = [BANDS[2], BANDS[0], BANDS[1]]
    assert map_to_maturity_level(2.5, shuffled) == "En cours"


# ── compute_scores ────────────────────────────────────────────────────

def test_compute_scores_deux_dimensions() -> None:
    questions = [
        QuestionInput(question_id=1, dimension_id=10, weight=1.0, value=2),
        QuestionInput(question_id=2, dimension_id=10, weight=1.0, value=4),
        QuestionInput(question_id=3, dimension_id=20, weight=1.0, value=5),
    ]
    dimensions = [
        DimensionInput(dimension_id=10, weight=60.0),
        DimensionInput(dimension_id=20, weight=40.0),
    ]
    result = compute_scores(questions, dimensions, BANDS)

    assert result.dimension_scores[10] == 3.0  # (2+4)/2
    assert result.dimension_scores[20] == 5.0
    # (3.0*60 + 5.0*40) / 100 = 3.8
    assert result.global_score == pytest.approx(3.8)
    assert result.maturity_label == "Avance"


def test_compute_scores_dimension_sans_poids_declare() -> None:
    """Une dimension presente dans les reponses mais absente de la liste
    des dimensions (poids inconnu) compte pour un poids de 0, elle
    n'ecrase pas le calcul des autres."""
    questions = [QuestionInput(question_id=1, dimension_id=99, weight=1.0, value=5)]
    result = compute_scores(questions, dimensions=[], bands=BANDS)
    assert result.dimension_scores[99] == 5.0
    # Poids global 0 pour l'unique dimension -> repli sur la moyenne simple.
    assert result.global_score == 5.0


# ── select_recommendations_dimension_plus_one (scenario 1) ──────────────

def test_scenario1_selectionne_l_etape_suivante() -> None:
    evaluation = {1: 2, 2: 3}
    question_dimensions = {1: 10, 2: 10}
    dimension_scores = {10: 2.5}  # cible = 3.5
    catalog = {
        (1, 2): "reco-1-vers-3",
        (2, 3): "reco-3-vers-4",
    }
    result = select_recommendations_dimension_plus_one(
        evaluation, question_dimensions, dimension_scores, catalog
    )
    assert set(result) == {"reco-1-vers-3", "reco-3-vers-4"}


def test_scenario1_ignore_na_et_niveau_max() -> None:
    evaluation = {1: None, 2: 5}
    question_dimensions = {1: 10, 2: 10}
    dimension_scores = {10: 2.0}
    catalog = {(1, 1): "x", (2, 5): "y"}
    assert select_recommendations_dimension_plus_one(
        evaluation, question_dimensions, dimension_scores, catalog
    ) == []


def test_scenario1_ignore_question_deja_a_la_cible() -> None:
    """current_level >= target_level (dimension deja au-dessus de +1) ->
    aucune recommandation pour cette question."""
    evaluation = {1: 4}
    question_dimensions = {1: 10}
    dimension_scores = {10: 3.0}  # cible = 4.0, current_level=4 >= 4.0
    catalog = {(1, 4): "reco"}
    assert select_recommendations_dimension_plus_one(
        evaluation, question_dimensions, dimension_scores, catalog
    ) == []


def test_scenario1_plafonne_a_max_level() -> None:
    """Une dimension a 4.8 vise min(5.8, 5) = 5, jamais au-dela."""
    evaluation = {1: 4}
    question_dimensions = {1: 10}
    dimension_scores = {10: 4.8}
    catalog = {(1, 4): "reco-4-vers-5"}
    assert select_recommendations_dimension_plus_one(
        evaluation, question_dimensions, dimension_scores, catalog
    ) == ["reco-4-vers-5"]


def test_scenario1_catalog_incomplet_ignore_silencieusement() -> None:
    """Aucune entree catalogue pour (question, niveau) -> ignoree, pas
    d'exception."""
    evaluation = {1: 2}
    question_dimensions = {1: 10}
    dimension_scores = {10: 2.0}
    assert select_recommendations_dimension_plus_one(
        evaluation, question_dimensions, dimension_scores, catalog={}
    ) == []


# ── select_recommendations_custom_target (scenario 2) ────────────────────

def test_scenario2_chaine_complete_de_recommandations() -> None:
    """current=2, cible=5 -> les etapes 2->3, 3->4, 4->5."""
    evaluation = {1: 2}
    question_dimensions = {1: 10}
    catalog = {(1, 2): "a", (1, 3): "b", (1, 4): "c"}
    result = select_recommendations_custom_target(
        evaluation, question_dimensions, dimension_id=10, target_level=5, catalog=catalog
    )
    assert result == ["a", "b", "c"]


def test_scenario2_ignore_autres_dimensions() -> None:
    evaluation = {1: 2, 2: 2}
    question_dimensions = {1: 10, 2: 20}
    catalog = {(1, 2): "a", (2, 2): "b"}
    result = select_recommendations_custom_target(
        evaluation, question_dimensions, dimension_id=10, target_level=3, catalog=catalog
    )
    assert result == ["a"]


def test_scenario2_ignore_question_deja_a_la_cible() -> None:
    evaluation = {1: 4}
    question_dimensions = {1: 10}
    catalog = {(1, 4): "a"}
    result = select_recommendations_custom_target(
        evaluation, question_dimensions, dimension_id=10, target_level=4, catalog=catalog
    )
    assert result == []


@pytest.mark.parametrize("bad_target", [0, 6, -1])
def test_scenario2_cible_hors_bornes_leve(bad_target: int) -> None:
    with pytest.raises(ValueError):
        select_recommendations_custom_target(
            {1: 1}, {1: 10}, dimension_id=10, target_level=bad_target, catalog={}
        )
