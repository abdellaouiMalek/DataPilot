"""Analyse reglementaire d'une circulaire (« Veille reglementaire »), avec
RAG (retrieval-augmented generation) sur le referentiel : chaque section de
la circulaire est comparee par similarite d'embeddings (bge-m3, voir
``llm/embeddings.py``) aux questions/recommandations existantes, et seuls
les k elements les plus proches sont montres au LLM -- pas tout le
referentiel, ce qui garde le prompt court (donc rapide sur un modele local
CPU) et fiable (moins de candidats = moins de risque de code invente).

REGLE ABSOLUE : ce module ne fait que PROPOSER. Aucune ecriture en base
n'a lieu ici -- les fonctions ci-dessous retournent des propositions
("exigences") a valider par un humain ; leur application eventuelle au
referentiel se fait ailleurs, apres validation.

Ce module reste DB-agnostique (comme avant) : la recherche par similarite
(qui a besoin d'une session DB) vit dans ``app/services/regulatory_index.py``
et est appelee par l'orchestrateur async (``app/services/regulatory.py``),
qui boucle sur les sections, recupere les candidats, puis appelle les
fonctions synchrones ici (``build_retrieval_query``, puis
``analyze_chunk_with_candidates``) pour chacune.
"""

from __future__ import annotations

import difflib
import json
import os
from dataclasses import dataclass, field
from typing import Any

from llm.generation import _contains_garbage_token, call_regulatory_llm

# Les 7 combinaisons (entite, action) possibles pour une exigence detectee.
# Un seul enum plat plutot que deux champs separes ("entity_type" +
# "action") : verifie empiriquement (Task 7) qu'un petit modele local
# respecte un enum unique de facon bien plus fiable qu'une classification
# a deux niveaux -- ce module le decoupe en (entity_type, proposed_action)
# cote Python juste apres, voir ``_split_impact_kind``.
IMPACT_KINDS = (
    "question_ajouter",
    "question_modifier",
    "question_desactiver",
    "recommandation_ajouter",
    "recommandation_modifier",
    "recommandation_desactiver",
    "recommandation_activer_flag",
)

_SIMILARITY_THRESHOLD = 0.82

_SYSTEM_PROMPT = """\
Tu es un assistant qui analyse des circulaires reglementaires bancaires
(ex. Banque Centrale de Tunisie) pour proposer des mises a jour d'un
referentiel d'evaluation de maturite data. Le texte source peut etre en
francais ou en arabe ; tu reponds TOUJOURS en francais.

Tu ne dois JAMAIS inventer d'exigence absente du texte fourni. Chaque
exigence doit correspondre a une obligation reellement presente dans
l'extrait analyse, et son "excerpt" doit etre une citation courte et
fidele de ce texte (pas une paraphrase).

Des candidats du referentiel existant (questions et recommandations les
plus proches du sujet de cet extrait) te sont fournis ci-dessous -- ce ne
sont PAS tous les elements du referentiel, seulement les plus pertinents
pour CET extrait. Attention : ces candidats sont choisis par similarite
generale, PAS garantis pertinents -- il arrive qu'AUCUN ne corresponde
vraiment au sujet precis de l'exigence (ex. des candidats sur "la
gouvernance data" ne couvrent PAS une exigence sur "l'empreinte carbone
des infrastructures"). Ne force JAMAIS un rattachement a un candidat dont
le SUJET reel differe -- dans ce cas utilise "ajouter" (nouvelle question
ou nouvelle recommandation), meme si le candidat semble superficiellement
proche (meme categorie, meme dimension). Pour CHAQUE exigence detectee,
choisis un impact_kind parmi exactement ces 7 valeurs :
- "recommandation_activer_flag" : une recommandation candidate couvre deja
  cette exigence, il suffit d'activer son indicateur reglementaire.
  reco_code = code EXACT d'un candidat (jamais invente).
- "recommandation_modifier" : une recommandation candidate est proche mais
  doit etre modifiee. reco_code = code EXACT d'un candidat, modification =
  ce qui doit changer.
- "recommandation_ajouter" : aucune recommandation candidate ne couvre
  cette exigence, mais une question candidate est le bon rattachement.
  question_code = code EXACT d'un candidat, trigger_level (1 a 4, le
  palier de maturite que cette nouvelle recommandation fait franchir),
  title, recommendation_text, category, effort (1 a 3).
- "question_modifier" : une question candidate doit etre reformulee ou
  precisee. question_code = code EXACT d'un candidat, modification.
- "question_desactiver" : une question candidate est rendue obsolete par
  la circulaire (jamais utilisee pour une exigence NOUVELLE). question_code
  + justification.
- "question_ajouter" : rien dans les candidats ne couvre le sujet, une
  toute nouvelle question d'evaluation est necessaire. title (libelle de
  la question, reformule), level_labels (jusqu'a 5 libelles courts, du
  niveau le plus faible au plus fort), dimension_hint = le nom de la
  dimension candidate la plus proche thematiquement (ou vide si aucune).

Ne propose JAMAIS un "ajouter" qui ferait doublon avec un candidat deja
liste -- dans ce cas utilise "modifier" ou "activer_flag" a la place. Ne
reference JAMAIS un reco_code/question_code absent des candidats fournis.

Reponds uniquement en JSON strict conforme au schema demande."""

