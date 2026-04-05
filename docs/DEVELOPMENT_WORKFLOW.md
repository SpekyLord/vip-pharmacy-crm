# Development Workflow Guide

## VIP CRM

**Version:** 1.0  
**Last Updated:** April 2026

---

## Table of Contents

1. [Branch Strategy](#1-branch-strategy)
2. [MongoDB Dev Database Setup](#2-mongodb-dev-database-setup)
3. [Environment Configuration](#3-environment-configuration)
4. [Database Sync (Prod → Dev)](#4-database-sync-prod--dev)
5. [Git Workflow](#5-git-workflow)
6. [CI/CD Pipeline](#6-cicd-pipeline)
7. [S3 & File Storage](#7-s3--file-storage)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. Branch Strategy

### Branch Hierarchy

```
main (production)          ← Deployed to viosintegrated.net
  ↑ PR (merge when stable)
dev (staging/integration)  ← Test merges here first
  ↑ PR
feature/xxx                ← All new work starts here
erp-integration
bugfix/yyy
```

### Branch Roles

| Branch | Purpose | Protection | Deploys To |
|--------|---------|------------|------------|
| `main` | Production code | Protected — PR required, CI must pass | viosintegrated.net (Lightsail) |
| `dev` | Integration & testing | Protected — CI must pass | Local dev only (for now) |
| `feature/*`, `erp-integration`, etc. | Active development | No protection | Local dev only |

### Rules

- **Never push directly** to `main` — always go through a PR
- Feature branches are created **from `dev`**, merged back **into `dev`** via PR
- `dev` is merged into `main` **only when stable and tested**
- Use **squash merge** for feature → dev (clean history)
- Use **regular merge** for dev → main (preserve full context)

### Flow Diagram

```
feature/new-thing ──PR──→ dev ──PR──→ main ──deploy──→ Production
                           ↑                              │
                           │         sync script          │
                      dev database ←──────────────── prod database
```

---

## 2. MongoDB Dev Database Setup

### Overview

Both dev and prod databases live on the **same Atlas cluster** (`cluster0`). This keeps costs at zero while providing full isolation at the database level.

| Environment | CRM Database | Website Products DB |
|-------------|-------------|-------------------|
| **Production** | `vip-pharmacy-crm` | `vip-pharmacy` |
| **Development** | `vip-pharmacy-crm-dev` | `vip-pharmacy-dev` |

### Step-by-Step: Create Dev Database

#### 1. Create a Dev Atlas User (Recommended)

A dedicated user prevents accidental writes to production from a dev environment.

1. Go to [MongoDB Atlas Console](https://cloud.mongodb.com)
2. Navigate to **Database Access** → **Add New Database User**
3. Create user:
   - **Username:** `dev-user`
   - **Password:** Generate a strong password, save it securely
   - **Database User Privileges:** Select **"Only read and write to specific databases"**
     - Add: `vip-pharmacy-crm-dev` — Read and Write
     - Add: `vip-pharmacy-dev` — Read and Write
4. Click **Add User**

#### 2. Get the Dev Connection String

1. Go to **Database** → **Connect** on your cluster
2. Choose **"Connect your application"**
3. Copy the connection string
4. Replace `<username>` and `<password>` with the dev user credentials
5. Replace the database name with `vip-pharmacy-crm-dev`:

```
mongodb+srv://dev-user:<password>@cluster0.e9wenoo.mongodb.net/vip-pharmacy-crm-dev?retryWrites=true&w=majority
```

#### 3. Initialize the Dev Database

The dev database is created automatically when you first connect. You have two options:

**Option A: Run the sync script** (recommended — copies prod data):
```bash
./scripts/sync-prod-to-dev.sh
```

**Option B: Seed fresh data** (clean start):
```bash
# With your dev .env configured
cd backend
npm run seed
```

#### 4. Verify the Connection

```bash
# Start the backend with dev .env
cd backend
npm run dev
# You should see:
# MongoDB Connected: cluster0...
# Website DB Connected: vip-pharmacy-dev
```

---

## 3. Environment Configuration

### Dev vs Prod Environment Variables

Create your local `backend/.env` file with dev values. The key differences:

| Variable | Production | Development |
|----------|-----------|-------------|
| `NODE_ENV` | `production` | `development` |
| `MONGO_URI` | `mongodb+srv://vip-admin:...@cluster0.../vip-pharmacy-crm?...` | `mongodb+srv://dev-user:...@cluster0.../vip-pharmacy-crm-dev?...` |
| `WEBSITE_DB_NAME` | `vip-pharmacy` (or omit — it's the default) | `vip-pharmacy-dev` |
| `JWT_SECRET` | *(prod secret)* | *(different dev secret, 64+ chars)* |
| `JWT_REFRESH_SECRET` | *(prod secret)* | *(different dev secret, 64+ chars)* |
| `SES_SANDBOX_MODE` | `false` | `true` *(logs emails to console)* |
| `CORS_ORIGINS` | `https://viosintegrated.net` | *(leave empty for dev)* |
| `S3_BUCKET_NAME` | `vip-pharmacy-crm-prod` | `vip-pharmacy-crm-prod` *(shared — see S3 section)* |

### Setting Up Your Dev Environment

1. Copy the example file:
   ```bash
   cp backend/.env.example backend/.env
   ```

2. Update these values in `backend/.env`:
   ```bash
   NODE_ENV=development
   MONGO_URI=mongodb+srv://dev-user:<password>@cluster0.e9wenoo.mongodb.net/vip-pharmacy-crm-dev?retryWrites=true&w=majority
   WEBSITE_DB_NAME=vip-pharmacy-dev

   # Generate unique dev secrets (64+ characters each)
   JWT_SECRET=<your-dev-jwt-secret>
   JWT_REFRESH_SECRET=<your-dev-jwt-refresh-secret>

   # IMPORTANT: Keep sandbox mode ON in dev
   SES_SANDBOX_MODE=true
   ```

3. Frontend config (`frontend/.env.local`) — no changes needed for local dev:
   ```bash
   VITE_APP_ENV=development
   # VITE_API_URL is not set in dev — Vite proxy handles it
   ```

### Important Notes

- **JWT secrets MUST differ** between prod and dev. A token from prod won't work in dev and vice versa. This is intentional.
- **Never copy prod `.env` to dev and use it as-is.** Always change `MONGO_URI`, `WEBSITE_DB_NAME`, and JWT secrets.
- **`SES_SANDBOX_MODE=true`** is critical in dev — it prevents real emails from being sent.

---

## 4. Database Sync (Prod → Dev)

### Overview

The sync is **one-way only**: production → development. **Never sync dev → prod.**

The sync is **on-demand** — you run the script manually when you want fresh production data in dev. There is no automatic/scheduled sync.

### Prerequisites

Install [MongoDB Database Tools](https://www.mongodb.com/try/download/database-tools):

- **Windows:** Download the MSI installer or use `winget install MongoDB.DatabaseTools`
- **macOS:** `brew install mongodb-database-tools`
- **Linux:** `sudo apt install mongodb-database-tools` (Ubuntu/Debian)

Verify installation:
```bash
mongodump --version
mongorestore --version
```

### Running the Sync

```bash
# From project root
./scripts/sync-prod-to-dev.sh
```

The script will:
1. Dump the production CRM database (`vip-pharmacy-crm`)
2. Restore it into the dev database (`vip-pharmacy-crm-dev`) — **drops existing dev data**
3. Sanitize user passwords (all reset to `DevPass123!@#`)
4. Optionally sync the website products database (`vip-pharmacy` → `vip-pharmacy-dev`)
5. Clean up temporary dump files

### What Gets Synced

| Collection | Synced? | Notes |
|-----------|---------|-------|
| `users` | Yes | Passwords sanitized to `DevPass123!@#` |
| `doctors` | Yes | Full VIP Client data |
| `visits` | Yes | Includes S3 photo references (still work — same bucket) |
| `regions` | Yes | Full hierarchy |
| `productassignments` | Yes | Product-to-VIP Client mappings |
| `messageinboxes` | Yes | Message history |
| `auditlogs` | Yes | Audit trail (has 90-day TTL) |

### After Syncing

- All users in dev have password `DevPass123!@#`
- Login with any test account using this password
- S3 photo URLs in synced visits still work (shared bucket)
- Indexes are preserved during restore

### Sync Frequency

Sync when you need it — common scenarios:
- Starting work on a new feature that needs realistic data
- Before testing a migration script
- After major prod data changes (new BDMs, regions, etc.)

---

## 5. Git Workflow

### Starting a New Feature

```bash
# 1. Make sure dev is up to date
git checkout dev
git pull origin dev

# 2. Create your feature branch
git checkout -b feature/my-new-feature

# 3. Do your work, commit as you go
git add <files>
git commit -m "feat: add whatever"

# 4. Push your branch
git push -u origin feature/my-new-feature

# 5. Create a PR targeting dev (not main!)
gh pr create --base dev --title "feat: my new feature" --body "Description..."
```

### Merging Feature → Dev

1. Create PR from `feature/xxx` → `dev`
2. CI must pass (tests, lint, build)
3. Review the changes
4. **Squash merge** into `dev`
5. Delete the feature branch

### Merging Dev → Main (Release to Production)

```bash
# 1. Make sure dev is stable — all tests passing, features working
git checkout dev
git pull origin dev

# 2. Create a PR from dev → main
gh pr create --base main --head dev --title "release: merge dev to main" --body "Description of changes..."
```

1. CI must pass on the PR
2. Review all changes going to production
3. **Regular merge** (not squash — preserve the commit history)
4. Deploy to production (see Deployment Guide)

### Current ERP Integration Branch

The `erp-integration` branch predates `dev`. To integrate it:

```bash
# After creating the dev branch from main:
git checkout erp-integration
git rebase dev
git push --force-with-lease origin erp-integration

# Then create a PR: erp-integration → dev
```

### Hotfix Workflow

For urgent production fixes:

```bash
# 1. Branch from main
git checkout main
git pull origin main
git checkout -b hotfix/critical-fix

# 2. Fix the issue, commit

# 3. PR directly to main (skip dev for urgency)
gh pr create --base main --title "hotfix: fix critical issue"

# 4. After merging to main, backport to dev
git checkout dev
git pull origin dev
git merge main
git push origin dev
```

---

## 6. CI/CD Pipeline

### What Triggers CI

| Event | Branches | Runs CI? |
|-------|----------|----------|
| Push | `main`, `dev` | Yes |
| Pull Request | Any → Any | Yes |

### CI Steps

The GitHub Actions workflow (`.github/workflows/ci.yml`) runs:

1. **Install dependencies** — backend + frontend `npm ci`
2. **Backend startup check** — validates production-like config
3. **Backend tests** — unit tests + smoke tests
4. **Frontend lint** — risk-based linting on changed files
5. **Frontend build** — production build verification
6. **Dependency audit** — critical vulnerabilities gate, high+ report

### CI Must Pass Before Merging

Both `dev` and `main` require CI to pass before PRs can be merged. If CI fails:

1. Check the GitHub Actions tab for error details
2. Fix locally on your feature branch
3. Push again — CI re-runs automatically

---

## 7. S3 & File Storage

### Current Strategy: Shared Bucket

Both dev and prod use the **same S3 bucket** (`vip-pharmacy-crm-prod`).

| Scenario | How It Works |
|----------|-------------|
| Viewing synced prod visits in dev | S3 URLs in DB point to prod bucket — works fine |
| Uploading new photos in dev | Goes to same bucket — acceptable for small team |
| Deleting in dev | Could affect prod data — **be careful with delete operations** |

### Guidelines

- **Reading/viewing** images in dev: No issues, works naturally
- **Uploading** in dev: Fine for testing, photos go to same bucket
- **Deleting** in dev: Avoid bulk delete operations that could remove prod images
- **Future option**: Create a `vip-pharmacy-crm-dev` bucket if isolation is needed

### If You Need Bucket Isolation Later

1. Create a new S3 bucket: `vip-pharmacy-crm-dev`
2. Set `S3_BUCKET_NAME=vip-pharmacy-crm-dev` in dev `.env`
3. Synced visit photo URLs will break (they reference prod bucket paths)
4. New uploads will go to the dev bucket

---

## 8. Troubleshooting

### "Website database not connected" Error

Make sure `WEBSITE_DB_NAME` is set in your `.env`:
```bash
WEBSITE_DB_NAME=vip-pharmacy-dev
```

If omitted, it defaults to `vip-pharmacy` (the prod website DB). This is fine for read-only access but set it to `vip-pharmacy-dev` if you want full isolation.

### "JWT Secret must be at least 64 characters" on Startup

Generate proper dev secrets:
```bash
# Generate a 64-character hex string
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### Can't Login After Sync

After running the sync script, all passwords are reset to `DevPass123!@#`. Use this password for any user account.

### CI Failing on Dev Branch

Check the specific step that failed in GitHub Actions:
- **Startup check fails**: Usually a config validation issue — check env vars in the CI workflow
- **Tests fail**: Read the test output, fix on your feature branch, push again
- **Build fails**: Usually a TypeScript/import error — check the build log

### Merge Conflicts Between Dev and Main

```bash
# On your dev branch
git checkout dev
git pull origin dev
git merge main
# Resolve conflicts
git add <resolved-files>
git commit -m "merge: resolve conflicts with main"
git push origin dev
```

### mongodump/mongorestore Not Found

Install MongoDB Database Tools:
- **Windows:** `winget install MongoDB.DatabaseTools`
- **macOS:** `brew install mongodb-database-tools`
- **Linux:** `sudo apt install mongodb-database-tools`

---

## Quick Reference

### Daily Development

```bash
git checkout dev && git pull origin dev    # Start fresh
git checkout -b feature/xxx               # New feature branch
# ... code, commit, push ...
gh pr create --base dev                    # PR to dev
```

### Release to Production

```bash
gh pr create --base main --head dev        # PR dev → main
# After merge: deploy via SSH to Lightsail
```

### Refresh Dev Database

```bash
./scripts/sync-prod-to-dev.sh             # Copy prod data to dev
# All passwords become: DevPass123!@#
```
