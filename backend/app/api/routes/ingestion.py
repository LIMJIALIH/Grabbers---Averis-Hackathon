from fastapi import APIRouter

from app.core.config import settings
from app.schemas.ingestion import ClassifiedEmail
from app.schemas.verification import VerificationResult
from app.services.verification import process_email

router = APIRouter(prefix="/ingestion", tags=["stage4"])


@router.post("", response_model=VerificationResult)
def ingest_attachments(email: ClassifiedEmail) -> VerificationResult:
    return process_email(email, settings.bundle_dir / "attachments")
