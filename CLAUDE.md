# VIP CRM - Project Context

This file provides essential context for AI assistants working on this project. Read this before making any implementation decisions.

> **Last Updated**: April 2026
> **Version**: 5.0
> **Status**: CRM Phase 1 Complete. Client change requests (17 items) documented in `docs/CHANGE_LOG.md`. ERP context in `CLAUDE-ERP.md`.

---

## Terminology Mapping (Business Terms vs Code)

> **Important**: Documentation uses business terminology (BDM, VIP Client). The code was renamed but the business still uses the original terms.
>
> **Phase S2 (Apr 2026)**: the auth-tier role string for non-management users was renamed from `employee` / `contractor` to `staff`. Rationale: the VIP business is hiring actual W-2 employees who do BDM-style work (and get promoted to BDM if they perform), so `contractor` on a W-2 employee's profile was misleading. Employment nature (contractor vs. employee) now lives on `PeopleMaster.employment_type` (`REGULAR` / `PROBATIONARY` / `CONTRACTUAL` / `CONSULTANT` / `PARTNERSHIP`). `User.role` is purely the auth tier.

| Business Term | Code Term | Key File |
|---|---|---|
| **VIP Client** | Doctor | `backend/models/Doctor.js` |
| **BDM** (Business Development Manager) | staff (role) — was `employee` / `contractor` pre-Phase S2 | `backend/models/User.js` role enum |
| VIP Client list | DoctorList | `frontend/src/components/employee/DoctorList.jsx` |
| BDM Dashboard | EmployeeDashboard | `frontend/src/pages/employee/EmployeeDashboard.jsx` |
| VIP Client service | doctorService | `frontend/src/services/doctorService.js` |
| VIP Client controller | doctorController | `backend/controllers/doctorController.js` |
| VIP Client routes | doctorRoutes | `backend/routes/doctorRoutes.js` → `/api/doctors` |
| BDM Management | EmployeeManagement | `frontend/src/components/admin/EmployeeManagement.jsx` |
| BDM Visit Report | EmployeeVisitReport | `frontend/src/components/admin/EmployeeVisitReport.jsx` |

When writing code, use the **code terms** (Doctor, `ROLES.STAFF`). When writing UI labels and documentation, use the **business terms** (VIP Client, BDM). The directory and file names (`frontend/src/components/employee/*`, `EmployeeManagement.jsx`) pre-date the rename and were left untouched — they reference the legacy role name but the runtime role string is now `staff`.

---

## Project Overview

**VIP CRM** is a pharmaceutical field sales management system designed for Business Development Managers (BDM) to track VIP Client visits, manage product assignments, and ensure compliance with visit schedules.

### Client's Desired System Flow

See `docs/CHANGE_LOG.md` for the full 17 change requests. The target system flow is:

```
Excel CPT (BDM creates)
  → Gives to Admin
    → Admin reviews, then uploads to CRM
      → Admin approves entire batch
        → VIP Client profiles + Schedule imported
          → Schedule loops every 4-week cycle (anchored to Jan 5, 2026)
            → BDM logs visits on phone (photo + engagement type)
              → Only scheduled + carried VIP Clients are visitable
                → Missed visits auto-carry until end of cycle (W4D5 = hard cutoff)
                  → Extra visits allowed but don't count ahead
                    → Up to 30 extra calls (non-VIP) per day
                      → DCR Summary auto-calculates Call Rate + daily MD count
                        → Admin & BDM monitor performance
                          → Every ~3 months: export → edit → re-upload → cycle repeats
```

**Device usage**: Phone is primary device for BDMs (daily CRM work). Tablet is ONLY for presenting product images to VIP Clients during visits.

---

## Business Rules (MUST Follow)

### 1. Visit Frequency Rules
- **Weekly Limit**: Maximum ONE visit per VIP Client per week (Monday-Friday only)
- **Monthly Quota**: Based on VIP Client's `visitFrequency` setting:
  - `2` = Maximum 2 visits per month (alternating weeks: W1+W3 or W2+W4)
  - `4` = Maximum 4 visits per month (1 per week)
- **Enforcement**: These are HARD LIMITS - the system must BLOCK excess visits, not just warn
- **Week Definition**: Calendar weeks, work days only (Monday = Day 1, Friday = Day 5)
- **Blocking after visit**: Once visited this week, VIP Client is blocked — UNLESS carried/missed weeks exist to clear
- **Current week priority**: When logging, tick off **current week first**, then carried weeks (oldest first). Example: W1 missed, now W2 → first log = W2, second log = W1.
- **No advance credit**: Extra visits in W1 do NOT count for W2/W3/W4

### 2. Role Hierarchy
| Business Name | Code Role | Description | Access |
|---|---|---|---|
| Admin | `admin` | System administrator | Full access to all regions, users, and data |
| MedRep | `medrep` | Medical representative manager | Manages product-to-VIP Client assignments (being removed — see CHANGE_LOG Change 1) |
| BDM | `employee` | Business Development Manager | Logs visits, sees only assigned region's VIP Clients |

**Important**: There is NO "manager" role. Admin handles management functions.

### 3. Visit Proof Requirements
Every visit MUST include:
- GPS coordinates (latitude, longitude, accuracy)
- At least ONE photo as proof (1-10 photos per visit)
- Visit date (must be a work day)

### 4. Assignment-Based Access
- BDMs can ONLY see VIP Clients assigned to them via `assignedTo` field on Doctor model
- BDMs can ONLY log visits for VIP Clients they are assigned to
- Admins can see and access ALL VIP Clients
- **Note**: The legacy Region model has been removed. Access is now assignment-based, not region-based.

### 5. VIP Client Categorization
- Use `visitFrequency: 2` or `visitFrequency: 4`
- Do NOT use A/B/C/D categories (deprecated)

---

## Technology Stack (LOCKED)

These decisions are final. Do not suggest alternatives.

| Component | Technology | Notes |
|-----------|------------|-------|
| **Backend** | Express.js + Node.js | REST API |
| **Frontend** | React + Vite | SPA with React Router |
| **Database** | MongoDB Atlas | Cloud-hosted (cluster0.wv27nfk.mongodb.net) |
| **Hosting** | AWS Lightsail | NOT a VPS provider |
| **Image Storage** | AWS S3 | NOT Cloudinary. Bucket: `vip-pharmacy-crm-prod` (shared by dev + prod — see [docs/DEVELOPMENT_WORKFLOW.md](docs/DEVELOPMENT_WORKFLOW.md)). |
| **Authentication** | JWT | httpOnly cookies (NOT localStorage). Access (15min) + Refresh (7d) |

### AWS Configuration
- Default Region: `ap-southeast-1` (configurable via env)
- S3 Bucket Structure:
  - `visits/` - Visit proof photos
  - `products/` - Product images
  - `avatars/` - User profile pictures
- Signed URL expiry: 1 hour

---

## Database Schema Key Points

### Visit Model - Weekly Tracking Fields
```javascript
// backend/models/Visit.js
{
  doctor: ObjectId,        // References Doctor model (VIP Client)
  user: ObjectId,          // References User model (BDM)
  weekNumber: Number,      // 1-53 (ISO week number)
  weekOfMonth: Number,     // 1-5 (week within month)
  dayOfWeek: Number,       // 1-5 (Mon-Fri only)
  weekLabel: String,       // "W2D3" format
  monthYear: String,       // "2026-02" format
  yearWeekKey: String      // "2026-W07" format (for unique constraint)
}
```

### Unique Constraint for Visit Enforcement
```javascript
// Compound unique index prevents duplicate visits
{ doctor: 1, user: 1, yearWeekKey: 1 } // unique: true
```

### Cross-Database Product Pattern
Products live in a separate `vip-pharmacy` database. **Never use Mongoose `populate()` for products.** Instead:
```javascript
const { getWebsiteProductModel } = require('../models/WebsiteProduct');
const Product = getWebsiteProductModel();
const products = await Product.find({ _id: { $in: productIds } }).select('name category').lean();
```

---

## What's IN Scope

### Phase 1 (COMPLETE)
- User authentication (login, logout, token refresh, password reset)
- VIP Client management (CRUD, region assignment, cascading dropdowns)
- Visit logging with GPS + photo proof
- Weekly/monthly visit enforcement
- Product catalog management (reads from website DB)
- Product-to-VIP Client assignments
- BDM Visit Report with Excel/CSV export (Call Plan Template format)
- Admin dashboard with all-region access
- BDM dashboard with assigned-region access
- MedRep dashboard with product assignment
- Messaging system (admin → BDM)
- Security hardening (httpOnly cookies, account lockout, audit logging)

### Upcoming Phases (see `docs/CHANGE_LOG.md` for details)
- **Phase A**: VIP Client model field extensions, 2x alternating week rule, remove MedRep role, BDM edit own VIP Clients
- **Phase B**: VIP Client info page, product detail popup, photo upload flexibility, engagement tracking, regular clients, filters by support/program
- **Phase C**: 4-week schedule calendar, Call Planning Tool (CPT), Excel import/export, VIP count minimums
- **Phase D**: Admin per-BDM DCR Summary, wire up scaffolded pages, deployment

