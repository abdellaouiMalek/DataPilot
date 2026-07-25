from fastapi import FastAPI

from app.core.cors import setup_cors
from app.routers import admin, admin_users, assessments, config, recommendations

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
app.include_router(admin_users.router)


@app.get("/")
def read_root():
    return {"status": "online", "message": "Bienvenue sur l'API DataPilot"}
