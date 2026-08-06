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


# ── Extraction des metadonnees (une fois par circulaire, sur l'en-tete) ──

_EXTRACT_REF_SYSTEM_PROMPT = """\
Tu extrais des metadonnees d'une circulaire reglementaire bancaire depuis
son en-tete. Tu n'inventes JAMAIS une valeur absente du texte : si un champ
n'est pas identifiable, renvoie une chaine vide pour ce champ plutot que de
deviner. Reponds uniquement en JSON strict conforme au schema demande."""

_EXTRACT_REF_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "reference": {"type": "string"},
        "theme": {"type": "string"},
        "institution": {"type": "string"},
        "publication_date": {"type": "string"},
    },
    "required": ["reference", "theme", "institution", "publication_date"],
    "additionalProperties": False,
}

# L'en-tete (institution, reference, date, objet) est quasi toujours dans
# les tout premiers paragraphes -- inutile d'envoyer tout le document pour
# cette extraction.
_EXTRACT_REF_HEAD_CHARS = 2000


def extract_document_metadata(text: str) -> dict[str, str]:
    """Extrait automatiquement, depuis l'en-tete de la circulaire :
    - ``reference`` : ex. "Circulaire BCT n°2024-09", SANS la date (voir
      ``publication_date`` ci-dessous, extraite separement) ;
    - ``theme`` : l'objet, en quelques mots ;
    - ``institution`` : l'autorite emettrice, ex. "Banque Centrale de
      Tunisie" ;
    - ``publication_date`` : la date de la circulaire TELLE QU'ECRITE dans
      le document (pas la date d'import), au format ISO ``AAAA-MM-JJ`` si
      elle est determinable, chaine vide sinon.

    Appeler APRES une eventuelle traduction (le texte doit etre en
    francais, voir ``translate_document_to_french``), sur le texte complet
    ou juste son debut (seul l'en-tete est utilise ici).

    Permet a l'admin d'importer une circulaire sans devoir saisir
    manuellement ces informations : elles sont proposees automatiquement
    (voir ``app/services/regulatory.py``) -- important en contexte
    bancaire, ou la date/reference reelles du texte reglementaire priment
    sur la date a laquelle l'outil interne l'a recu.

    Retourne un dict avec les 4 cles ci-dessus, toutes vides, si
    l'extraction echoue (LLM indisponible, reponse invalide) -- l'appelant
    garde alors ses valeurs de repli (ex. le nom du fichier, la date
    d'import) plutot que de bloquer l'import."""
    empty = {"reference": "", "theme": "", "institution": "", "publication_date": ""}
    head = text.strip()[:_EXTRACT_REF_HEAD_CHARS]
    if not head:
        return empty
    user_prompt = f"""Texte (debut de la circulaire) :
---
{head}
---

Extrait :
- la reference courte du document, SANS la date -- elle est extraite
  separement ci-dessous (ex. "Circulaire BCT n°2024-09", ou un intitule
  court si aucune reference numerotee n'est visible) ;
- son theme (l'objet) en quelques mots ;
- l'institution emettrice (ex. "Banque Centrale de Tunisie") ;
- sa date de publication telle qu'ecrite dans le texte, au format ISO
  AAAA-MM-JJ (chaine vide si non determinable -- n'invente jamais une
  date absente du texte).

Reponds en JSON avec exactement les cles "reference", "theme",
"institution", "publication_date"."""
    try:
        raw = call_regulatory_llm(_EXTRACT_REF_SYSTEM_PROMPT, user_prompt, _EXTRACT_REF_SCHEMA, max_output_tokens=300)
        parsed = json.loads(raw)
        result = {
            "reference": str(parsed.get("reference") or "").strip(),
            "theme": str(parsed.get("theme") or "").strip(),
            "institution": str(parsed.get("institution") or "").strip(),
            "publication_date": str(parsed.get("publication_date") or "").strip(),
        }
        if _contains_garbage_token(*result.values()):
            return empty
        return result
    except Exception:
        return empty


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


# ── Recommandations par palier (une question:ajouter, une fois analysee) ──

_PALIER_TRANSITIONS = ((1, 2), (2, 3), (3, 4), (4, 5))

_PALIER_RECOMMENDATIONS_SYSTEM_PROMPT = """\
Tu es un assistant qui redige des recommandations d'amelioration pour un
referentiel d'evaluation de maturite data bancaire. Pour UNE question de
maturite (nouvellement proposee), tu dois rediger UNE recommandation par
palier de progression (niveau N vers niveau N+1, pour N de 1 a 4) : l'action
concrete qu'une banque situee au niveau N sur cette question doit mener
pour atteindre le niveau N+1.

Chaque recommandation :
- traduit l'ecart entre le niveau N et le niveau N+1 (fournis ci-dessous)
  en une action CONCRETE que la banque doit mener, jamais un simple
  constat de l'ecart ;
- reste GENERIQUE (applicable a n'importe quelle banque) : tu n'as pas le
  contexte d'un etablissement precis, tu ne dois JAMAIS en inventer un ;
- titre de 8 mots maximum, texte de 2 phrases maximum ;
- categorie parmi : strategie, gouvernance, qualite, architecture,
  securite, competences ;
- effort estime de 1 (faible) a 3 (eleve).

Reponds uniquement en JSON strict conforme au schema demande."""

