# ANPR Intelligence Dashboard

Next-generation Automatic Number Plate Recognition (ANPR) platform with a hybrid microservices architecture:

| Service | Stack | Port |
|---------|-------|------|
| Frontend | React + Next.js (cyberpunk UI) | 3000 |
| Backend API | Node.js + Express + MySQL + Redis | 8000 |
| AI Pipeline | Python FastAPI + YOLO + PaddleOCR + ByteTrack | 5000 |

## Quick Start (Docker)

```bash
# Clone and start all services
docker compose up --build
```

Services:

- Dashboard: http://localhost:3000
- API: http://localhost:8000
- AI Service: http://localhost:5000
- API Docs: http://localhost:8000/api/docs
- AI Health: http://localhost:5000/api/v1/health

## Local Development

### 1. Infrastructure

```bash
docker compose up mysql redis -d
```

Apply schema: `docs/schema.sql` (auto-applied on first MySQL container start)

### 2. Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

### AI Service (with real YOLO + PaddleOCR)

```powershell
cd ai-service
.\scripts\install.ps1
```

This installs PyTorch, PaddlePaddle 2.6, PaddleOCR 2.9, downloads:
- **Vehicle YOLO** (`yolov8n.pt`) — COCO vehicle detection
- **Plate YOLO** (`models/plate_yolov8n.pt`) — dedicated license plate detector

Verify all models loaded (no mock):

```bash
curl http://localhost:5000/api/v1/models/status
```

Expected: `"mock": false` for `vehicle_yolo`, `plate_yolo`, and `ocr`.

### 4. Frontend

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

## Architecture

```
Frontend (3000) ──HTTP/WS──► Backend (8000) ──REST──► AI Service (5000)
                                   │
                              MySQL + Redis
```

- **Async video processing**: Bull queue + WebSocket job updates
- **Real-time detections**: Socket.IO events (`detection`, `alert`, `job:complete`)
- **Analytics**: Peak traffic, repeat analysis, confidence heatmap

## Project Structure

```
anpr-dashboard/
├── frontend/     # Next.js cyberpunk dashboard
├── backend/      # Express REST API + Socket.IO + Bull
├── ai-service/   # FastAPI detection pipeline
├── docs/         # Schema, setup, API, deployment guides
└── docker-compose.yml
```

## Key API Endpoints

- `POST /api/v1/detect` — Upload video for processing
- `GET /api/v1/detections` — Paginated detection history
- `GET /api/v1/analytics/summary` — Dashboard KPIs
- `GET /api/v1/alerts/unresolved` — Active alerts
- `POST /api/v1/stream/update` — Real-time detection callback (AI → Backend)

## Documentation

- [Setup Guide](docs/SETUP.md)
- [Architecture](docs/ARCHITECTURE.md)
- [API Reference](docs/API.md)
- [Deployment](docs/DEPLOYMENT.md)

## License

MIT
