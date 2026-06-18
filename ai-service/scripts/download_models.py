#!/usr/bin/env python3
"""Download YOLO vehicle weights and dedicated license-plate detector."""
from __future__ import annotations

import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from config.models import MODELS_DIR, PLATE_MODEL_URLS, PLATE_YOLO_FILENAME, vehicle_model_path


def download_url(url: str, dest: Path) -> bool:
    print(f"  Downloading {url}")
    try:
        urllib.request.urlretrieve(url, dest)
        return dest.exists() and dest.stat().st_size > 100_000
    except Exception as exc:
        print(f"  Failed: {exc}")
        return False


def download_vehicle_yolo(model_name: str = "yolov8n.pt") -> bool:
    print(f"[1/2] Vehicle YOLO ({model_name})")
    try:
        from ultralytics import YOLO

        YOLO(vehicle_model_path(model_name))
        print("  OK — cached by Ultralytics")
        return True
    except ImportError:
        print("  Skipped — install ultralytics first: pip install ultralytics")
        return False
    except Exception as exc:
        print(f"  Failed: {exc}")
        return False


def download_plate_yolo() -> bool:
    dest = MODELS_DIR / PLATE_YOLO_FILENAME
    print(f"[2/2] Plate YOLO -> {dest}")

    if dest.exists() and dest.stat().st_size > 100_000:
        print("  Already exists")
        return True

    for url in PLATE_MODEL_URLS:
        if download_url(url, dest):
            print(f"  OK ({dest.stat().st_size // 1024} KB)")
            return True

    print("  ERROR: Could not download plate model. Place weights manually at:")
    print(f"    {dest}")
    return False


def main() -> int:
    print("ANPR model downloader\n")
    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    vehicle_ok = download_vehicle_yolo()
    plate_ok = download_plate_yolo()

    print()
    if vehicle_ok and plate_ok:
        print("All models ready.")
        return 0
    if vehicle_ok:
        print("Vehicle YOLO ready. Plate model missing — pipeline will use vehicle-crop fallback.")
        return 0
    print("Some models missing. Install deps then re-run: python scripts/download_models.py")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
