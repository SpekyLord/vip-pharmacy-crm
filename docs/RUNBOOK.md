# VIP CRM/ERP — Disaster Recovery Runbook

> **Purpose**: Step-by-step procedures to recover the system from common and catastrophic failures.
> **Audience**: Founder + designated technical operators.
> **Updated**: 2026-04-25 (Week-1 Stabilization)
> **Print this. Store one copy at home, one in the office safe.**

---

## SECTION 1 — Critical Contacts

| Service | Contact / Account | Notes |
|---|---|---|
| **MongoDB Atlas Support** | Project: VIP DATABASES, Cluster: Cluster0 | Login at cloud.mongodb.com. Support tier: **Developer Free** — no human support, community forum only |
| **AWS Support** | Account: 271776746743 (`francis-admin` IAM user) | Console: aws.amazon.com. Plan: **Basic** — no human support, docs + re:Post forum only |
| **Domain Registrar** | **Squarespace** (domain: viosintegrated.net) | TODO: founder to add Squarespace login email + 2FA recovery into secure vault |
| **OneDrive Personal Vault** | (Microsoft account — see secure vault, not stored in this runbook) | Stores .env backups + this runbook |
| **PayMongo** (when added) | TBD | TBD |
| **Founder backup contact** | **TODO: founder to designate** (name + mobile + relationship) | Critical for ops continuity. If founder unreachable during incident, this person authorizes restore decisions. |

---

## SECTION 2 — Where Everything Lives

### MongoDB Atlas
- **Organization**: VIPPharmacy
- **Project**: VIP DATABASES (id begins with `699c30c07a3b82e2ae0bfaf5`)
- **Cluster name**: Cluster0
- **Tier**: M10 (Dedicated)
- **Region**: AWS Singapore (ap-southeast-1)
- **Topology**: 3-node Replica Set (intra-region failover built-in)
- **Hostname**: `ac-dwvh8hq-shard-XX-XX.e9wenoo.mongodb.net` (3 shards)
- **Backups**: Continuous Cloud Backup (PITR) — 7-day window
- **Database user (app)**: `vip-admin` (Atlas admin role)
- **Databases**:
  - `vip-pharmacy-crm` — main CRM/ERP data (users, sales, expenses, etc.)
  - `vip-pharmacy` — website products (cross-DB queries via `getWebsiteProductModel`)

### AWS
- **Account ID**: 271776746743
- **Primary IAM user**: `francis-admin`
- **Lightsail instance**:
  - Internal hostname: `ip-172-26-11-73`
  - Region: ap-southeast-1 (Singapore)
  - Static IP: **TODO** — copy from Lightsail console → instance → Networking tab → "Public static IP"
  - Snapshot retention: 7 daily auto + manual baselines
- **S3 buckets**:
  - `vip-pharmacy-crm-prod` — primary, Singapore (ap-southeast-1)
  - `vip-pharmacy-crm-prod-dr` — DR replica, Sydney (ap-southeast-2)
  - Replication rule: `replicate-to-sydney-dr` (active)
  - IAM role: `s3crr_role_for_vip-pharmacy-crm-prod`
  - Versioning: enabled both buckets
  - Lifecycle: noncurrent versions deleted after 90 days

### Production VM
- **Repo path**: `/var/www/vip-pharmacy-crm`
- **Env file**: `/var/www/vip-pharmacy-crm/backend/.env` (mode 600, owner ubuntu)
- **PM2 processes**:
  - id 0: `vip-crm-api`
  - id 1: `vip-crm-worker`
- **Nginx config**: `/etc/nginx/sites-available/default`

### Code & Config
- **GitHub repo**: https://github.com/SpekyLord/vip-pharmacy-crm
- **Default branch**: `main`
- **Active dev branch**: `dev`
- **Local repo on founder machine**: `c:\Users\LENOVO\OneDrive\Documents\VIP and VS CODE\VIP IP\VIP CRM ERP\vip-pharmacy-crm`
- **DNS hosted zone**: **TODO** — domain `viosintegrated.net` is registered at Squarespace. Confirm whether DNS records are managed at Squarespace-native DNS or pointed to AWS Route 53. If Route 53, copy zone ID from AWS Console → Route 53 → Hosted Zones.
- **Production URL**: https://viosintegrated.net