_JSON_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "exigences": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "excerpt": {"type": "string"},
                    "requirement_text": {"type": "string"},
                    "impact_kind": {"type": "string", "enum": list(IMPACT_KINDS)},
                    "reco_code": {"type": "string"},
                    "question_code": {"type": "string"},
                    "title": {"type": "string"},
                    "recommendation_text": {"type": "string"},
                    "category": {"type": "string"},
                    "effort": {"type": "integer"},
                    "trigger_level": {"type": "integer"},
                    "level_labels": {"type": "array", "items": {"type": "string"}},
                    "dimension_hint": {"type": "string"},
                    "modification": {"type": "string"},
                    "justification": {"type": "string"},
                },
                "required": ["excerpt", "requirement_text", "impact_kind"],
            },
        },
    },
    "required": ["exigences"],
    "additionalProperties": False,
}

_CHUNK_MAX_OUTPUT_TOKENS = 1500
_DEFAULT_LEVEL_LABELS = 5


@dataclass(frozen=True)
class Exigence:
    """Une exigence detectee, avec sa proposition d'impact -- toujours a
    l'etat "propose", jamais applique."""

    excerpt: str
    requirement_text: str
    entity_type: str  # "question" | "recommandation"
    proposed_action: str  # "ajouter" | "modifier" | "desactiver" | "activer_flag"
    proposed: dict[str, Any] = field(default_factory=dict)


def _split_impact_kind(impact_kind: str) -> tuple[str, str]:
    entity_type, _, action = impact_kind.partition("_")
    return entity_type, action


# ── Traduction du document ENTIER (arabe -> francais), UNE fois par
# circulaire, avant le decoupage en chunks d'analyse ─────────────────────
#
# Plus grand que CHUNK_SIZE (pdf_extract.py) : "quelques grands blocs"
# plutot que plein de petits, pour minimiser le nombre d'appels LLM de
# traduction sur un document long. Un bloc de traduction couvre
# generalement plusieurs chunks d'analyse.
_TRANSLATION_BLOCK_CHARS = int(os.getenv("REG_TRANSLATION_BLOCK_CHARS", "12000"))

_TRANSLATE_DOCUMENT_SYSTEM_PROMPT = """\
Tu traduis un texte de l'arabe vers le francais. Traduction directe et
fidele, sans commentaire, sans reformulation, sans rien ajouter ni omettre
et SANS resumer -- traduis l'integralite du texte fourni, phrase par
phrase, dans le meme ordre. Le resultat sert a l'analyse reglementaire
d'une circulaire bancaire ; privilegie la fidelite au sens et la
completude sur le style. Reponds uniquement avec le texte traduit, sans
JSON, sans guillemets, sans prefixe."""


@dataclass(frozen=True)
class TranslationBlock:
    """Un bloc du document source et sa traduction francaise, avec la
    position (en caracteres) du bloc TRADUIT dans le texte francais
    complet renvoye par ``translate_document_to_french`` -- sert a
    retrouver, pour un chunk d'analyse (decoupe dans ce texte francais),
    le texte ORIGINAL correspondant pour la tracabilite (voir
    ``find_original_context``)."""

    original: str
    translated: str
    start: int
    end: int


