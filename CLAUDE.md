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
11. **Phase A.5 canonical VIP Client key** (Apr–May 2026, A.5.1 + A.5.5 + A.5.2 SHIPPED on both dev + prod): `Doctor.vip_client_name_clean` is auto-maintained by pre-save + pre-findOneAndUpdate hooks as `lastname|firstname` (lowercased). Mirrors `Customer.customer_name_clean` (Phase G5) / `Hospital.hospital_name_clean`. **A.5.2 SHIPPED May 04–05 2026** (deployed to both clusters via single push to `origin/dev` → AWS pull on `ip-172-26-11-73:/var/www/vip-pharmacy-crm`): (a) backfilled `vip_client_name_clean` + `primaryAssignee` on all 734 active doctors (dev) + 742 (prod) via `node backend/scripts/migrateVipClientCanonical.js --apply`; (b) bulk-merged 131 (dev) + 132 (prod) duplicate canonical-key groups via [backend/scripts/bulkMergeIloiloDupes.js](backend/scripts/bulkMergeIloiloDupes.js) (one-shot tool: heuristic = visit count desc → field completeness desc → createdAt asc; calls executeMerge directly; CSV audit per run in `reports/`) — Iloilo BDM territory overlap from CPT import; per-merge audit + 30-day rollback grace per [DoctorMergeAudit](backend/models/DoctorMergeAudit.js); 263 total merges, 0 failures across both clusters; (c) flipped the unique index on both clusters via `node backend/scripts/migrateVipClientCanonical.js --add-unique-index` — final shape `{ vip_client_name_clean: 1 }` UNIQUE with `partialFilterExpression: { mergedInto: null }` so the merge service's soft-delete contract (loser keeps canonical key, gets `mergedInto` set + `isActive: false`) doesn't trip the constraint on rollback. Final state: **dev 603 active + 131 merged losers = 734**; **prod 610 active + 132 merged losers = 742**. (d) global `errorHandler.js` maps `E11000` on `vip_client_name_clean` to friendly 409 ("A VIP Client with this name already exists. Rename yours, or contact admin to share coverage.") — minimum UX gate; full A.5.3 DUPLICATE_VIP_CLIENT contract + frontend modal still deferred. (e) new `backend/scripts/healthcheckMdMergeAudit.js` (retires CLAUDE.md note 12b TODO) verifies 9-section contract end-to-end — **PASS on both clusters**. **Shipped commits on `dev`**: `99e2be7 feat(erp): Implement Phase A.5.2 changes for VIP Client canonical key management` (6 files: Doctor model + errorHandler + migration script + healthcheck + PageGuide + CLAUDE.md) + `d51c6ab Add bulk merge report for Iloilo on 2026-05-04` (CSV — see follow-up note: should have been gitignored, in repo history but acceptable for private repo). `primaryAssignee` is the forward-compatible ownership scalar that A.5.4's `assignedTo` scalar→array flip will preserve. **Decision D11 (locked Apr 24, ratified by A.5.5)**: all A.5 lifecycle operations are gated by the `VIP_CLIENT_LIFECYCLE_ROLES` Lookup category (lazy-seed-from-inline-defaults, mirrors `PROXY_ENTRY_ROLES` in [resolveOwnerScope.js](backend/erp/utils/resolveOwnerScope.js) and `MD_PARTNER_ROLES` in [mdPartnerAccess.js](backend/utils/mdPartnerAccess.js)). Helper [backend/utils/resolveVipClientLifecycleRole.js](backend/utils/resolveVipClientLifecycleRole.js) exports getters for 7 codes: `VIEW_MERGE_TOOL`, `EXECUTE_MERGE`, `ROLLBACK_MERGE`, `HARD_DELETE_MERGED` (all wired by A.5.5), and `REASSIGN_PRIMARY`, `JOIN_COVERAGE_AUTO`, `JOIN_COVERAGE_APPROVAL` (forward-compat for A.5.4). Defaults: admin + president for VIEW/EXECUTE/ROLLBACK; **president-only** for HARD_DELETE_MERGED (it bypasses the 30-day rollback grace). Plan: `~/.claude/plans/phase-a5-canonical-vip-client.md`. **A.5.4 + follow-on SHIPPED on `feat/phase-a5-4-assigned-to-array` worktree (May 5, 2026, NOT yet pushed)**: `Doctor.assignedTo` flipped scalar→`[ObjectId]`; `primaryAssignee` invariant enforced by pre-save (`primaryAssignee ∈ assignedTo[]` else reset to `assignedTo[0]`); 10 backend readers + 4 frontend display sites swept onto shape-agnostic helpers ([backend/utils/assigneeAccess.js](backend/utils/assigneeAccess.js) + [frontend/src/utils/assigneeDisplay.js](frontend/src/utils/assigneeDisplay.js)); admin Edit modal in [DoctorManagement.jsx](frontend/src/components/admin/DoctorManagement.jsx) replaced single-BDM `<SelectField>` with chip picker (★/☆ primary toggle + `+ Add BDM…` filtered dropdown + remove-X with auto primary-transfer); `createDoctor` + `updateDoctor` accept `primaryAssignee` from body and normalize array shape; lookup-driven role gates `REASSIGN_PRIMARY` + `JOIN_COVERAGE_AUTO` consumed via [resolveVipClientLifecycleRole.userCanPerformLifecycleAction](backend/utils/resolveVipClientLifecycleRole.js) — defaults `[admin, president]`, subscribers loosen `JOIN_COVERAGE_AUTO` to include `staff` for BDM self-join or narrow `REASSIGN_PRIMARY` to president-only via Control Center → Lookup Tables → `VIP_CLIENT_LIFECYCLE_ROLES` (Rule #3 / #19). [Doctor.assignedTo, ProductAssignment.doctor, Visit.doctor, Schedule.doctor, CommunicationLog.doctor] all keep their existing per-BDM unique indexes intact, so the per-BDM weekly visit cap is unaffected by sharing one MD across two BDMs. **Verification**: 47/47 healthcheck PASS ([backend/scripts/healthcheckAssigneeAccess.js](backend/scripts/healthcheckAssigneeAccess.js)), 22/22 Jest unit suite ([backend/tests/unit/assigneeAccess.test.js](backend/tests/unit/assigneeAccess.test.js)), Vite green, full UI smoke ratified end-to-end as president on parallel worktree stack (BE :5001 + FE :5174) — added Jake to Mae's Fel Abejar, toggled primary, submitted, round-tripped, removed primary chip → star auto-transferred, reverted to single BDM cleanly. **Migration `--apply` still pending on dev cluster** — backend tolerates pre-migration scalar shape via Mongoose array-cast on read, but run `node backend/scripts/migrateAssignedToArray.js --apply` immediately after merging to dev to normalize the 725 scalar docs.

