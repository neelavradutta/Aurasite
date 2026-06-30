# AURASITE / APNR — Agent Project Brain

**Read this first. Do not broad-search the repo for orientation.** Use this file + agent-knowledge MCP. Only open files you will edit or that this doc names explicitly.

## Product

**AURASITE** — Next-Gen Automatic Number Plate Recognition dashboard. Brand: cyberpunk dark (default) + optional **brown-cream** day theme.

| Service | Stack | Port |
|---------|-------|------|
| Frontend | Next.js + React + Tailwind + Zustand | 3001 |
| Backend | Node Express + MySQL + Socket.IO | 8000 |
| AI | Python FastAPI + YOLO + PaddleOCR + ByteTrack | 5000 |

```
Frontend ──HTTP/WS──► Backend ──REST──► AI Service
                         │
                       MySQL
```

Default login: `admin@gmail.com` / `admin123` (also `admin@anpr.local` in docs).

## Pages → files

| Route | File | Purpose |
|-------|------|---------|
| `/login` | `frontend/pages/login.tsx` | Auth; always cyberpunk (no brown-cream) |
| `/dashboard` | `frontend/pages/dashboard.tsx` | Main ops: KPIs, charts, upload, plates |
| `/detections` | `frontend/pages/detections.tsx` | Detection log table, filters, export |
| `/vehicles` | `frontend/pages/vehicles.tsx` | Vehicle catalog, modal detail, PDF export |
| `/analytics` | `frontend/pages/analytics.tsx` | Full analytics charts |
| `/live` | `frontend/pages/live.tsx` | Camera/RTSP live detection |
| `/alerts` | `frontend/pages/alerts.tsx` | Alert management |
| App shell | `frontend/pages/_app.tsx` | Theme hydrate, global CSS imports |

**Header/nav:** `frontend/components/Header.tsx`, `MobileNav.tsx`, icons `NavIcons.tsx`.

## Frontend architecture

**State (Zustand):**
- `store/dashboardStore.ts` — detections, peak traffic, sessionVersion, speed readings, selected plate
- `store/authStore.ts` — JWT user/token, logout
- `store/liveStore.ts` — live detection history
- `store/themeStore.ts` — `dark` | `brown-cream`
- `store/videoUploadStore.ts` — uploaded video cards meta

**API client:** `frontend/services/api.ts` — axios to `/api/v1`, Bearer token interceptor.

**Socket:** `frontend/services/socket.ts`, hook `hooks/useSocket.ts` — events: `detection`, `alert`, `statistics:update`, `job:progress`, `job:complete`, `stream:status`.

**Session persistence (logout/login keeps data; new upload resets):**
- `services/sessionPersistence.ts` — per-user localStorage snapshots
- `services/dashboardSessionFlush.ts` — flush on logout
- `hooks/useSessionPersistence.ts` — hydrate on login
- `startNewAnalysisSession()` only after **successful** upload (not on upload start)
- **Never** clear uploads on `sessionVersion` bump (was a bug)

**Analytics hooks:** `hooks/useAnalytics.ts` — summary, traffic, repeat, confidence, speeds.

## Dashboard layout (`dashboard.tsx`)

3-column XL grid: KPIs aligned above panels. Left: MostFrequentVehicles, PeakTrafficChart. Center: ConfidenceHeatmap, SuspiciousVehicles. Right: VideoInputPanel, SelectedPlatePanel, LiveFeedLaunchCard, PlateCardsGrid. `KPICards` has `aligned` prop for column sync.

## Key components (by area)