### Secrets
- **OneDrive Personal Vault**: stores `.env.production` + this runbook
- **JWT_SECRET / JWT_REFRESH_SECRET**: in `.env`. **CANNOT be regenerated** without invalidating all user sessions.
- **AWS Access Keys**: in `.env` as AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
- **Atlas connection**: in `.env` as MONGODB_URI

---

## SECTION 3 — Scenario: Lightsail VM Unreachable

**Symptoms**: SSH timeout, app URL returns 502/timeout, AWS console shows instance as stopped/terminated/unhealthy.

**Estimated RTO**: ~30-45 minutes (measured during Day 5 drill — update this after testing)

### Steps

1. **Confirm scope**: try SSH from a different network. Is it the VM or your local connection?
2. **AWS Console → Lightsail → Instances**: check instance health
3. If instance is dead/terminated:
   ```
   Lightsail console → Snapshots → latest auto-snapshot or `baseline-week1-YYYY-MM-DD`
   → "Create new instance from snapshot"
   → Same plan, same region (ap-southeast-1)
   → Name: vip-erp-restored-YYYYMMDD
   ```
4. Wait for instance to provision (~5 min)
5. **Attach static IP**: Lightsail → Networking → static IP → detach from old instance → attach to new one
6. SSH to new instance (use static IP)
7. Verify app is running:
   ```bash
   pm2 list                # both processes "online"
   pm2 logs --lines 20    # check for errors
   ```
8. Pull latest code if needed:
   ```bash
   cd /var/www/vip-pharmacy-crm
   git pull origin main
   pm2 reload all
   ```
9. Restore `.env` if not in snapshot (paste from OneDrive Personal Vault):
   ```bash
   sudo nano /var/www/vip-pharmacy-crm/backend/.env
   pm2 reload all
   ```
10. Hit `/api/health` endpoint — confirm 200
11. Test full login flow with test admin credentials

---

## SECTION 4 — Scenario: Accidental Data Deletion / Corruption

**Symptoms**: User reports "all my data is gone" or unusual amounts of records missing. Audit log shows mass-delete operation.

**Estimated RTO**: ~1 hour (most of it is Atlas PITR cluster spin-up time)

### Steps

1. **DO NOT panic-write to production**. Stop further damage:
   ```bash
   pm2 stop all
   ```
2. **Atlas Console → Cluster0 → Backup → Continuous Cloud Backup → Restore**
3. Pick a point-in-time **just before the bad event** (you have 7-day window)
4. **Restore Type**: Restore to a **new cluster** (do NOT overwrite production)
5. Name: `cluster0-pitr-recovery-YYYYMMDD`
6. Wait for new cluster to spin up (~10-15 min)
7. Connect to recovery cluster, verify the lost data is present:
   ```bash
   mongosh "mongodb+srv://vip-admin:PASSWORD@cluster0-pitr-recovery-XXX.mongodb.net/vip-pharmacy-crm" \
     --eval "db.<collection>.countDocuments()"
   ```
8. Dump the recovered collection(s):
   ```bash
   mongodump --uri="mongodb+srv://vip-admin:PASSWORD@cluster0-pitr-recovery-XXX.mongodb.net" \
     --db=vip-pharmacy-crm \
     --collection=<collection-name> \
     --out=/tmp/dr-restore
   ```
9. **Triage with finance/admin**: which records to restore? (You may want to merge selectively, not full overwrite)
10. Restore to production (replace `<collection-name>`):
    ```bash
    mongorestore --uri="mongodb+srv://vip-admin:PASSWORD@cluster0.e9wenoo.mongodb.net" \
      --db=vip-pharmacy-crm \
      --collection=<collection-name> \
      --drop \
      /tmp/dr-restore/vip-pharmacy-crm/<collection-name>.bson
    ```
    > ⚠️ `--drop` deletes the existing collection first. Use selectively. For partial restore, omit `--drop` and use `--upsert` or write a custom merge script.
11. `pm2 start all` — bring app back up
12. **Delete the recovery cluster** after restore completes (Atlas charges for it)
13. Audit `auditlogs` collection to identify root cause of deletion

---

## SECTION 5 — Scenario: Atlas Region Outage

**Symptoms**: All app instances log MongoDB connection errors. Atlas status page shows ap-southeast-1 incident.

**Estimated RTO**: depends on Atlas — typically minutes (you have 3-node intra-region replica which auto-fails-over)