---

## SaaS Spin-Out Scope (Year 2 — Pharmacy SaaS / Vios Software Solutions)

> **Strategic intent (locked Apr 29 2026)**: the rebate engine is the proprietary moat. It does NOT ship to SaaS subscribers. The CRM SaaS bundle = field sales + BDM management + VIP Client management + Visits + CPT + CLM + Messaging + Stats. Nothing else.

### Proprietary — RELOCATED `/admin/*` → `/erp/*` Apr 29 2026 evening (Phase 1 of Rebate Stack Relocation)

The eight pages below were moved from `frontend/src/pages/admin/` to `frontend/src/erp/pages/` and re-routed from `/admin/*` to `/erp/*`. Old `/admin/*` paths remain as 30-day redirect shims in App.jsx (remove after May 29 2026). Backend routes were already under `backend/erp/routes/` — frontend-only relocation. UX hardening (schema fixes for `MdProductRebate.hospital_id`, payout routing to PRF/CALF, `client_type` filter on partner dropdowns, ProductMaster swap, calculation_mode toggle on non-MD) is **Phase 2A/2B**, separate.

| Sidebar Label | New Route | Page | Reason it's proprietary |
|---|---|---|---|
| MD Rebate Matrix | `/erp/rebate-matrix` | `erp/pages/RebateMatrixPage.jsx` | Per (MD × Hospital × Product × %) — the proprietary moat |
| Non-MD Rebate | `/erp/non-md-rebate-matrix` | `erp/pages/NonMdRebateMatrixPage.jsx` | Pharmacy partnership economics |
| Capitation | `/erp/capitation-rules` | `erp/pages/CapitationRulesPage.jsx` | Online-pharmacy MD per-patient pay (VIP-1.D) |
| Commission Matrix | `/erp/commission-matrix` | `erp/pages/CommissionMatrixPage.jsx` | Wired to rebate/incentive ledger; per-line BDM commission |
| Payout Ledger | `/erp/payout-ledger` | `erp/pages/PayoutLedgerPage.jsx` | Reads `IncentivePayout` + PRF/CALF from rebate engine |
| BIR Compliance | `/erp/bir` | `erp/pages/BIRCompliancePage.jsx` | VIP's filings (1601-EQ, 2550Q, 2307, etc.); subscribers run their own books |
| BIR Form Detail | `/erp/bir/:formCode/:year/:period` | `erp/pages/BirVatReturnDetailPage.jsx` | 2550M / 2550Q form-detail sub-page of BIR Compliance |
| SC/PWD Sales Book | `/erp/scpwd-sales-book` | `erp/pages/SCPWDSalesBookPage.jsx` | RA 9994 + BIR RR 7-2010 — VIP's filings |

**All-mode payout routing (locked Apr 29 2026)**: per "for simplicity in accounting put it to one place and just internal" decision, ALL Tier-A MD rebate accruals route to PRF/CALF balances (the per-MD bucket model PrfCalf already supports). No `IncentivePayout` PAID_DIRECT path for MD rebates — outflows happen via PRF disbursement when admin spends on legitimate CME / patient programs / advisory honoraria with formal MOA. Avoids PRC Code of Ethics kickback exposure. Phase 2A wires this routing.

**Why this matters**: when Year-2 multi-tenant kicks in, every line of CRM-frontend code that's not behind a tenant-isolation gate becomes a leak risk (Rule #0d — "a leak across tenants is an end-of-business event in regulated SaaS"). The relocation closes that gap before the SaaS bundle is cut.

### Subscriber-shippable (stays in CRM frontend)

VIP Client mgmt, BDM mgmt, Visits, Reports, Statistics, Activity Monitor, GPS Verification, Comm Logs, Message Templates, Settings (lookup-driven config), CLM, CPT, Excel import/export.

---

## What's OUT of Scope

| Feature | Status | Notes |
|---------|--------|-------|
| Mobile native apps | Not planned | Web-only, phone-first responsive |
| Offline mode | Phase D (deferred) | Service workers, IndexedDB |
| VIP Client A/B/C/D categories | Deprecated | Use visitFrequency instead |
| Cloudinary integration | Removed | Use AWS S3 |
| Generic VPS hosting | Removed | Use AWS Lightsail |
| Rebate engine in CRM SaaS | Proprietary | Move to `/erp/*` before SaaS spin-out (see "SaaS Spin-Out Scope" above) |

---

## /schedule Policy (Locked May 01 2026)

`/schedule` (remote agents on cron / one-shot) is **opt-in for narrow, high-value cases only** — not a general productivity layer. Cost-benefit decided May 01 2026:

**Use `/schedule` for:**
1. **Dated one-shot cleanups** — concrete deletion/cleanup PRs tied to a known future date (e.g., 30-day redirect-shim removals, time-limited migration sweeps). Currently scheduled:
   - **May 28 2026 16:00 UTC** — Remove `/admin/*` redirect shims for the rebate-stack relocation (Phase 1, locked Apr 29 2026, commit 328ade3). Routine ID `trig_011Lcy2dn9Db5xpe3WYmMGps`. Idempotent — exits cleanly if shims already removed.
2. **Time-bounded grace windows** — when a hardcoded TODO says "remove once X ages N days." Example candidate: MD-merge 30-day hard-delete cron (CLAUDE.md note 12b — defer until first audit row ages, then schedule a recurring weekly sweep).

**Do NOT use `/schedule` for:**
- Healthcheck sweeps — already run per-phase, every commit. Recurring agent duplicates work + burns tokens on green runs.
- Auto-commit / auto-push — chronic "DO NOT git add ." intermingling means a background agent will sweep up unrelated WIP. Shipping risk far exceeds convenience value.
- PR babysitting / triage — Gregg ships 2–3 phases/day with hands-on Playwright ratification. No bottleneck to automate.
- Memory/handoff cleanup — these are *now* work, not scheduled work. Do them in-session.

**Why locked:** annual cost of recurring agents is non-trivial (~$10–15/yr each). Two yeses above cost ~$10/yr combined and replace cognitive load that would otherwise rot. Everything else is ceremony. Re-evaluate when a new dated cleanup or a true subscriber-facing recurring sweep appears.

---

## API Patterns

### Response Format
```json
{
  "success": true,
  "message": "Operation completed",
  "data": { ... },
  "pagination": { "page": 1, "limit": 20, "total": 100 }
}
```

### Error Response
```json
{
  "success": false,
  "message": "Error description",
  "errors": [{ "field": "email", "message": "Invalid format" }]
}
```

### Visit Limit Error Response
```json
{
  "success": false,
  "message": "Weekly visit limit reached for this VIP Client",
  "data": {
    "weeklyCount": 1,
    "monthlyCount": 2,
    "monthlyLimit": 2
  }
}
```

---

## File Structure

