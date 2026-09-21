import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import settings


class PrivateAccessFilter(logging.Filter):
    def filter(self, record):
        # Uvicorn includes callback authorization codes in its request URL.
        return "/api/v1/auth/" not in record.getMessage() and "/api/v1/gmail/" not in record.getMessage()


logging.getLogger("uvicorn.access").addFilter(PrivateAccessFilter())


def create_app() -> FastAPI:
    application = FastAPI(title="DocuVerify API", version="0.1.0")
    @application.middleware("http")
    async def private_response_headers(request, call_next):
        response = await call_next(request)
        if request.url.path.startswith(("/api/v1/auth/", "/api/v1/gmail/")):
            response.headers["Cache-Control"] = "no-store"
            response.headers["Referrer-Policy"] = "no-referrer"
        return response
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH"],
        allow_headers=["Content-Type", "Authorization"],
    )
    application.include_router(api_router, prefix="/api/v1")
    return application


app = create_app()
