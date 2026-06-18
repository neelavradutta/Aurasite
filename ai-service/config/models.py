"""Model paths and download sources."""
from pathlib import Path

MODELS_DIR = Path(__file__).resolve().parent.parent / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)

VEHICLE_YOLO_DEFAULT = "yolov8n.pt"
PLATE_YOLO_FILENAME = "plate_yolov8n.pt"

# Hugging Face — YOLOv8 license plate detector (Roboflow-trained, class: license_plate)
PLATE_MODEL_URLS = [
    "https://huggingface.co/orionwambert/yolov8-license-plate-detection/resolve/main/best.pt",
    "https://huggingface.co/love671/yolov8-license-plate-detection/resolve/main/best.pt",
]

def vehicle_model_path(name: str | None = None) -> str:
    """Return vehicle YOLO weights path or hub name."""
    return name or VEHICLE_YOLO_DEFAULT

def plate_model_path(name: str | None = None) -> Path:
    """Return local path for dedicated plate detector."""
    if name and Path(name).exists():
        return Path(name)
    local = MODELS_DIR / (name or PLATE_YOLO_FILENAME)
    return local
