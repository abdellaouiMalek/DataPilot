"""Tests pour les helpers purs de la veille reglementaire
(app/services/regulatory.py) : decoupage en articles par regex
(split_into_articles) et rapprochement approche de sous-dimension
(_best_subdimension_match). Aucun des deux ne touche la DB ni un LLM.

    pytest backend/tests/test_regulatory_helpers.py
"""

from __future__ import annotations

from dataclasses import dataclass

from app.services.regulatory import _best_subdimension_match, split_into_articles


# ── split_into_articles ──────────────────────────────────────────────────

def test_split_sans_marqueur_article_renvoie_liste_vide() -> None:
    """Un communique non structure en articles -- pas d'exception, liste
    vide pour que l'appelant retombe sur le texte brut."""
    assert split_into_articles("Ceci est une simple note sans structure.") == []


def test_split_texte_vide_renvoie_liste_vide() -> None:
    assert split_into_articles("") == []
    assert split_into_articles("   ") == []


def test_split_deux_articles_texte_preserve_verbatim() -> None:
    text = (
        "Préambule, vu la loi...\n"
        "Article 1 : Les banques doivent publier un rapport annuel.\n"
        "Article 2 : Ce rapport est transmis avant le 31 mars.\n"
    )
    articles = split_into_articles(text)
    assert len(articles) == 2
    assert articles[0]["label"] == "Article 1"
    assert articles[0]["text"] == "Les banques doivent publier un rapport annuel."
    assert articles[1]["label"] == "Article 2"
    assert articles[1]["text"] == "Ce rapport est transmis avant le 31 mars."


def test_split_preambule_avant_le_premier_marqueur_exclu() -> None:
    """Le texte avant le premier "Article" (objet, visas) n'est pas un
    article -- il fait doublon avec extract_document_metadata ailleurs."""
    text = "Objet : mise a jour du dispositif.\nArticle 1 : Entree en vigueur immediate."
    articles = split_into_articles(text)
    assert len(articles) == 1
    assert "Objet" not in articles[0]["text"]


def test_split_variantes_de_marqueur() -> None:
    """"Art. N", "Article N -", et le suffixe bis/ter sont tous reconnus."""
    text = (
        "Art. 3 : Premiere regle.\n"
        "Article 4 bis - Regle inseree apres coup.\n"
        "Art 5. Derniere regle.\n"
    )
    articles = split_into_articles(text)
    labels = [a["label"] for a in articles]
    assert labels == ["Art. 3", "Article 4 bis", "Art 5"]


def test_split_article_sans_corps_est_ignore() -> None:
    """Deux marqueurs consecutifs sans texte entre les deux -- l'article
    vide n'est pas ajoute (rien d'exploitable a afficher)."""
    text = "Article 1 :\nArticle 2 : Contenu reel."
    articles = split_into_articles(text)
    assert len(articles) == 1
    assert articles[0]["label"] == "Article 2"


# ── _best_subdimension_match ──────────────────────────────────────────────

@dataclass
class FakeSubDimension:
    name: str


def test_best_match_aucune_sous_dimension_disponible() -> None:
    assert _best_subdimension_match([], "Tracabilite") is None


def test_best_match_correspondance_exacte() -> None:
    subs = [FakeSubDimension("Gouvernance des données"), FakeSubDimension("Tracabilite / lignage")]
    best, ratio = _best_subdimension_match(subs, "Tracabilite / lignage")
    assert best.name == "Tracabilite / lignage"
    assert ratio == 1.0


def test_best_match_choisit_le_plus_proche_parmi_plusieurs() -> None:
    subs = [
        FakeSubDimension("Empreinte carbone"),
        FakeSubDimension("Gouvernance des donnees"),
        FakeSubDimension("Qualite des donnees"),
    ]
    best, _ = _best_subdimension_match(subs, "Gouvernance de la donnee")
    assert best.name == "Gouvernance des donnees"


def test_best_match_hint_sans_rapport_donne_un_ratio_faible() -> None:
    """Un theme reellement nouveau doit produire un ratio bas -- c'est ce
    ratio que les seuils de reutilisation (voir regulatory.py) comparent
    pour decider de creer plutot que de rattacher a tort."""
    subs = [FakeSubDimension("Sponsoring executif")]
    _, ratio = _best_subdimension_match(subs, "Empreinte carbone des infrastructures")
    assert ratio < 0.5
