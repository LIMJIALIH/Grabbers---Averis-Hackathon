from fastapi import APIRouter, HTTPException

from app.schemas.classification import ClassificationRequest, ClassificationResponse
from app.services.email_classifier import ModelUnavailableError
from app.services.model_registry import get_email_classifier

router = APIRouter(prefix="/classification", tags=["classification"])


@router.post("", response_model=ClassificationResponse)
def classify_email(request: ClassificationRequest) -> ClassificationResponse:
    try:
        return get_email_classifier().predict(request.subject, request.body)
    except ModelUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