12b. **Phase A.5.5 Merge Tool — cascade map** (Apr 28 2026, shipped): Doctor merge re-points 13 FK paths across CRM + ERP. Service is manifest-driven ([backend/services/doctorMergeService.js](backend/services/doctorMergeService.js) `buildCascadeManifest()`). Cascade kinds:
    - **simple** (5 paths): `CommunicationLog.doctor`, `CommunicationLog.aiMatchSuggestion.doctorId`, `InviteLink.doctor`, `CLMSession.doctor`, `MdProductRebate.doctor_id`, `MdCapitationRule.doctor_id`, `PrfCalf.partner_id` → bulk `updateMany`.
    - **nested-array** (2 paths): `Collection.settled_csis.partner_tags.doctor_id`, `Collection.settled_csis.md_rebate_lines.md_id` → positional `$[]` arrayFilters update.
    - **visit-week** (1 path): `Visit.doctor` — collisions on unique `{doctor,user,yearWeekKey}` defused by writing sentinel `<orig>__MERGED_<loserId>` on the loser visit's yearWeekKey. Audit captures original_value for rollback.
    - **schedule** (1 path): `Schedule.doctor` — collisions on unique `{doctor,user,cycleNumber,scheduledWeek,scheduledDay}` defused by bumping cycleNumber by 1e9.
    - **pa-active** (1 path): `ProductAssignment.doctor` — partial-unique on `{product,doctor,active=true}`. Loser rows that collide get deactivated (status='inactive') rather than re-pointed; rollback re-activates if winner side is unchanged.
    - **attribution** (1 path): `PatientMdAttribution.doctor_id` — unique on `{entity_id,patient_id,doctor_id}`. Collisions deactivate loser side; non-collisions re-point.
    Cascade runs inside Mongoose `withTransaction` when Atlas/replica-set is detected; falls back to sequential writes on standalone Mongo (test fixtures only). `DoctorMergeAudit` row is written OUTSIDE the cascade txn so audit failures don't roll back a committed merge — but the controller surfaces a hard error so admin knows rollback won't work. **Cron hard-delete** (30-day grace) is NOT yet wired — defer until first 30-day audit row ages. Until then, manual cleanup via DB shell. Healthcheck: [backend/scripts/healthcheckMdMergeAudit.js](backend/scripts/healthcheckMdMergeAudit.js) — **shipped May 04 2026 (A.5.2-prep)**, 9-section static contract verifier; run before A.5.2 flip and after any merge-service edit.

13. **Phase N — Offline Visit + CLM Merge + Public Deck** (Apr 26 2026, shipped on `feat/phase-n-offline-visit-clm-merge`): One encounter → two DB rows linked by a client-generated UUID. **Visit gains** `clm_session_id` (ref CLMSession, sparse) + `session_group_id` (String, sparse). **CLMSession gains** `visit_id` (ref Visit, sparse), `mode` enum `['in_person','remote']` default `'in_person'`, `deckOpenedAt` + `deckOpenCount` for public-link analytics. **CommunicationLog gains** `clm_session_id` (sparse) so admin can join "remote pitch shared" → "deck opened". **Linkage logic** lives in [visitController.createVisit](backend/controllers/visitController.js) — when the FormData carries `session_group_id`, the controller looks up CLMSession by `idempotencyKey` and stamps `clm_session_id` on the Visit + back-stamps `visit_id` on the CLMSession. Both writes are best-effort (Visit saves with just session_group_id if CLM lookup fails). **Public deck** at `GET /api/clm/deck/:id` ([clmController.getPublicDeck](backend/controllers/clmController.js)) is mounted OUTSIDE `router.use(protect)` in [clmRoutes.js](backend/routes/clmRoutes.js), rate-limited 10 req/min/IP via express-rate-limit, returns ONLY remote-mode sessions (in-person 404s even with a correct ID), redacts to first names only — no BDM email/phone, no GPS. **Frontend public route** at `/clm/deck/:id` → [DeckViewerPage.jsx](frontend/src/pages/public/DeckViewerPage.jsx) — anonymous, renders `CLMPresenter previewMode=true`. **Offline visit submit**: SW queue path in [sw.js](frontend/public/sw.js) now accepts `/api/visits/` plus a JSON envelope `{ kind:'visit', photoRefs, formFields }`. Photo Blobs persist in `vip-offline-data` IndexedDB DB v3, store `visit_photos`; SW reads them at replay time and rebuilds FormData. E11000 (weekly-limit dup) treated as success → dequeue, not retry. **Merged in-person flow**: VisitLogger generates a stable UUID (`draftIdRef`), passes it to CameraCapture as `draftId` (triggers Blob persistence) AND uses it as `session_group_id` at submit. The "Start Presentation" button navigates to `/bdm/partnership?doctorId=…&session_group_id=…&products=…`; PartnershipCLM reads the params, prefills the doctor + products, and uses the same UUID as `idempotencyKey` on `clmService.startSession`. **Remote flow**: CommLogPage has a "Generate Deck Link" panel that creates a remote-mode CLMSession, copies `https://app/clm/deck/<id>` to clipboard; the next CommLog submission via CommLogForm carries `clm_session_id`. Healthcheck script at [backend/scripts/healthcheckOfflineVisitWiring.js](backend/scripts/healthcheckOfflineVisitWiring.js) statically verifies the wiring contract end-to-end. **Gotchas**: (a) DB version bump (`vip-offline-data` v2 → v3) — main thread (offlineStore.js) owns the schema migration; SW opens read-only and falls back to `[]` if SW activates before main has upgraded. (b) Visit unique index `{doctor, user, yearWeekKey}` naturally dedups offline replays — SW catches both 409 and "already been logged this week" 400 as idempotent success. (c) DeckViewerPage uses `withCredentials: false` — never sends cookies even if browser has them, keeps the public route truly anonymous. (d) `mode='remote'` discards any `location` payload server-side so a hostile client can't fake an in-person attribution. (e) The new visit fields are sparse — backwards-compat is intact for every Visit row created before this phase. (f) Plan: `~/.claude/plans/phase-n-offline-visit-clm-merge.md`. Handoff: `memory/handoff_phase_n_apr26_2026.md`.

