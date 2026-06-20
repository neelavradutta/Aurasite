# Setup Guide

## Prerequisites

- Node.js 18+
- Python 3.10+
- MySQL 8.0+

## Environment Files

Copy example env files for each service:

```bash
cp backend/.env.example backend/.env
cp ai-service/.env.example ai-service/.env
cp frontend/.env.example frontend/.env.local
```

## Database

Create the database and apply the schema:

```bash
mysql -u root -p < docs/schema.sql
```

Or run `npm run db:setup` from `backend/` after configuring `.env`.

## Running Locally

Start services in order:

1. MySQL
2. AI service (`uvicorn app:app --port 5000` from `ai-service/`)
3. Backend (`npm run dev` in `backend/`)
4. Frontend (`npm run dev` in `frontend/`)

## ML Inference (Production ANPR)

Install the full stack:

```powershell
cd ai-service
.\scripts\install.ps1
```

Or manually from the repo root:

```bash
pip install -r requirements.txt
cd ai-service && python scripts/download_models.py
```

### Pipeline

| Stage | Model | Purpose |
|-------|-------|---------|
| Plate detection | `models/plate_yolov8n.pt` | Dedicated license plate YOLO |
| Vehicle detection | `yolov8n.pt` | Associate plates with vehicles |
| OCR | PaddleOCR | Read plate text from crop |

Set `ANPR_PIPELINE=auto` (default): plate YOLO first, vehicle-crop fallback if weights missing.

Verify: `GET http://localhost:5000/api/v1/models/status` — all `"mock": false`.

Set `MOCK_MODE=true` only for UI dev without GPU/ML deps.

## Authentication

Default admin (created on first backend start): `admin@gmail.com` / `admin123`

Login at http://localhost:3001/login. Set `AUTH_ENABLED=false` in backend `.env` to skip auth during development.

## Live Streams & CSV Export

- **Live Monitor**: enter RTSP URL → Start Detection → real-time plate events via WebSocket
- **CSV Export**: Analytics or Detections page → Export CSV (requires login)

## Verification
```bash
curl http://localhost:8000/health
curl http://localhost:5000/api/v1/health
```

Upload a test video from the dashboard or:

```bash
curl -X POST http://localhost:8000/api/v1/detect \
  -F "video_file=@sample.mp4"
```
