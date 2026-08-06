"""Extraction de texte a partir d'un PDF de circulaire reglementaire.

Deux cas geres :
- PDF texte (le cas courant) : extraction directe via PyMuPDF (``fitz``),
  rapide et fiable, aucun appel externe.
- PDF scanne / image : la couche texte est absente ou quasi vide, donc on
  bascule sur de l'OCR (Tesseract) page par page, avec les packs de
  langue francais + arabe charges ensemble -- Tesseract detecte lui-meme
  quel alphabet utiliser localement dans la page. Le moteur LSTM de
  Tesseract restitue le texte arabe deja dans l'ordre logique de lecture
  (droite-a-gauche gere en interne), donc aucun retraitement bidi n'est
  necessaire cote Python.

Aucune donnee ne quitte la machine : PyMuPDF et Tesseract tournent tous
deux entierement en local.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

import fitz  # PyMuPDF
import pytesseract
from langdetect import DetectorFactory, LangDetectException, detect
from PIL import Image

# langdetect's detection is non-deterministic across runs unless seeded --
# pin it so the same document always reports the same language.
DetectorFactory.seed = 0

# En-dessous de ce nombre moyen de caracteres de texte natif par page, le
# PDF est considere comme scanne (pas de couche texte exploitable) et on
# bascule sur l'OCR plutot que de retourner un texte quasi vide.
_NATIVE_TEXT_CHARS_PER_PAGE_THRESHOLD = 20

# Les deux langues attendues pour les circulaires (BCT : francais, parfois
# arabe) sont toujours chargees ensemble pour l'OCR -- Tesseract choisit
# localement le bon alphabet par zone de texte, donc pas besoin de deviner
# la langue avant l'OCR.
_OCR_LANGS = "fra+ara"

# Repertoire des packs de langue Tesseract. Le pack "ara" (et parfois
# "fra") n'est pas fourni avec l'installeur Windows par defaut, et
# l'installer dans le repertoire standard (Program Files) demande les
# droits admin -- voir SETUP.local.md pour comment le peupler dans un
# repertoire accessible en ecriture sans elevation.
TESSDATA_DIR = os.getenv(
    "TESSDATA_DIR", r"C:\Users\USER\AppData\Local\tessdata"
)

# Rendu des pages en image pour l'OCR : plus le DPI est eleve, meilleure
# est la reconnaissance, mais plus l'OCR est lent -- 200 DPI est un bon
# compromis pour du texte imprime standard.
_OCR_RENDER_DPI = 200


@dataclass(frozen=True)
class ExtractionResult:
    """Resultat de l'extraction : texte exploitable + langue detectee."""

    text: str
    language: str  # "fr" | "ar" | "unknown"
    used_ocr: bool


def _ensure_tessdata_prefix() -> None:
    """Points Tesseract at TESSDATA_DIR via the TESSDATA_PREFIX env var.

    Deliberately not passed as a ``--tessdata-dir "<path>"`` config string:
    pytesseract splits that string on whitespace (not shell-aware), so a
    quoted path comes out with the literal quote characters still attached
    and fails to resolve. An env var has no such quoting problem."""
    if TESSDATA_DIR and os.path.isdir(TESSDATA_DIR):
        os.environ["TESSDATA_PREFIX"] = TESSDATA_DIR


def _extract_native_text(doc: fitz.Document) -> str:
    """Texte natif (couche texte du PDF), page par page."""
    return "\n\n".join(page.get_text() or "" for page in doc)


def _ocr_document(doc: fitz.Document) -> str:
    """OCR page par page via Tesseract (francais + arabe), sur un rendu
    image de chaque page -- pas de dependance a Poppler/pdf2image, PyMuPDF
    rend directement les pages en pixmap."""
    _ensure_tessdata_prefix()
    zoom = _OCR_RENDER_DPI / 72  # PyMuPDF's default render DPI is 72
    matrix = fitz.Matrix(zoom, zoom)

    pages_text = []
    for page in doc:
        pixmap = page.get_pixmap(matrix=matrix)
        image = Image.frombytes(
            "RGB", (pixmap.width, pixmap.height), pixmap.samples
        )
        pages_text.append(
            pytesseract.image_to_string(image, lang=_OCR_LANGS, config="--psm 3")
        )
    return "\n\n".join(pages_text)