def translate_document_to_french(text: str) -> tuple[str, list[TranslationBlock]]:
    """Traduit un document arabe en francais avant le decoupage en chunks
    d'analyse, en quelques grands blocs (``_TRANSLATION_BLOCK_CHARS``) --
    un seul appel LLM si le document tient dans un bloc, quelques appels
    sinon, plutot qu'une traduction par petit chunk d'analyse (qui
    doublait le nombre d'appels LLM : voir le docstring du module).

    Retourne ``(texte_francais_complet, blocs)`` :
    - ``texte_francais_complet`` est ce qui doit ensuite etre decoupe en
      chunks pour l'analyse (RAG + LLM, tout en francais a partir de la) ;
    - ``blocs`` garde le texte ORIGINAL (arabe) de chaque section alignee
      avec sa traduction, pour que l'excerpt affiche a l'admin puisse
      citer la circulaire dans sa langue source -- important en contexte
      bancaire : ne jamais presenter une traduction comme si c'etait
      l'original (voir ``find_original_context``).

    Ne leve jamais : si la traduction d'un bloc echoue completement
    (Gemini ET le repli local echouent tous les deux, voir
    ``call_regulatory_llm``), ce bloc est gardé TEL QUEL (texte arabe non
    traduit) plutot que perdu -- le decoupage et l'analyse qui suivent le
    verront alors tel quel (moins fiable pour ce bloc, mais jamais de
    plantage ni de contenu perdu)."""
    from llm.pdf_extract import chunk_text  # import tardif : pdf_extract ne depend pas de ce module, evite tout risque de cycle

    raw_blocks = chunk_text(text, chunk_size=_TRANSLATION_BLOCK_CHARS, overlap=0)

    blocks: list[TranslationBlock] = []
    full_text_parts: list[str] = []
    offset = 0
    for raw_block in raw_blocks:
        try:
            translated = call_regulatory_llm(_TRANSLATE_DOCUMENT_SYSTEM_PROMPT, raw_block, max_output_tokens=_CHUNK_MAX_OUTPUT_TOKENS * 4).strip()
            if not translated or _contains_garbage_token(translated):
                translated = raw_block  # repli : garder l'original plutot qu'une traduction vide/suspecte
        except Exception:
            translated = raw_block

        start = offset
        end = start + len(translated)
        blocks.append(TranslationBlock(original=raw_block, translated=translated, start=start, end=end))
        full_text_parts.append(translated)
        offset = end + 2  # +2 : le separateur "\n\n" ajoute par le join ci-dessous

    return "\n\n".join(full_text_parts), blocks


def find_original_context(chunk: str, full_french_text: str, blocks: list[TranslationBlock]) -> str:
    """Retrouve le texte ORIGINAL (langue source) correspondant a un chunk
    d'analyse decoupe dans le texte francais traduit -- au niveau du BLOC
    de traduction (pas phrase par phrase : les blocs sont larges, voir
    ``_TRANSLATION_BLOCK_CHARS``, donc un chunk d'analyse tombe presque
    toujours entierement dans un seul bloc).

    Localise le chunk par recherche de sous-chaine (best-effort : premiere
    occurrence, approximatif si le meme texte apparait plusieurs fois,
    mais suffisant pour la tracabilite visee ici -- situer l'exigence dans
    la bonne section de la circulaire, pas une citation caractere pres) ;
    retourne le texte original du/des bloc(s) qui chevauchent sa position.
    Retourne ``chunk`` lui-meme si ``blocks`` est vide (rien a traduire,
    circulaire deja en francais) ou si la position n'a pas pu etre
    retrouvee."""
    if not blocks:
        return chunk
    start = full_french_text.find(chunk)
    if start == -1:
        # Chunk chevauchant (voir chunk_text overlap) : la recherche peut
        # echouer sur le fragment repete en tete, deja vu dans le chunk
        # precedent -- retente sur la seconde moitie, plus susceptible
        # d'etre unique dans le document.
        start = full_french_text.find(chunk[len(chunk) // 2 :])
        if start == -1:
            return chunk
    end = start + len(chunk)
    matching = [b.original for b in blocks if b.start < end and b.end > start]
    return "\n\n".join(matching) if matching else chunk


# ── Extraction reference/theme (une fois par circulaire, sur l'en-tete) ──

_EXTRACT_REF_SYSTEM_PROMPT = """\
Tu extrais des metadonnees d'une circulaire reglementaire bancaire depuis
son en-tete. Reponds uniquement en JSON strict conforme au schema demande."""

_EXTRACT_REF_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "reference": {"type": "string"},
        "theme": {"type": "string"},
    },
    "required": ["reference", "theme"],
    "additionalProperties": False,
}

