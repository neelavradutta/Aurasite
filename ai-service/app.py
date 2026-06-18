import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config.settings import settings
from routes import detect, health, stream
from services.video_service import initialize_models

logging.basicConfig(level=getattr(logging, settings.log_level.upper(), logging.INFO))
logger = logging.getLogger(__name__)

app = FastAPI(
    title="ANPR AI Service",
    description="YOLO + PaddleOCR + ByteTrack detection pipeline",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs("uploads", exist_ok=True)

app.include_router(health.router)
app.include_router(detect.router)
app.include_router(stream.router)


@app.on_event("startup")
async def startup():
    initialize_models()
    logger.info("AI service started on port %s (production models ready)", settings.port)
