# Architecture

## Overview

The ANPR platform separates concerns across three services:

1. **Frontend** — Operator dashboard, real-time visualization, analytics charts
2. **Backend** — Business logic, persistence, authentication, job orchestration
3. **AI Service** — Computer vision pipeline (detection, OCR, tracking)

## Communication Patterns

### Pattern 1: Synchronous (short videos)

Frontend → Backend → Python → Backend → Frontend

### Pattern 2: Async Job Queue (recommended)

1. Frontend uploads video → Backend enqueues in-memory job → returns `job_id`
2. Worker calls Python AI service
3. Results saved to MySQL
4. WebSocket emits `job:complete`

### Pattern 3: Real-time Stream

Python processes frames → POST `/api/v1/stream/update` → Backend → Socket.IO `detection` event

## Data Stores

| Store | Purpose |
|-------|---------|
| MySQL | Vehicles, detections, alerts, analytics, in-process cache for repeat detection |
| Shared volume | Video uploads |

## AI Pipeline

```
Video Frame → YOLO (vehicles) → Crop plate region → PaddleOCR → ByteTrack → JSON
```

## Security Notes

- JWT middleware scaffolded in backend (`middleware/auth.ts`)
- CORS restricted via `CORS_ORIGIN`
- Use HTTPS and secrets management in production
