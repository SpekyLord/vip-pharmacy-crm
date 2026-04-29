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

**Drill measurements** (Day-5 DR drill — fill in during run):

| Date | Snapshot used | Provision time | SSH-ready time | Health-200 time | Total RTO | Operator notes |
|---|---|---|---|---|---|---|
| 2026-04-25 | TBD | TBD min | TBD min | TBD min | TBD min | TBD |

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

**Drill measurements** (Day-5 DR drill — fill in during run):

| Date | PITR target | Cluster spin-up | mongodump time | Dump file size | Total RTO | Operator notes |
|---|---|---|---|---|---|---|
| 2026-04-25 | ~1h ago | TBD min | TBD min | TBD MB | TBD min | TBD |

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
| Lightsail snapshot restore | Quarterly | ⏸ **PAUSED on AWS quota** — Service Quotas case open Apr 27 2026 (vCPU 10 → 40 requested). Procedure pre-staged in Section 9a. | Once quota approved, then quarterly |
| Atlas PITR restore | Quarterly | ✅ **PASSED 2026-04-25** (Drill #2, Day-5) — RTO TBD-backfill in Section 4 | 2026-07-25 (Q3) |
| S3 DR bucket sanity check (object count + fetch) | Quarterly | ✅ **PASSED 2026-04-25** (Drill #1, Day-5) — Singapore↔Sydney parity: 1,318 objects + sample JPEG byte-verified | 2026-07-25 (Q3) |
| S3 DR bucket failover (config swap, full traffic) | Bi-annually | Not yet run | H2 2026 |
| End-to-end "VM is dead" full restore | Annually | Not yet run | 2026 |
| Tabletop incident response (no actual restore) | Quarterly | Not yet run | Q3 2026 |

After each drill: update measured RTO in the relevant section above.

---

## SECTION 9a — Drill #3 Pre-Staged Procedure (Lightsail Snapshot Restore)

> **Status (as of 2026-04-27)**: BLOCKED on AWS Service Quotas case (EC2/Lightsail vCPU 10 → 40, status `Case opened`). Once approved, execute this procedure within the same week. This section is the planned-drill counterpart to Section 3 (which is the *incident* version of the same restore). Do not conflate: Section 3 fires under pressure with prod down; Section 9a fires deliberately, against a snapshot, with prod still running.

### Goal

Verify that a Lightsail snapshot can be restored to a working instance **without touching production**, and measure the real RTO so Section 3's "30-45 min" estimate becomes evidence rather than a guess.

### Pre-flight (do not start without all 5)

1. ☐ AWS Service Quotas case for Lightsail/EC2 vCPU is **Approved**, and current usage + 1 prod-equivalent instance fits under the new cap. Verify in Lightsail console → Account → Usage.
2. ☐ Confirm a recent Lightsail **snapshot** of the prod instance exists. Console → Snapshots → check timestamp ≤ 24h old. If not, take a manual snapshot named `drill3-baseline-YYYY-MM-DD` and wait for it to complete (~5-10 min).
3. ☐ Schedule a 90-minute window. BDMs not in active field hours (after 18:00 Manila or weekend morning).
4. ☐ A **secondary `.env`** file prepared in OneDrive Personal Vault, named `.env.drill3`, with: (a) `MONGODB_URI` pointed to a **throwaway Atlas PITR-restored cluster** OR commented out entirely, (b) `S3_BUCKET_NAME=vip-pharmacy-crm-prod-dr`, (c) `JWT_SECRET` regenerated (do not reuse prod's — restored instance must not mint tokens prod will accept).
5. ☐ Founder backup contact informed that drill is starting (so they don't think prod is down if they see the activity).

### Steps (timer starts at Step 2)

1. **T-0** — Open AWS Lightsail console → Snapshots. Note the snapshot name and timestamp you'll restore from.
2. **Provision** — Click snapshot → "Create new instance from snapshot". Settings:
   - Region: **ap-southeast-1** (snapshots are region-pinned — must match)
   - Plan: same as prod (do not downsize — RTO won't be representative)
   - Name: `vip-erp-drill3-YYYYMMDD`
   - **Do NOT attach the prod static IP.** Leave it on prod. The drill instance gets its own dynamic public IP.
3. **Wait for SSH-ready** — record the time the instance shows "Running" and SSH succeeds. Target: ≤ 5 min.
4. **Firewall lockdown** — Lightsail → Networking → firewall on the drill instance → restrict SSH (22) and HTTPS (443) to your operator IP only. Reject 0.0.0.0/0. Prevents accidental BDM traffic landing on the drill instance.
5. **Replace .env** — SSH in:
   ```bash
   sudo cp /var/www/vip-pharmacy-crm/backend/.env /var/www/vip-pharmacy-crm/backend/.env.snapshot-bak
   sudo nano /var/www/vip-pharmacy-crm/backend/.env
   # Paste contents of .env.drill3 from OneDrive Personal Vault
   sudo chown ubuntu:ubuntu /var/www/vip-pharmacy-crm/backend/.env
   sudo chmod 600 /var/www/vip-pharmacy-crm/backend/.env
   ```
   This step is the **dual-write firebreak**. Skipping it means the restored app reads AND writes to prod Atlas + prod S3.
6. **Reload PM2** — `pm2 reload all` and `pm2 logs --lines 50`. Look for `MongoDB connected` (against the throwaway cluster, NOT prod). If you see a connection to the prod cluster URI, **STOP and re-do Step 5 — you are now dual-writing to prod**.
7. **Smoke walk** — hit the drill instance's public IP directly (skip DNS, since drill IP isn't in DNS):
   - `curl https://<drill-public-ip>/api/health -k` → expect 200
   - Log in via browser using throwaway-cluster credentials → confirm dashboard loads
   - Open one VIP Client record → confirm products list (cross-DB read works)
   - DO NOT log a real visit (would write to throwaway cluster, fine, but no value in adding noise)
8. **Stop timer** — record `Total RTO` = (T-0 to "smoke green").
9. **Evidence capture** — screenshots: Lightsail console showing both instances running, PM2 logs showing connection to throwaway cluster, browser showing login + dashboard.

### Teardown (must complete same session)

10. **Stop PM2 on drill instance**: `pm2 stop all`
11. **Lightsail → drill instance → Stop, then Delete instance.** Confirm prod instance is still running.
12. **Delete throwaway Atlas PITR cluster** (Atlas charges hourly for it). Atlas → Clusters → recovery cluster → Terminate.
13. **Verify prod is untouched** — log into prod via normal URL, confirm BDM list / dashboard / recent visits look correct. Spot-check one document modified during the drill window — its `updated_at` should NOT have changed.
14. **Wipe `.env.drill3`** from local disk if it was copied out of OneDrive (it should never have left the vault, but verify).

### Pass criteria (all four required)

- ✅ Drill instance reached HTTP 200 on `/api/health` within ≤ 45 min (matches Section 3's RTO claim)
- ✅ Smoke walk passed against throwaway cluster (login + dashboard + cross-DB product read)
- ✅ Zero writes to prod Atlas during drill window (verify via Atlas → Cluster0 → Profiler or `auditlogs` check)
- ✅ Teardown complete — drill instance deleted, recovery cluster terminated, prod-only state restored

### Evidence log row (fill in after run, append to Section 3 measurements table)

| Date | Snapshot used | Provision time | SSH-ready time | Health-200 time | Total RTO | Operator notes |
|---|---|---|---|---|---|---|
| TBD | TBD | TBD min | TBD min | TBD min | TBD min | Drill #3 — first run after AWS quota approval |

### Failure modes to watch for

- **Restored instance can't reach Atlas** — likely .env points at a cluster IP-allowlist that doesn't include the drill instance's public IP. Add it temporarily; remove after teardown.
- **PM2 starts but app 500s** — check `pm2 logs`. Most common cause: the throwaway `JWT_SECRET` is < 32 chars (server.js validation rejects it). Regenerate to ≥ 32.
- **Smoke walk login fails** — throwaway cluster has no users. Either (a) seed one test admin via `npm run seed` against the throwaway cluster, or (b) restore the throwaway cluster from PITR with prod data and accept the data-handling risk for the 90-min drill window (then verify deletion in Step 12).
- **Snapshot restore stuck in "Pending" > 15 min** — Lightsail snapshot service has occasional regional slowness. If > 30 min, escalate via AWS Support case. Drill is paused, not failed.

---

## SECTION 9b — Tenant Guard Violation (production alert)

> Triggered by: `[ENTITY_GUARD_VIOLATION]` or `[BDM_GUARD_VIOLATION]` JSON line in `pm2 logs`, OR a MessageInbox alert titled `[GUARD] …` arriving in admin inbox. Both signals fire from [backend/middleware/entityGuard.js](../backend/middleware/entityGuard.js) and [bdmGuard.js](../backend/middleware/bdmGuard.js). Production runs on `ENTITY_GUARD_MODE=log` so the violation **does not break the request** — it only paints a target on a tenant-isolation leak we shipped.

### What it means

Two separate fingerprints, same procedure:

- **`entity_filter_missing`** — a query on a strict-entity model (e.g. `SmerEntry`, `ExpenseEntry`, `ChartOfAccounts`) ran with **no `entity_id` filter**. In a multi-tenant prod, that's a cross-tenant leak risk (Phase 23 / Phase G5 / Phase G4.5d bug class).
- **`bdm_silent_self_fill`** — a privileged user (admin / finance / president) hit a query whose `bdm_id` filter equals **their own _id**, but the request URL had **no `?bdm_id=` param**. That's the Rule #21 silent-self-fill: their results are wrong (empty, instead of the full entity scope).

### Steps

1. **Read the alert body or the log line.** The structured JSON includes:
   - `model` — the Mongoose model that ran the unfiltered query
   - `path` — the request path (`GET /api/erp/sales`)
   - `userId` / `role` / `entityId` / `requestId`
   - `filterKeys` (or `pipelineStages` for aggregates)
   - `stack` — first 6 non-`node_modules` frames; usually points straight at the controller line.

2. **Classify the violation** (per the Day-4 triage procedure):
   - **(a) Legitimate cross-entity read** — an admin all-entity dashboard, a consolidated finance report. Fix: in the route handler call `markCrossEntityAllowed(req, 'reason')` (see [backend/middleware/requestContext.js](../backend/middleware/requestContext.js)). Add a code comment explaining why the route is allowed cross-entity.
   - **(b) Missing entity filter — actual bug.** Add `entity_id: req.entityId` to the query. Reference Rule #21 if it's a `bdm_id` issue.
   - **(c) Wrong classification.** The model shouldn't be in `strict_entity` / `strict_entity_and_bdm`. Move it to `global` or `deferred_crm` in [backend/middleware/entityScopedModels.json](../backend/middleware/entityScopedModels.json) and update [docs/ENTITY_SCOPED_MODELS.md](ENTITY_SCOPED_MODELS.md).

3. **Verify dedup is working.** A flooding violation only fires ONE alert per `(kind, model, path)` per hour ([backend/middleware/guardAlerter.js](../backend/middleware/guardAlerter.js) `DEDUP_WINDOW_MS`). If you see >1 alert per hour for the same triple, restart `pm2` (in-process Map cleared) or check for clock skew.

4. **Once all observed violations are triaged**, flip prod from `log` to `throw`:
   ```bash
   # /var/www/vip-pharmacy-crm/backend/.env
   ENTITY_GUARD_MODE=throw
   BDM_GUARD_MODE=throw   # only after Rule #21 sweep covers all 9 endpoints
   ```
   Restart pm2. Any future leak will surface as a 500 in real time, caught by the controller's `catchAsync` and the global `errorHandler`.

5. **Roll back to `log` if `throw` causes 500 storms:**
   ```bash
   ENTITY_GUARD_MODE=log
   pm2 restart vip-api
   ```
   The structured log line still fires — you have 1 hour of dedup before the first alert lands, so triage is unblocked.

### Won't catch

- Background jobs / cron tasks — no AsyncLocalStorage context, guards skip silently. Audit those manually if a leak is suspected (see [backend/middleware/requestContext.js](../backend/middleware/requestContext.js) header comment for rationale).
- CRM-side models (Visit, Doctor, MessageInbox-CRM) — different tenant model (`user` / `assignedTo[]`), classified as `deferred_crm`. Week-2 pharmacy greenfield will introduce a parallel `userScopeGuard`.

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
| 2026-04-25 | Founder + Claude | Day 4 — added Section 9b (Tenant Guard Violation procedure) for ENTITY_GUARD / BDM_GUARD alerts. |
| 2026-04-25 | Founder | Day-5 DR Drills #1 (S3 parity) + #2 (Atlas PITR) — both PASSED. Drill #3 (Lightsail) paused on AWS vCPU quota. RTOs in Sections 3/4 still TBD-backfill. |
| 2026-04-27 | Founder + Claude | Section 9 schedule synced to actual Drill #1 + #2 results. Section 9a added — Drill #3 Lightsail snapshot-restore procedure pre-staged for execution post-quota-approval. |
| TBD | Founder | First Drill #3 run after AWS quota approval — record measured RTO + evidence in Sections 9a + 3. |
| 2026-04-28 | Founder + Claude | Section 10 added — Accounting Integrity Agent + Orphan Ledger Audit Agent operator procedures (manual trigger, expected output, alert routing, repair paths). |

---

## Section 10 — Accounting Integrity Alerts (added Apr 28 2026)

The system now runs two integrity agents on adjacent nightly slots. Both notify PRESIDENT (in_app + email) and ALL_ADMINS (in_app — covers admin/finance/president/ceo) via the standard `notify()` plumbing. They have different jobs and different repair paths.

### 10a. Orphan Ledger Audit (cron `0 3 * * *` Asia/Manila)

**What it checks**: any POSTED `Sale / Collection / PrfCalf` row whose `event_id` has NO matching POSTED `JournalEntry.source_event_id`. Scans all entities, no date window — persistent orphans keep alerting until fixed.

**Why it exists**: the auto-journal block in CR / CSI / PRF POST runs OUTSIDE the POST transaction. If the JE engine throws (COA mismatch, period lock, missing fund), the source doc stays POSTED but no JournalEntry exists — books silently inconsistent until BIR filing time.

**Manual trigger** (any operator with shell access):
```bash
cd backend
node scripts/runOrphanLedgerAuditOnce.js                     # via agent (full notification + AgentRun record)
node erp/scripts/findOrphanedLedgerEntries.js                # standalone, console output
node erp/scripts/findOrphanedLedgerEntries.js --csv          # CSV block for finance
node erp/scripts/findOrphanedLedgerEntries.js --module sales # one module
```

**Expected baseline (healthy system)**: agent.run() returns `status: 'success'`, summary `key_findings: ['Scanned N POSTED rows. No ledger orphans detected. ✓']`, 0 messages_sent.

**Alert priority routing**:
- `> 10 orphans` → priority `'high'` — investigate within the same business day. Likely a controller bug introduced recently (check git log for recent edits to `collectionController.js` / `salesController.js`).
- `1–10 orphans` → priority `'important'` — investigate within 48h. Often a one-off data error (missing COA mapping for a new vendor, period lock fired mid-write).

**Repair path** (per orphan):
1. Search `ErpAuditLog` for `event=LEDGER_ERROR` with `target_ref` matching the orphan's `doc_ref` — this captures why the JE engine threw.
2. Once "Retry JE" UI ships (Step 2 of the larger remediation plan): open the doc, click Retry.
3. Until then: open the doc → Reopen → Re-submit (the JE engine is idempotent on `source_event_id`, so this is safe).

### 10b. Accounting Integrity (cron `0 4 * * *` Asia/Manila)

**What it checks** — five strict + one informational check per entity per day:

| # | Check | Strict? | Source | Repair |
|---|---|---|---|---|
| 1 | Trial balance (cumulative + per-period) | ✅ | aggregate POSTED `JournalEntry.lines` | Search `ErpAuditLog` for direct-DB writes; recompute totals via `JE.save()` |
| 2 | Sub-ledger == control account (VAT + CWT) | ⓘ | `VatLedger / CwtLedger` vs GL | Informational — drift = VAT-portion of open A/R |
| 3 | JE-row math sanity | ✅ | per-row `total_debit == total_credit` + recompute | Open the JE in `/erp/journal`, re-save (pre-save validator recomputes) |
| 4 | IC over-settled | ✅ | POSTED `IcTransfer` vs POSTED `IcSettlement.settled_transfers` | Void the excess IcSettlement, re-issue with correct `settled_transfers` |
| 5 | Period-close readiness | ✅ | drafts in previous month across 6 collections | Post (or void) every draft listed before flipping the `PeriodLock` |

**Manual trigger**:
```bash
cd backend
node scripts/runAccountingIntegrityOnce.js                                # full agent run + notify
node scripts/runAccountingIntegrityOnce.js --entity 69cd76ec7f6beb5888bd1a53  # one entity
node scripts/runAccountingIntegrityOnce.js --period 2026-04                # specific period

node erp/scripts/findAccountingIntegrityIssues.js                          # standalone, full output
node erp/scripts/findAccountingIntegrityIssues.js --csv                    # CSV for finance
node erp/scripts/findAccountingIntegrityIssues.js --check tb               # one check (tb / subledger / jemath / ic / periodclose)
```

**Expected baseline (healthy system)**: 0 strict failures. Sub-ledger VAT/CWT drift shown as ⓘ informational — that's expected for accrual-GL vs cash-VatLedger PH setup; ignore unless the gap doesn't match open-AR-VAT.

**Alert priority routing**:
- TB out-of-balance OR JE-math drift > 0 → priority `'high'`. Books literally don't add up. Page on-call before BIR-deadline windows.
- Period-close drafts OR IC over-settled → priority `'important'`. Same-business-day investigation.

**Tolerance tuning** (Lookup category `ACCOUNTING_INTEGRITY_THRESHOLDS`, code `DEFAULT`):
- `tb_tolerance` (default 0.01): bank rounding to the cent. Don't raise above 0.10.
- `je_math_tolerance` (default 0.01): same rationale.
- `subledger_tolerance` (default 1.00): peso-rounding cushion across many rows.
- `ic_tolerance` (default 1.00): same rationale for inter-entity netting.
- `subledger_enforce` (default `false`): flip to `true` ONLY after the org commits to a single recognition basis end-to-end (pure accrual or pure cash). Otherwise daily false alarms — the PH JE engine writes OUTPUT_VAT to GL on Sale POST (accrual) but writes the VatLedger row on Collection POST (cash, for 2550Q filing).

Edit via Control Center → Lookup Tables → `ACCOUNTING_INTEGRITY_THRESHOLDS` → row `DEFAULT` → metadata. `insert_only_metadata: true` so admin edits survive auto-seed.

### 10c. Common false-alarm pitfalls

- **Sub-ledger drift complaint** ("OUTPUT_VAT GL doesn't match VatLedger"): expected by design. Drift = VAT on open A/R. Verify against the open-AR aging report. Don't flip `subledger_enforce` until the JE engine writes VatLedger inline (or the VAT is moved to cash basis end-to-end).
- **TB unbalanced after migration**: a script that did `JE.updateOne({...})` instead of `JE.save()` will skip the pre-save validator. Recompute via `for (const je of unbalanced) await je.save()` — pre-save will re-sum lines.
- **Period-close drafts after a holiday**: BDMs leave SalesLine drafts open. Post or void from `/erp/sales`. Don't lock the period until the draft list is empty.
- **IC over-settled after a void**: IcSettlement was voided but the IcTransfer it closed wasn't reopened. Manual journal correction may be required if the settled_transfers links can't be cleanly reversed.

---

## SECTION 11 — Operational Quickstart: Granting eBDM Proxy Access

> Operational, not disaster recovery. Lives in this RUNBOOK because it's the single
> page operators reach for when "set up a new clerk" comes in. Reflects every proxy
> phase shipped through Apr 29 2026 (G4.5a → G4.5bb).

### 11a. The proxy access model in one paragraph

The ERP has a two-layer gate for "do work on behalf of someone else" (proxy entry):

1. **Role gate** — the caller's role must appear in the `PROXY_ENTRY_ROLES.<MODULE>` lookup row's `metadata.roles` array (default `['admin', 'finance', 'president']`). To allow `staff` (eBDM) through, admin appends `'staff'` to that array.
2. **Sub-permission gate** — the caller's user record must have the matching sub-permission ticked under ERP Access Template (e.g. `expenses.proxy_entry`, `payroll.income_proxy`, `payroll.payslip_deduction_write`).

President and admin/finance always bypass both layers. CEO is always denied (view-only role).

For modules where the target is a BDM-shaped record (sales / collections / expenses / SMER / car logbook / PRF-CALF / undertaking / hospital PO / GRN / inventory / income / deduction schedule), the page also shows an `OwnerPicker` "Record on behalf of" dropdown so the proxy chooses the target BDM at write time.

### 11b. 3-step quickstart for a new eBDM clerk

> Goal: clerk `s22.vippharmacy@gmail.com` (role: staff) should be able to record expenses + sales + IncomeReports + DeductionSchedules on behalf of any field BDM, AND maintain the deduction lines on EMPLOYEE-type payslips for the Sales department.

#### Step 1 — Append `'staff'` to the `PROXY_ENTRY_ROLES` rows for the modules you want to delegate

Control Center → Lookup Tables → `PROXY_ENTRY_ROLES` → for each module the clerk needs (one row per code):

| Code | What it gates |
|---|---|
| `SALES` | Live CSI entry on behalf of a BDM |
| `OPENING_AR` | Pre-cutover CSI entry |
| `COLLECTIONS` | Collection receipts |
| `EXPENSES` | Expense Entry / OR |
| `GRN` | Goods Receipt |
| `CAR_LOGBOOK` | Daily driver log + per-fuel approvals |
| `PRF_CALF` | Partner rebate / CALF cash advance liquidation |
| `UNDERTAKING` | GRN receipt confirmation |
| `SMER` | Per-diem cycle + per-day override |
| `HOSPITAL_PO` | Hospital PO entry (Iloilo office proxy) |
| `INVENTORY` | Batch metadata + physical count (legacy bundled key) |
| `INCOME` | IncomeReport generation + manual deduction lines |
| `DEDUCTION_SCHEDULE` | Cash-advance / loan amortization schedules |

Edit each row → metadata → `roles` → append `"staff"`. Save. (Caches bust within milliseconds via the registered hot-reload set.)

#### Step 2 — Tick the matching sub-permissions on the clerk's ERP Access Template

People → `s22 Vip Pharmacy` → ERP Access Template → tick the sub-permissions:

| Module | Sub-permission key | Phase |
|---|---|---|
| `expenses` | `proxy_entry` | G4.5a |
| `expenses` | `car_logbook_proxy` | G4.5e |
| `expenses` | `prf_calf_proxy` | G4.5e |
| `expenses` | `smer_proxy` | G4.5f |
| `expenses` | `undertaking_proxy` | G4.5e |
| `sales` | `proxy_entry` | G4.5a |
| `sales` | `opening_ar_proxy` | G4.5a |
| `sales` | `hospital_po_proxy` | CSI-X1 |
| `collections` | `proxy_entry` | G4.5b |
| `inventory` | `grn_proxy_entry` | G4.5b |
| `inventory` | `batch_metadata_proxy` | G4.5z (split from legacy key) |
| `inventory` | `physical_count_proxy` | G4.5z (split from legacy key) |
| `payroll` | `income_proxy` | G4.5aa |
| `payroll` | `deduction_schedule_proxy` | G4.5aa |
| `payroll` | `payslip_deduction_write` | G4.5aa |
| `payroll` | `run_proxy` | G4.5cc (Compute + Submit Payroll Run for Approval Hub) |

Save the user. The clerk now has the role half AND the sub-permission half of every gate they need.

#### Step 2.5 — (Phase G4.5cc) Friday-payroll authority for the clerk

Phase G4.5cc lets a finance clerk run payroll and submit it for posting. Authority chain is split
cleanly: the `payroll.run_proxy` sub-perm tick is "who can RUN" (subscription-tunable per clerk),
while `MODULE_DEFAULT_ROLES.PAYROLL.metadata.roles` keeps its original meaning ("who AUTHORIZES on
the Hub" — admin/finance/president by default).

**To onboard a clerk on Friday-payroll authority:**

1. Tick `payroll.run_proxy` on the clerk's Access Template (Step 2 table above).
2. **Do NOT** add `'staff'` to `MODULE_DEFAULT_ROLES.PAYROLL.metadata.roles`. Doing so would let
   the clerk direct-post (gateApproval would treat them as authorized) AND would notify every
   staff user as a potential Hub approver. Both wrong.

That's it — one tick.

When the clerk submits a run, `postPayroll` calls `gateApproval` with `forceApproval=true` for
non-privileged callers, so the Hub holds the submission regardless of authorizer-list membership.
Admin / finance / president opens `/erp/approvals` on phone, sees ONE row "Post N payslips (total
₱X) — Submitted by <clerk>" (per-payslip rows are hidden by the run-cover dedup in
`MODULE_QUERIES.PAYROLL.query`), taps Approve, and the cascade handler (`payroll_run` in
`universalApprovalController.js`, registered in `MODULE_AUTO_POST.PAYROLL`) walks every matching
payslip COMPUTED → REVIEWED → APPROVED → POSTED with auto-emitted JEs in one round trip. Failures
are logged per-payslip; the approval decision is never rolled back.

#### Step 3 — (Optional, payslip-only) Constrain the clerk's payslip roster

For Phase G4.5bb (Apr 29 2026): if the clerk should only mutate deduction lines on a SUBSET of payslips (not entity-wide), add a row to `PAYSLIP_PROXY_ROSTER`.

Control Center → Lookup Tables → `PAYSLIP_PROXY_ROSTER` → `+ Add row`:

| Field | Value |
|---|---|
| `code` | The clerk's User `_id` as a string (copy from `/admin/employees` URL or DB) |
| `label` | Human-readable: e.g. `s22 — Sales department roster` |
| `metadata.scope_mode` | `ALL` (no constraint) · `PERSON_IDS` (specific employees) · `PERSON_TYPES` (e.g. `EMPLOYEE` only — exclude DIRECTOR/CONSULTANT) |
| `metadata.person_ids` | If scope_mode is `PERSON_IDS`: array of PeopleMaster `_id` strings |
| `metadata.person_types` | If scope_mode is `PERSON_TYPES`: e.g. `["EMPLOYEE"]` |
| `metadata.note` | Optional free text shown on the chip / banner |
| `is_active` | `true` |

**No row** = `scope_mode='ALL'` (entity-wide write — the G4.5aa default). The roster is opt-in, not required.

When restrictive, the staging list at `/erp/payroll` filters server-side to the roster, a purple chip explains the constraint, and any out-of-roster payslip opens read-only with a yellow banner.

### 11c. Verify the grant worked

1. Log in as the clerk.
2. Open the page they're now allowed to proxy — e.g. `/erp/expenses` or `/erp/my-income`.
3. Confirm a "Record on behalf of" dropdown is visible (purple border = optional self-fill, amber border = mandatory pick).
4. Pick a target BDM, file a record, watch it land under the target's `bdm_id` while audit fields (`created_by`, `proxied_by`, `entered_by`) reflect the clerk.
5. For payslip work: confirm the chip on `/erp/payroll` shows the roster scope, and that an out-of-roster payslip opens read-only.

### 11d. Revoke a grant

- Untick the sub-permissions on the user's Access Template → routes immediately reject with 403.
- OR remove `'staff'` from the relevant `PROXY_ENTRY_ROLES.<MODULE>` row → all staff-shaped users lose proxy access for that module simultaneously.
- OR set the clerk's `PAYSLIP_PROXY_ROSTER` row `is_active=false` → falls back to G4.5aa entity-wide behavior (the row is now ignored).

### 11e. Cache TTLs (for ops debugging)

- `PROXY_ENTRY_ROLES` / `VALID_OWNER_ROLES`: 60s cache, busted on lookup CRUD.
- `PAYSLIP_PROXY_ROSTER`: 60s cache per `(entityId, userId)`, busted on lookup CRUD.
- `ERP_DANGER_SUB_PERMISSIONS`: 5min cache.

If a grant doesn't take effect within ~10 seconds, check the lookup CRUD path actually hit the bust (server logs will show `invalidatePayslipRosterCache` calls). Worst case: bounce the backend pod.

---

## END OF RUNBOOK

**Print this document. Two physical copies: one home, one office safe.**

If the founder is unreachable AND the system is down, this runbook + a competent technical operator should be sufficient to restore service within 4 hours.
