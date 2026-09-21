from fastapi import APIRouter

from app.api.routes.health import router as health_router
from app.api.routes.cases import router as cases_router
from app.api.routes.classification import router as classification_router
from app.api.routes.ingestion import router as ingestion_router
from app.api.routes.google import router as google_router

api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(cases_router)
api_router.include_router(classification_router)
api_router.include_router(ingestion_router)
api_router.include_router(google_router)