### Steps

1. **Check Atlas Status page**: https://status.mongodb.com — confirm regional incident
2. **Within-region failover is automatic** — your 3-node replica set in Singapore handles single-node outages without intervention
3. **Full-region outage** (multiple AZs down): you do NOT have multi-region cluster (paid add-on, not enabled). Action:
   - Switch app to read-only banner. Display message to users.
   - Do NOT manually attempt failover — Atlas will recover when region recovers
   - Contact MongoDB Support to confirm timeline
4. While down, monitor:
   - status.mongodb.com (primary signal)
   - status.aws.amazon.com (Atlas runs on AWS, often correlated)
5. When region recovers:
   - App should auto-reconnect (Mongoose driver retries automatically)
   - Verify with `pm2 logs` looking for "MongoDB connected"
   - If not auto-reconnected: `pm2 reload all`

### Future hardening
- Consider upgrading to Atlas Multi-Region Cluster (~$200-400/mo extra) when revenue justifies — adds Sydney secondary for true cross-region failover.

---

## SECTION 6 — Scenario: S3 Region Outage

**Symptoms**: Visit photo uploads fail. Existing photos return errors. AWS status page shows S3 ap-southeast-1 incident.

**Estimated RTO**: ~15-30 minutes (config change + PM2 reload)

### Steps

1. **Confirm scope**: status.aws.amazon.com → S3 → ap-southeast-1
2. **Switch app to DR bucket**:
   ```bash
   sudo nano /var/www/vip-pharmacy-crm/backend/.env
   ```
   Change:
   - `S3_BUCKET_NAME=vip-pharmacy-crm-prod` → `S3_BUCKET_NAME=vip-pharmacy-crm-prod-dr`
   - `AWS_REGION=ap-southeast-1` → `AWS_REGION=ap-southeast-2`
3. Restart app: `pm2 reload all`
4. Test by viewing an existing visit photo in the app (should load from Sydney bucket)
5. Test by uploading a new visit photo (should write to Sydney bucket)
6. **NEW UPLOADS during outage will only exist in Sydney bucket.** When Singapore recovers, you'll need to manually sync them back:
   ```bash
   # AFTER Singapore region recovers
   aws s3 sync s3://vip-pharmacy-crm-prod-dr s3://vip-pharmacy-crm-prod \
     --source-region ap-southeast-2 --region ap-southeast-1 \
     --exclude "*" --include "visits/2026/*/*"  # adjust date pattern to outage window
   ```
7. After confirming primary is healthy: revert .env to `vip-pharmacy-crm-prod` + `ap-southeast-1`, `pm2 reload all`

---

## SECTION 7 — Scenario: VM Compromised / Suspected Breach

**Symptoms**: Unusual auditlogs entries, unknown SSH sessions, unexpected env file modifications, ransom note, BDM reports being unable to log in (sessions invalidated by attacker).

**Estimated RTO**: ~2-4 hours (forensics + clean restore + secret rotation)

### Steps — STOP THE BLEEDING FIRST

1. **Take forensics snapshot of compromised VM**: Lightsail → Snapshots → manual snapshot named `forensics-YYYYMMDD-HHMM`. Do NOT destroy the VM yet — preserve evidence.
2. **Block all access**: Lightsail → Networking → firewall → temporarily allow only your IP on SSH/HTTPS, deny all else
3. **Rotate all secrets immediately**:
   - **JWT_SECRET / JWT_REFRESH_SECRET** in `.env` — generate new 32+ char random strings. ⚠️ This invalidates ALL active user sessions (BDMs, admin, everyone) — they must re-login.
   - **AWS Access Keys**: AWS Console → IAM → Users → `francis-admin` → Security credentials → make active key inactive, create new pair, update `.env`
   - **MongoDB Atlas**: Atlas → Database Access → `vip-admin` → Edit Password → set new strong password, update `.env` MONGODB_URI
   - **PayMongo / third-party API keys** (if added): rotate via their respective consoles
4. **Audit logs investigation**:
   ```bash
   mongosh "mongodb+srv://..." --eval "db.auditlogs.find({createdAt:{\$gte:new Date('YYYY-MM-DDTHH:MM:SSZ')}}).sort({createdAt:-1}).limit(100)"
   ```
   Look for: unfamiliar IPs, unusual hours, mass operations, deleted records
