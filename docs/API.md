# API Reference

Base URL: `http://localhost:8000/api/v1`

## Auth

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/login` | Login with email/password |
| POST | `/auth/register` | Register new user |
| GET | `/auth/me` | Current user profile (Bearer token) |

Default admin (auto-created): `admin@anpr.local` / `admin123`

## Stream Detection

| Method | Path | Description |
|--------|------|-------------|
| POST | `/detect/stream` | Start RTSP/HTTP stream detection (auth required) |
| POST | `/detect/stop` | Stop active stream (auth required) |
| GET | `/stream/status` | Stream status |
| GET | `/stream/:streamId/preview` | Latest JPEG preview frame |

## Export

| Method | Path | Description |
|--------|------|-------------|
| GET | `/analytics/export/detections` | CSV export (auth required) |
| GET | `/analytics/export/vehicles` | CSV export (auth required) |

## Detection

| Method | Path | Description |
|--------|------|-------------|
| POST | `/detect` | Upload video (multipart: `video_file`, optional `options` JSON) |
| GET | `/jobs/:jobId/status` | Job queue status |
| GET | `/detections` | List detections (query: `page`, `limit`, `plate`) |
| GET | `/detections/:id` | Detection detail |
| POST | `/detections/:id/verify` | Correct plate number |
| DELETE | `/detections/:id` | Delete detection |

## Vehicles

| Method | Path | Description |
|--------|------|-------------|
| GET | `/vehicles` | List vehicles |
| GET | `/vehicles/search?plate=` | Search by plate |
| GET | `/vehicles/:id` | Vehicle detail + history |
| PUT | `/vehicles/:id` | Update vehicle metadata |
| POST | `/vehicles/:id/flag` | Flag suspicious |
| GET | `/vehicles/repeat/analysis` | Repeat vehicle metrics |

## Analytics

| Method | Path | Description |
|--------|------|-------------|
| GET | `/analytics/summary` | KPI summary |
| GET | `/analytics/traffic` | Peak traffic hours |
| GET | `/analytics/repeat` | Repeat analysis |
| GET | `/analytics/confidence` | Confidence bands |
| GET | `/analytics/vehicles` | Most frequent vehicles |
| GET | `/analytics/trends?days=7` | Trend data |

## Alerts

| Method | Path | Description |
|--------|------|-------------|
| GET | `/alerts` | All alerts |
| GET | `/alerts/unresolved` | Pending alerts |
| POST | `/alerts/:id/resolve` | Resolve alert |
| GET | `/suspicious` | Suspicious vehicles |

## Stream

| Method | Path | Description |
|--------|------|-------------|
| POST | `/stream/update` | AI callback for live detections |
| GET | `/stream/status` | Stream status |

## WebSocket Events

**Server → Client:** `detection`, `alert`, `statistics:update`, `job:progress`, `job:complete`, `stream:status`

**Client → Server:** `join-stream`, `leave-stream`, `request:stats`

## Python AI Service

Base URL: `http://localhost:5000/api/v1`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/detect` | Process video file |
| POST | `/stream/detect` | Process single frame |
| GET | `/health` | Health check |
| GET | `/models/status` | Model status |