```
vip-pharmacy-crm/
├── backend/
│   ├── config/
│   │   ├── db.js              # MongoDB connection
│   │   ├── s3.js              # AWS S3 integration
│   │   └── websiteDb.js       # Dual DB connection for website products
│   ├── controllers/
│   │   ├── authController.js          # Login, register, password reset, lockout
│   │   ├── userController.js          # User CRUD, profile management
│   │   ├── doctorController.js        # VIP Client CRUD with assignment filter
│   │   ├── visitController.js         # Visit logging with enforcement
│   │   ├── productController.js       # Product CRUD (reads from website DB)
│   │   ├── productAssignmentController.js  # Product-to-VIP Client assignments
│   │   ├── messageInboxController.js  # Admin→BDM messaging
│   │   ├── communicationLogController.js  # Communication log CRUD + API messaging
│   │   └── messageTemplateController.js   # Template CRUD + send-from-template
│   ├── middleware/
│   │   ├── auth.js            # JWT protect, optionalAuth, verifyRefreshToken
│   │   ├── roleCheck.js       # adminOnly, medRepOnly, employeeOnly, etc.
│   │   ├── errorHandler.js    # Global error handling, catchAsync, custom errors
│   │   ├── validation.js      # Express-validator rules
│   │   └── upload.js          # Multer + S3 processors
│   ├── models/
│   │   ├── User.js            # Admin, medrep, employee roles; lockout fields
│   │   ├── Doctor.js          # VIP Client: visitFrequency (2/4), assignment-based
│   │   ├── Visit.js           # Weekly tracking, GPS, photos, unique constraint
│   │   ├── ProductAssignment.js  # Product-to-VIP Client assignments
│   │   ├── WebsiteProduct.js  # Read-only website products (separate DB)
│   │   ├── MessageInbox.js    # Admin→BDM messages with categories/priority
│   │   ├── AuditLog.js        # Security audit logging (90-day TTL)
│   │   ├── CommunicationLog.js    # Multi-channel BDM-client interaction log
│   │   └── MessageTemplate.js     # Admin-created reusable message templates
│   ├── routes/
│   │   ├── authRoutes.js      # /api/auth
│   │   ├── userRoutes.js      # /api/users
│   │   ├── doctorRoutes.js    # /api/doctors (VIP Clients)
│   │   ├── visitRoutes.js     # /api/visits
│   │   ├── productRoutes.js   # /api/products
│   │   ├── productAssignmentRoutes.js  # /api/assignments
│   │   ├── messageInbox.js    # /api/messages
│   │   ├── sentRoutes.js      # /api/sent (admin sent messages)
│   │   ├── communicationLogRoutes.js  # /api/communication-logs
│   │   ├── messageTemplateRoutes.js   # /api/message-templates
│   │   └── webhookRoutes.js           # /api/webhooks (WhatsApp/Messenger/Viber + auto-reply)
│   ├── utils/
│   │   ├── generateToken.js       # JWT access + refresh tokens
│   │   ├── validateWeeklyVisit.js # Visit limit enforcement
│   │   ├── controllerHelpers.js   # Shared controller utilities
│   │   ├── auditLogger.js        # Security event logging
│   │   ├── calculateProgress.js   # Progress calculation helpers
│   │   ├── pagination.js         # Pagination utilities
│   │   └── autoReply.js          # Chatbot auto-reply (business hours check)
│   ├── scripts/
│   │   ├── seedData.js        # Seed data for testing (npm run seed)
│   │   └── fixVisitWeeks.js   # Migration script for visit week data
│   └── server.js              # Express app, all routes mounted, health check
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── auth/
│   │   │   │   ├── LoginForm.jsx         # Email/password form
│   │   │   │   └── ProtectedRoute.jsx    # Role-based route protection
│   │   │   ├── common/
│   │   │   │   ├── Navbar.jsx            # User info and logout
│   │   │   │   ├── Sidebar.jsx           # Role-based navigation
│   │   │   │   ├── LoadingSpinner.jsx    # Loading states
│   │   │   │   ├── ErrorMessage.jsx      # Error display with retry
│   │   │   │   ├── ErrorBoundary.jsx     # Catches React errors
│   │   │   │   ├── Pagination.jsx        # Shared pagination (React.memo)
│   │   │   │   ├── NotificationCenter.jsx # Notification bell (scaffolded)
│   │   │   │   └── MapView.jsx           # Reusable map component
│   │   │   ├── employee/                  # BDM components
│   │   │   │   ├── DoctorList.jsx        # VIP Client list (React.memo, visit status)
│   │   │   │   ├── VisitLogger.jsx       # FormData upload, GPS, products
│   │   │   │   ├── CameraCapture.jsx     # GPS watchPosition, 5-min timeout
│   │   │   │   ├── ProductRecommendations.jsx # Assigned products display
│   │   │   │   ├── MessageBox.jsx        # BDM inbox UI
│   │   │   │   ├── AdminSentMessageBox.jsx # View admin sent messages
│   │   │   │   ├── CommLogForm.jsx          # Screenshot upload form for interactions
│   │   │   │   ├── CommLogList.jsx          # Communication log list with filters
│   │   │   │   └── MessageComposer.jsx      # Send messages via API (Phase 2)
│   │   │   ├── admin/
│   │   │   │   ├── Dashboard.jsx         # Admin stats display
│   │   │   │   ├── DoctorManagement.jsx  # VIP Client CRUD
│   │   │   │   ├── EmployeeManagement.jsx # BDM CRUD, multi-entity assignment
│   │   │   │   ├── ProductManagement.jsx # Product CRUD
│   │   │   │   ├── EmployeeVisitReport.jsx # Call Plan Template format report
│   │   │   │   ├── VisitApproval.jsx     # Scaffolded (mock data)
│   │   │   │   ├── LiveActivityFeed.jsx  # Scaffolded (mock data)
│   │   │   │   ├── ActivityDetailModal.jsx # Activity detail popup
│   │   │   │   ├── VisitLocationMap.jsx  # GPS verification map (400m threshold)
│   │   │   │   ├── EmployeeAnalytics.jsx # Scaffolded (no data source)
│   │   │   │   ├── PerformanceChart.jsx  # Scaffolded (no data source)
│   │   │   │   └── ReportGenerator.jsx   # Report generation
│   │   │   └── medrep/
│   │   │       ├── ProductAssignment.jsx     # Assignment cards, filtering
│   │   │       └── DoctorProductMapping.jsx  # VIP Client-product assignments
│   │   ├── context/
│   │   │   └── AuthContext.jsx    # Auth state, cookie-based, auth:logout listener
│   │   ├── hooks/
│   │   │   ├── useAuth.js         # Auth hook
│   │   │   ├── useApi.js          # API hook with loading/error
│   │   │   ├── useDebounce.js     # Debounce hook (300ms default)
│   │   │   └── usePushNotifications.js # Push notification subscription
│   │   ├── pages/
│   │   │   ├── LoginPage.jsx              # Role-based redirect after login
│   │   │   ├── employee/                   # BDM pages
│   │   │   │   ├── EmployeeDashboard.jsx  # Stats, VIP Client list, visit status
│   │   │   │   ├── MyVisits.jsx           # Visit history, AbortController, debounced search
│   │   │   │   ├── NewVisitPage.jsx       # Visit logging, canVisit check
│   │   │   │   ├── EMP_InboxPage.jsx      # BDM inbox
│   │   │   │   └── CommLogPage.jsx         # BDM communication log (screenshots + messaging)
│   │   │   ├── admin/
│   │   │   │   ├── AdminDashboard.jsx     # System-wide stats
│   │   │   │   ├── DoctorsPage.jsx        # VIP Client management (CRUD, filters)
│   │   │   │   ├── EmployeesPage.jsx      # BDM management (CRUD, filters)
│   │   │   │   ├── ReportsPage.jsx        # BDM Visit Report, Excel/CSV export
│   │   │   │   ├── StatisticsPage.jsx     # Scaffolded (mock data, Recharts)
│   │   │   │   ├── ActivityMonitor.jsx    # Real data (audit logs + visits)
│   │   │   │   ├── PendingApprovalsPage.jsx # Scaffolded (mock data)
│   │   │   │   ├── GPSVerificationPage.jsx  # Real data (visit GPS review)
│   │   │   │   ├── SentPage.jsx           # Admin sent messages history
│   │   │   │   ├── CommLogsPage.jsx        # Admin communication logs overview
│   │   │   │   └── MessageTemplatesPage.jsx # Admin message template CRUD
│   │   │   ├── medrep/
│   │   │   │   └── MedRepDashboard.jsx    # Product assignment CRUD
│   │   │   └── common/
│   │   │       └── NotificationPreferences.jsx # Notification settings
│   │   ├── services/
│   │   │   ├── api.js                 # Axios instance, interceptors, withCredentials
│   │   │   ├── authService.js         # Login, logout, refresh (cookie-based)
│   │   │   ├── doctorService.js       # VIP Client API calls
│   │   │   ├── visitService.js        # Visit API calls, AbortController support
│   │   │   ├── productService.js      # Product API calls
│   │   │   ├── assignmentService.js   # Product assignment API calls
│   │   │   ├── userService.js         # User CRUD API calls
│   │   │   ├── messageInboxService.js # Inbox messaging API calls
│   │   │   ├── communicationLogService.js  # Communication log API calls
│   │   │   └── messageTemplateService.js  # Message template CRUD + send
│   │   └── utils/
│   │       ├── exportCallPlan.js      # VIP Client export (Call Plan Template format)
│   │       ├── exportEmployeeReport.js # BDM Visit Report export
│   │       ├── validators.js          # Client-side validation
│   │       ├── classifyError.js       # Error classification (network/auth/timeout/server)
│   │       └── formatters.js          # Data formatting helpers
│   └── vite.config.js
├── docs/
│   ├── CHANGE_LOG.md      # 17 client change requests (February 2026)
│   ├── PHASE-TASKS.md     # Phase task breakdown
│   ├── PRD.md             # Product Requirements Document
│   ├── EXCEL_SCHEMA_DOCUMENTATION.md  # CPT Excel workbook exact schema (23 sheets, 39 cols, import/export logic)
│   ├── API_DOCUMENTATION.md
│   ├── TECHNICAL_SPEC.md
│   ├── DEVELOPMENT_GUIDE.md
│   ├── DEPLOYMENT_GUIDE.md
│   └── SECURITY_CHECKLIST.md
└── CLAUDE.md              # This file
```

---

## Decision Checklist

Before implementing a feature, verify:

1. [ ] Does it align with the roles (admin, employee/BDM)? (MedRep being removed)
2. [ ] Does it respect assignment-based access control?
3. [ ] Does it enforce weekly/monthly visit limits?
4. [ ] Does it use AWS S3 for file storage (not Cloudinary)?
5. [ ] Does it use `getWebsiteProductModel()` for cross-DB product queries (not populate)?
6. [ ] Does it align with the client's 17 change requests in `docs/CHANGE_LOG.md`?

---

## Common Gotchas

