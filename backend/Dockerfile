# DataPilot API (FastAPI). Built and pushed to GHCR by
# .github/workflows/docker-publish.yml.
FROM python:3.12-slim

# Native libraries the app loads at runtime (pip doesn't ship them):
#  - tesseract-ocr + fra/ara packs: OCR fallback for scanned BCT circulars
#    (llm/pdf_extract.py). TESSDATA_DIR is left unset, so Tesseract uses the
#    distro's own tessdata directory where these packs land.
#  - pango/harfbuzz + fonts: WeasyPrint PDF reports (app/services/pdf.py)
#  - libgomp1: OpenMP runtime LightGBM links against (app/services/ranking.py)
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        tesseract-ocr tesseract-ocr-fra tesseract-ocr-ara \
        libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz-subset0 \
        fonts-dejavu-core fonts-liberation \
        libgomp1 \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY requirements.txt .
# pip itself first: the copy bundled with the base image has known CVEs.
RUN pip install --upgrade pip \
    && pip install -r requirements.txt

COPY . .

# Non-root; it only needs to write uploaded bank logos (app/static/logos;
# mount a volume there to keep them across container re-creation).
RUN useradd --create-home --uid 10001 app \
    && mkdir -p app/static/logos \
    && chown -R app:app app/static
USER app

EXPOSE 8000

ENTRYPOINT ["sh", "/app/docker-entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