# L'en-tete (reference, objet) est quasi toujours dans les tout premiers
# paragraphes -- inutile d'envoyer tout le document pour cette extraction.
_EXTRACT_REF_HEAD_CHARS = 2000


def extract_reference_theme(text: str) -> dict[str, str]:
    """Extrait automatiquement la reference courte (ex. "Circulaire BCT
    n°2024-09 du 5 fevrier 2026") et le theme de la circulaire depuis son
    texte -- appeler APRES une eventuelle traduction (le texte doit etre
    en francais, voir ``translate_document_to_french``), sur le texte
    complet ou juste son debut (seul l'en-tete est utilise ici).

    Permet a l'admin d'importer une circulaire sans devoir saisir
    manuellement sa reference/son theme : ils sont proposes automati-
    quement (voir ``app/services/regulatory.py``).

    Retourne ``{"reference": "", "theme": ""}`` si l'extraction echoue
    (LLM indisponible, reponse invalide) -- l'appelant affiche alors un
    repli (ex. le nom du fichier) plutot que de bloquer l'import."""
    head = text.strip()[:_EXTRACT_REF_HEAD_CHARS]
    if not head:
        return {"reference": "", "theme": ""}
    user_prompt = f"""Texte (debut de la circulaire) :
---
{head}
---

Extrait la reference courte du document (ex. "Circulaire BCT n°2024-09
du 5 fevrier 2026", ou un intitule court si aucune reference numerotee
n'est visible) et son theme en quelques mots.

Reponds en JSON avec exactement les cles "reference" et "theme"."""
    try:
        raw = call_regulatory_llm(_EXTRACT_REF_SYSTEM_PROMPT, user_prompt, _EXTRACT_REF_SCHEMA, max_output_tokens=300)
        parsed = json.loads(raw)
        reference = str(parsed.get("reference") or "").strip()
        theme = str(parsed.get("theme") or "").strip()
        if _contains_garbage_token(reference, theme):
            return {"reference": "", "theme": ""}
        return {"reference": reference, "theme": theme}
    except Exception:
        return {"reference": "", "theme": ""}


def build_retrieval_query(chunk: str, langue: str) -> str:
    """Construit le texte utilise pour chercher les candidats pertinents
    dans le referentiel (recherche par similarite d'embeddings, toujours
    en francais -- l'espace du catalogue).

    Ne traduit plus elle-meme (contrairement a une version anterieure) :
    un document arabe est desormais traduit UNE SEULE FOIS pour
    l'ensemble du document, AVANT le decoupage en chunks (voir
    ``translate_document_to_french``), plutot que chunk par chunk ici --
    ce qui ramene une circulaire arabe de N chunks de 2N appels LLM
    (traduction + analyse, par chunk) a 1 + N (une traduction, puis une
    analyse par chunk). Au moment ou cette fonction est appelee, ``chunk``
    est donc deja en francais quelle que soit la langue source, et
    ``langue`` vaut toujours "fr" en pratique -- le parametre est gardé
    pour la clarte de l'appelant plutot que retire."""
    return chunk


def _build_candidates_text(candidates: dict[str, list[dict[str, Any]]]) -> str:
    lines = ["QUESTIONS CANDIDATES (les plus proches de cet extrait) :"]
    for q in candidates.get("questions", []):
        lines.append(f"- {q['code']} [{q.get('dimension', '')}] {q['title']}")
    lines.append("")
    lines.append("RECOMMANDATIONS CANDIDATES (les plus proches de cet extrait) :")
    for r in candidates.get("recommandations", []):
        flag = "reglementaire" if r.get("regulatory_flag") else "standard"
        lines.append(
            f"- {r['code']} ({r.get('question_code', '')}, {r.get('category', '')}, {flag}) {r['title']}"
        )
    return "\n".join(lines)


def _build_user_prompt(chunk: str, langue: str, candidates_text: str) -> str:
    langue_label = "arabe" if langue == "ar" else "francais"
    return f"""{candidates_text}

---
Extrait de la circulaire (langue detectee : {langue_label}) :
---
{chunk}
---

Analyse cet extrait et liste les exigences concretes qu'il impose, chacune
avec son impact_kind et les champs associes (voir les regles du systeme).
Maximum 6 exigences pour cet extrait. Si aucune exigence exploitable n'y
figure, renvoie une liste vide.

Reponds en JSON avec exactement la cle "exigences" (liste d'objets)."""


