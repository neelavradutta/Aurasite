from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    fastapi_env: str = "development"
    log_level: str = "INFO"
  # When true, use CUDA if available; set false to force CPU only
    gpu_enabled: bool = True
    port: int = 5000

    # Vehicle YOLO (COCO — car, truck, bus, etc.)
    yolo_model: str = "yolov8n.pt"
    confidence_threshold: float = 0.5
    min_bbox_area: int = 2000

    # Dedicated plate YOLO (local file in models/)
    plate_yolo_model: str = "plate_yolov8n.pt"
    # plate_confidence_threshold: float = 0.4
    plate_confidence_threshold: float = 0.35
    min_plate_area: int = 400

    # OCR
    ocr_lang: str = "en"
    min_plate_confidence: float = 0.72

    # Pipeline: plate_first only — skip noisy vehicle-crop fallback
    anpr_pipeline: str = "plate_first"

    frame_skip: int = 2
    max_frames: int = 100
    video_detection_interval: int = 3
    video_ocr_variants: int = 2
    detection_interval: int = 3
    motion_threshold: float = 12.0
    track_buffer: int = 30
    track_match_iou: float = 0.8
    track_thresh: float = 0.5
    backend_callback_url: str = "https://aurasite.onrender.com"
    stream_frame_interval: float = 0.5

    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()