1. **Week numbers**: Use ISO week numbers (1-53), not simple division
2. **Work days only**: Visits can only be logged Monday-Friday
3. **Unique constraint**: The `{ doctor, user, yearWeekKey }` index prevents same user visiting same VIP Client twice in one week
4. **Assignment filtering**: BDM (contractor) queries filter by `assignedTo: user._id` on Doctor model (Region model removed)
5. **Photo requirement**: Visits without photos should be rejected (1-10 photos)
6. **Cross-database products**: NEVER use Mongoose `populate()` for products. Use `getWebsiteProductModel()` manual fetching.
7. **httpOnly cookies**: Tokens are in cookies, NOT in localStorage or response body. Frontend uses `withCredentials: true`.
8. **Code vs business terms**: Code uses Doctor/employee, business uses VIP Client/BDM
8b. **CORS custom headers**: Any custom header injected by `api.js` request interceptor (e.g., `X-Entity-Id`) must be listed in `server.js` `buildCorsOptions().allowedHeaders` — otherwise CORS preflight fails silently as "Network Error"
9. **Scaffolded pages**: Statistics uses real APIs (5 tabs: overview, BDM performance, programs, products, daily heatmap). Approvals has UI but uses mock data. Activity Monitor and GPS Verification are fully wired to real data.
10. **Excel CPT import**: The CPT Excel has 23 sheets with specific structure (1 master + 20 day sheets + summary + readme). Day flags in CPT cols E-X map to day sheets W1D1-W4D5. Duplicate detection is by `lastName + firstName` (case-insensitive). See `docs/EXCEL_SCHEMA_DOCUMENTATION.md` for exact column mappings and import/export logic.
11. **Phase A.5 series — Canonical VIP Client key + backfill + bulk merge** (Apr–May 2026, shipped on dev + prod). `Doctor.vip_client_name_clean` (`lastname|firstname` lowercased) is auto-maintained by pre-save hook + UNIQUE partial index `{ vip_client_name_clean: 1, partialFilterExpression: { mergedInto: null } }`. Backfilled on both clusters; Iloilo dupes bulk-merged via [bulkMergeIloiloDupes.js](backend/scripts/bulkMergeIloiloDupes.js); audit + 30-day rollback grace via [DoctorMergeAudit](backend/models/DoctorMergeAudit.js). Healthcheck: [healthcheckMdMergeAudit.js](backend/scripts/healthcheckMdMergeAudit.js). **A.5.4** (May 5, 2026): `Doctor.assignedTo` flipped scalar→`[ObjectId]` with `primaryAssignee` invariant; admin chip picker for multi-BDM assignment. Migration `--apply` pending on dev — run [migrateAssignedToArray.js](backend/scripts/migrateAssignedToArray.js) immediately after merging to dev. Full detail: [docs/PHASE-TASKS-CRM.md](docs/PHASE-TASKS-CRM.md) § Phase A.5.1 + A.5.2 + A.5.5 and § Phase A.5.4.

12b. **Phase A.5.5 Merge Tool — 13-path cascade map** (Apr 28 2026, shipped). Doctor merge re-points 13 FK paths across CRM + ERP via manifest-driven [doctorMergeService.js](backend/services/doctorMergeService.js). Six cascade kinds: simple, nested-array, visit-week (sentinel-defused), schedule (cycleNumber+1e9), pa-active (deactivate-on-collision), attribution (deactivate-on-collision). Cron hard-delete (30-day grace) NOT yet wired — defer until first 30-day audit row ages. Full detail: [docs/PHASE-TASKS-CRM.md](docs/PHASE-TASKS-CRM.md) § Phase A.5.1 + A.5.2 + A.5.5.

12c. **Phase A.6 — Admin-Driven One-Off Scheduling** (May 5, 2026, shipped + healthcheck-ratified). Three entry points (Add VIP / per-row Schedule-or-Reschedule / EmployeeVisitReport row Reschedule) → one shared [ScheduleVisitsModal](frontend/src/components/admin/ScheduleVisitsModal.jsx). Atomic VIP-create-with-schedule via `mongoose.startSession().withTransaction()` (Atlas) with compensating `Doctor.deleteOne` fallback for standalone Mongo. Editing logged Visit's `visitDate` is **out of scope** (would let BDMs bypass weekly-limit cap). Full detail: [docs/PHASE-TASKS-CRM.md](docs/PHASE-TASKS-CRM.md) § Phase A.6.

13. **Phase N — Offline Visit + CLM Merge + Public Deck** (Apr 26 2026, shipped). One encounter → two DB rows linked by client-generated UUID (`session_group_id`). `Visit` ↔ `CLMSession` cross-FK; `CLMSession.mode` enum `[in_person, remote]`; remote-only public deck at `/clm/deck/:id` (rate-limited 10 req/min/IP, redacts to first names, no GPS). Offline visit submit via SW + IndexedDB v3 photo Blob persistence. E11000 weekly-limit dup treated as success → dequeue, not retry. Healthcheck: [healthcheckOfflineVisitWiring.js](backend/scripts/healthcheckOfflineVisitWiring.js). Full detail: [docs/PHASE-TASKS-CRM.md](docs/PHASE-TASKS-CRM.md) § Phase N.

13b. **Phase N+ — CLM-finalization gate + always-render CLM panel + bidirectional merged flow** (May 03–04 2026, shipped). Gate is **opt-in by CLM use, not by doctor**: clicking Start Presentation then Skip stamps `?clm_pending=1` → Submit Visit blocked until Resume → Save Session. Save Session button disabled unless Notes + Interest Level + Outcome filled. Backend Resume vs duplicate-sync split: `(sameUser && in_progress) → 200 + resumed:true`, else 409. Healthcheck: [healthcheckClmIdempotency.js](backend/scripts/healthcheckClmIdempotency.js). Full detail: [docs/PHASE-TASKS-CRM.md](docs/PHASE-TASKS-CRM.md) § Phase N+.

13c. **Phase D.4c — CLM Pitch Performance coaching surface** (May 04 2026, shipped + healthcheck-ratified). New admin tab `/admin/statistics` → "CLM Performance": BDM Comparison Table (sortable, click-to-drill), Slide Performance Heatmap with drop-off%, Top Products × BDM. Backend `GET /api/clm/sessions/performance` (admin-only, mounted before `/sessions/:id`). Lookup-driven thresholds via `CLM_PERFORMANCE_THRESHOLDS` (60s TTL). Full detail: [docs/PHASE-TASKS-CRM.md](docs/PHASE-TASKS-CRM.md) § Phase D.4c.

13d. **Phase O — Visit Photo Trust + Screenshot Block + Late-Log Cutoff** (May 05 2026, shipped + smoke-ratified). Backend extracts EXIF server-side via `exifr` BEFORE sharp re-encode strips it; `Visit.visitDate` auto-anchored to earliest photo's `DateTimeOriginal`; photos older than lookup-driven cutoff (default 14 days) hard-blocked. Conservative trifecta screenshot detection → HTTP 422 + redirect to `/bdm/comm-log?doctorId=…`. Three new error codes: `VISIT_PHOTO_TOO_OLD`, `VISIT_PHOTO_FUTURE_DATED`, `CAMERA_PHOTO_MISSING_EXIF`. Three new `photoFlags` signal-only codes: `no_exif_timestamp`, `gps_in_photo`, `late_log_cross_week`. SMER bridge regression fix: `PERDIEM_DISQUALIFYING_FLAGS = ['date_mismatch', 'duplicate_photo']` constant (only fraud flags disqualify per-diem). **Known SaaS gap (deferred)**: this list is an inline constant in [smerCrmBridge.js](backend/erp/services/smerCrmBridge.js) — future-Phase work to lift to a Lookup category so subscribers can tune which photo flags disqualify per-diem without a code deploy. Phase O.1 same-day hardening: relaxed screenshot trifecta to handle frontend `compressImage` + canvas-encoded uploads + frontend-EXIF fallback. Healthcheck: [healthcheckPhaseOPhotoTrust.js](backend/scripts/healthcheckPhaseOPhotoTrust.js). Full detail: [docs/PHASE-TASKS-CRM.md](docs/PHASE-TASKS-CRM.md) § Phase O and § Phase O.1.