_PALIER_RECOMMENDATIONS_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "recommandations": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "trigger_level": {"type": "integer", "enum": [1, 2, 3, 4]},
                    "title": {"type": "string"},
                    "recommendation_text": {"type": "string"},
                    "category": {"type": "string"},
                    "effort": {"type": "integer"},
                },
                "required": ["trigger_level", "title", "recommendation_text", "category", "effort"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["recommandations"],
    "additionalProperties": False,
}


def _placeholder_associated_recommendations() -> list[dict[str, Any]]:
    """Ebauches generiques (is_placeholder=True, texte vide) -- repli
    utilise si la generation LLM (ci-dessous) echoue entierement ou pour
    les paliers qu'elle n'a pas reussi a produire correctement. Jamais
    publiees telles quelles ; l'admin les complete pendant la revue."""
    return [
        {
            "trigger_level": trigger,
            "title": f"Recommandation à définir (niveau {trigger} → {target})",
            "recommendation_text": "",
            "category": "Conformité",
            "effort": 2,
            "is_placeholder": True,
        }
        for trigger, target in _PALIER_TRANSITIONS
    ]


def generate_palier_recommendations(
    question_title: str, dimension: str, level_labels: list[str]
) -> list[dict[str, Any]]:
    """Fait rediger par le LLM une recommandation par palier de progression
    (1->2, 2->3, 3->4, 4->5) pour une question de maturite NOUVELLEMENT
    PROPOSEE -- meme mecanisme (meme fournisseur Gemini/local, memes
    champs title/recommendation_text/category/effort) que la generation
    d'une recommandation "ajouter" autonome, applique ici aux 4 transitions
    d'un coup (un seul appel LLM, pas quatre).

    Historique : ces 4 paliers etaient auparavant de pures ebauches
    generiques ("Recommandation a definir...", texte vide) que l'admin
    devait integralement rediger -- un modele local etait juge peu fiable
    sur une structure a 4 elements imbriques (voir Task 7). Le repli
    Gemini-first (voir ``call_regulatory_llm``) et la validation stricte
    ci-dessous (chaque palier est ecarte individuellement s'il echoue,
    plutot que de rejeter tout le lot) rendent maintenant cette generation
    fiable.

    Retourne TOUJOURS exactement 4 elements (trigger_level 1 a 4) : tout
    palier que le LLM n'a pas produit -- ou dont la reponse est invalide
    (champ vide, jeton de remplissage type "None"/"null") -- retombe sur
    l'ebauche generique correspondante (``is_placeholder: True``) plutot
    que d'etre omis. Repli total sur les 4 ebauches si l'appel echoue
    entierement, si ``question_title`` est vide, ou si la reponse est
    inexploitable -- jamais bloquant."""
    fallback = _placeholder_associated_recommendations()
    if not question_title.strip():
        return fallback

    labels_text = "\n".join(f"Niveau {i + 1} : {lbl}" for i, lbl in enumerate(level_labels[:5]))
    user_prompt = f"""Question de maturite proposee : {question_title}
Dimension : {dimension or "non precisee"}

Echelle de maturite de cette question (du niveau le plus faible au plus fort) :
{labels_text}

Redige les 4 recommandations de progression (niveau 1->2, 2->3, 3->4,
4->5) pour cette question. Reponds en JSON avec exactement la cle
"recommandations" (liste de 4 objets, un par transition)."""

    try:
        raw = call_regulatory_llm(
            _PALIER_RECOMMENDATIONS_SYSTEM_PROMPT,
            user_prompt,
            _PALIER_RECOMMENDATIONS_SCHEMA,
            max_output_tokens=1200,
        )
        parsed = json.loads(raw)
        by_level: dict[int, dict[str, Any]] = {}
        for item in parsed.get("recommandations", []):
            level = item.get("trigger_level")
            title = str(item.get("title") or "").strip()
            text = str(item.get("recommendation_text") or "").strip()
            if level not in (1, 2, 3, 4) or not title or not text:
                continue
            if _contains_garbage_token(title, text):
                continue
            effort = item.get("effort")
            by_level[level] = {
                "trigger_level": level,
                "title": title,
                "recommendation_text": text,
                "category": str(item.get("category") or "Conformité").strip(),
                "effort": effort if isinstance(effort, int) and 1 <= effort <= 3 else 2,
                "is_placeholder": False,
            }
        if not by_level:
            return fallback
        # Complete les paliers manquants/invalides avec l'ebauche
        # generique correspondante plutot que de retourner un lot partiel.
        return [by_level.get(f["trigger_level"], f) for f in fallback]
    except Exception:
        return fallback


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
