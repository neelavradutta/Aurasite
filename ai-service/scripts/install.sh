#!/usr/bin/env bash
set -euo pipefail
AI_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$AI_ROOT/.." && pwd)"
cd "$AI_ROOT"

echo "=== ANPR AI Service ML Install ==="

echo -e "\n[1/2] Python dependencies (repo requirements.txt)..."
python3 -m pip install --upgrade pip
pip install -r "$REPO_ROOT/requirements.txt"

echo -e "\n[2/2] Download YOLO models..."
python3 scripts/download_models.py

echo -e "\n=== Verify ==="
python3 -c "
from services.anpr_pipeline import initialize_models
from services.model_registry import model_status_payload
initialize_models()
s = model_status_payload()
print('Vehicle YOLO loaded:', s['vehicle_yolo']['loaded'])
print('Plate YOLO loaded:', s['plate_yolo']['loaded'])
print('PaddleOCR loaded:', s['ocr']['loaded'])
"

echo -e "\nDone. Start: uvicorn app:app --reload --port 5000"