13f. **Phase SMER-CL — CommLog Per-Diem Inclusion** (May 07 2026, shipped + healthcheck-ratified). Manual-source `CommunicationLog` rows (Messenger / Viber / WhatsApp / Email / Google Chat screenshots, `source='manual'` + `photos.length≥1`) now count toward SMER per-diem MD threshold when admin enables `include_comm_log` on `PERDIEM_RATES.<role>`. VIP entity: `BDM` + `ECOMMERCE_BDM` default `true`; SaaS-template `DELIVERY_DRIVER` defaults `false`. **Trust model**: admin (Gregg) is in the BDM group chats → fraud-credit auditable via Messenger spot-check, no hardcoded daily cap by default (`comm_log_daily_cap=null`). One CommLog row = one MD credit (existing `doctor`/`client` FK; **zero schema migration**). Same-day same-MD across `Visit` + `CommunicationLog` dedups at merge to 1 via `Set<string>` on stringified ObjectId. Phase O 14-day cutoff inherits — bridge filters `(createdAt - photos[0].capturedAt) ≤ 14d` per row, so old screenshots cannot retroactively pad SMER. New helper [aggregateCommLogDaily](backend/erp/services/smerCrmBridge.js) groups by `contactedAt` (NOT `visitDate`). 4 new lookup keys via [resolvePerdiemConfig](backend/erp/services/perdiemCalc.js): `include_comm_log`, `comm_log_daily_cap`, `comm_log_require_outbound`, `comm_log_allowed_sources`. Per-day SMER row renders blue `💬 N chats` badge when `comm_log_count > 0`. Healthcheck: [healthcheckSmerCrmBridgeUnion.js](backend/scripts/healthcheckSmerCrmBridgeUnion.js) — extended from 32 to **51 gates**. Subscription-neutral (every business value lookup-driven). Full detail: [docs/PHASETASK-ERP.md](docs/PHASETASK-ERP.md) § Phase SMER-CL. **Out of scope (cut per user direction "I only need the screen shot upload"):** new audit fields (`chatGroupName`/`mdMentioned`/`chatGroupSnapshotAt`), MD multi-select chip picker, Group Chat Audit drilldown column, `commlog_perdiem_credited` self-DM audit trail. The screenshot itself is the audit handle — admin spot-checks Messenger directly.

13e. **Phase N.8 — Offline Replay Failure Surfacing** (May 07 2026, shipped). Closes two silent-failure modes in the Phase N offline visit chain. (1) Server-rejected replays — when a queued visit replays and the server returns 4xx (Phase O `SCREENSHOT_DETECTED`, `VISIT_PHOTO_TOO_OLD`, `VISIT_PHOTO_FUTURE_DATED`, `CAMERA_PHOTO_MISSING_EXIF`, etc.), SW now broadcasts `VIP_VISIT_DRAFT_LOST` with the server's structured `{code, status, message, kind, sessionGroupId}` BEFORE deleting photos — surfaces as toast + SyncErrorsTray row + inbox audit row instead of silently disappearing. (2) Online-multipart-fails-mid-flight — SW now returns `503 OFFLINE_REPLAY_UNAVAILABLE` instead of fake-200ing with a stale text() body; VisitLogger's catch fires, draft is preserved, BDM retries (next attempt routes through `createOffline()` if now genuinely offline). `CACHE_VERSION` bumped `v3 → v4`. E11000 dedup branch stays silent (idempotent success, not draft-lost). useOfflineSyncListener differentiates `"Offline visit lost"` (photo-blob-loss) vs `"Offline visit rejected on sync"` (server rejection). Zero new business values introduced — pure pass-through of server's lookup-driven Phase O codes; subscription-neutral. Healthcheck: extended [healthcheckOfflineVisitWiring.js](backend/scripts/healthcheckOfflineVisitWiring.js) to 11 sections (gates 9–11 cover the new contract). Full detail: [docs/PHASE-TASKS-CRM.md](docs/PHASE-TASKS-CRM.md) § Phase N.8.

14. **Phase TA-1 — Team Activity Cockpit + Overview drill-down** (Apr 29 2026, shipped). New leftmost tab on `/admin/statistics` with red-flag badge counting BDMs flagged below threshold. One row per active staff with Today/Week/Month/Cycle counts + last-visit recency + 🚩 red-flag pill. Worst-first sort. Click row → drills into BDM Performance tab. Backend `GET /api/schedules/team-activity` (admin-only, Manila-time-correct). Lookup-driven thresholds via `TEAM_ACTIVITY_THRESHOLDS` (60s TTL). Healthcheck: [healthcheckTeamActivity.js](backend/scripts/healthcheckTeamActivity.js). Full detail: [docs/PHASE-TASKS-CRM.md](docs/PHASE-TASKS-CRM.md) § Phase TA-1.

15. **Programs / Support Types foundation ratified** (May 05 2026, smoke-only — no code change). Four Programs (CME GRANT, MED SOCIETY, REBATES/MONEY, REST AND RECREATION) and five Support Types (AIR FRESHENER, FULL DOSE, PATIENT DISCOUNT, PROMATS, STARTER DOSES) verified end-to-end on dev. Models: [Program.js](backend/models/Program.js) + [SupportType.js](backend/models/SupportType.js) — admin-owned MongoDB collections, NOT lookup enums. Doctor tags are string arrays (NOT FK refs). Endpoints under `cacheControl(300)`; admin UI at `/admin/settings`; stats UI at `/admin/statistics` Programs tab. **Known SaaS gap (deferred — Phase S6)**: stats endpoints query globally without `req.entityId`. Future spend-attribution roadmap: see [docs/PHASE-TASKS-CRM.md](docs/PHASE-TASKS-CRM.md) § Phase PRG. Foundation detail: § Phase PRG-Foundation.

16. **Phase P1.2 Slice 7-extension Round 2C — CWT-Inbound picker on Mark-Received modal** (May 06 2026, shipped + UI-ratified — superseded May 06 by Phase 1 / note 20 which moves CWT under `COLLECTION` workflow_type). Full detail: [docs/PHASETASK-ERP.md](docs/PHASETASK-ERP.md) § Phase P1.2 Slice 7-extension Round 2C.

17. **Phase P1.2 Slice 6 — Car Logbook Auto-Populate** (May 06 2026, shipped + UI-ratified). `/erp/car-logbook` becomes a *review surface* — proxies review pre-populated grid built from 4 sources: SMER hospital_covered, ODO captures (min/max via OCR), DriveAllocation personal/official split, Fuel-entry captures. Plus PRIOR_DAY fallback for `starting_km`. Frontend `SourceBadge` component + edit flips badge to MANUAL (red). Healthcheck: [healthcheckCarLogbookAutoPopulate.js](backend/scripts/healthcheckCarLogbookAutoPopulate.js). Full detail: [docs/PHASETASK-ERP.md](docs/PHASETASK-ERP.md) § PHASE P1.2 SLICE 6.

18. **Phase P1.2 Slice 6.1 — CRM Visit cities also auto-fill Car Logbook destination** (May 06 2026 evening, shipped + UI-ratified). Adds 5th source: CRM Visit + ClientVisit join with `Doctor.locality + .province` → unique localities deduped by `Set`, joined with `'; '`. Destination resolution chain: CRM Visits > SMER hospital_covered > empty. New cyan `CRM_VISIT_CITY` source badge. Out of scope: Tier-2 Haversine and Tier-3 Google Maps Distance Matrix (per user direction). Full detail: [docs/PHASETASK-ERP.md](docs/PHASETASK-ERP.md) § PHASE P1.2 SLICE 6.1.

19. **Phase P1.2 Slice 6.2 — GRN sub_type split (BATCH_PHOTO vs WAYBILL)** (May 06 2026, shipped — pending UI smoke ratification). Single GRN tile on `/erp/capture-hub` replaced by two tiles: BATCH_PHOTO (digital-only — `physical_required=false`/`physical_status='N_A'`) and WAYBILL (paper-expected — preserves legacy posture). Per-workflow `VALID_SUB_TYPES_BY_WORKFLOW` map replaces flat `VALID_SUB_TYPES`. Migration: legacy GRN rows default to WAYBILL (conservative — flipping to BATCH_PHOTO would silently lift physical_required gate). Full detail: [docs/PHASETASK-ERP.md](docs/PHASETASK-ERP.md) § PHASE P1.2 SLICE 6.2.

20. **Phase P1.2 Phase 1 — Capture-type cleanup + Option D BIR audit gate** (May 06 2026, shipped — pending UI smoke ratification). Three coupled changes: (1) `workflow_type='CWT_INBOUND'` dropped (now sub_type of `COLLECTION`); (2) `workflow_type='PETTY_CASH'` dropped (was speculative, never shipped); (3) **Two-step BIR receive on `/erp/bir/2307-IN`** — photo evidence attaches but does NOT unlock 1702 credit; finance must ALSO tick "I confirm the paper certificate is in the Iloilo office archive" checkbox to flip `status='RECEIVED'` + stamp `CwtLedger.physical_received_at`. Closes audit-credibility gap (BIR RR 2-98 requires original paper). Migration: [migrateCwtInboundToCollectionSubtype.js](backend/scripts/migrateCwtInboundToCollectionSubtype.js) flipped 2 rows on dev. Full detail: [docs/PHASETASK-ERP.md](docs/PHASETASK-ERP.md) § PHASE P1.2 PHASE 1.