def _similar(a: str, b: str) -> bool:
    return difflib.SequenceMatcher(None, a.lower().strip(), b.lower().strip()).ratio() >= _SIMILARITY_THRESHOLD


def _validate_and_normalize(
    raw_item: dict[str, Any],
    reco_codes: set[str],
    question_codes: set[str],
    existing_titles: list[str],
) -> Exigence | None:
    """Verifie et normalise une exigence brute renvoyee par le LLM.
    Retourne None si l'item est inexploitable (champs manquants, ou
    reference a un code absent des CANDIDATS retournes par la recherche --
    un code hors de cette liste est forcement invente ou hors-sujet, donc
    ecarte plutot que persiste a moitie faux)."""
    excerpt = str(raw_item.get("excerpt") or "").strip()
    requirement_text = str(raw_item.get("requirement_text") or "").strip()
    impact_kind = str(raw_item.get("impact_kind") or "").strip()
    if not excerpt or not requirement_text or impact_kind not in IMPACT_KINDS:
        return None
    entity_type, proposed_action = _split_impact_kind(impact_kind)

    if proposed_action in ("modifier", "desactiver", "activer_flag") and entity_type == "recommandation":
        reco_code = str(raw_item.get("reco_code") or "").strip()
        if reco_code not in reco_codes:
            return None
        proposed: dict[str, Any] = {"reco_code": reco_code}
        if proposed_action == "modifier":
            proposed["modification"] = str(raw_item.get("modification") or "").strip()
            if not proposed["modification"]:
                return None
        elif proposed_action == "desactiver":
            proposed["justification"] = str(raw_item.get("justification") or "").strip()
            if not proposed["justification"]:
                return None
        else:  # activer_flag
            proposed["reason"] = requirement_text
        return Exigence(excerpt, requirement_text, entity_type, proposed_action, proposed)

    if proposed_action in ("modifier", "desactiver") and entity_type == "question":
        question_code = str(raw_item.get("question_code") or "").strip()
        if question_code not in question_codes:
            return None
        proposed = {"question_code": question_code}
        field_name = "modification" if proposed_action == "modifier" else "justification"
        value = str(raw_item.get(field_name) or "").strip()
        if not value:
            return None
        proposed[field_name] = value
        return Exigence(excerpt, requirement_text, entity_type, proposed_action, proposed)

    if entity_type == "recommandation" and proposed_action == "ajouter":
        question_code = str(raw_item.get("question_code") or "").strip()
        if question_code not in question_codes:
            return None
        title = str(raw_item.get("title") or "").strip()
        text = str(raw_item.get("recommendation_text") or "").strip()
        if not title or not text:
            return None
        if any(_similar(title, t) for t in existing_titles):
            return None  # filet de securite anti-doublon, en plus de la consigne du prompt
        try:
            effort = int(raw_item.get("effort") or 2)
        except (TypeError, ValueError):
            effort = 2
        effort = min(max(effort, 1), 3)
        try:
            trigger_level = int(raw_item.get("trigger_level") or 1)
        except (TypeError, ValueError):
            trigger_level = 1
        trigger_level = min(max(trigger_level, 1), 4)
        return Exigence(
            excerpt,
            requirement_text,
            entity_type,
            proposed_action,
            {
                "question_code": question_code,
                "title": title,
                "recommendation_text": text,
                "category": str(raw_item.get("category") or "Conformité").strip(),
                "regulatory_flag": True,
                "effort": effort,
                "trigger_level": trigger_level,
            },
        )

    if entity_type == "question" and proposed_action == "ajouter":
        title = str(raw_item.get("title") or "").strip()
        if not title:
            return None
        levels = [str(lbl).strip() for lbl in (raw_item.get("level_labels") or []) if str(lbl).strip()]
        levels = levels[:_DEFAULT_LEVEL_LABELS]
        return Exigence(
            excerpt,
            requirement_text,
            entity_type,
            proposed_action,
            {
                "title": title,
                "level_labels": levels,
                "dimension_hint": str(raw_item.get("dimension_hint") or "").strip(),
            },
        )

    return None


