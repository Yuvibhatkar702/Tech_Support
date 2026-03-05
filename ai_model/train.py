"""
train.py — Fine-tune MobileNetV3-Small on your municipal complaint dataset
==========================================================================

Dataset structure expected
--------------------------
  dataset/
    train/
      road_damage/    *.jpg
      street_light/   *.jpg
      water_supply/   *.jpg
      sewage/         *.jpg
      garbage/        *.jpg
      encroachment/   *.jpg
      noise_pollution/      *.jpg
      illegal_construction/ *.jpg
      traffic/        *.jpg
      other/          *.jpg
    val/
      <same structure>

Usage
-----
  python train.py                         # default settings
  python train.py --epochs 30 --lr 3e-4  # custom hyperparameters
  python train.py --dataset /path/to/dataset --output weights/classifier.pt

The trained weights are saved to  weights/classifier.pt  and loaded
automatically by the FastAPI server (main.py).
"""

import argparse
import json
import time
from pathlib import Path

import torch
import torch.nn as nn
import torch.optim as optim
from torch.optim.lr_scheduler import CosineAnnealingLR
from torch.utils.data import DataLoader
from torchvision import datasets, models, transforms

# ─── Categories (must match main.py) ─────────────────────────────────────────

CATEGORIES = [
    "Damaged Road Issue",
    "Fallen Trees",
    "Garbage and Trash Issue",
    "Illegal Drawing on Walls",
    "Street Light Issue",
    "Other"
]
NUM_CLASSES = len(CATEGORIES)
IMG_SIZE = 224

# ─── Transforms ───────────────────────────────────────────────────────────────

TRAIN_TRANSFORMS = transforms.Compose([
    transforms.RandomResizedCrop(IMG_SIZE, scale=(0.7, 1.0)),
    transforms.RandomHorizontalFlip(),
    transforms.ColorJitter(brightness=0.3, contrast=0.3, saturation=0.2),
    transforms.RandomRotation(15),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406],
                         std=[0.229, 0.224, 0.225]),
])

VAL_TRANSFORMS = transforms.Compose([
    transforms.Resize((IMG_SIZE, IMG_SIZE)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406],
                         std=[0.229, 0.224, 0.225]),
])


# ─── Model builder ────────────────────────────────────────────────────────────

def build_model() -> nn.Module:
    """MobileNetV3-Small with custom head — matches main.py."""
    model = models.mobilenet_v3_small(
        weights=models.MobileNet_V3_Small_Weights.IMAGENET1K_V1
    )
    in_features = model.classifier[0].in_features  # 576
    model.classifier = nn.Sequential(
        nn.Linear(in_features, 512),
        nn.BatchNorm1d(512),
        nn.ReLU(),
        nn.Dropout(0.3),
        nn.Linear(512, 256),
        nn.BatchNorm1d(256),
        nn.ReLU(),
        nn.Dropout(0.3),
        nn.Linear(256, NUM_CLASSES),
    )
    return model


# ─── Training loop ────────────────────────────────────────────────────────────

def train_one_epoch(model, loader, criterion, optimizer, device):
    model.train()
    total_loss, correct, total = 0.0, 0, 0

    for images, labels in loader:
        images, labels = images.to(device), labels.to(device)
        optimizer.zero_grad()
        outputs = model(images)
        loss = criterion(outputs, labels)
        loss.backward()
        optimizer.step()

        total_loss += loss.item() * images.size(0)
        preds = outputs.argmax(dim=1)
        correct += (preds == labels).sum().item()
        total += images.size(0)

    return total_loss / total, correct / total