21. **Phase A.5.3 + A.5.6 — Duplicate VIP Client UX + Phase-N Offline Merge Resolver**. **A.5.3**: structured `DUPLICATE_VIP_CLIENT` 409 + [DuplicateVipClientModal](frontend/src/components/admin/DuplicateVipClientModal.jsx) with three role-gated buttons (Rename / Join / Request approval). `POST /api/doctors/:id/join-coverage` endpoint, role-gated via `VIP_CLIENT_LIFECYCLE_ROLES.JOIN_COVERAGE_AUTO` / `JOIN_COVERAGE_APPROVAL`. **Approval messages** stamp `requires_action=true` + `action_type='approve_coverage_join'` + `action_payload={doctor_id, requester_user_id, ...}` so [InboxThreadView](frontend/src/components/common/inbox/InboxThreadView.jsx) renders Approve/Reject inline; `messageInboxController.executeAction` walks `mergedInto` to the winner, `$addToSet`s requester onto `Doctor.assignedTo`, system-DMs the requester. Modal also wired into BDM-side [DoctorEditForm](frontend/src/components/employee/DoctorEditForm.jsx) for rename collisions. **A.5.6**: offline-replayed visits walk `mergedInto` (cap 5 hops) BEFORE access/cap/schedule → response carries `merge_redirected: { from, to, message }`; SW captures it from each replay, batches into `VIP_SYNC_COMPLETE.mergeRedirects`, [useOfflineSyncListener](frontend/src/hooks/useOfflineSyncListener.js) toasts each + records inbox audit. Online VisitLogger toasts the same shape on direct submit. Healthcheck: [healthcheckPhaseA5_3_6.js](backend/scripts/healthcheckPhaseA5_3_6.js).