| Area | Path |
|------|------|
| Video upload + processing | `components/RightPanel/VideoInputPanel.tsx` |
| Processing overlay | `components/VideoProcessingOverlay.tsx` |
| Peak traffic chart | `components/LeftPanel/PeakTrafficChart.tsx` + `PeakTrafficHoursLogo.tsx` |
| Vehicle speed | `components/Analytics/VehicleSpeedPanel.tsx` — `plain` mode in brown-cream via `useActiveTheme()` |
| Parking | `components/Analytics/ParkingOccupancyPanel.tsx` |
| Detection table | `components/DetectionLogTable.tsx` |
| Vehicle cards | `components/VehicleCatalogCard.tsx`, `VehicleCatalogModal.tsx` |
| Brand overlay | `components/AurasiteBrandOverlay.tsx` |

## Theme rules (CRITICAL)

Two themes: **cyberpunk dark** (default) and **brown-cream** (`data-theme='brown-cream'` on `<html>`).

- Brown-cream CSS lives only under `frontend/styles/brown-cream/` — scope with `[data-theme='brown-cream']`.
- **Do not change cyberpunk defaults** when polishing brown-cream.
- Hover: glow **only the hovered element**; never dim siblings.
- Login page: cyberpunk only.
- Vehicles nav icon: `NavIcons.tsx` → `VehiclesNavIcon` uses CSS mask + `/vehicles-tab-logo.png` (transparent, no dark box).
- Peak Traffic panel logo: `peak-traffic-hours-logo-cropped.png` in navy box (`peak-traffic-hours-logo-box` in globals.css).
- Brown-cream: no dark film on video cards, vehicle speed cards, detected plate cards; brown text on cream/brown surfaces.

## Backend routes (`backend/src/routes/`)

`authRoutes`, `detectRoutes`, `detectionRoutes`, `vehicleRoutes`, `analyticsRoutes`, `alertRoutes`, `jobRoutes`, `cameraRoutes`, `liveRoutes`.

Entry: `backend/src/app.ts` — Express + Socket.IO, CORS, swagger.

## API quick reference (base `/api/v1`)

- Auth: `POST /auth/login`, `GET /auth/me`
- Detect: `POST /detect` (multipart video), `GET /jobs/:id/status`
- Stream: `POST /detect/stream`, `POST /detect/stop`, `GET /stream/status`
- Detections: `GET /detections`, `DELETE /detections/:id`, `POST /detections/:id/verify`
- Vehicles: `GET /vehicles`, `GET /vehicles/search`, `GET /vehicles/:id`, `PUT /vehicles/:id`, `POST /vehicles/:id/flag`
- Analytics: `/analytics/summary`, `/traffic`, `/repeat`, `/confidence`, `/vehicles`, `/trends`
- Alerts: `GET /alerts/unresolved`, `POST /alerts/:id/resolve`

## AI pipeline (`ai-service/`)

Frame → YOLO vehicles → plate crop → PaddleOCR → ByteTrack. Main: `services/anpr_pipeline.py`, `video_plate_processing.py`. Health: `GET /api/v1/models/status` (`mock: false` when real).

## Types

- `frontend/types/detection.ts` — `Detection`, `DetectionVehicle`
- `frontend/types/vehicle.ts` — `Vehicle`, `VehicleStatus`
- `frontend/types/analytics.ts` — `AnalyticsSummary`, `Alert`

## Docs

`docs/ARCHITECTURE.md`, `docs/API.md`, `docs/SETUP.md`, `docs/schema.sql`

## User preferences (persist in memory)

- Minimize diff scope; match existing code style.
- Brown-cream theme scope only; preserve cyberpunk.
- Per-user dashboard widgets persist across logout/login; reset on new successful upload only.
- Mobile app planned: React Native + Expo thin client over same API (see chat history / memory vault).

## Agent workflow

1. **Start:** Query agent-knowledge MCP for task + AURASITE context.
2. **Work:** Read only files listed above or named by user.
3. **End:** Store new decisions, bugs fixed, and file paths in agent-knowledge.
4. **Never:** SemanticSearch/Grep/Task explore for orientation when this doc + memory suffice.

## Seed memory

Run once: `powershell -File scripts/seed-agent-memory.ps1`
