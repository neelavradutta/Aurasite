# Deployment

## Docker Production

```bash
docker compose -f docker-compose.yml up -d --build
```

## Frontend (Vercel)

1. Connect repository, set root to `frontend/`
2. Environment:
   - `NEXT_PUBLIC_API_URL=https://api.yourdomain.com`
   - `NEXT_PUBLIC_WS_URL=https://api.yourdomain.com`

## Backend

- Deploy Docker image to AWS ECS, GCP Cloud Run, or DigitalOcean App Platform
- Use managed MySQL (RDS, Cloud SQL) and Redis (ElastiCache, Memorystore)
- Set strong `JWT_SECRET`
- Place Nginx/ALB in front for HTTPS

## AI Service

- Deploy on GPU instance (AWS p3, GCP with NVIDIA T4)
- Set `MOCK_MODE=false`, install full ML dependencies
- Scale independently from API tier

## Recommended Production Checklist

- [ ] HTTPS everywhere
- [ ] Managed database with backups
- [ ] Redis persistence for job queue
- [ ] Object storage (S3/MinIO) for video artifacts
- [ ] Rate limiting and auth on all endpoints
- [ ] Centralized logging (CloudWatch, Datadog)
- [ ] Health checks and auto-restart policies