@torch.no_grad()
def evaluate(model, loader, criterion, device):
    model.eval()
    total_loss, correct, total = 0.0, 0, 0

    for images, labels in loader:
        images, labels = images.to(device), labels.to(device)
        outputs = model(images)
        loss = criterion(outputs, labels)

        total_loss += loss.item() * images.size(0)
        preds = outputs.argmax(dim=1)
        correct += (preds == labels).sum().item()
        total += images.size(0)

    return total_loss / total, correct / total


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Train municipal complaint classifier")
    parser.add_argument("--dataset",    default="dataset",              help="Root dataset dir")
    parser.add_argument("--output",     default="weights/classifier.pt", help="Where to save weights")
    parser.add_argument("--epochs",     type=int,   default=20)
    parser.add_argument("--batch",      type=int,   default=32)
    parser.add_argument("--lr",         type=float, default=1e-3)
    parser.add_argument("--workers",    type=int,   default=4)
    parser.add_argument("--freeze-backbone", action="store_true",
                        help="Freeze backbone; only train the classifier head")
    args = parser.parse_args()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Device: {device}")

    # ── Datasets
    dataset_root = Path(args.dataset)
    train_dir = dataset_root / "train"
    val_dir   = dataset_root / "val"

    if not train_dir.exists():
        print(f"\nERROR: Training directory not found: {train_dir}")
        print("Please create the dataset directory structure as described in train.py docstring.")
        return

    train_ds = datasets.ImageFolder(str(train_dir), transform=TRAIN_TRANSFORMS)
    val_ds   = datasets.ImageFolder(str(val_dir),   transform=VAL_TRANSFORMS) if val_dir.exists() else None

    print(f"Training samples : {len(train_ds)}")
    if val_ds:
        print(f"Validation samples: {len(val_ds)}")
    print(f"Classes          : {train_ds.classes}")

    # Verify class order matches CATEGORIES
    if train_ds.classes != sorted(CATEGORIES):
        print(
            "\nWARNING: Dataset class order differs from CATEGORIES list. "
            "Predictions may be misaligned."
        )

    train_loader = DataLoader(
        train_ds, batch_size=args.batch, shuffle=True,
        num_workers=args.workers, pin_memory=True
    )
    val_loader = DataLoader(
        val_ds, batch_size=args.batch, shuffle=False,
        num_workers=args.workers, pin_memory=True
    ) if val_ds else None

    # ── Model
    model = build_model().to(device)

    if args.freeze_backbone:
        print("Freezing backbone — only training classifier head.")
        for name, param in model.named_parameters():
            if "classifier" not in name:
                param.requires_grad = False

    # ── Loss, optimiser, scheduler
    criterion = nn.CrossEntropyLoss(label_smoothing=0.1)
    optimizer = optim.AdamW(
        filter(lambda p: p.requires_grad, model.parameters()),
        lr=args.lr, weight_decay=1e-4
    )
    scheduler = CosineAnnealingLR(optimizer, T_max=args.epochs, eta_min=1e-5)

    # ── Output dir
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    history = []
    best_val_acc = 0.0
    best_epoch   = 0

    print(f"\nStarting training for {args.epochs} epochs …\n{'─' * 55}")

    for epoch in range(1, args.epochs + 1):
        t0 = time.time()
        train_loss, train_acc = train_one_epoch(model, train_loader, criterion, optimizer, device)
        scheduler.step()

        row = {
            "epoch": epoch,
            "train_loss": round(train_loss, 4),
            "train_acc":  round(train_acc,  4),
        }

        if val_loader:
            val_loss, val_acc = evaluate(model, val_loader, criterion, device)
            row["val_loss"] = round(val_loss, 4)
            row["val_acc"]  = round(val_acc,  4)
            improved = val_acc > best_val_acc
            if improved:
                best_val_acc = val_acc
                best_epoch   = epoch
                torch.save(model.state_dict(), output_path)
            marker = " ✓ saved" if improved else ""
            print(
                f"Epoch {epoch:03d}/{args.epochs}  "
                f"train loss={train_loss:.4f} acc={train_acc:.3f}  "
                f"val loss={val_loss:.4f} acc={val_acc:.3f}  "
                f"({time.time()-t0:.1f}s){marker}"
            )
        else:
            torch.save(model.state_dict(), output_path)
            print(
                f"Epoch {epoch:03d}/{args.epochs}  "
                f"train loss={train_loss:.4f} acc={train_acc:.3f}  "
                f"({time.time()-t0:.1f}s)  weights saved"
            )

        history.append(row)

    print(f"\n{'─'*55}")
    if val_loader:
        print(f"Best val accuracy : {best_val_acc:.3f}  (epoch {best_epoch})")
    print(f"Weights saved to  : {output_path}")

    # Save training history
    hist_path = output_path.parent / "training_history.json"
    with open(hist_path, "w") as f:
        json.dump(history, f, indent=2)
    print(f"History saved to  : {hist_path}")


if __name__ == "__main__":
    main()