13b. **Phase N+ — CLM-finalization gate + always-render CLM panel + bidirectional merged flow** (May 03 2026 v1 + May 04 2026 v2 hardening, both shipped + UI-ratified): closes the merged-encounter UX. v1 (May 03, committed `e61ea49`) shipped the always-render panel + clm_pending gate + bidirectional merged flow. v2 (May 04) hardens it:
    - **Always-render**: VisitLogger's "Run Partnership Presentation" panel was previously gated on `formData.productsDiscussed.length > 0` ([VisitLogger.jsx:708](frontend/src/components/employee/VisitLogger.jsx)). Gate dropped — the panel now renders for every doctor, since BDM may have an opportunity to present even before picking products (CLM has its own product-picker step). The forwarded URL still includes `&products=` (empty CSV when nothing is preselected), and the in-CLM picker handles the rest. Button label dynamically reads "Start Presentation" or "Start Presentation with N Products" so the BDM knows the picker state.
    - **CLM-finalization gate (the rule)**: gate is **opt-in by CLM use, not by doctor**. When BDM does NOT click Start Presentation → no `clm_pending` flag → Submit only requires a photo (the no-CLM path is fully open — photo + selfie is sufficient). When BDM DOES click Start Presentation, then clicks Skip on the Session Complete modal, `returnAfterCLM({ pendingSession: true })` appends `?clm_pending=1&session_group_id=…` on the back URL. VisitLogger reads `clm_pending` via `useSearchParams`, replaces the yellow "Run Partnership Presentation" panel with a red "CLM session not finalized" warning that includes a "Resume CLM session" button, AND disables Submit Visit. Defense-in-depth: `handleSubmit` early-exits with a toast if `clmPending` is true. **Why**: the BDM presented partnership material to the doctor — that interaction needs Interest Level + Outcome + Notes captured before the visit can count, otherwise admin loses the analytics signal. Skip is allowed (BDM can step away mid-flow), but the visit cannot be submitted until they Resume → fill in → Save Session.
    - **Bidirectional merged flow**: previously the merged flow only supported VisitLogger → CLM → back. Direct entry to /bdm/partnership left the BDM stranded on the doctor-pick step after Save Session with no path to log the proof of visit. Renamed `returnToVisitLoggerIfLaunchedFromIt` → `returnAfterCLM` ([PartnershipCLM.jsx:349-358](frontend/src/pages/employee/PartnershipCLM.jsx)) and unified the post-modal navigation: it now resolves `doctorIdToUse` and `uuidToUse` from URL params (merged flow) OR `selectedDoctor + activeIdempotencyKey` state (direct flow). New state `activeIdempotencyKey` is set in `handleStartPresentation` (online + offline + catch paths) so direct-mode Save Session forwards to `/bdm/visit/new?doctorId=X&session_group_id=Y` — the eventual Visit gets `clm_session_id` stamped via the existing Phase N idempotencyKey lookup. `session_group_id` on the offline session stub is also persisted for parity.
    - **VisitLogger Phase-N draftIdRef** initializer prefers `incomingSessionGroupId` from URL when present so a Resume CLM round-trip preserves the same UUID through the offline-store draft, the CLM idempotencyKey, and the eventual Visit.session_group_id.
    - **v2 (May 04 2026) — Symmetric Skip across both channels**: v1 left direct-mode Skip on /bdm/partnership step='doctor' on the rationale "BDM may have skipped because they're not logging a visit." User overrode that: the rushed-BDM scenario (doctor leaving, BDM needs the selfie *now*) requires Skip to forward to VisitLogger in BOTH merged AND direct modes. Removed the `if (options.pendingSession && !incomingDoctorId) return;` early-exit. Both Skip paths now navigate to `/bdm/visit/new?doctorId=X&session_group_id=Y&clm_pending=1`. Visit Submit stays blocked in both channels until Resume → Save Session.
    - **v2 — Save Session button gate**: Notes was the only Session Complete field not validated. Now Save Session is **disabled** unless `endForm.bdmNotes?.trim()` AND `endForm.interestLevel ∈ [1,5]` AND `endForm.outcome` is set. Notes label has a red asterisk; placeholder reads "Key observations, objections, questions asked... (required)"; disabled state has 0.5 opacity + cursor not-allowed + tooltip "Fill in Notes to enable Save Session". Follow-up Date label gets explicit "(optional)" suffix to call out the asymmetry. Defaults (Interest=3, Outcome=maybe) make the gate effectively just-Notes in practice but the validation guards future regressions.
    - **v2 — Backend Resume vs duplicate-sync split** ([clmController.js:82-110 + 156-178](backend/controllers/clmController.js)): `POST /clm/sessions` with `X-Idempotency-Key` used to ALWAYS return 409 when a session existed, breaking Resume because PartnershipCLM's catch block fell back to an offline-mode stub (Session Complete data was saved as offline draft, not pushed to the original CLMSession record). New contract: `(sameUser && status === 'in_progress') → 200 { data: existing, resumed: true }` (Resume); else `409 { data: existing }` (duplicate-sync — completed session OR different user trying to hijack). Both the pre-check AND the race-safe E11000 catch implement the same split. Frontend `setActiveSession(res.data)` works for both 201 (new) and 200 (resumed) since both responses carry `data: <session>` in the envelope. The 200 response carries `resumed: true` for future toast-UX hooks (not yet wired — see follow-ups).
    - **In-modal hint copy** (updated for v2): "Interest Level, Outcome, and Notes are required so admin can coach and refine the deck. Save Session forwards you to the visit log to upload the proof-of-visit photo. Skip lets you capture the selfie first if the client is leaving — but Visit Submit stays blocked until you Resume CLM and Save this session."
    - **Smoke-ratified** end-to-end through Playwright as Mae Navarro (s3.vippharmacy@gmail.com): v1 — Path A merged-Save (Christine), Path B no-CLM (Allysia), Path C direct-Save (Edmar — visit `69f766bf` ↔ CLM `69f7665a`), Path D merged-Skip → banner → Resume → Save (Bella — visit `69f76928` ↔ CLM `69f76812`). v2 re-smoke (May 04) covers: Path E direct Skip → VisitLogger banner → Resume → Save → Submit (validates the symmetric Skip + the 200 Resume contract end-to-end), Path F Save Session disabled until Notes filled, Path G regression on merged-Save, Path Z regression on no-CLM photo-only path.
    - **Phase N+ closure (May 04 2026 evening)** — follow-ups (a) + (c) shipped:
      - **(a) Resume toast** — [PartnershipCLM.handleStartPresentation](frontend/src/pages/employee/PartnershipCLM.jsx) now reads `res.resumed === true` from the 200 response and fires a `toast('Resuming in-progress CLM session for <FirstName LastName>', { icon: '🔁' })` so the BDM has visible confirmation that they re-entered the same session record (vs. a brand-new one). 5-line change.
      - **(c) Healthcheck** — [backend/scripts/healthcheckClmIdempotency.js](backend/scripts/healthcheckClmIdempotency.js) (NEW, 6 sections / asserts contract intact end-to-end): clmController has same-user guard ≥2× + in_progress guard ≥2× + 200/resumed:true ≥2× + 409 ≥2× + E11000 catch + remote-mode location discard; CLMSession has sparse unique index on idempotencyKey; clmRoutes wires POST /sessions; clmService sends `X-Idempotency-Key`; server.js CORS lists `X-Idempotency-Key` (CLAUDE.md gotcha 8b — preflight would fail silently otherwise); PartnershipCLM reads `res.resumed`. Run: `node backend/scripts/healthcheckClmIdempotency.js` — exit 0 = clean.
      - **PageGuide banner** — [`partnership-clm`](frontend/src/components/common/PageGuide.jsx) updated to mention Notes-required gate + Skip-then-Resume flow + "Resuming in-progress session" toast (Rule #1 — banners must reflect current behavior).
    - **Remaining open follow-ups**: (b) Photo persisted to IndexedDB under `draftId=X` doesn't restore in the live UI when VisitLogger remounts — CameraCapture writes but doesn't read on mount. Cosmetic (BDM re-uploads). (d) **Slide-stats per BDM Phase 2** — ✅ SHIPPED (May 04 2026, see note 13c).

13c. **Phase D.4c — CLM Pitch Performance coaching surface** (May 04 2026, shipped + healthcheck-ratified): Phase 2 follow-up from note 13b is in. New admin tab at [/admin/statistics](frontend/src/pages/admin/StatisticsPage.jsx) → "CLM Performance" renders three panels over a default 90-day window:
    - **Panel 1 — BDM Comparison Table**: one row per BDM with totalSessions, avgDuration (min), avgSlidesViewed, avgDwell/slide (sec), conversionRate (%), avgInterestLevel, earlyExitCount. Status pill (`on track` / `short` / `coach` / `new BDM`) computed client-side against thresholds. Sortable on every numeric column. Row-click drills into the BDM Performance tab for that BDM (mirrors Team Activity click-to-drill from note 14).
    - **Panel 2 — Slide Performance Heatmap**: bar chart of avg dwell per slide × view count + drop-off% (terminal-slide ratio). Drop-off > 25% rendered red so admin sees immediately which slide bleeds attention.
    - **Panel 3 — Top Products × BDM**: per-BDM × per-product rows (timesPresented, interestRate%, avgTimeSpent). Sorted server-side by interestRate then timesPresented; capped at 30 rows on the frontend so the table stays readable.
    - **Backend**: new endpoint `GET /api/clm/sessions/performance` (admin-only, mounted BEFORE `/sessions/:id` generic) in [clmController.getPerformanceMatrix](backend/controllers/clmController.js). Three independent aggregation pipelines all `$match {status: 'completed'}` + entity scope + optional `userId` window. `bdmComparison` groups by user with conversion = (interested + already_partner) / total × 100 and per-slide dwell = totalSlideDwellMs / totalSlideEvents (true average, not skewed by sessions that exited early). `slidePerformance` unwinds slideEvents and joins drop-off counts from a sister `slidesViewedCount - 1` pipeline. `bdmProductMatrix` unwinds productsPresented and groups by `{user, product}`. Existing `getAnalytics` is untouched (no regression risk on existing callers).
    - **Lookup-driven thresholds**: `CLM_PERFORMANCE_THRESHOLDS` lookup category (lazy-cached 60s, inline `DEFAULTS` in [backend/utils/clmPerformanceThresholds.js](backend/utils/clmPerformanceThresholds.js)) — 5 keys: `min_avg_dwell_seconds_per_slide` (10), `target_avg_session_minutes` (8), `target_conversion_rate_pct` (30), `min_slides_viewed` (4), `flag_below_total_sessions` (5). Subscribers tune per-entity via Control Center → Lookup Tables — Rule #3 / Rule #19. `insert_only_metadata: true` so admin overrides survive future re-seeds.
    - **Tab badge**: red badge counts BDMs flagged below `target_conversion_rate_pct` OR below `min_avg_dwell_seconds_per_slide` (skipping new BDMs with fewer than `flag_below_total_sessions` sessions). Same pattern as Team Activity's red-flag count badge.
    - **Subscription readiness**: per-entity `entity_id` filter via existing `resolveEntityId()` (Rule #21 — president sees cross-entity by default with optional `?entity_id=` narrow; admin/finance see their working entity). Threshold helper caches per entity_id with 60s TTL + `invalidate()` hook so admin's lookup edit propagates within a minute.
    - **Healthcheck**: [backend/scripts/healthcheckClmPerformance.js](backend/scripts/healthcheckClmPerformance.js) — 34/34 PASS. Asserts: helper exports + 5 default keys + Lookup query category, controller has 3 pipelines + entity scope + earlyExitCount, route mounted before `/:id`, lookup seed has 5 metadata keys + `insert_only_metadata`, frontend service hits `/clm/sessions/performance`, StatisticsPage imports clmService + state + lazy-load + tab button + 3 panels + Refresh handler.
    - **PageGuide banner** (Rule #1) — `statistics-page` entry updated to describe the new CLM Performance tab + tip mentions `CLM_PERFORMANCE_THRESHOLDS` so admin discovers tunability.
    - **Live HTTP smoke** (May 04 2026): logged in as president, GET `/api/clm/sessions/performance` returned 200 with the expected shape — `window` + `thresholds` (5 default keys) + `bdmComparison` (1 row, Mae 8 sessions) + `slidePerformance` (5 slides) + `bdmProductMatrix` (6 rows). Threshold lookup-row not yet seeded for the entity but the helper falls back to inline DEFAULTS cleanly.

13d. **Phase O — Visit Photo Trust + Screenshot Block + Late-Log Cutoff** (May 05 2026, shipped + smoke-ratified): closes the back-dating fraud surface and the screenshot abuse pattern surfaced by the Jake Montero May 4 case (one Messenger screenshot, two different VIP Clients, identical timestamp). Backend now extracts EXIF server-side via `exifr` (^7.1.3, new dep — pure JS, no native bindings) in [middleware/upload.js processVisitPhotos](backend/middleware/upload.js) BEFORE sharp's re-encode strips it; `Visit.visitDate` is auto-anchored to the earliest photo's `DateTimeOriginal` rather than the BDM-supplied `visitDate` body field; photos older than the lookup-driven cutoff (default 14 days) are hard-blocked at upload. **Screenshot detection** in [backend/utils/photoMetadata.js extractMetadata](backend/utils/photoMetadata.js) uses a conservative trifecta (no EXIF DateTimeOriginal AND no EXIF GPS AND aspect ratio ≥ 1.85 AND width OR height matches a known phone resolution like 1080/1170/1284/1290/1440) — when all three signals fire, the upload returns **HTTP 422** with `{ code: 'SCREENSHOT_DETECTED', redirect: '/bdm/comm-log' }` and [VisitLogger handleSubmit](frontend/src/components/employee/VisitLogger.jsx) navigates the BDM to `/bdm/comm-log?doctorId=<X>` with the doctor pre-selected. Three new error codes also fire from the controller: `VISIT_PHOTO_TOO_OLD` (EXIF age > cutoff), `VISIT_PHOTO_FUTURE_DATED` (EXIF date > 1 day ahead — clock skew guard), `CAMERA_PHOTO_MISSING_EXIF` (only when subscriber sets `require_exif_for_camera_source: true`). Three new `photoFlags` codes (`no_exif_timestamp`, `gps_in_photo`, `late_log_cross_week`) emit as **signal-only flags** that admin sees but don't disqualify the visit from per-diem. **Lookup-driven thresholds** (Rule #3 + Rule #19) via new category `VISIT_PHOTO_VALIDATION_RULES` (5 metadata keys: `late_log_max_days_old`=14, `cross_week_soft_flag`=true, `screenshot_block_enabled`=true, `screenshot_redirect_path`='/bdm/comm-log', `require_exif_for_camera_source`=false), helper at [backend/utils/visitPhotoValidation.js getThresholds](backend/utils/visitPhotoValidation.js) with 60s TTL cache + invalidate hook (mirrors `clmPerformanceThresholds.js` / `teamActivityThresholds.js`); seed uses `insert_only_metadata: true` so admin tweaks survive future re-seeds. **Downstream regression fix** in [backend/erp/services/smerCrmBridge.js](backend/erp/services/smerCrmBridge.js): the pre-Phase-O `$size === 0` photoFlags filter (line ~230) would have treated the new `no_exif_timestamp` signal flag as disqualifying — silently killing per-diem for every BDM using the in-app camera (canvas → JPEG has no EXIF). Replaced with `$setIntersection` against a `PERDIEM_DISQUALIFYING_FLAGS = ['date_mismatch', 'duplicate_photo']` constant; only fraud flags now disqualify per-diem, signal flags stay countable. Future-Phase work: lift `PERDIEM_DISQUALIFYING_FLAGS` to a Lookup category for true subscriber control. **Photo restoration fix** in [CameraCapture.jsx](frontend/src/components/employee/CameraCapture.jsx) — previously CameraCapture's internal `photos` state was independent of VisitLogger's restored photos array, so an offline draft restore showed 0 thumbnails even though the parent knew photos existed (CLAUDE.md note 13b follow-up b). Now accepts an `initialPhotos` prop, useEffect seeds it on mount, guarded by `initialSeededRef` so user-captured photos can't be clobbered when the parent's async restoration callback fires after the BDM already started capturing. **Healthcheck**: [backend/scripts/healthcheckPhaseOPhotoTrust.js](backend/scripts/healthcheckPhaseOPhotoTrust.js) — **10/10 PASS** (9 Phase O sections + 1 SMER bridge regression guard). **Live API smoke (Mae Navarro on dev cluster)**: (a) 1080×2400 PNG → HTTP 422 + `code: SCREENSHOT_DETECTED` + `redirect: '/bdm/comm-log'`; (b) 1920×1080 JPEG (16:9 — below the 1.85 screenshot floor) → HTTP 201 + `photoFlags: ['no_exif_timestamp']` (correct: canvas-output JPEGs have no EXIF); (c) `GET /api/erp/expenses/smer/crm-md-counts?period=2026-05&cycle=C1` → May 5 entry shows `md_count: 1, flagged_excluded: 0` confirming `no_exif_timestamp` does NOT kill per-diem post-fix. **Vite build**: ✓ 14.17s. **PageGuide banner** updated for `new-visit` (Rule #1). **Test residue**: 2 smoke visit rows remain on dev (`69f9d7ed0498a87019eb239d` — Mae→Amador Aguirre, and `69f9dbdcd2e4bcf27714aead` — Mae→Fel Abejar, both 2026-05-05, gray placeholder photos, photoFlags `['no_exif_timestamp']`). Cancel route is admin-gated (`DELETE /api/visits/:id`); the rows are legitimate test data and exercise the `no_exif_timestamp` flag end-to-end. Plan: drop via admin login or Mongo shell if they pollute weekly-cap testing later.

**Phase O.1 — UI-smoke-driven hardening (May 05 2026, same-day)**: live Playwright UI smoke exposed three follow-on issues that the API smoke missed:

1. **Compressed-screenshot path missed by trifecta** — frontend `compressImage` (CameraCapture.jsx, maxDim=1024) shrinks 1080×2400 → 460×1024 *before* upload. The original `(aspect ≥ 1.85 AND matchesPhoneRes)` heuristic missed because neither 460 nor 1024 are in `PHONE_RESOLUTIONS`. **Fix**: relaxed `extractMetadata` to fire on `(matchesRawScreenshot OR aspectRatio ≥ 2.0)` — added `SCREENSHOT_ASPECT_RATIO_COMPRESSED_FLOOR = 2.0` constant. False-positive analysis: 4:3 selfies = 1.33, 16:9 = 1.78, 9:18.5 cinema portrait = 2.05+ — all clear of 2.0. Live smoke confirms 460×1024 compressed screenshot now 422s, 1024×576 compressed 16:9 frame still passes through.

2. **Server EXIF defeated by frontend canvas-compression** — `compressImage` canvas-encodes before upload, which ALWAYS strips EXIF. So `serverMeta.capturedAt` is null for every in-app camera capture and gallery upload — the late-log cutoff guard would have NEVER fired in practice. **Fix**: `visitController.createVisit` now merges server-EXIF + frontend-claimed EXIF (`parsedPhotoMeta[i].capturedAt`) into a `mergedMetas` array before passing to `resolveAggregateVisitDate`. Server-EXIF still takes precedence per-photo; frontend-EXIF is the second-tier source. Same 14-day cutoff + future-dated guards apply identically to both sources, so the fraud surface stays bounded. Refined `no_exif_timestamp` flag to fire only when BOTH server-EXIF AND frontend-EXIF are missing (otherwise every visit would flag — pure noise).

3. **CommLogPage didn't read `?doctorId=`** — the screenshot-redirect path (`/bdm/comm-log?doctorId=<X>`) successfully landed the BDM on Comm Log but the doctor wasn't preselected, forcing a re-pick. **Fix**: `CommLogPage` now reads `searchParams.get('doctorId')` on mount, fetches the doctor via `doctorService.getById`, auto-opens the form with `preselectedDoctor` set, and shows a confirmation toast ("Logging Comm interaction with <name>"). The form was already prop-aware via `CommLogForm.preselectedDoctor`; just needed the page-level wiring.

**Live UI ratification (post-Phase-O.1)**: Mae logs in → `/bdm/visit/new?doctorId=Gemma` → uploads synthetic 1080×2400 PNG → CameraCapture compresses to 460×1024 → submits with VOICE CALL engagement → server fires 422 SCREENSHOT_DETECTED → toast "This looks like a screenshot, not a visit photo. Use Comm Log..." → URL navigates to `/bdm/comm-log?doctorId=Gemma` → CommLog opens with form pre-shown + Gemma Alba preselected → second toast "Logging Comm interaction with Gemma Alba". **Vite build**: ✓ 1m. **Healthcheck**: 10/10 PASS. **Helper unit smoke**: 6/6 PASS (added compressed-screenshot path tests). **Files added in Phase O.1**: `frontend/src/pages/employee/CommLogPage.jsx` (+30 lines for `useSearchParams` + `preselectedDoctor` state + auto-open). **Files updated**: `backend/utils/photoMetadata.js` (compressed-screenshot constant + dual-path heuristic), `backend/controllers/visitController.js` (mergedMetas + dateSourcePerPhoto + no_exif_timestamp refinement), `backend/scripts/healthcheckPhaseOPhotoTrust.js` (3 new asserts), `frontend/src/pages/employee/CommLogPage.jsx`. **Screenshot evidence**: `phase-o1-final-ratified-comm-log-preselected.png` at repo root (the redirect destination with form auto-open).

14. **Team Activity Cockpit + Overview drill-down** (Apr 29 2026, shipped + smoke-ratified): COO daily-scan surface answering "who do I talk to today and why." New tab in [/admin/statistics](frontend/src/pages/admin/StatisticsPage.jsx) (leftmost, with a red badge counting red-flagged BDMs) renders one row per active staff with Today / This Week / This Month / Cycle counts + last-visit recency + a 🚩 red-flag pill. Worst-first sort by default (red-flag > never > warning > ok, then ascending callRate). Click any row → drills into BDM Performance tab pre-selected via `handleBdmDrillDown`. Same handler is wired into the Overview tab's Per-BDM Call Rate `<Bar onClick>` so the bar chart is also clickable (Quick Win — symmetric with row click). Backend: `GET /api/schedules/team-activity` (admin-only) — one Manila-time-correct sweep across Visit + Schedule for the current cycle, computes `gapWorkdays` walking backward from today over Mon-Fri only. Thresholds (`red_flag_consecutive_workdays=2`, `gap_warning_workdays=1`, `target_call_rate=80`) are lookup-driven via `TEAM_ACTIVITY_THRESHOLDS` lookup category (lazy-cached 60s, inline DEFAULTS in [backend/utils/teamActivityThresholds.js](backend/utils/teamActivityThresholds.js)) so subscribers tune the cadence per-entity via Control Center → Lookup Tables — no code deploy. Lookup row uses `insert_only_metadata: true` so admin overrides survive future re-seeds. **Gotchas**: (a) Manila-local "today" boundaries — the controller shifts `now → MANILA_OFFSET_MS` then resets to UTC midnight before subtracting the offset back, so a 00:30 PHT visit doesn't bucket to "yesterday" UTC. Same pattern for week/month starts. (b) Rows are sorted server-side by default flag-then-rate; client-side sort overrides on header click. (c) `ROLES.STAFF` is the active filter (Phase S2 — `ROLES.CONTRACTOR` is now an alias to `'staff'`). (d) Healthcheck at [backend/scripts/healthcheckTeamActivity.js](backend/scripts/healthcheckTeamActivity.js) statically verifies the 22-point wiring contract (controller/route/helper/lookup/service/tab/banner/route-guard parity). (e) Per-BDM bar chart click in Overview goes through Recharts' `<Bar onClick>` which fires with the row payload as the first arg — that payload now carries `userId` (added in `fetchOverviewData` perBdmCallRates push). The Recharts DOM renders 11 `.recharts-bar-rectangle` groups; React synthetic-event bridge handles the click bubbling correctly. (f) The Team Activity tab badge counts redflag + never so a quick glance at the page header tells admin whether to drill in. Plan reasoning: rejected the matrix-of-cells alternative because it's a *reference* view, not a *decision* view — COO needs an action list, not a 220-cell scan.

12c. **Phase A.6 Admin-Driven One-Off Scheduling** (May 05 2026, shipped + healthcheck-ratified): admin can now schedule and reschedule individual VIP visits without going through the CPT Excel re-import. Three entry points, one shared modal:
    - **Add VIP / Upgrade-to-VIP** ([DoctorsPage.handleUpgradeToVIP](frontend/src/pages/admin/DoctorsPage.jsx)) — clicking Upgrade opens [ScheduleVisitsModal](frontend/src/components/admin/ScheduleVisitsModal.jsx) in `mode='create'` with prefilled dates (W1+W3 Tuesdays for `2x/mo`, W1..W4 Tuesdays for `4x/mo`). Admin edits or accepts; on Confirm, the VIP is created with `initialSchedule` in one round-trip; on Skip, the VIP is created without and gets a "Needs scheduling" badge on the row.
    - **Schedule / Reschedule per VIP row** ([DoctorManagement.jsx](frontend/src/components/admin/DoctorManagement.jsx)) — every VIP row has a CalendarDays action button. Mode is decided by a lookup against `scheduleService.adminGetUpcoming`: 0 entries → `mode='schedule'` (prefill), 1+ → `mode='reschedule'` (existing entries as date pickers).
    - **Reschedule from EmployeeVisitReport row** ([EmployeeVisitReport.jsx](frontend/src/components/admin/EmployeeVisitReport.jsx) + [ReportsPage.handleEvrReschedule](frontend/src/pages/admin/ReportsPage.jsx)) — the BDM Visit Report's Actions column carries a per-row Reschedule button that opens the same modal with the BDM context already resolved from `reportData.employee._id`.
    - **Backend contract**: `PATCH /api/schedules/admin/:id` accepts `{ date: 'YYYY-MM-DD' }` and re-derives `cycleNumber` / `scheduledWeek` / `scheduledDay` / `scheduledLabel` via [scheduleSlotMapper.dateToSlot](backend/utils/scheduleSlotMapper.js); rejects completed (409 — visit already logged) and missed (409 — past cycle); enforces alternating-week rule for `visitFrequency: 2`; maps E11000 to 409 with friendly message. `POST /api/schedules/admin/create` now accepts `{ date }` per entry alongside the legacy `{ scheduledWeek, scheduledDay }` shape (backward-compat preserved). `GET /api/schedules/admin/upcoming?doctorId=X&userId=Y` lists planned/carried entries for one VIP under one BDM. `GET /api/schedules/admin/upcoming-counts?doctorIds=a,b,c` is a single $group aggregation that returns `{doctorId: count}` (capped at 100 IDs server-side; page paginates at 20) — powers the "Needs scheduling" badge so the bulk-fetch is one round-trip per page render.
    - **Atomic VIP-create-with-schedule**: `POST /api/doctors` accepts optional `initialSchedule: [{ date }, ...]` and wraps Doctor + Schedule inserts in `mongoose.startSession().withTransaction()` (Atlas) with a compensating `Doctor.deleteOne` fallback for standalone Mongo. Cross-row alt-week guard runs server-side over the entire proposed set so a 2x/mo VIP can't slip through with W1+W2 even if the modal is bypassed.
    - **Scope decision**: editing a *logged Visit's* `visitDate` is **out of scope** — the existing visit-update endpoint still rejects it ([visitController.js:455](backend/controllers/visitController.js)). Reason: BDMs editing their own logged visit dates would let them bypass the weekly-limit cap (Rule 1.1 — log Mon, edit to last Fri, log again). Admin-only Visit-date edit + audit-log + period-lock is a separate phase if/when needed.
    - **Lookup-driven future**: role gating uses `adminOnly` middleware today; `SCHEDULE_LIFECYCLE_ROLES` lookup category (codes `RESCHEDULE`, `INITIAL_SCHEDULE_ON_CREATE`) is the documented migration path when subscribers need to delegate (mirrors `MD_PARTNER_ROLES` / `PROXY_ENTRY_ROLES`). Inline defaults in code today: `['admin']` + president implicit. Smart-default day (Tuesday = 2) and `2x/mo` pattern (W1+W3) are inline constants in [scheduleSlotMapper.generateDefaultDates](backend/utils/scheduleSlotMapper.js); if subscribers want different defaults, lift to `SCHEDULE_DEFAULTS.PREFERRED_DAY_OF_WEEK` / `.VISIT_FREQ_2_PATTERN` lookup keys.
    - **Healthcheck**: [backend/scripts/healthcheckAdminScheduling.js](backend/scripts/healthcheckAdminScheduling.js) — **36/36 PASS**. Asserts mapper exports + alt-week rules + controller endpoints + route mount order (`/admin/upcoming` before `/admin/:id` to avoid Express shadowing) + transaction-with-fallback path + frontend service + modal testids + DoctorsPage wiring + DoctorManagement badge + EVR action column + ReportsPage modal mount + PageGuide updates.
    - **PageGuide banners** updated for `doctors-page` (mentions Schedule/Reschedule action + Needs scheduling badge + alt-week rule) and `reports-page` (mentions per-row Reschedule action + scope) per Rule #1.
    - **Vite build**: ✓ built in 10.16s (no warnings).
    - **Smoke status (May 05 2026, ratified)**: end-to-end smoke passed against the dev cluster. (a) **API smoke** as president (`yourpartner@viosintegrated.net`): GET `/api/schedules/admin/upcoming-counts?doctorIds=...` returned `{currentCycle: 4, counts: {...}}` with one VIP at 0 (matched the "Needs scheduling" badge in the UI); GET `/api/schedules/admin/upcoming?doctorId=X&userId=Y` returned planned + carried entries in `{currentCycle, entries}` shape; PATCH `/admin/:id` round-trip on a 2x/mo planned entry W3D3 (May 13) → W3D4 (May 14) → W3D3 succeeded each time (200 + correct slot tuple); 6/6 negative paths returned the right status: weekend → 400, past cycle → 400 with friendly message, alt-week violation (W3 → W2 on a 2x/mo) → 400 ("Existing entry on W1 conflicts with proposed W2"), no-op same-day → 200 with `unchanged: true`, missing body → 400, non-existent ID → 404. (b) **Playwright UI smoke** on `/admin/doctors`: 20 rows rendered, exactly 2 carried "Needs scheduling" badges (matched the API counts), 20 Schedule/Reschedule action buttons; row 0 (Fel Abejar, 4x/mo, 0 upcoming) opened the modal in `mode='create'` titled "Schedule visits" with 4 prefilled Tuesday inputs; row 2 (Gifford Abejo, 4x/mo, 4 upcoming) opened the modal in `mode='reschedule'` titled "Reschedule visits" with the existing Thursdays prefilled. (c) **Playwright UI smoke** on `/admin/reports`: BDM picker → Mae Navarro → Generate Report rendered the Call Plan grid with 88 per-row Reschedule buttons (testid `evr-reschedule-<doctorId>`); clicking Amador Aguirre's row opened the modal in reschedule mode with 3 existing Wednesday entries. No console errors during the smoke (one CSS warning, unrelated). Cycle anchor verified via `scheduleSlotMapper.slotToDate(4,3,3) = 2026-05-13` matching the API response.

15. **Programs / Support Types foundation ratified** (May 05 2026, smoke-only — no code change): the four configurable categories (Programs: CME GRANT, MED SOCIETY PARTICIPATION, REBATES / MONEY, REST AND RECREATION; Support Types: AIR FRESHENER, FULL DOSE, PATIENT DISCOUNT, PROMATS, STARTER DOSES) were end-to-end smoked against the dev cluster as president to confirm the existing wiring is healthy. Contract verified:
    - **Models**: [Program.js](backend/models/Program.js) + [SupportType.js](backend/models/SupportType.js) — admin-owned MongoDB collections (NOT lookup enums); `{ name, isActive, timestamps }` with case-insensitive uniqueness.
    - **Doctor tags**: [Doctor.programsToImplement](backend/models/Doctor.js#L190) + `Doctor.supportDuringCoverage` are string arrays (NOT FK refs). Indexed for $in filter performance.
    - **Endpoints** (mounted at [server.js:329-330](backend/server.js#L329-L330) under `cacheControl(300)`): `GET /api/programs` + `/stats` ([programController.js](backend/controllers/programController.js)), `GET /api/support-types` + `/stats` ([supportTypeController.js](backend/controllers/supportTypeController.js)). Read is open to all authenticated roles (BDMs need it for filter dropdowns); CRUD + `/stats` are `adminOnly`. Stats compute enrolled-doctor-count + visited-this-cycle + coverage% per item using [scheduleCycleUtils](backend/utils/scheduleCycleUtils.js) for Manila-time cycle bounds.
    - **Admin UI**: [/admin/settings](frontend/src/pages/admin/SettingsPage.jsx) (sidebar label "Programs") renders two tabs via shared [ProgramSupportManager](frontend/src/components/admin/ProgramSupportManager.jsx) — Add / Rename / Deactivate / Reactivate / Seed-from-Existing. The component cache-busts every fetch with `_t: Date.now()` to neutralize the 5-min `cacheControl(300)` after a mutation, and calls `invalidateLookupCache()` so the Doctor edit modal picks up new options without a page refresh.
    - **Stats UI**: [StatisticsPage.jsx Programs tab](frontend/src/pages/admin/StatisticsPage.jsx) (`ProgramMonitoringTab`, lines ~2854-2919) renders 9 cards (4 Programs + 5 Support Types) with coverage%/enrolled/visited matching the API exactly. Lazy-loaded on first tab visit.
    - **Doctor filter**: [DoctorsPage.jsx:691-692](frontend/src/pages/admin/DoctorsPage.jsx#L691-L692) → [doctorController.js:86-95](backend/controllers/doctorController.js#L86-L95) — `programsToImplement` and `supportDuringCoverage` query params drive `$in` filters; bad values return 0 (no silent fallback — Rule #21). Custom `FilterDropdown` in [DoctorManagement.jsx:1279-1318](frontend/src/components/admin/DoctorManagement.jsx#L1279-L1318) uses `useLookupData()` to populate options + a fallback union with whatever appears on the loaded doctor rows so a stale lookup never hides legitimate values.
    - **Smoke evidence (May 05 2026)**: API as president — `/programs` 200 (4 active), `/programs/stats` 200 cycle 4 (REST=87 enrolled / 3 visited / 3%; MED SOCIETY=5/0/0%; CME GRANT=0/0/0%; REBATES=23/0/0%), `/support-types` 200 (5 active), `/support-types/stats` 200 (AIR=16/3/19%; PROMATS=83/0/0%; FULL DOSE / PATIENT DISCOUNT / STARTER DOSES = 2/0/0% each); Doctor filter `programsToImplement=REST AND RECREATION` → 87 (matches stats), `supportDuringCoverage=AIR FRESHENER` → 16 (matches), combined `REBATES/MONEY + PROMATS` → 4 (subset), nonexistent value → 0; anon → 401, BDM (Mae) `/programs` → 200 + `/programs/stats` → 403 (correct gate). Playwright UI — Settings page Programs tab 4 rows / Support Types tab 5 rows; Statistics → Programs tab 9 cards matching API; Doctors page "All Programs" dropdown 4 opts → REBATES/MONEY → "20 of 23"; "All Support Types" 5 opts → AIR FRESHENER → "16 of 16". 0 console errors during the smoke (the `net::ERR_ABORTED` lines on `/api/doctors` are React 18 StrictMode double-mount cancellations from `fetchDoctorsControllerRef.current?.abort()` — intentional).
    - **Known SaaS gap (deferred — Phase PRG / Phase S6)**: `getProgramStats` and `getSupportTypeStats` query `Doctor` + `Visit` globally without `req.entityId`. Fine for VIP single-tenant today, but will cross-leak when SaaS spins out (Year 2). Same posture as several pre-S6 endpoints; will be addressed in the broader Phase S6 tenant-isolation sweep, not in isolation. No urgency.
    - **Future spend-attribution (deferred — Phase PRG, see [docs/PHASE-TASKS-CRM.md Phase PRG](docs/PHASE-TASKS-CRM.md))**: today Programs/Support Types are *labels* on doctors, not *cost objects*. PRF/CALF and rebates have no `program_code` / `support_type_id`, so spend-per-program-per-MD is unmeasurable and the `coverageRate` on the Stats tab is the only available signal. Phase PRG-1 (schema tag) → PRG-2 (Stats overhaul) → PRG-3 (per-MD drill-down) → PRG-4 (auto-join Rx attribution once VIP-1.D `PatientMdAttribution` ships) is planned but NOT scoped for any active sprint. The current foundation is sufficient for cycle-coverage monitoring; build out only when admin signals they want true ROI per program.

13. **Phase VIP-1.A MD Partner Lead Pipeline** (Apr 26 2026, shipped): `Doctor` gained `partnership_status` (LEAD/CONTACTED/VISITED/PARTNER/INACTIVE), `lead_source`, `partner_agreement_date`, `prc_license_number`, `partnership_notes`. Admin operator surface at `/admin/md-leads` ([frontend/src/pages/admin/MdLeadsPage.jsx](frontend/src/pages/admin/MdLeadsPage.jsx)) drives LEAD→CONTACTED→VISITED→PARTNER. **Gotchas**: (a) existing Doctors loaded without `partnership_status` get `'VISITED'` on next save via the pre-save hook (flipped from `'PARTNER'` on Apr 29 2026 — see corrective-migration note below); net-new docs default to `'LEAD'`. **Apr 29 2026 corrective migration**: `backend/scripts/migrateLegacyPartnersToVisited.js` ran on prod (idempotent, dry-run-by-default) — flipped all 742 legacy-backfill PARTNERs (no `partner_agreement_date`) back to VISITED. Reason: the Apr 26 backfill optimistically marked legacy doctors PARTNER, but the rebate engine treats PARTNER as eligible-to-be-paid and the online-pharmacy patient-attribution capture has not started, so no doctor has earned PARTNER status under the Phase VIP-1.A rules yet. Final state: 742 VISITED / 0 PARTNER. Pre-save hook + script use the same heuristic (missing/null status → VISITED for legacy, LEAD for new). (b) Promoting to PARTNER requires `partner_agreement_date` (Gate #2 of the rebate engine that VIP-1.B will wire). (c) BDMs can move LEAD→CONTACTED→VISITED on their OWN assignees but cannot promote to PARTNER (admin/president only — keeps rebate-eligibility decisions out of field reps' hands). (d) Status pill labels + colors come from `DOCTOR_PARTNERSHIP_STATUS` lookup (rows: `LEAD`/`CONTACTED`/`VISITED`/`PARTNER`/`INACTIVE`, each with `metadata: { bg, fg, sort_order, description }`); lead-source labels from `DOCTOR_LEAD_SOURCE` (rows: `BDM_MANUAL`/`CUSTOMER_ATTESTATION`/`RX_PARSE`/`IMPORT`/`OTHER`). Both are wired through `useLookupOptions` in [MdLeadsPage.jsx:142-165](frontend/src/pages/admin/MdLeadsPage.jsx#L142-L165) with inline `STATUS_META_FALLBACK` so the page never goes dark on a Lookup outage (Rule #3 — schema enum is the validation gate, lookups drive UI). All three categories live in [lookupGenericController.js SEED_DEFAULTS](backend/erp/controllers/lookupGenericController.js) and were seeded across all entities Apr 26 2026 via `node backend/erp/scripts/seedAllLookups.js` (lazy-seed also fires on first GET per entity). Every row uses `insert_only_metadata: true` so admin edits to colors/labels survive future re-seeds. (e) Role gates are lookup-driven via `MD_PARTNER_ROLES` category (codes `VIEW_LEADS`, `MANAGE_PARTNERSHIP`, `SET_AGREEMENT_DATE`) with inline defaults `[admin, president]` if the lookup row is missing. Helper: [backend/utils/mdPartnerAccess.js](backend/utils/mdPartnerAccess.js). (f) The historic Phase M1 `partnerProgram.referralCode` block on `Doctor` is NOT removed — kept as legacy contract metadata; the VIP-1 attribution flow uses `partnership_status` + future `PatientMdAttribution` (VIP-1.B), not referral codes. Plan: `~/.claude/plans/no-show-me-the-shimmying-candy.md`.

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
