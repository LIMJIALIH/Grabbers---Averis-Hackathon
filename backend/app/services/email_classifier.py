"""Lazy, local inference for the fine-tuned email classifier."""

from pathlib import Path
from threading import Lock

from app.schemas.classification import ClassificationResponse


class ModelUnavailableError(RuntimeError):
    """Raised when the local classifier cannot be loaded."""


class EmailClassifier:
    """Load the model once, then reuse it for thread-safe inference."""

    def __init__(self, model_dir: Path, requested_device: str = "auto"):
        self.model_dir = model_dir
        self.requested_device = requested_device.casefold()
        self._load_lock = Lock()
        self._inference_lock = Lock()
        self._model = None
        self._tokenizer = None
        self._torch = None
        self._device = "not-loaded"

    @property
    def device(self) -> str:
        return self._device

    def _load(self) -> None:
        if self._model is not None:
            return
        with self._load_lock:
            if self._model is not None:
                return
            if not (self.model_dir / "config.json").is_file():
                raise ModelUnavailableError(f"Classifier not found at {self.model_dir}")
            try:
                import torch
                from transformers import AutoModelForSequenceClassification, AutoTokenizer

                if self.requested_device not in {"auto", "cpu", "cuda"}:
                    raise ModelUnavailableError(
                        "DOCUVERIFY_MODEL_DEVICE must be one of: auto, cpu, cuda"
                    )
                if self.requested_device == "cuda" and not torch.cuda.is_available():
                    raise ModelUnavailableError("CUDA was requested but is not available to PyTorch")

                device = "cuda" if (
                    self.requested_device == "cuda"
                    or self.requested_device == "auto" and torch.cuda.is_available()
                ) else "cpu"
                tokenizer = AutoTokenizer.from_pretrained(
                    self.model_dir, local_files_only=True
                )
                model = AutoModelForSequenceClassification.from_pretrained(
                    self.model_dir, local_files_only=True
                )
                model.to(device)
                model.eval()
            except ModelUnavailableError:
                raise
            except (ImportError, OSError, RuntimeError, ValueError) as exc:
                raise ModelUnavailableError(f"Could not load local classifier: {exc}") from exc

            self._torch = torch
            self._tokenizer = tokenizer
            self._model = model
            self._device = device

    def predict(self, subject: str, body: str) -> ClassificationResponse:
        self._load()
        text = f"{subject.strip()}\n{body.strip()}".strip()
        if not text:
            raise ValueError("subject or body must contain text")

        with self._inference_lock, self._torch.inference_mode():
            inputs = self._tokenizer(
                text,
                return_tensors="pt",
                truncation=True,
                max_length=512,
            )
            inputs = {name: tensor.to(self._device) for name, tensor in inputs.items()}
            logits = self._model(**inputs).logits[0]
            probabilities = self._torch.softmax(logits, dim=-1).detach().cpu().tolist()

        labels = {
            int(index): label for index, label in self._model.config.id2label.items()
        }
        scores = {labels[index]: float(score) for index, score in enumerate(probabilities)}
        best_index = max(range(len(probabilities)), key=probabilities.__getitem__)
        return ClassificationResponse(
            category=labels[best_index],
            confidence=float(probabilities[best_index]),
            scores=scores,
            device=self._device,
        )