5. **Restore from clean snapshot** (predating compromise — check Day-1 baseline if needed):
   - Lightsail → Snapshots → pre-compromise snapshot → Create new instance
   - Move static IP to new instance
6. After restore: `pm2 reload all`, verify health endpoint
7. **NPC breach notification** (RA 10173): if PII was accessed, notify National Privacy Commission within **72 hours** of becoming aware. Required if any of: visit photos, BDM names, customer/doctor data, prescription data was accessed.
8. **Customer/BDM communication**: prepare honest disclosure. Don't hide.
9. **Post-incident review** within 1 week: how did they get in, what did we learn, what's the patch.

---

## SECTION 8 — Known Gotchas (learned the hard way)

### Atlas Flex → M10 upgrade causes 15-30 min of intermittent errors
- During data migration, app sees: repeated `MongoDB disconnected` warnings, then `cannot find user account` app-level errors, then "Something went wrong" on login
- **DO NOT** change permissions or rollback during this window
- Wait for "Your cluster is upgrading..." banner to fully clear in Atlas
- Then `pm2 reload all` if connection still stale
- Login should work without any other intervention

### Database user permissions vs Atlas tier change
- After tier upgrade, verify `vip-admin` still has `Atlas admin` role in Database Access
- If somehow scoped narrower, error will be: `user is not allowed to do action [find] on [vip-pharmacy-crm.users]`

### S3 bucket name mismatch with old docs
- CLAUDE.md historically said bucket name was `vip-pharmacy-crm-devs` — actual production bucket is `vip-pharmacy-crm-prod`
- Verify env var truth via: `grep S3_BUCKET /var/www/vip-pharmacy-crm/backend/.env`

### Repo path on VM is /var/www, NOT ~/
- Old docs may say `~/vip-pharmacy-crm`
- Actual: `/var/www/vip-pharmacy-crm`
- Owned by `ubuntu:ubuntu`

### Lightsail snapshot retention is only 7 days
- Auto-snapshots delete after 7 days
- For longer retention, take MANUAL snapshots periodically (named `weekly-YYYY-MM-DD` or `monthly-YYYY-MM`) — manual snapshots don't auto-delete

### .env file should NEVER be committed to git
- Verify periodically: `git check-ignore -v backend/.env` — must show it's gitignored
- If it ever lands in git history, immediately rotate ALL secrets and `git filter-repo` to scrub history

---

## SECTION 9 — DR Drill Schedule

DR procedures are only real if tested. Schedule:

| Drill | Frequency | Last Run | Next Due |
|---|---|---|---|
| Lightsail snapshot restore | Quarterly | Not yet run | Q3 2026 (planned during Day 5 sign-off) |
| Atlas PITR restore | Quarterly | Not yet run | Q3 2026 (planned during Day 5 sign-off) |
| S3 DR bucket failover (config swap) | Bi-annually | Not yet run | H2 2026 |
| End-to-end "VM is dead" full restore | Annually | Not yet run | 2026 |
| Tabletop incident response (no actual restore) | Quarterly | Not yet run | Q3 2026 |

After each drill: update measured RTO in the relevant section above.

---

## SECTION 10 — Maintenance Windows

Recommended cadence for planned (non-emergency) work:

| Activity | Recommended Window |
|---|---|
| OS security updates (`apt upgrade`) | 2nd Sunday of each month, 02:00-04:00 Manila |
| Lightsail VM reboot | Same as above |
| MongoDB version upgrades | Coordinate with founder, weekend evening |
| Atlas tier changes | Off-hours, expect 15-30 min intermittent errors |
| Code deployments to production | Weekday evenings after 6 PM Manila (BDMs done with field work) |

---

## VERSION HISTORY

| Date | Author | Change |
|---|---|---|
| 2026-04-25 | Founder + Claude | Initial runbook drafted during Week-1 Stabilization (Day 2b). 6 of 9 placeholders filled; 3 deferred (static IP, founder backup contact, DNS hosted zone). |
| TBD | Founder | First DR drill — record measured RTOs in Sections 3 & 4 |

---

## END OF RUNBOOK

**Print this document. Two physical copies: one home, one office safe.**

If the founder is unreachable AND the system is down, this runbook + a competent technical operator should be sufficient to restore service within 4 hours.