def _target_code(exigence: Exigence) -> str | None:
    """Le code (reco_code ou question_code) que cette exigence cible, si
    applicable -- None pour "ajouter" (rien a cibler, c'est justement une
    proposition de nouvel element)."""
    return exigence.proposed.get("reco_code") or exigence.proposed.get("question_code")


def _is_duplicate(a: Exigence, b: Exigence) -> bool:
    """Deux exigences sont considerees comme des doublons si :
    - leur requirement_text se ressemble fortement (comme avant) ; OU
    - elles ciblent le MEME element (meme reco_code/question_code), avec
      le meme type d'action, et leurs extraits se recoupent au moins
      moderement -- capture le cas ou le LLM reformule legerement une
      exigence d'un chunk a l'autre (chevauchement de chunks, voir
      chunk_text) sans que la ressemblance de requirement_text seule
      suffise a depasser le seuil strict. Le seuil sur l'extrait est
      volontairement plus bas (0.5 vs. _SIMILARITY_THRESHOLD) car le
      MEME element cible + la MEME action sont deja un signal fort a eux
      seuls ; il ne sert qu'a eviter de fusionner deux exigences bien
      distinctes qui viseraient coincidemment le meme element."""
    if _similar(a.requirement_text, b.requirement_text):
        return True
    a_target, b_target = _target_code(a), _target_code(b)
    if (
        a_target
        and a_target == b_target
        and a.entity_type == b.entity_type
        and a.proposed_action == b.proposed_action
        and difflib.SequenceMatcher(None, a.excerpt.lower(), b.excerpt.lower()).ratio() >= 0.5
    ):
        return True
    return False


def _dedupe(exigences: list[Exigence]) -> list[Exigence]:
    """Deduplique sur le CONTENU (requirement_text) et/ou l'ELEMENT CIBLE
    (reco_code/question_code) -- jamais sur un identifiant -- voir
    ``_is_duplicate``. Important depuis l'introduction du chevauchement
    entre chunks (``chunk_text``, ``CHUNK_OVERLAP``) : une meme exigence
    situee pres d'une frontiere de chunk peut etre vue -- et proposee --
    par l'analyse de deux chunks consecutifs."""
    kept: list[Exigence] = []
    for item in exigences:
        if not any(_is_duplicate(item, k) for k in kept):
            kept.append(item)
    return kept


def analyze_chunk_with_candidates(
    chunk: str,
    langue: str,
    candidates: dict[str, list[dict[str, Any]]],
) -> list[dict[str, Any]]:
    """Analyse un seul extrait (chunk) de circulaire, ancre sur les
    candidats deja recuperes par similarite (voir
    ``app.services.regulatory_index.retrieve``) -- pas tout le referentiel.

    Ne leve jamais : un extrait illisible pour le LLM, une reponse JSON
    invalide, ou un timeout renvoient simplement une liste vide.

    Retourne une liste de dicts prets a agreger :
    ``{"excerpt", "requirement_text", "entity_type", "proposed_action",
    "proposed"}``.
    """
    reco_codes = {r["code"] for r in candidates.get("recommandations", [])}
    question_codes = {q["code"] for q in candidates.get("questions", [])}
    existing_titles = [r["title"] for r in candidates.get("recommandations", [])]

    candidates_text = _build_candidates_text(candidates)
    user_prompt = _build_user_prompt(chunk, langue, candidates_text)

    try:
        raw = call_regulatory_llm(
            _SYSTEM_PROMPT,
            user_prompt,
            _JSON_SCHEMA,
            max_output_tokens=_CHUNK_MAX_OUTPUT_TOKENS,
        )
        parsed = json.loads(raw)
    except Exception:
        return []

    items: list[Exigence] = []
    for raw_item in parsed.get("exigences", []):
        if _contains_garbage_token(
            str(raw_item.get("requirement_text") or ""), str(raw_item.get("title") or "")
        ):
            continue
        normalized = _validate_and_normalize(raw_item, reco_codes, question_codes, existing_titles)
        if normalized is not None:
            items.append(normalized)

    return [
        {
            "excerpt": e.excerpt,
            "requirement_text": e.requirement_text,
            "entity_type": e.entity_type,
            "proposed_action": e.proposed_action,
            "proposed": e.proposed,
        }
        for e in _dedupe(items)
    ]