22. **Phase VIP-1.A — MD Partner Lead Pipeline** (Apr 26 2026, shipped). `Doctor` gained `partnership_status` (LEAD/CONTACTED/VISITED/PARTNER/INACTIVE), `lead_source`, `partner_agreement_date`, `prc_license_number`, `partnership_notes`. Admin operator surface at `/admin/md-leads`. Promoting to PARTNER requires `partner_agreement_date` (rebate engine Gate #2 wired by VIP-1.B). BDMs can move LEAD→CONTACTED→VISITED on their own assignees but cannot promote to PARTNER (admin/president only). Lookup-driven role gates via `MD_PARTNER_ROLES` ([backend/utils/mdPartnerAccess.js](backend/utils/mdPartnerAccess.js)). Final state on prod: 742 VISITED / 0 PARTNER (no doctor has earned PARTNER under VIP-1.A rules yet). Full detail: [docs/PHASE-TASKS-CRM.md](docs/PHASE-TASKS-CRM.md) § VIP-1.A.

23. **Phase E1 — Doctor entity scoping (SaaS-readiness)** (May 8 2026, shipped — pending migration --apply + UI smoke). Closes the cross-entity ghost-rule + partner-picker leak observed on `/erp/non-md-rebate-matrix` ("Angelyn Tingocia" surfaced regardless of working entity). New `Doctor.entity_ids: [ObjectId ref Entity]` is auto-maintained by pre-save / pre-findOneAndUpdate hooks as the union of assignees' `User.entity_ids` (or `[User.entity_id]` fallback for legacy single-entity users) — covers `$set` / `$addToSet` / `$pull` operators. Two indexes (plain + compound `entity_ids+partnership_status+isActive`). [getAllDoctors](backend/controllers/doctorController.js) honors `?entity_id=` for privileged callers (Rule #21 — explicit opt-in; absence = no filter). All three rebate-rule controllers (NonMd, MD, Capitation) call shared [`assertPartnerInEntity`](backend/erp/utils/rebatePartnerEntityScope.js) on create → 400 `PARTNER_ENTITY_MISMATCH` / `PARTNER_NO_ENTITY_COVERAGE` / `PARTNER_NOT_FOUND` / `PARTNER_MERGED`. Both rebate matrix pages forward `workingEntityId` from EntityContext + re-fetch on entity switch. `PageGuide` banners on `/erp/rebate-matrix` and `/erp/non-md-rebate-matrix` updated. Migration script [migrateDoctorEntityIds.js](backend/scripts/migrateDoctorEntityIds.js) (dry-run + --apply + --include-merged + --limit=N, idempotent, raw-collection writes). Healthcheck: [healthcheckDoctorEntityScope.js](backend/scripts/healthcheckDoctorEntityScope.js) — 24/24 static + DATA-mode gates against live cluster. BDM read-path UNCHANGED (multi-entity coverage preserved — `assignedTo: user._id` filter still wins). Proxy hand-off note in controller: when proxy mode lands in getAllDoctors later, entity scope must follow the proxy *target's* entity (not the proxy user's), per Phase 32R-Transfer-Stock-Scope precedent. Subscription posture: subscriber tenants will narrow the SAME field from "subsidiary entity" to "tenant slice" (Year-2 SaaS) without code changes. Full detail: [docs/PHASE-TASKS-CRM.md](docs/PHASE-TASKS-CRM.md) § Phase E1.
---

## Environment Variables Reference

```bash
# Server
NODE_ENV=development
PORT=5000

# Database
MONGO_URI=mongodb+srv://...

# JWT (must be 32+ characters each)
JWT_SECRET=your-secret-min-32-chars
JWT_EXPIRE=15m
JWT_REFRESH_SECRET=your-refresh-secret-min-32-chars
JWT_REFRESH_EXPIRE=7d

# AWS
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=ap-southeast-1
S3_BUCKET_NAME=vip-pharmacy-crm-prod

# CORS (required in production)
CORS_ORIGINS=https://app.vipcrm.com
```

---

## Routes (Frontend)

| Route | Page | Allowed Roles |
|-------|------|---------------|
| `/login` | LoginPage | Public |
| `/employee` | EmployeeDashboard (BDM Dashboard) | employee, admin |
| `/employee/visits` | MyVisits | employee, admin |
| `/employee/visit/new` | NewVisitPage | employee, admin |
| `/employee/inbox` | EMP_InboxPage | employee, admin |
| `/admin` | AdminDashboard | admin |
| `/admin/doctors` | DoctorsPage (VIP Client Mgmt) | admin |
| `/admin/employees` | EmployeesPage (BDM Mgmt) | admin |
| `/admin/reports` | ReportsPage | admin |
| `/admin/statistics` | StatisticsPage | admin |
| `/admin/activity` | ActivityMonitor | admin |
| `/admin/approvals` | PendingApprovalsPage (scaffolded) | admin |
| `/admin/gps-verification` | GPSVerificationPage | admin |
| `/medrep` | MedRepDashboard | medrep, admin |
| `/notifications/preferences` | NotificationPreferences | all roles |
| `/bdm/comm-log` | CommLogPage | contractor, admin |
| `/admin/comm-logs` | CommLogsPage | admin |
| `/admin/message-templates` | MessageTemplatesPage | admin |

---

## API Routes (Backend)

| Route | Controller | Prefix |
|-------|-----------|--------|
| `authRoutes.js` | authController | `/api/auth` |
| `userRoutes.js` | userController | `/api/users` |
| `doctorRoutes.js` | doctorController | `/api/doctors` |
| `visitRoutes.js` | visitController | `/api/visits` |
| `productRoutes.js` | productController | `/api/products` |
| `productAssignmentRoutes.js` | productAssignmentController | `/api/assignments` |
| `messageInbox.js` | messageInboxController | `/api/messages` |
| `sentRoutes.js` | (admin sent messages) | `/api/sent` |
| `communicationLogRoutes.js` | communicationLogController | `/api/communication-logs` |
| `messageTemplateRoutes.js` | messageTemplateController | `/api/message-templates` |
| `webhookRoutes.js` | (webhook handlers + auto-reply) | `/api/webhooks` |

---

## File Connection Map

### Backend Dependencies
```
server.js
├── config/db.js (MongoDB CRM connection)
├── config/websiteDb.js (MongoDB website products connection)
├── middleware/errorHandler.js (notFound, errorHandler)
└── routes/*.js
    ├── controllers/*.js
    │   ├── models/*.js
    │   │   └── models/WebsiteProduct.js (cross-DB product access)
    │   └── middleware/errorHandler.js (catchAsync, errors)
    ├── middleware/auth.js (protect, verifyRefreshToken)
    ├── middleware/roleCheck.js (adminOnly, employeeOnly, etc.)
    ├── middleware/validation.js (validators)
    └── middleware/upload.js (multer + S3)

config/s3.js
└── Used by: middleware/upload.js, controllers (delete, signed URLs)

utils/generateToken.js
└── Used by: controllers/authController.js (sets httpOnly cookies)

utils/validateWeeklyVisit.js
└── Used by: controllers/visitController.js

utils/auditLogger.js
└── Used by: controllers/authController.js (security events)

utils/controllerHelpers.js
└── Used by: multiple controllers (shared utilities)
```

### Frontend Dependencies
```
App.jsx
├── context/AuthContext.jsx (cookie-based, auth:logout listener)
├── components/auth/ProtectedRoute.jsx
└── pages/*.jsx
    ├── components/*.jsx
    └── services/*.js
        └── services/api.js (base axios instance, withCredentials: true)
```

---

## Implementation Progress Checklist

### Backend Status: ✅ FULLY FUNCTIONAL

#### Infrastructure
- [x] MongoDB Atlas - Connected (cluster0.wv27nfk.mongodb.net)
- [x] AWS S3 - Bucket `vip-pharmacy-crm-prod` configured (ap-southeast-1) — shared by dev + prod per [DEVELOPMENT_WORKFLOW.md](docs/DEVELOPMENT_WORKFLOW.md). Future option: separate dev bucket if isolation becomes a regulator-facing requirement.
- [ ] AWS Lightsail - Instance not provisioned

#### Config Files
- [x] `config/db.js` - MongoDB connection
- [x] `config/s3.js` - AWS S3 integration (1-hour signed URL expiry)
- [x] `config/websiteDb.js` - Dual DB connection for website products

#### Models (8/8 Complete)
- [x] `models/User.js` - Admin, medrep, employee roles; lockout fields
- [x] `models/Doctor.js` - VIP Client: visitFrequency (2/4), assignment-based
- [x] `models/Visit.js` - Weekly tracking, GPS, photos, unique constraint
- [x] `models/ProductAssignment.js` - Product-to-VIP Client assignments
- [x] `models/WebsiteProduct.js` - Read-only website products (separate DB)
- [x] `models/MessageInbox.js` - Admin→BDM messaging with categories/priority
- [x] `models/AuditLog.js` - Security audit logging (90-day TTL)

#### Middleware (5/5 Complete)
- [x] `middleware/auth.js` - JWT protect (reads httpOnly cookies), optionalAuth, verifyRefreshToken
- [x] `middleware/roleCheck.js` - adminOnly, medRepOnly, employeeOnly, etc.
- [x] `middleware/errorHandler.js` - Global error handling, catchAsync, custom errors
- [x] `middleware/validation.js` - Express-validator rules, password complexity
- [x] `middleware/upload.js` - Multer + S3 processors

#### Controllers (8/8 Complete)
- [x] `controllers/authController.js` - Login, register, password reset, lockout, audit logging
- [x] `controllers/userController.js` - User CRUD, profile management
- [x] `controllers/doctorController.js` - VIP Client CRUD with assignment filter
- [x] `controllers/visitController.js` - Visit logging with enforcement, getBDMReport
- [x] `controllers/productController.js` - Product CRUD (reads from website DB)
- [x] `controllers/productAssignmentController.js` - Assignments
- [x] `controllers/messageInboxController.js` - Admin→BDM messaging

#### Routes (9/9 Complete)
- [x] `routes/authRoutes.js` → `/api/auth` (stricter rate limiting: 20 req/15min)
- [x] `routes/userRoutes.js` → `/api/users`
- [x] `routes/doctorRoutes.js` → `/api/doctors`
- [x] `routes/visitRoutes.js` → `/api/visits`
- [x] `routes/productRoutes.js` → `/api/products`
- [x] `routes/productAssignmentRoutes.js` → `/api/assignments`
- [x] `routes/messageInbox.js` → `/api/messages`
- [x] `routes/sentRoutes.js` → `/api/sent`

#### Utils (6/6 Complete)
- [x] `utils/generateToken.js` - JWT access + refresh tokens (sets httpOnly cookies)
- [x] `utils/validateWeeklyVisit.js` - Visit limit enforcement
- [x] `utils/controllerHelpers.js` - Shared controller utilities
- [x] `utils/auditLogger.js` - Security event logging
- [x] `utils/calculateProgress.js` - Progress calculation
- [x] `utils/pagination.js` - Pagination utilities

---

### Frontend Status: ✅ PHASE 1 COMPLETE + Partial Phase 2 Scaffolding

#### Services (10/10 Complete)
- [x] `services/api.js` - Axios instance, interceptors, withCredentials, auth:logout event
- [x] `services/authService.js` - Login, logout, refresh (cookie-based)
- [x] `services/doctorService.js` - VIP Client API calls + getAssignedProducts
- [x] `services/visitService.js` - Visit API calls, AbortController support, getBDMReport
- [x] `services/productService.js` - Product API calls
- [x] `services/assignmentService.js` - Product assignment API calls
- [x] `services/userService.js` - User CRUD API calls
- [x] `services/messageInboxService.js` - Inbox messaging API calls
- [x] ~`services/complianceService.js`~ - Removed (was calling non-existent backend APIs)

#### Context & Hooks
- [x] `context/AuthContext.jsx` - Cookie-based auth, auth:logout event listener
- [x] `hooks/useAuth.js` - Auth hook
- [x] `hooks/useApi.js` - API hook with loading/error states
- [x] `hooks/useDebounce.js` - Debounce hook (300ms default)
- [x] `hooks/usePushNotifications.js` - Push notification subscription

#### Frontend Utils
- [x] `utils/exportCallPlan.js` - VIP Client export (Call Plan Template format)
- [x] `utils/exportEmployeeReport.js` - BDM Visit Report export
- [x] `utils/validators.js` - Client-side validation
- [x] `utils/classifyError.js` - Error classification (network/auth/timeout/server) — mirrors ERP errorToast.js pattern
- [x] `utils/formatters.js` - Data formatting helpers

#### Components - Auth
- [x] `components/auth/LoginForm.jsx` - Email/password form
- [x] `components/auth/ProtectedRoute.jsx` - Role-based route protection

#### Components - Common
- [x] `components/common/Navbar.jsx` - User info and logout
- [x] `components/common/Sidebar.jsx` - Role-based navigation
- [x] `components/common/LoadingSpinner.jsx` - Loading states
- [x] `components/common/ErrorMessage.jsx` - Error display with retry
- [x] `components/common/ErrorBoundary.jsx` - Catches React errors
- [x] `components/common/Pagination.jsx` - Shared pagination (React.memo)
- [x] `components/common/NotificationCenter.jsx` - Notification bell (scaffolded)
- [x] `components/common/MapView.jsx` - Reusable map component

#### Components - BDM (employee/)
- [x] `components/employee/DoctorList.jsx` - VIP Client list (React.memo, useMemo, visit status)
- [x] `components/employee/VisitLogger.jsx` - FormData upload, GPS, products discussed
- [x] `components/employee/CameraCapture.jsx` - GPS watchPosition, 5-min timeout, accuracy badges
- [x] `components/employee/ProductRecommendations.jsx` - Assigned products display, detail modal
- [x] `components/employee/MessageBox.jsx` - BDM inbox UI
- [x] `components/employee/AdminSentMessageBox.jsx` - View admin sent messages

#### Components - Admin
- [x] `components/admin/Dashboard.jsx` - Stats display, activity feed
- [x] `components/admin/DoctorManagement.jsx` - VIP Client CRUD
- [x] `components/admin/EmployeeManagement.jsx` - BDM CRUD, multi-entity assignment
- [x] `components/admin/ProductManagement.jsx` - Product CRUD
- [x] `components/admin/EmployeeVisitReport.jsx` - Call Plan Template format, visit grid
- [x] `components/admin/ReportGenerator.jsx` - Report generation
- [ ] `components/admin/VisitApproval.jsx` - **Scaffolded** (mock data — repurpose for Excel import)
- [ ] `components/admin/LiveActivityFeed.jsx` - **Scaffolded** (mock data)
- [ ] `components/admin/ActivityDetailModal.jsx` - **Scaffolded** (mock data)
- [ ] `components/admin/VisitLocationMap.jsx` - **Scaffolded** (mock coordinates, 400m threshold)
- [ ] `components/admin/EmployeeAnalytics.jsx` - **Scaffolded** (no data source)
- [ ] `components/admin/PerformanceChart.jsx` - **Scaffolded** (no data source)

#### Components - MedRep (being removed in Phase A)
- [x] `components/medrep/ProductAssignment.jsx` - Assignment cards, filtering
- [x] `components/medrep/DoctorProductMapping.jsx` - VIP Client-product assignments

#### Pages
- [x] `pages/LoginPage.jsx` - Role-based redirect
- [x] `pages/employee/EmployeeDashboard.jsx` - BDM Dashboard (real API data)
- [x] `pages/employee/MyVisits.jsx` - AbortController, debounced search, pagination
- [x] `pages/employee/NewVisitPage.jsx` - isMounted cleanup, canVisit check
- [x] `pages/employee/EMP_InboxPage.jsx` - BDM inbox
- [x] `pages/admin/AdminDashboard.jsx` - Optimized API calls (limit:0)
- [x] `pages/admin/DoctorsPage.jsx` - VIP Client CRUD, filters, pagination
- [x] `pages/admin/EmployeesPage.jsx` - BDM CRUD, filters, pagination
- [x] `pages/admin/ReportsPage.jsx` - BDM Visit Report, Excel/CSV export
- [x] `pages/admin/SentPage.jsx` - Admin sent messages
- [x] `pages/admin/StatisticsPage.jsx` - **WORKING** (5 tabs: overview with team avg, BDM performance with lookup-driven labels, programs, products, daily heatmap)
- [x] `pages/admin/ActivityMonitor.jsx` - **WORKING** (real audit logs + visit data)
- [ ] `pages/admin/PendingApprovalsPage.jsx` - **Scaffolded** (mock approval data)
- [x] `pages/admin/GPSVerificationPage.jsx` - **WORKING** (real visit GPS data)
- [x] `pages/medrep/MedRepDashboard.jsx` - Product assignment CRUD
- [x] `pages/common/NotificationPreferences.jsx` - Notification settings

---

## Quick Reference: Current Status

| Feature | Status | Notes |
|---------|--------|-------|
| Backend Code | ✅ WORKING | All APIs tested |
| MongoDB Atlas | ✅ CONNECTED | cluster0.wv27nfk.mongodb.net |
| AWS S3 | ✅ CONFIGURED | vip-pharmacy-crm-prod (ap-southeast-1) — shared by dev + prod |
| AWS Lightsail | NOT PROVISIONED | Need to set up instance |
| Frontend Auth | ✅ WORKING | httpOnly cookie-based login/logout/refresh |
| BDM Dashboard | ✅ WORKING | Real API data, VIP Client list |
| Visit Logger | ✅ WORKING | Photo + GPS capture, FormData upload |
| My Visits History | ✅ WORKING | Filters, pagination, photo gallery |
| Admin Dashboard | ✅ WORKING | Real API data, stats |
| VIP Client Management | ✅ WORKING | Full CRUD, assignment-based |
| BDM Management | ✅ WORKING | Full CRUD, multi-entity assignment |
| MedRep Dashboard | ✅ WORKING | Full assignment CRUD, VIP Client mapping |
| Reports Page | ✅ WORKING | BDM Visit Report, Excel/CSV export |
| Messaging System | ✅ WORKING | Admin→BDM messaging with categories |
| BDM Inbox | ✅ WORKING | Message read/archive |
| Admin Statistics | ✅ WORKING | Real API data (5 tabs: overview, BDM performance, programs, products, daily heatmap) |
| Activity Monitor | ✅ WORKING | Real audit logs + visit data, auto-refresh |
| Pending Approvals | ⚠️ SCAFFOLDED | UI built, uses mock data |
| GPS Verification | ✅ WORKING | Real visit GPS data, 400m threshold |
| Security Hardening | ✅ COMPLETE | httpOnly cookies, lockout, audit logging |

---

## Completed Tasks

1. ✅ **Task 1.1** - MongoDB Atlas setup & connection
2. ✅ **Task 1.2** - AWS S3 bucket configuration
3. ✅ **Task 1.3** - Seed data script (12 regions, 5 users, 56 VIP Clients)
4. ✅ **Task 1.4** - Backend API testing (all endpoints verified)
5. ✅ **Task 1.5** - Authentication flow (login, logout, token refresh)
6. ✅ **Task 1.6** - BDM Dashboard & VIP Client List (visitFrequency filter)
7. ✅ **Task 1.7** - Visit Logger with Photo & GPS capture
8. ✅ **Task 1.8** - My Visits history page (filters, pagination, photo gallery)
9. ✅ **Task 1.9** - Admin Dashboard (real API data, stats)
10. ✅ **Task 1.10** - VIP Client Management (full CRUD, cascading regions)
11. ✅ **Task 1.10b** - Cascading Region Dropdown Fix
12. ✅ **Task 1.10c** - VIP Client Export to Excel/CSV (Call Plan Template format)
13. ✅ **Task 1.11** - BDM Management (CRUD, multi-region assignment)
14. ✅ **Task 1.12** - Region Management (tree view, hierarchy CRUD)
15. ✅ **Task 1.12b** - Cascading Region Assignment Fix (parentRegions field)
16. ✅ **Task 1.13** - MedRep Dashboard & Product Assignment
17. ✅ **Task 1.14** - Product Recommendations in Visit Interface
18. ✅ **Task 1.14c** - Cross-Database Product Population Fix
19. ✅ **Task 1.16** - Development Environment Documentation
20. ✅ **Task 1.18** - Security Hardening (httpOnly cookies, lockout, audit logging)
21. ✅ **Backend Optimization** - Rate limiting, indexes, HSTS, timeout (Dec 2025)
22. ✅ **Frontend Optimization** - ErrorBoundary, useDebounce, AbortController, React.memo (Dec 2025)
23. ✅ **BDM Visit Report** - Reports page, Excel/CSV export (Dec 2025)
24. ✅ **Visit Week Calculation Fix** - weekOfMonth alignment, 5th week handling (Dec 2025)
25. ✅ **Messaging System** - Admin→BDM messaging with categories, priority, read tracking (Jan 2026)
26. ✅ **Admin Page Scaffolding** - Statistics, Activity Monitor, Approvals, GPS Verification (Jan 2026)

---

## Security Hardening Summary (Completed Jan 2026)

- ✅ **httpOnly Cookies** (SEC-001): Tokens in cookies only, not localStorage or response body
- ✅ **Visit Race Condition** (SEC-002): Duplicate key error handling
- ✅ **Account Lockout** (SEC-003): 5 failed attempts = 15 min lockout
- ✅ **Password Complexity** (SEC-004): Upper + lower + number + special char, 8+ chars
- ✅ **Audit Logging** (SEC-005): All auth events → `auditlogs` collection (90-day TTL)
- ✅ **JWT Secret Validation** (SEC-006): 32+ character secrets required at startup
- ✅ **S3 URL Expiry** (SEC-007): 1-hour signed URLs (was 24h)
- ✅ **Token Response Cleanup** (SEC-008): No tokens in JSON response body
- ✅ **CORS Validation** (SEC-009): `CORS_ORIGINS` required in production
- ✅ **Email Validation** (SEC-010): Modern TLD support

---

## Cross-Database Product Fix Pattern

Products are in separate `vip-pharmacy` database. Use this pattern everywhere:
```javascript
const { getWebsiteProductModel } = require('../models/WebsiteProduct');

// 1. Get documents WITHOUT product population
const visits = await Visit.find(query).populate('doctor', 'name');

// 2. Collect product IDs
const productIds = visits.flatMap(v => v.productsDiscussed.map(p => p.product));

// 3. Fetch from website DB
const Product = getWebsiteProductModel();
const products = await Product.find({ _id: { $in: productIds } }).select('name category').lean();
const productMap = new Map(products.map(p => [p._id.toString(), p]));

// 4. Enrich documents
visits.forEach(v => {
  v.productsDiscussed = v.productsDiscussed.map(item => ({
    ...item,
    product: productMap.get(item.product?.toString()) || { _id: item.product }
  }));
});
```

---

## Next Steps Priority

See `docs/CHANGE_LOG.md` for full details on all 17 client-requested changes.

### Phase A (Do First) — Core Schema + Role Changes
1. **Change 9**: VIP Client model field extensions (15+ new fields — foundation for everything)
2. **Change 10**: 2x alternating week enforcement (W1+W3 or W2+W4)
3. **Change 1**: Remove MedRep role — BDMs assign their own products
4. **Change 2**: BDM edit own VIP Clients (ownership-based permissions)

### Phase B — UX Improvements
5. **Change 3**: VIP Client info page before log visit
6. **Change 4**: Product detail popup (tablet-friendly)
7. **Change 5**: Photo upload flexibility (gallery, clipboard)
8. **Change 12**: Level of engagement tracking (1-5 scale)
9. **Change 14**: BDM self-service performance metrics
10. **Change 16**: Non-VIP regular clients table
11. **Change 17**: Filter by support type & program

### Phase C — Scheduling & Import (Core System Flow)
12. **Change 6**: 4-week schedule calendar
13. **Change 7**: Call Planning Tool (CPT) with DCR Summary
14. **Change 8**: Excel upload & import (admin reviews + approves)
15. **Change 11**: VIP count minimums & validation

> **Excel format spec**: `docs/EXCEL_SCHEMA_DOCUMENTATION.md` contains the exact CPT workbook structure (23 sheets, 39 columns, day-to-column mappings, field definitions, import/export logic). Required reading for C.2 (CPT View) and C.3+D.3 (Excel Import).

### Phase D — Advanced
16. **Change 15**: Admin per-BDM DCR Summary view
17. **Change 13**: Repurpose approvals for Excel import

---

## Test Credentials

> **Dev / localhost only.** Use for Playwright smoke walks against
> `localhost:5173` (frontend) / `localhost:5000` (backend) when the
> dev stack is bound to the live Atlas dev cluster. Verified working
> Apr 27 2026; proxy persona pair added Apr 29 2026.

| Role | Email | Password | Notes |
|------|-------|----------|-------|
| Admin / President | yourpartner@viosintegrated.net | DevPass123!@# | full access; privileged short-circuit on every proxy gate |
| BDM (Mae Navarro) | s3.vippharmacy@gmail.com | DevPass123!@# | generic BDM persona |
| BDM (MG and CO BDM) | s19.vippharmacy@gmail.com | DevPass123!@# | MG-and-CO entity BDM — useful for cross-entity / multi-entity scoping tests |
| BDM Proxy 1 | s22.vippharmacy@gmail.com | DevPass123!@# | designated proxy tester — grant `inventory.grn_proxy_entry` + add `staff` to `PROXY_ENTRY_ROLES.INVENTORY` to exercise Phase G4.5x batch metadata + G4.5y physical count proxy |
| BDM Proxy 2 | s25.vippharmacy@gmail.com | DevPass123!@# | second proxy persona — pair with Proxy 1 for cross-BDM scenarios where Proxy 1 + Proxy 2 act on each other's warehouses |

> Legacy aspirational seeds (`admin@vipcrm.com`, `juan@vipcrm.com`,
> etc.) were never applied to the live cluster — ignore them.
