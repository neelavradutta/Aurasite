# ANPR Intelligence Dashboard

Next-generation Automatic Number Plate Recognition (ANPR) platform with a hybrid microservices architecture:

| Service | Stack | Port |
|---------|-------|------|
| Frontend | React + Next.js (cyberpunk UI) | 3001 |
| Backend API | Node.js + Express + MySQL | 8000 |
| AI Pipeline | Python FastAPI + YOLO + PaddleOCR + ByteTrack | 5000 |

## Quick Start

### 1. Database

Install MySQL 8+ locally, then apply the schema:

```bash
mysql -u root -p < docs/schema.sql
```

### 2. Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

### 3. AI Service (with real YOLO + PaddleOCR)

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

Open http://localhost:3001 — default login: `admin@gmail.com` / `admin123`

## Architecture

```
Frontend (3001) ──HTTP/WS──► Backend (8000) ──REST──► AI Service (5000)
                                   │
                              MySQL
```

- **Async video processing**: In-memory job queue + WebSocket job updates
- **Real-time detections**: Socket.IO events (`detection`, `alert`, `job:complete`)
- **Analytics**: Peak traffic, repeat analysis, confidence heatmap

## Project Structure

```
anpr-dashboard/
├── frontend/     # Next.js cyberpunk dashboard
├── backend/      # Express REST API + Socket.IO
├── ai-service/   # FastAPI detection pipeline
└── docs/         # Schema, setup, API, deployment guides
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
