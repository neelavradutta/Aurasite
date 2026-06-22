# ANPR AI Service — full ML stack installer (Windows)
$ErrorActionPreference = "Stop"
$AiRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$RepoRoot = Split-Path -Parent $AiRoot
Set-Location $AiRoot

Write-Host "=== ANPR AI Service ML Install ===" -ForegroundColor Cyan

Write-Host "`n[1/2] Python dependencies (requirements-cpu.txt)..." -ForegroundColor Yellow
Write-Host "      For GPU: pip install -r `"$RepoRoot\requirements-gpu.txt`"" -ForegroundColor DarkGray
python -m pip install --upgrade pip
pip install -r "$RepoRoot\requirements-cpu.txt"

Write-Host "`n[2/2] Download YOLO models..." -ForegroundColor Yellow
python scripts/download_models.py

Write-Host "`n=== Verify model loading ===" -ForegroundColor Cyan
.\.venv\Scripts\python.exe -c @"
from services.anpr_pipeline import initialize_models
from services.model_registry import model_status_payload
initialize_models()
s = model_status_payload()
print('Vehicle YOLO loaded:', s['vehicle_yolo']['loaded'], '|', s['vehicle_yolo']['detail'])
print('Plate YOLO loaded:', s['plate_yolo']['loaded'], '|', s['plate_yolo']['detail'])
print('PaddleOCR loaded:', s['ocr']['loaded'], '|', s['ocr']['detail'])
"@

Write-Host "`nDone. Start service: python -m uvicorn app:app --reload --port 5000" -ForegroundColor Green
