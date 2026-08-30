import logging

from fastapi import FastAPI

from app.core.cors import setup_cors

# Sans ceci, les logs de niveau INFO (ex. "[Veille reglementaire] USING
# GEMINI"/"USING LOCAL LLM" -- voir llm/generation.py) n'atteignent JAMAIS
# le terminal : le logger racine Python vaut WARNING par defaut et
# n'a aucun handler tant que rien ne le configure explicitement --
# uvicorn configure ses PROPRES loggers ("uvicorn", "uvicorn.access") mais
# jamais le logger racine ni les loggers applicatifs (``logging.getLogger
# (__name__)`` un peu partout dans ce backend). basicConfig() ne fait rien
# si le logger racine a deja un handler (peu importe donc que uvicorn se
# configure avant ou apres cet import).
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
from app.routers import (
    admin,
    admin_banks,
    admin_users,
    assessments,
    config,
    notifications,
    profile,
    recommendations,
    regulatory,
    reports,
    versions,
)

app = FastAPI(
    title="DataPilot API",
    description="Backend de l'application DataPilot",
    version="1.0.0",
)

setup_cors(app)

app.include_router(config.router)
app.include_router(admin.router)
app.include_router(assessments.router)
app.include_router(recommendations.router)
app.include_router(reports.router)
app.include_router(regulatory.router)
app.include_router(admin_users.router)
app.include_router(admin_banks.router)
app.include_router(profile.router)
app.include_router(notifications.router)
app.include_router(versions.router)


@app.get("/")
def read_root():
    return {"status": "online", "message": "Bienvenue sur l'API DataPilot"}
