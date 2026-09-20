from fastapi import APIRouter, HTTPException

from app.core.config import settings
from app.schemas.classification import ClassificationRequest, ClassificationResponse
from app.services.email_classifier import EmailClassifier, ModelUnavailableError

router = APIRouter(prefix="/classification", tags=["classification"])
classifier = EmailClassifier(settings.model_dir, settings.model_device)


@router.post("", response_model=ClassificationResponse)
def classify_email(request: ClassificationRequest) -> ClassificationResponse:
    try:
        return classifier.predict(request.subject, request.body)
    except ModelUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
