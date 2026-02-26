"""
GrievancePortal — AI Image Classification Model
================================================
FastAPI server that accepts a complaint image and returns the predicted
municipal issue category.

Architecture
------------
• Base model : MobileNetV3-Small (pretrained on ImageNet, ~3 MB)
• Fine-tuning : Replace classifier head with 10-class softmax
• Training    : run  python train.py  (see train.py)
• Inference   : POST /classify  { multipart: image }

Supported categories
--------------------
  road_damage | street_light | water_supply | sewage | garbage
  encroachment | noise_pollution | illegal_construction | traffic | other

Quick start
-----------
  pip install -r requirements.txt
  python train.py          # optional: fine-tune on your dataset
  uvicorn main:app --host 0.0.0.0 --port 8000 --reload
"""

import io
import os
import logging
from pathlib import Path
from typing import Optional

import torch
import torch.nn as nn
import torchvision.transforms as T
from torchvision import models
from PIL import Image
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ─── Config ───────────────────────────────────────────────────────────────────

CATEGORIES = [
    "Damaged Road Issue",
    "Fallen Trees",
    "Garbage and Trash Issue",
    "Illegal Drawing on Walls",
    "Street Light Issue",
    "Other"
]
NUM_CLASSES = len(CATEGORIES)
MODEL_WEIGHTS_PATH = Path(os.getenv("MODEL_WEIGHTS", "weights/classifier.pt"))
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
IMG_SIZE = 224

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger("classifier")

# ─── Model definition ─────────────────────────────────────────────────────────


def build_model() -> nn.Module:
    """
    MobileNetV3-Small with a custom classification head.
    Lightweight enough to run comfortably on CPU.
    """
    model = models.mobilenet_v3_small(
        weights=models.MobileNet_V3_Small_Weights.IMAGENET1K_V1
    )
    # Replace the final classifier layer
    in_features = model.classifier[-1].in_features
    model.classifier[-1] = nn.Linear(in_features, NUM_CLASSES)
    return model


# ─── Inference transform ──────────────────────────────────────────────────────

_transform = T.Compose([
    T.Resize((IMG_SIZE, IMG_SIZE)),
    T.ToTensor(),
    T.Normalize(mean=[0.485, 0.456, 0.406],
                std=[0.229, 0.224, 0.225]),
])


def _confidence_label(prob: float) -> str:
    if prob >= 0.70:
        return "high"
    if prob >= 0.40:
        return "medium"
    if prob >= 0.20:
        return "low"
    return "none"


# ─── Load weights ─────────────────────────────────────────────────────────────

model: Optional[nn.Module] = None


def load_model() -> nn.Module:
    m = build_model()
    if MODEL_WEIGHTS_PATH.exists():
        log.info(f"Loading fine-tuned weights from {MODEL_WEIGHTS_PATH}")
        state = torch.load(MODEL_WEIGHTS_PATH, map_location=DEVICE)
        m.load_state_dict(state)
    else:
        log.warning(
            "Fine-tuned weights not found — using ImageNet backbone only. "
            "Run  python train.py  to fine-tune on your dataset."
        )
    m.to(DEVICE)
    m.eval()
    return m


# ─── FastAPI app ──────────────────────────────────────────────────────────────

app = FastAPI(
    title="GrievancePortal Image Classifier",
    description="Classifies municipal issue images into predefined categories.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    global model
    log.info(f"Loading model on device={DEVICE}")
    model = load_model()
    log.info("Model ready.")


# ─── Schemas ──────────────────────────────────────────────────────────────────


class ClassifyResponse(BaseModel):
    category: str
    raw_label: str
    confidence: str          # "high" | "medium" | "low" | "none"
    confidence_score: float  # 0.0 – 1.0
    all_scores: dict         # category → probability


# ─── Routes ───────────────────────────────────────────────────────────────────


@app.get("/health")
def health():
    return {"status": "ok", "device": DEVICE, "model_loaded": model is not None}


@app.post("/classify", response_model=ClassifyResponse)
async def classify(image: UploadFile = File(...)):
    """
    Accept a JPEG/PNG image upload and return the predicted complaint category.
    """
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded yet.")

    # Validate content type
    if image.content_type and not image.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image.")

    raw_bytes = await image.read()
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="Empty file received.")

    try:
        pil_img = Image.open(io.BytesIO(raw_bytes)).convert("RGB")
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Cannot decode image: {exc}")

    # Run inference
    tensor = _transform(pil_img).unsqueeze(0).to(DEVICE)
    with torch.no_grad():
        logits = model(tensor)                          # [1, NUM_CLASSES]
        probs = torch.softmax(logits, dim=1)[0]         # [NUM_CLASSES]

    probs_list = probs.cpu().tolist()
    top_idx = int(torch.argmax(probs).item())
    top_prob = probs_list[top_idx]
    top_cat = CATEGORIES[top_idx]

    all_scores = {cat: round(prob, 4) for cat, prob in zip(CATEGORIES, probs_list)}

    log.info(
        f"[classify] category={top_cat}  "
        f"confidence={_confidence_label(top_prob)}  "
        f"score={top_prob:.3f}"
    )

    return ClassifyResponse(
        category=top_cat,
        raw_label=top_cat.replace("_", " ").title(),
        confidence=_confidence_label(top_prob),
        confidence_score=round(top_prob, 4),
        all_scores=all_scores,
    )