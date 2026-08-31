from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.core.cors import setup_cors
from app.core.keycloak_admin import close_client
from app.routers import (
    admin,
    admin_banks,
    admin_dashboard,
    admin_framework,
    admin_logs,
    admin_profile,
    admin_scoring,
    admin_settings,
    admin_topbar,
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

@asynccontextmanager
async def lifespan(_app: FastAPI):
    yield
    # Release the shared Keycloak HTTP client and its connection pool.
    await close_client()


app = FastAPI(
    title="DataPilot API",
    description="Backend de l'application DataPilot",
    version="1.0.0",
    lifespan=lifespan,
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
app.include_router(admin_scoring.router)
app.include_router(admin_framework.router)
app.include_router(admin_logs.router)
app.include_router(admin_dashboard.router)
app.include_router(admin_topbar.router)
app.include_router(admin_profile.router)
app.include_router(admin_settings.router)
app.include_router(profile.router)
app.include_router(notifications.router)
app.include_router(versions.router)


@app.get("/")
def read_root():
    return {"status": "online", "message": "Bienvenue sur l'API DataPilot"}
