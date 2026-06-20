# Deployment

## Frontend (Vercel)

1. Connect repository, set root to `frontend/`
2. Environment:
   - `NEXT_PUBLIC_API_URL=https://api.yourdomain.com`
   - `NEXT_PUBLIC_WS_URL=https://api.yourdomain.com`

## Backend

- Deploy to a Node.js host (VPS, AWS EC2, Railway, Render, etc.)
- Use managed MySQL (RDS, Cloud SQL) or self-hosted MySQL
- Set strong `JWT_SECRET`
- Place Nginx/ALB in front for HTTPS
- Run with `npm run build && npm start`

## AI Service

- Deploy on a GPU instance (AWS p3, GCP with NVIDIA T4) or CPU-only for lighter workloads
- Install full ML dependencies via `ai-service/scripts/install.ps1` or equivalent
- Scale independently from API tier
- Run with `uvicorn app:app --host 0.0.0.0 --port 5000`

## Recommended Production Checklist

- [ ] HTTPS everywhere
- [ ] Managed database with backups
- [ ] Object storage (S3/MinIO) for video artifacts
- [ ] Rate limiting and auth on all endpoints
- [ ] Centralized logging (CloudWatch, Datadog)
- [ ] Health checks and auto-restart policies (systemd, PM2, or process manager)