def detect_language(text: str) -> str:
    """Detecte francais/arabe a partir du texte. Retourne "fr", "ar", ou
    "unknown" si le texte est trop court ou ambigu pour etre tranche."""
    sample = text.strip()[:2000]
    if not sample:
        return "unknown"
    try:
        code = detect(sample)
    except LangDetectException:
        return "unknown"
    if code == "fr":
        return "fr"
    if code == "ar":
        return "ar"
    return "unknown"


def extract_text(pdf_bytes: bytes) -> ExtractionResult:
    """Extrait le texte exploitable d'un PDF de circulaire et detecte sa
    langue (francais ou arabe).

    Essaie d'abord l'extraction native (rapide, PDF avec couche texte) ;
    si elle ne renvoie presque rien (PDF scanne / image), bascule
    automatiquement sur l'OCR Tesseract (packs francais + arabe).
    """
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        native_text = _extract_native_text(doc)
        threshold = _NATIVE_TEXT_CHARS_PER_PAGE_THRESHOLD * max(doc.page_count, 1)

        if len(native_text.strip()) >= threshold:
            text, used_ocr = native_text, False
        else:
            text, used_ocr = _ocr_document(doc), True
    finally:
        doc.close()

    language = detect_language(text)
    return ExtractionResult(text=text, language=language, used_ocr=used_ocr)


# Taille de decoupage par defaut pour l'analyse LLM, et chevauchement entre
# deux chunks consecutifs -- configurables via l'environnement (voir
# regulatory_analysis.py pour le decoupage de traduction, plus grand, qui
# reutilise cette meme fonction avec overlap=0).
CHUNK_SIZE = int(os.getenv("REG_CHUNK_SIZE", "4000"))
CHUNK_OVERLAP = int(os.getenv("REG_CHUNK_OVERLAP", "200"))


def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Decoupe un texte long en sections pour l'analyse LLM, en coupant de
    preference sur des sauts de paragraphe pour ne pas trancher une
    exigence en plein milieu. Limite le contexte envoye a chaque appel
    LLM plutot que de tout envoyer d'un coup.

    ``overlap`` (en caracteres) fait chevaucher chaque chunk avec le
    precedent : la fin du chunk N est repetee au debut du chunk N+1, pour
    qu'une exigence coupee pile a la frontiere entre deux chunks apparaisse
    quand meme en entier dans au moins l'un des deux, plutot que d'etre
    perdue. Consequence assumee : la meme exigence peut alors ressortir de
    l'analyse de deux chunks -- voir la deduplication renforcee dans
    ``llm/regulatory_analysis.py`` (``_dedupe``), qui merge ces doublons
    sur le contenu (et l'element cible), pas sur un identifiant."""
    text = text.strip()
    if len(text) <= chunk_size:
        return [text] if text else []

    paragraphs = text.split("\n\n")
    chunks: list[str] = []
    current = ""
    for para in paragraphs:
        candidate = f"{current}\n\n{para}" if current else para
        if len(candidate) > chunk_size and current:
            chunks.append(current)
            current = para
        else:
            current = candidate
        # A single paragraph longer than chunk_size on its own: hard-split
        # it rather than send an oversized chunk to the LLM.
        while len(current) > chunk_size:
            chunks.append(current[:chunk_size])
            current = current[chunk_size:]
    if current:
        chunks.append(current)

    if overlap > 0 and len(chunks) > 1:
        overlapped = [chunks[0]]
        for i in range(1, len(chunks)):
            prev_tail = chunks[i - 1][-overlap:]
            overlapped.append(prev_tail + chunks[i])
        chunks = overlapped

    return chunks
