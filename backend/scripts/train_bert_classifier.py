"""Train and export the local email BERT classifier used by Stage 3.

Run from ``backend``:
    .\\.venv\\Scripts\\python.exe -m scripts.train_bert_classifier

The script consumes the reproducible labelled data built by data_prep and writes
Hugging Face-compatible artifacts to the path configured by DOCUVERIFY_MODEL_DIR.
"""

from __future__ import annotations

import csv
import random
from dataclasses import dataclass
from pathlib import Path

import torch
from torch.optim import AdamW
from torch.utils.data import DataLoader, Dataset
from transformers import AutoModelForSequenceClassification, AutoTokenizer

from app.core.config import settings


LABELS = ["BL_COMPARISON", "SI_REQUEST", "INVOICE_QUERY", "GENERAL", "SPAM"]
LABEL_TO_ID = {label: index for index, label in enumerate(LABELS)}
DATA_DIR = Path(__file__).resolve().parents[1] / "data_prep" / "out"
MODEL_NAME = "bert-base-uncased"
MAX_LENGTH = 256
EPOCHS = 5
BATCH_SIZE = 8
LEARNING_RATE = 2e-5
SEED = 42


@dataclass(frozen=True)
class Example:
    text: str
    label: int


class EmailDataset(Dataset):
    def __init__(self, examples: list[Example], tokenizer):
        self.examples = examples
        self.tokenizer = tokenizer

    def __len__(self) -> int:
        return len(self.examples)

    def __getitem__(self, index: int):
        item = self.tokenizer(
            self.examples[index].text,
            truncation=True,
            max_length=MAX_LENGTH,
            padding="max_length",
            return_tensors="pt",
        )
        return {
            **{key: value.squeeze(0) for key, value in item.items()},
            "labels": torch.tensor(self.examples[index].label, dtype=torch.long),
        }


def load_examples(path: Path) -> list[Example]:
    with path.open(encoding="utf-8", newline="") as stream:
        rows = list(csv.DictReader(stream))
    examples = [
        Example(row["bert_text"].strip(), LABEL_TO_ID[row["category"]])
        for row in rows
        if row.get("bert_text", "").strip() and row.get("category") in LABEL_TO_ID
    ]
    if not examples:
        raise RuntimeError(f"No labelled examples found in {path}")
    return examples


def accuracy(model, loader, device: str) -> float:
    correct = total = 0
    model.eval()
    with torch.inference_mode():
        for batch in loader:
            labels = batch.pop("labels").to(device)
            batch = {name: tensor.to(device) for name, tensor in batch.items()}
            predictions = model(**batch).logits.argmax(dim=-1)
            correct += int((predictions == labels).sum())
            total += len(labels)
    return correct / total


def main() -> None:
    random.seed(SEED)
    torch.manual_seed(SEED)
    train_examples = load_examples(DATA_DIR / "train.csv")
    test_examples = load_examples(DATA_DIR / "test.csv")
    device = "cuda" if torch.cuda.is_available() and settings.model_device != "cpu" else "cpu"
    if settings.model_device == "cuda" and device != "cuda":
        raise RuntimeError("DOCUVERIFY_MODEL_DEVICE=cuda but CUDA is unavailable")

    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    model = AutoModelForSequenceClassification.from_pretrained(
        MODEL_NAME,
        num_labels=len(LABELS),
        label2id=LABEL_TO_ID,
        id2label={index: label for label, index in LABEL_TO_ID.items()},
    ).to(device)
    train_loader = DataLoader(EmailDataset(train_examples, tokenizer), batch_size=BATCH_SIZE, shuffle=True)
    test_loader = DataLoader(EmailDataset(test_examples, tokenizer), batch_size=BATCH_SIZE)
    optimizer = AdamW(model.parameters(), lr=LEARNING_RATE)

    print(f"Training {len(train_examples)} examples on {device}; evaluating {len(test_examples)} examples.")
    for epoch in range(1, EPOCHS + 1):
        model.train()
        for batch in train_loader:
            labels = batch.pop("labels").to(device)
            batch = {name: tensor.to(device) for name, tensor in batch.items()}
            loss = model(**batch, labels=labels).loss
            loss.backward()
            optimizer.step()
            optimizer.zero_grad()
        print(f"epoch={epoch} test_accuracy={accuracy(model, test_loader, device):.3f}")

    settings.model_dir.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(settings.model_dir)
    tokenizer.save_pretrained(settings.model_dir)
    print(f"Exported model to {settings.model_dir}")


if __name__ == "__main__":
    main()
