# Production-Like Runbook (Lightsail + MongoDB Atlas)

Last updated: 2026-04-04

## 1. Deployment Topology
- Public entrypoint: Nginx on `80/443` only.
- API process: `vip-crm-api` (`ENABLE_SCHEDULER=false`).
- Worker process: `vip-crm-worker` (`ENABLE_SCHEDULER=true`).
- Database: MongoDB Atlas (IP whitelist includes Lightsail static IP only).
- Media storage: S3 bucket with private access + signed URL usage.

## 2. Required Environment Variables
- Runtime: `NODE_ENV`, `PORT`, `ENABLE_SCHEDULER`, `HEALTH_EXPOSE_DETAILS`.
- Security: `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CORS_ORIGINS`.
- Rate limiting: `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_GENERAL_MAX`, `RATE_LIMIT_AUTH_MAX`, `RATE_LIMIT_USER_MAX`.
- Upload hardening: `IMPORT_MAX_FILE_SIZE_MB`, `IMPORT_MAX_WORKBOOK_SHEETS`, `IMPORT_MAX_WORKSHEET_ROWS`.
- Optional alerting: `ALERT_WEBHOOK_URL`.

## 3. Pre-Release Checklist
1. Rotate secrets and credentials:
- JWT secrets, Atlas DB password, AWS keys, Resend key.
2. Confirm network controls:
- Lightsail firewall allows only `22/80/443`.
- Atlas network access includes Lightsail static IP only.
3. Verify process split:
- `pm2 status` shows both `vip-crm-api` and `vip-crm-worker`.
4. Run release gates:
- CI green (`startup check`, backend tests/smoke, frontend build, dependency audit critical gate).
5. Confirm health endpoints:
- `GET /api/health/live` returns `200`.
- `GET /api/health/ready` returns `200` only when DB is connected.

## 4. Rollback Procedure
1. On server:
- `cd /var/www/vip-crm`
- `git checkout <last-known-good-tag>`
- `cd backend && npm ci`
- `cd ../frontend && npm ci && npm run build`
- `cd .. && pm2 reload ecosystem.config.js --update-env`
2. Validate:
- `curl -f https://<domain>/api/health/live`
- `curl -f https://<domain>/api/health/ready`
3. Record incident summary with timestamp and rollback reason.

## 5. Backup/Restore Verification
- Atlas restore drill:
1. Create test record.
2. Trigger/verify Atlas snapshot availability.
3. Restore to staging cluster and verify test record existence.
- S3 object restore drill:
1. Upload test object.
2. Delete test object.
3. Restore from versioning/lifecycle backup path (if enabled) and verify checksum.

## 6. Monitoring and Alerts
- Monitor API and worker process status (`pm2 monit`, `pm2 logs`).
- Worker failures emit operational alerts and optionally post to `ALERT_WEBHOOK_URL`.
- Retain logs for incident review and add external uptime monitors for `/api/health/live`.

## 7. 30-Day Follow-Up
1. Add Redis-backed shared rate limiting and scale API horizontally.
2. Expand backend tests across CRM/ERP critical paths.
3. Reduce frontend lint debt and move from changed-file risk lint gate to full lint gate.
4. Replace `xlsx` dependency with a safer parser path (see risk register).

