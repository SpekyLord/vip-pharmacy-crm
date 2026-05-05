# VIP CRM - Phase Task Breakdown

> **Last Updated**: March 2026
> **Status**: Phase 1-5 Complete. Phase 6 next — D.1, D.2, D.4, D.5, D.6.
> **Reference**: See `docs/CHANGE_LOG.md` for full details on all 17 client-requested changes.
> **Note**: Phases were reorganized from theme-based (A/B/C/D) to dependency-driven order (2-6). Task IDs (A.1, B.6, etc.) preserved for CHANGE_LOG traceability.

## Terminology Note

Documentation uses business terms (BDM, VIP Client). Code uses Doctor/Employee. See CLAUDE.md Terminology Mapping for details.

---

# PHASE 1: Foundation & Core System ✅ COMPLETE
**Goal**: Working system with authentication, VIP Client management, visit logging, and dashboards.

## Backend Tasks (All Complete)

### Task 1.1: Database Connection Setup ✅
**Files**: `backend/config/db.js`
- MongoDB Atlas connection with pooling and graceful shutdown
- Status: Connected to cluster0.wv27nfk.mongodb.net

### Task 1.2: AWS S3 Bucket Configuration ✅
**Files**: `backend/config/s3.js`
- S3 bucket `vip-pharmacy-crm-devs` in ap-southeast-1
- Signed URL expiry: 1 hour
- Folder structure: visits/, products/, avatars/

### Task 1.3: Seed Data ✅
**Files**: `backend/scripts/seedData.js`
- 12 regions (Panay Island hierarchy + 18 Philippine regions)
- 5 users (1 admin, 1 medrep, 3 BDMs)
- 5 products, 56 VIP Clients

### Task 1.4: Backend API Testing ✅
- All endpoints tested with Postman
- Visit limit enforcement verified

### Task 1.18: Security Hardening ✅ (January 2026)
**Files**:
- `backend/controllers/authController.js` - Lockout logic, audit logging
- `backend/models/User.js` - failedLoginAttempts, lockoutUntil fields
- `backend/models/AuditLog.js` (new) - Security audit schema, 90-day TTL
- `backend/utils/auditLogger.js` (new) - Event logging utility
- `backend/middleware/validation.js` - Password complexity (upper+lower+number+special, 8+ chars)
- `backend/server.js` - JWT secret 32+ char validation, CORS_ORIGINS required in production
- `backend/config/s3.js` - 1-hour signed URL expiry
- `frontend/src/context/AuthContext.jsx` - Cookie-based auth, auth:logout listener
- `frontend/src/services/api.js` - withCredentials, no token injection
- `frontend/src/services/authService.js` - Cookie-based auth

**Security Items**:
- [x] SEC-001: httpOnly cookie token storage (XSS protection)
- [x] SEC-002: Visit race condition duplicate key handling
- [x] SEC-003: Account lockout (5 attempts = 15 min)
- [x] SEC-004: Password complexity enforcement
- [x] SEC-005: Audit logging (13 event types, 90-day TTL)
- [x] SEC-006: JWT secret validation at startup (32+ chars)
- [x] SEC-007: S3 URL expiry reduced to 1 hour
- [x] SEC-008: Tokens removed from JSON response body
- [x] SEC-009: CORS_ORIGINS required in production
- [x] SEC-010: Modern TLD email validation

## Frontend Tasks (All Complete)

### Task 1.5: Authentication Flow ✅
**Files**: `context/AuthContext.jsx`, `components/auth/LoginForm.jsx`, `components/auth/ProtectedRoute.jsx`, `pages/LoginPage.jsx`, `services/authService.js`, `services/api.js`, `hooks/useAuth.js`, `hooks/useApi.js`
- Cookie-based JWT auth (NOT localStorage)
- Role-based redirect: admin→/admin, medrep→/medrep, employee→/employee
- Token refresh on 401 errors

### Task 1.6: BDM Dashboard & VIP Client List ✅
**Files**: `pages/employee/EmployeeDashboard.jsx`, `components/employee/DoctorList.jsx`, `services/doctorService.js`, `services/visitService.js`
- Real API data, stats cards, compliance bar
- VIP Client list with visitFrequency (2x/4x), visit status, Log Visit button
- Region-filtered for BDMs

### Task 1.7: Visit Logger with Photo & GPS ✅
**Files**: `components/employee/VisitLogger.jsx`, `components/employee/CameraCapture.jsx`, `services/visitService.js`, `pages/employee/NewVisitPage.jsx`
- FormData upload with photos + GPS
- GPS watchPosition with 5-min timeout, accuracy badges
- canVisit check before rendering form
- Work day validation (Mon-Fri only)

### Task 1.8: My Visits History ✅
**Files**: `pages/employee/MyVisits.jsx`, `services/visitService.js`
- Filters (status, date range, VIP Client search), pagination
- AbortController for request cancellation, debounced search
- Visit details modal with photo gallery, GPS Google Maps link

### Task 1.9: Admin Dashboard ✅
**Files**: `pages/admin/AdminDashboard.jsx`, `components/admin/Dashboard.jsx`
- Real API data, optimized calls (limit:0 for counts)
- Stats grid, activity feed, quick action buttons

### Task 1.10: Admin VIP Client Management ✅
**Files**: `pages/admin/DoctorsPage.jsx`, `components/admin/DoctorManagement.jsx`, `services/doctorService.js`, `services/regionService.js`
- Full CRUD with cascading region dropdowns (Country→Region→Province→City→District)
- Filters (region, specialization, visitFrequency), pagination
- Excel/CSV export matching Call Plan Template format (`utils/exportCallPlan.js`)

### Task 1.11: Admin BDM Management ✅
**Files**: `pages/admin/EmployeesPage.jsx`, `components/admin/EmployeeManagement.jsx`, `services/userService.js`
- Full CRUD with multi-region checkbox assignment
- Filters (search, role, status, region), pagination

### Task 1.12: Region Management ✅
**Files**: `pages/admin/RegionsPage.jsx`, `components/admin/RegionManagement.jsx`, `services/regionService.js`
- Tree view with expand/collapse, level badges
- CRUD with parent assignment, stats modal

### Task 1.13: MedRep Dashboard & Product Assignment ✅
**Files**: `pages/medrep/MedRepDashboard.jsx`, `components/medrep/ProductAssignment.jsx`, `components/medrep/DoctorProductMapping.jsx`, `services/assignmentService.js`
- Assignment cards with search/filter, view/edit/deactivate
- Two-panel VIP Client→Product mapping with priority

### Task 1.14: Product Recommendations in Visit Interface ✅
**Files**: `components/employee/ProductRecommendations.jsx`, `components/employee/VisitLogger.jsx`
- Shows assigned products for selected VIP Client
- Product detail modal, tracks discussed products with visit

### Task 1.14b: Frontend Optimization ✅ (December 2025)
**New Files**: `components/common/ErrorBoundary.jsx`, `components/common/Pagination.jsx`, `hooks/useDebounce.js`
- ErrorBoundary wrapping App routes
- React.memo on DoctorList, Pagination
- AbortController in MyVisits, debounced search
- useCallback in DoctorsPage, isMounted in NewVisitPage

### Task 1.14c: Cross-Database Product Fix ✅
**Files**: `controllers/visitController.js`, `controllers/doctorController.js`
- Replaced Mongoose populate with manual `getWebsiteProductModel()` fetching
- Fixed getMyVisits, getVisitById, getVIPClientById, getVIPClientProducts

### BDM Visit Report ✅ (December 2025)
**Files**: `pages/admin/ReportsPage.jsx`, `components/admin/EmployeeVisitReport.jsx`, `utils/exportEmployeeReport.js`, `controllers/visitController.js` (getBDMReport)
- Call Plan Template format with 20-day grid
- BDM selector, month picker, Excel/CSV export

### Visit Week Calculation Fix ✅ (December 2025)
**Files**: `utils/validateWeeklyVisit.js`, `models/Visit.js`, `scripts/fixVisitWeeks.js`
- Aligned getWeekOfMonth formula
- 5th week → next month logic (week 5+ = next month Week 1)

### Messaging System ✅ (January 2026)
**Files**: `models/MessageInbox.js`, `controllers/messageInboxController.js`, `routes/messageInbox.js`, `routes/sentRoutes.js`, `services/messageInboxService.js`, `pages/employee/EMP_InboxPage.jsx`, `components/employee/MessageBox.jsx`, `components/employee/AdminSentMessageBox.jsx`, `pages/admin/SentPage.jsx`
- Admin→BDM messaging with categories (announcement, payroll, leave, policy, system, compliance_alert)
- Priority levels, read tracking, archive

### Admin Page Scaffolding ✅ (January 2026)
**Files**: `pages/admin/StatisticsPage.jsx`, `pages/admin/ActivityMonitor.jsx`, `pages/admin/PendingApprovalsPage.jsx`, `pages/admin/GPSVerificationPage.jsx`
- UI built with Recharts, tables, modals
- **All use mock/hardcoded data** — backend endpoints don't exist yet
- `services/complianceService.js` calls non-existent endpoints

### Database Query Optimization ✅ (February 2026)
**Files**:
- `backend/controllers/visitController.js` — Merged two `Visit.aggregate()` calls into single `$facet` pipeline in `getVisitStats`
- `backend/utils/validateWeeklyVisit.js` — Parallelized queries in `canVisitDoctorsBatch`, `getComplianceReport`, `checkBehindSchedule`; fixed dead code bug (schedule overlay was unreachable)
- `backend/controllers/scheduleController.js` — Parallelized `reconcileEntries` queries; eliminated redundant re-fetches in `getCycle`, `getToday`, `adminGetCycle`
- `backend/controllers/doctorController.js` — Added `.lean()` to `getAllDoctors`; skip `countDocuments` when `limit=0`
- `backend/controllers/clientController.js` — Added `.lean()` to `getAllClients`; skip `countDocuments` when `limit=0`

**Optimizations**:
- [x] `getVisitStats`: 2 aggregations → 1 `$facet` pipeline (~400ms saved)
- [x] `canVisitDoctorsBatch`: 4 sequential queries → `Promise.all` parallel + fixed dead schedule overlay code
- [x] `getComplianceReport`: Deduplicated `Doctor.countDocuments` + `Doctor.find`; parallelized with `User.findById`
- [x] `checkBehindSchedule`: Parallelized `getWeeklyComplianceStats` + `User.findById`
- [x] `reconcileEntries`: Parallelized `Schedule.find` + `Visit.find`; accepts pre-fetched entries; returns boolean to skip unnecessary re-fetches
- [x] `getCycle`: Fetch with populate upfront (1 query vs 4); skip re-fetch when reconcile makes no changes
- [x] `getToday`: Reconcile uses parallel fetch internally
- [x] `getAllDoctors` / `getAllClients`: `.lean()` skips Mongoose hydration; skip `countDocuments` for `limit=0`

**Results** (BDM dashboard `/employee` load):
- `visits/stats`: 22,677ms → ~300ms
- `can-visit-batch`: 1,800–3,200ms → ~375–780ms
- `schedules/cycle`: 2,100–2,900ms → ~500–800ms (estimated)
- `doctors?limit=0`: 1,300–2,600ms → ~400–800ms (estimated)
- `clients?limit=0`: 425ms → ~160–300ms

### Task 1.15: CSS Styling ⚠️ IN PROGRESS
- Base styles exist but missing comprehensive component styles
- Mobile-responsive design incomplete

### Task 1.17: Deploy to AWS Lightsail ❌ NOT STARTED
- Instance not provisioned

---

## Phase 1 Summary

| Category | Tasks | Status |
|----------|-------|--------|
| Backend Infrastructure | 4 tasks | ✅ Complete |
| Frontend Auth | 1 task | ✅ Complete |
| Frontend BDM Features | 4 tasks | ✅ Complete |
| Frontend Admin Features | 5 tasks | ✅ Complete |
| Frontend MedRep Features | 1 task | ✅ Complete |
| Optimization | 2 tasks | ✅ Complete |
| Security | 1 task | ✅ Complete |
| Messaging | 1 task | ✅ Complete |
| Admin Scaffolding | 1 task | ✅ UI only (mock data) |
| CSS/Deployment | 2 tasks | ⚠️ Incomplete |

---

# PHASE 2: Role & Permission Changes
**Goal**: Restructure roles and permissions — remove MedRep, let BDMs self-manage.
**Dependency**: A.1 ✅ complete.
**Why first**: No heavy dependencies, cleans up role architecture before building new features.

---

### Task A.1: VIP Client Model Field Extensions (CHANGE_LOG Change 9) ✅ COMPLETE
**Priority**: CRITICAL (blocks nearly everything else)
**Completed**: February 2026

**Files modified (15 total)**:
- `backend/models/Doctor.js` — Rewrote model with all new fields, indexes, fullName virtual
- `backend/middleware/validation.js` — Updated create/update validation for all new fields
- `backend/controllers/doctorController.js` — Updated search, sort, CRUD, response fields
- `backend/controllers/visitController.js` — Updated 8 populate statements + response fields
- `backend/models/ProductAssignment.js` — Updated 2 populate statements
- `backend/controllers/productAssignmentController.js` — Updated 5 populates + response fields
- `backend/models/Visit.js` — Updated 2 populate statements in statics
- `backend/scripts/seedData.js` — Updated to new field format
- `backend/scripts/migrateDoctorFields.js` (NEW) — One-time migration for existing DB data
- `frontend/src/components/admin/DoctorManagement.jsx` — Full form redesign with all new fields
- `frontend/src/components/employee/DoctorList.jsx` — Updated search + display
- `frontend/src/utils/exportCallPlan.js` — Removed splitName(), real field values for new columns
- `frontend/src/utils/exportEmployeeReport.js` — Same changes
- `frontend/src/components/medrep/DoctorProductMapping.jsx` — doctor.name → doctor.fullName
- `frontend/src/components/admin/EmployeeVisitReport.jsx` — Removed splitName(), hospital → clinicOfficeAddress

**Deliverables**:
- [x] Split `name` into `firstName` (required) + `lastName` (required), add virtual `fullName` getter
- [x] Change `specialization` from enum to free-form String (client uses "Pedia Hema", "Im Car", "Breast Surg", etc.)
- [x] Merge `hospital` + `address` into single `clinicOfficeAddress` (free-form String)
- [x] Add new fields:
  - `outletIndicator` (String)
  - `programsToImplement` ([String] enum: CME GRANT, REBATES / MONEY, REST AND RECREATION, MED SOCIETY PARTICIPATION)
  - `supportDuringCoverage` ([String] enum: STARTER DOSES, PROMATS, FULL DOSE, PATIENT DISCOUNT, AIR FRESHENER)
  - `levelOfEngagement` (Number 1-5)
  - `secretaryName` (String)
  - `secretaryPhone` (String)
  - `birthday` (Date)
  - `anniversary` (Date)
  - `otherDetails` (String)
  - `targetProducts` ([{ product: ObjectId, status: 'showcasing'|'accepted' }]) — always 3 slots
  - `isVipAssociated` (Boolean) — admin approval for VIP partnership
- [x] Create migration script to split existing `name` fields and merge address fields
- [x] Update all frontend forms and displays for new fields
- [x] Update export utilities to include new fields in CPT format

**Breaking Changes** (all resolved):
- `name` → `firstName` + `lastName` — updated in all 15 files
- `hospital` + `address` → `clinicOfficeAddress` — updated in all files
- `specialization` enum → free-form String — dropdown replaced with text input in admin form

**To run migration on existing data**:
```bash
node backend/scripts/migrateDoctorFields.js
```

---

### Task A.3: Remove MedRep Role (CHANGE_LOG Change 1) ✅ COMPLETE
**Priority**: HIGH (role architecture change)
**Completed**: February 2026

**Files modified**:
- `backend/models/User.js` — Removed `medrep` from role enum
- `backend/models/ProductAssignment.js` — Updated pre-save hook to allow `employee` role
- `backend/middleware/roleCheck.js` — Removed `medRepOnly` middleware
- `backend/controllers/productAssignmentController.js` — Updated role checks
- `backend/routes/productAssignmentRoutes.js` — Updated route middleware
- `frontend/src/App.jsx` — Removed `/medrep` routes
- `frontend/src/components/common/Sidebar.jsx` — Removed medrep menu
- `frontend/src/pages/medrep/` — Deleted folder (MedRepDashboard.jsx removed)
- `frontend/src/components/medrep/` — Deleted folder
- `frontend/src/services/assignmentService.js` — Updated for BDM usage
- `backend/scripts/migrateMedRepUsers.js` (NEW) — Migration script for existing medrep users

**Deliverables**:
- [x] MedRep routes and pages removed
- [x] Migration script: convert existing medrep users to employee or admin
- [ ] BDMs can assign their own 3 target products per VIP Client (deferred to B.2)
- [ ] Product assignment UI moved to BDM section (deferred to B.2)
- [ ] Target product flow: 3 slots per VIP Client, status `showcasing` or `accepted` (deferred to B.2)

**Note**: Product assignment UI for BDMs deferred to Task B.2 (Product Detail Popup) which builds the tablet-friendly product selection interface.

---

### Task A.4: BDM Edit Own VIP Clients (CHANGE_LOG Change 2) ✅ COMPLETE
**Priority**: HIGH
**Depends on**: A.1 ✅
**Files**:
- `backend/controllers/doctorController.js` — Added ownership check (`assignedTo === req.user._id`) + split `allowedFields` by role
- `backend/routes/doctorRoutes.js` — Changed PUT `/:id` from `adminOnly` to `adminOrEmployee`
- `frontend/src/components/employee/DoctorList.jsx` — Added Edit button per VIP Client card + DoctorEditForm modal
- NEW: `frontend/src/components/employee/DoctorEditForm.jsx` — Modal edit form with cascading region dropdowns
- `frontend/src/pages/employee/EmployeeDashboard.jsx` — Added `onEditDoctor` callback to refresh data after save

**Deliverables**:
- [x] BDMs can edit all fields EXCEPT `assignedTo`, `isActive`, `isVipAssociated`
- [x] BDM-editable fields include: supportDuringCoverage, programsToImplement, levelOfEngagement (plus all other fields except restricted ones)
- [x] Region IS editable (BDM might correct mistakes) — cascading dropdowns
- [x] Admin retains full edit control over everything
- [x] Ownership enforced server-side (403 if not assigned)
- [x] Restricted fields silently ignored if BDM sends them

---

## Phase 2 Summary ✅ COMPLETE

| Task | Change # | Status | Notes |
|------|----------|--------|-------|
| A.1: VIP Client Model Extensions | 9 | ✅ Complete | Foundation for everything |
| A.3: Remove MedRep Role | 1 | ✅ Complete | Role architecture cleanup |
| A.4: BDM Edit Own VIP Clients | 2 | ✅ Complete | Ownership permissions |

---

# PHASE 3: Independent UX Improvements
**Goal**: Quick wins that have no heavy dependencies. Can be parallelized.
**Dependency**: A.1 ✅ for some tasks. No cross-task blocking within this phase.
**Note**: B.6 (Regular Clients) should be done early — it unblocks C.2 in Phase 5.

---

### Task B.3: Photo Upload Flexibility (CHANGE_LOG Change 5) ✅ COMPLETE
**Priority**: HIGH
**Depends on**: None
**Files**: `frontend/src/components/employee/CameraCapture.jsx`, `frontend/src/components/employee/VisitLogger.jsx`

**Deliverables**:
- [x] Camera capture (existing — kept)
- [x] File picker / gallery: `<input type="file" accept="image/jpeg,image/png,image/webp" multiple>`
- [x] Copy-paste: Clipboard API (`paste` event listener on container div)
- [x] EXIF parsing: `exifr` library for photo timestamp extraction (`DateTimeOriginal`)
- [x] BDMs can take photos with any device, then upload when logging visit later
- [x] GPS decoupled from camera — acquired on component mount independently
- [x] Source badges on photo thumbnails (Camera/Gallery/Clipboard)
- [x] VisitLogger GPS fallback — tries any photo with GPS, not just first photo

---

### Task B.6: Non-VIP Regular Clients Table (CHANGE_LOG Change 16) ✅ COMPLETE
**Priority**: HIGH — **do early, unblocks Phase 5 (C.2 Extra Call section)**
**Depends on**: None
**Files**:
- NEW: `backend/models/Client.js` — Simpler than Doctor (name, specialty, address, phone, notes)
- NEW: `backend/models/ClientVisit.js` — Simplified Visit (no weekly tracking, no products)
- NEW: `backend/controllers/clientController.js` — CRUD + visit logging
- NEW: `backend/routes/clientRoutes.js` — API endpoints
- `backend/middleware/validation.js` — Added client/client visit validators
- `backend/server.js` — Mounted `/api/clients` routes
- `frontend/src/pages/employee/EmployeeDashboard.jsx` — Second table below VIP Client list
- NEW: `frontend/src/components/employee/ClientList.jsx`
- NEW: `frontend/src/components/employee/ClientAddModal.jsx`
- NEW: `frontend/src/pages/employee/NewClientVisitPage.jsx`
- NEW: `frontend/src/services/clientService.js`
- `frontend/src/pages/employee/MyVisits.jsx` — Category tabs (All/VIP/Extra)
- `frontend/src/App.jsx` — Added `/employee/regular-visit/new` route

**Deliverables**:
- [x] BDMs can add regular clients directly (no Excel/admin approval needed)
- [x] Daily limit: up to 30 extra calls per day (system enforced, hard block)
- [x] No visit frequency enforcement (no 2x/4x rules)
- [x] No scheduling grid integration
- [x] Visits appear in "EXTRA CALL (VIP NOT INCLUDED IN THE LIST)" section of CPT (Phase 5)
- [x] May eventually be promoted to VIP status through Excel upload + admin approval
- [x] My Visits page shows merged VIP + Extra calls with category tabs
- [x] Visit detail modal adapts to show correct info for VIP vs Regular clients

---

### Task B.7: Filter VIP Clients by Support Type & Program (CHANGE_LOG Change 17) ✅ COMPLETE
**Priority**: LOW
**Depends on**: A.1 ✅
**Files**: `pages/admin/DoctorsPage.jsx`, `components/employee/DoctorList.jsx`, `controllers/doctorController.js`, `models/Doctor.js`

**Deliverables**:
- [x] Filter by Support During Coverage (e.g., "Show all VIP Clients with STARTER DOSES")
- [x] Filter by Programs to Implement (e.g., "Show all under CME GRANT")
- [x] Both admin and BDM views — admin sees all (server-side), BDMs see assigned only (client-side)

---

### Task B.4: Level of Engagement Tracking (CHANGE_LOG Change 12) ✅ COMPLETE
**Priority**: MEDIUM
**Depends on**: A.1 ✅
**Completed**: February 2026
**Files**: `components/employee/DoctorList.jsx`, `components/admin/DoctorManagement.jsx`

**Deliverables**:
- [x] Display engagement badge (1-5) on BDM VIP Client cards with color coding (red/orange=1-2, yellow=3, green=4-5)
- [x] Engagement column in admin DoctorManagement table with color badges
- [x] BDMs can update engagement level via Edit button on card (A.4 already provides this)
- [x] Scale: 1=Visited 4x, 2=Knows BDM/products, 3=Tried products, 4=In group chat, 5=Active partner

---

### Task B.5a: BDM Self-Service Performance — Basic Stats (CHANGE_LOG Change 14, partial) ✅ COMPLETE
**Priority**: MEDIUM
**Depends on**: None
**Completed**: February 2026
**Files**:
- NEW: `frontend/src/pages/employee/MyPerformancePage.jsx` — Full performance page
- `frontend/src/App.jsx` — Added `/employee/performance` route
- `frontend/src/components/common/Sidebar.jsx` — Added Performance menu item to BDM Work section

**Deliverables**:
- [x] Total visits/month, compliance %, engagement distribution
- [x] VIP coverage breakdown (2x vs 4x)
- [x] Behind-schedule warnings
- [x] Monthly stat cards with color-coded compliance
- [x] Weekly breakdown bar chart (Recharts)
- [x] Not-yet-visited VIP Clients table
- [x] Month picker (last 6 months)

> **Note**: DCR Summary view (Call Rate, Target vs Actual) requires C.2 — see Task B.5b in Phase 5.

---

### Task C.4: VIP Count Minimums & Validation (CHANGE_LOG Change 11) — ⏭ SKIPPED
**Priority**: LOW
**Depends on**: A.1 ✅
**Status**: ⏭ SKIPPED — Admin already reviews the Excel CPT before uploading to CRM, catching VIP count shortfalls at that stage. Automated warning banners would be redundant.

**Files**: `pages/employee/EmployeeDashboard.jsx`, `pages/admin/AdminDashboard.jsx`, `pages/admin/StatisticsPage.jsx`

**Deliverables**:
- [x] ~~BDM dashboard: Warning banner when assigned VIP Clients < 20~~ — skipped
- [x] ~~Admin dashboard: Warning when total active VIP Clients < 130~~ — skipped
- [x] ~~Statistics page: VIP count breakdown (2x vs 4x per BDM)~~ — skipped
- [x] ~~Schedule validation: Ensure planned visits adequately fill 20 working days~~ — skipped

---

## Phase 3 Summary

| Task | Change # | Depends On | Notes |
|------|----------|------------|-------|
| B.3: Photo Upload Flexibility | 5 | None | ✅ COMPLETE |
| B.6: Regular Clients | 16 | None | ✅ COMPLETE |
| B.7: Filter by Support/Program | 17 | A.1 ✅ | ✅ COMPLETE |
| B.4: Engagement Tracking | 12 | A.1 ✅ | ✅ COMPLETE |
| B.5a: BDM Performance (basic) | 14 | None | ✅ COMPLETE |
| C.4: VIP Count Minimums | 11 | A.1 ✅ | ⏭ SKIPPED — admin reviews CPT pre-upload |

---

# PHASE 4: Schedule System + Remaining UX ✅ COMPLETE
**Goal**: Build the core scheduling system (the biggest feature) and complete UX pages that depend on Phase 2.
**Dependency**: Phase 2 (A.3, A.4 must be done). A.2 (alternating weeks) is merged into C.1 here.

---

### Task C.1 + A.2: Schedule Model + 4-Week Calendar + Alternating Week Rule (CHANGE_LOG Changes 6 + 10) ✅ COMPLETE
**Priority**: CRITICAL (core system flow)
**Depends on**: A.1 ✅
**Completed**: February 2026

**Why A.2 is merged here**: The 2x alternating week rule (W1+W3 or W2+W4) was deferred from the original Task A.2.
Without the Schedule model, a calendar-week parity check incorrectly blocks valid carry-forward visits
(e.g., a missed W1 visit being legitimately logged in W2). The alternating pattern must be enforced
through schedule entries, not raw visit counts.

**Files**:
- NEW: `backend/models/Schedule.js` — Schema with cycle tracking, indexes, statics (getCycleSchedule, getVisitableEntries)
- NEW: `backend/controllers/scheduleController.js` — getCycle, getToday, generateSchedule, reconcile, admin CRUD
- NEW: `backend/routes/scheduleRoutes.js` — `/api/schedules` (BDM + Admin endpoints)
- NEW: `backend/utils/scheduleCycleUtils.js` — Shared cycle math (anchor, week/day/cycle calculations)
- NEW: `frontend/src/components/employee/ScheduleCalendar.jsx` — 4-week calendar grid UI
- NEW: `frontend/src/services/scheduleService.js` — Schedule API calls
- UPDATE: `backend/utils/validateWeeklyVisit.js` — Schedule-aware validation in both `canVisitDoctor` and `canVisitDoctorsBatch`

**Schedule Model** (as implemented):
```javascript
{
  doctor: ObjectId,
  user: ObjectId,
  cycleStart: Date,           // Start date of 4-week cycle
  cycleNumber: Number,        // 0-based cycle number from anchor
  scheduledWeek: Number,      // 1-4
  scheduledDay: Number,       // 1-5 (Mon-Fri)
  scheduledLabel: String,     // "W2D1" format
  status: String,             // planned | carried | completed | missed
  carriedToWeek: Number,      // Week carried to (if carried)
  completedAt: Date,
  completedInWeek: Number,    // Week completed in
  visit: ObjectId,            // Reference to Visit record once completed
}
```

**4-Week Cycle Rules**:
- Anchor date: **January 5, 2026 (Monday) = W1D1** (`scheduleCycleUtils.js`)
- 4-week cycle rolls continuously from this date (28-day periods)
- Schedule loops every 4-week cycle via `loopScheduleFromPrevious()` (clones previous cycle)
- `generateSchedule()`: Auto-generates entries from assigned doctors (4x=1/week, 2x=alternating W1+W3 or W2+W4)

**Carry & Cutoff Rules** (implemented in `reconcileEntries()`):
- `planned` + past scheduled week → `carried` (with `carriedToWeek`)
- Past cycle end (W4D5) → `missed`
- Matching visit found → `completed` (with `completedAt`, `completedInWeek`, `visit` ref)
- `bulkWrite` for efficient batch status updates

**Visit Rules** (implemented in `validateWeeklyVisit.js`):
- `canVisitDoctor()`: Schedule-aware — checks for visitable entries (planned ≤ current week, or carried)
- `canVisitDoctorsBatch()`: Same logic applied in batch with schedule overlay
- `getScheduleMatchForVisit()`: Current week planned first → oldest carried → past planned → extra visit
- No advance credit: only current/past week planned + carried entries are visitable

**Deliverables**:
- [x] Schedule model with cycle tracking (indexes on user+cycleNumber, unique on doctor+user+cycle+week)
- [x] Calendar grid matching CPT format (W1D1 through W4D5, 20 workdays)
- [x] Auto-carry logic for missed visits (`reconcileEntries` → planned→carried)
- [x] W4D5 hard cutoff → missed status (`reconcileEntries` → past cycle end→missed)
- [x] Schedule looping (auto-repeat every 4-week cycle via `loopScheduleFromPrevious`)
- [x] BDM daily view: "Today you need to visit" (`getToday` → `getVisitableEntries`)
- [x] Enforce 2x alternating week pattern through schedule entries (W1+W3 or W2+W4 in `generateSchedule`)
- [x] Update `validateWeeklyVisit.js` to validate against Schedule entries for alternating rule
- [x] Admin endpoints: generate, reconcile, view any BDM, create entries, clear cycle

---

### Task B.1: VIP Client Info Page Before Log Visit (CHANGE_LOG Change 3) ✅ COMPLETE
**Priority**: HIGH (major UX flow change)
**Depends on**: A.4 (BDM edit permissions)
**Completed**: February 2026
**Files**:
- NEW: `frontend/src/pages/employee/DoctorDetailPage.jsx` — Full VIP Client profile + visit history + "Log Visit" button
- `frontend/src/App.jsx` — Added route `/employee/doctor/:id`
- `frontend/src/pages/employee/EmployeeDashboard.jsx` — Updated `handleSelectDoctor` to navigate to info page

**Deliverables**:
- [x] Clicking a VIP Client card body shows info page first (all fields from A.1)
- [x] "Log Visit" button on info page header (disabled with reason when ineligible)
- [x] Visit history table on the page (recent 10, "View All" link)
- [x] BDM can edit VIP Client fields from this page via Edit button (reuses DoctorEditForm)
- [x] Profile details: address, region, assigned BDM, phone, email, secretary, birthday, anniversary
- [x] Clinic schedule dots (Mon-Fri availability)
- [x] Programs & support type badge chips
- [x] Target products with showcasing/accepted status
- [x] Notes & other details section
- [x] "Log Visit" quick-path button on DoctorList cards still goes directly to visit logger (unchanged)

---

### Task B.2: Product Detail Popup — Tablet-Friendly (CHANGE_LOG Change 4) ✅ COMPLETE
**Priority**: MEDIUM
**Depends on**: A.3 (target products moved to BDM)
**Completed**: February 2026
**Files**:
- NEW: `frontend/src/components/employee/ProductDetailModal.jsx` — Full-screen product detail modal (tablet-optimized)
- `frontend/src/components/employee/VisitLogger.jsx` — Replaced checkboxes with product cards + detail modal
- `frontend/src/pages/employee/DoctorDetailPage.jsx` — Clickable target products → detail modal

**Deliverables**:
- [x] Full-screen product detail modal with large image, name, generic name, dosage, category, price, description, usage, safety info
- [x] Tablet-optimized: landscape side-by-side layout, large tap targets (48px), readable text (18px body), full-screen overlay
- [x] Product cards instead of simple checkboxes in VisitLogger (thumbnail, name, generic name, dosage)
- [x] Checkbox still toggles product selection (stopPropagation), card tap opens detail modal
- [x] Prev/Next navigation arrows when viewing from product list context
- [x] Keyboard navigation (Escape to close, arrow keys for prev/next)
- [x] Clickable target products in DoctorDetailPage — fetches full product data via productService.getById()
- [x] Body scroll lock when modal is open

---

## Phase 4 Summary

| Task | Change # | Depends On | Notes |
|------|----------|------------|-------|
| C.1+A.2: Schedule + Alternating Weeks | 6+10 | A.1 ✅ | ✅ COMPLETE |
| B.1: VIP Client Info Page | 3 | A.4 ✅ | ✅ COMPLETE |
| B.2: Product Detail Popup | 4 | A.3 ✅ | ✅ COMPLETE |

---

# PHASE 5: CPT, DCR & Excel Import
**Goal**: Build the Call Planning Tool, DCR Summary tracking, and Excel import/export round-trip.
**Dependency**: C.1 (Schedule model from Phase 4), B.6 (Regular Clients from Phase 3).

---

### Task C.2: Call Planning Tool / CPT View (CHANGE_LOG Change 7) ✅ COMPLETE (February 2026)
**Priority**: HIGH
**Depends on**: C.1 (Schedule model), B.6 (Regular Clients for Extra Call section)
**Schema Reference**: See `docs/EXCEL_SCHEMA_DOCUMENTATION.md` for exact CPT sheet structure (columns A-AM), DCR day sheet layout, and engagement type columns.
**Files**:
- NEW: `frontend/src/components/employee/CallPlanView.jsx` — Main CPT grid component (doctor rows × 20 day columns)
- NEW: `frontend/src/components/employee/DCRSummaryTable.jsx` — DCR Summary with Call Rate + engagement breakdown
- NEW: `frontend/src/components/employee/EngagementTypeSelector.jsx` — 5 toggle chips for engagement types
- NEW: `frontend/src/pages/employee/CallPlanPage.jsx` — Page with cycle nav + mode toggle
- MODIFIED: `backend/models/Visit.js` — Added `engagementTypes` enum array field
- MODIFIED: `backend/models/ClientVisit.js` — Added `engagementTypes` + `weekOfMonth` computed field
- MODIFIED: `backend/middleware/validation.js` — Engagement type validation rules
- MODIFIED: `backend/controllers/scheduleController.js` — `getCPTGrid` + `toggleScheduleCell` endpoints
- MODIFIED: `backend/routes/scheduleRoutes.js` — 2 new routes (`/cpt-grid`, `/toggle`)
- MODIFIED: `backend/controllers/visitController.js` — Parse `engagementTypes` in createVisit
- MODIFIED: `backend/controllers/clientController.js` — Parse `engagementTypes` in createClientVisit
- MODIFIED: `frontend/src/components/employee/VisitLogger.jsx` — EngagementTypeSelector integration
- MODIFIED: `frontend/src/pages/employee/NewClientVisitPage.jsx` — EngagementTypeSelector integration
- MODIFIED: `frontend/src/services/scheduleService.js` — `getCPTGrid` + `toggleCell` methods
- MODIFIED: `frontend/src/components/common/Sidebar.jsx` — Added "Call Plan" nav link
- MODIFIED: `frontend/src/App.jsx` — Added `/employee/cpt` route
- MODIFIED: `frontend/src/pages/admin/ReportsPage.jsx` — Added CPT View section (read-only, BDM selector)

**CPT Grid**:
- Rows = VIP Clients (alphabetical by lastName)
- Columns = W1D1 through W4D5 (20 workdays)
- Cells = "1" for scheduled, checkmark for completed, orange for carried, red for missed
- Final column = SUM OF (total scheduled visits per VIP Client)
- Daily VIP count row at bottom (auto-calculated)

**Two Modes**:
- **Planned**: Shows schedule with "1"s (before visits happen)
- **Actual**: Shows completed/missed (after visits are logged)

**Editable During Planning Phase** (before approval):
- BDMs can place/remove "1"s to plan their schedule in the app
- Auto-distribution algorithm: 4x = 1/week spread across M-F, 2x = alternating weeks (W1+W3 or W2+W4) spread across different days
- Once approved → LOCKED for the cycle

**DCR Summary Table**:
| Column | Description |
|--------|-------------|
| Day | W1 D1, W1 D2, ... W4 D5 |
| Target Engagements | Number of "1"s scheduled for that day |
| Total Engagements | Actual visits completed |
| Call Rate | Total / Target × 100% |
| TOTAL row | Sum of all days, overall Call Rate % |

**Engagement Types** (tracked per visit — matches day sheet columns G-K, see `docs/EXCEL_SCHEMA_DOCUMENTATION.md` § Day Sheets):
- TXT/PROMATS (col G)
- MES/VIBER GIF (col H)
- PICTURE (col I)
- SIGNED CALL (col J)
- VOICE CALL (col K)

**Daily MD Count**: MDs visited per day, split into:
- Included in List (VIP Clients from schedule)
- Not Included in List (Extra Calls — non-VIP, see B.6)

**Extra Call Section**: Bottom of each daily sheet for non-VIP visits (from B.6). Own engagement type tracking but does NOT count toward Call Rate.

**Deliverables**:
- [x] Read-only 20-day grid (editing done via Excel → Admin upload)
- [x] Auto-distribution algorithm (via admin schedule generation)
- [x] DCR Summary table with Call Rate per day + overall
- [x] Engagement type tracking per visit
- [x] Daily MD count (VIP vs Extra Call split)
- [x] Extra Call section for non-VIP visits
- [x] Admin CPT View on ReportsPage (read-only, BDM selector)

---

### Task C.3 + D.3: Excel Import + Export + Approvals UI (CHANGE_LOG Changes 8 + 13) ✅ COMPLETE (March 2026)
**Priority**: HIGH
**Depends on**: C.1 (Schedule model), A.1 ✅
**Schema Reference**: `docs/EXCEL_SCHEMA_DOCUMENTATION.md` is the **authoritative specification** for the CPT Excel format. All parsing and export logic must conform to that document.
**Note**: These were originally separate tasks (C.3 in Phase C, D.3 in Phase D) but are the same feature — Excel import backend + approval review UI. Implementing together. The CRM does NOT need to produce a pixel-perfect Excel replica — it just needs to capture and organize all the information contained in the Excel.

**Files**:
- NEW: `backend/models/ImportBatch.js` — Staging model with parsedDoctors array, daySheetData, status, stats, cycleNumber
- NEW: `backend/controllers/importController.js` — Upload, list, getById, approve, reject, deleteBatch endpoints
- NEW: `backend/routes/importRoutes.js` — Custom multer (10MB, xlsx/xls), 120s approve timeout
- NEW: `backend/utils/excelParser.js` — parseCPTWorkbook + detectDuplicates (column A-AM mapping, day sheet engagement parsing)
- NEW: `frontend/src/services/importService.js` — Upload (60s timeout), list, getById, approve, reject, delete
- NEW: `frontend/src/utils/exportCPTWorkbook.js` — Full 23-sheet CPT workbook export (WEEKLY SUMMARY, README, CPT master, 20 day sheets)
- REWRITTEN: `frontend/src/pages/admin/PendingApprovalsPage.jsx` — 3-tab layout: Import, Export, History
- REWRITTEN: `frontend/src/components/admin/VisitApproval.jsx` → BatchDetailModal (batch metadata, doctor table, approve/reject)
- MODIFIED: `frontend/src/components/common/Sidebar.jsx` — Changed label to "Import / Export" with FileSpreadsheet icon
- MODIFIED: `backend/server.js` — Mounted `/api/imports` routes

**Workbook Structure** (23 sheets — 4 types):

| Sheet Type | Sheets | Purpose |
|---|---|---|
| WEEKLY SUMMARY | 1 | Aggregates engagement data from all 20 day sheets (cols A-F) |
| README | 1 | Documents sheet linkage rules |
| CALL PLAN - VIP CPT | 1 | **Master doctor list** — single source of truth (39 cols A-AM, rows 9-158 data, row 159 = END sentinel) |
| DCR Day Sheets | 20 | W1 D1 through W4 D5 — daily engagement tracking (cols A-T) |

**Day-to-Column Mapping** (CPT sheet cols E-X → 20 workdays):

| CPT Col | Day | Sheet | Week | Day-of-Week |
|---|---|---|---|---|
| E | Day 1 | W1 D1 | 1 | Mon |
| F | Day 2 | W1 D2 | 1 | Tue |
| G | Day 3 | W1 D3 | 1 | Wed |
| H | Day 4 | W1 D4 | 1 | Thu |
| I | Day 5 | W1 D5 | 1 | Fri |
| J | Day 6 | W2 D1 | 2 | Mon |
| K | Day 7 | W2 D2 | 2 | Tue |
| L | Day 8 | W2 D3 | 2 | Wed |
| M | Day 9 | W2 D4 | 2 | Thu |
| N | Day 10 | W2 D5 | 2 | Fri |
| O | Day 11 | W3 D1 | 3 | Mon |
| P | Day 12 | W3 D2 | 3 | Tue |
| Q | Day 13 | W3 D3 | 3 | Wed |
| R | Day 14 | W3 D4 | 3 | Thu |
| S | Day 15 | W3 D5 | 3 | Fri |
| T | Day 16 | W4 D1 | 4 | Mon |
| U | Day 17 | W4 D2 | 4 | Tue |
| V | Day 18 | W4 D3 | 4 | Wed |
| W | Day 19 | W4 D4 | 4 | Thu |
| X | Day 20 | W4 D5 | 4 | Fri |

**Excel Column → Doctor Model Field Mapping** (CPT master sheet):

| Excel Col | CPT Header | Doctor Model Field | Notes |
|---|---|---|---|
| B | LASTNAME | `lastName` | Required |
| C | FIRSTNAME | `firstName` | Required |
| D | VIP SPECIALTY | `specialization` | Free-form text |
| E-X | Day 1-20 flags | → Schedule `dayFlags[0..19]` | "1" or blank |
| Y | Count of 1s | → `visitFrequency` | Auto-calc: must be 2 or 4 |
| Z | Status | (validation only) | "OK", "INVALID", or "CHECK" |
| AA | CLINIC/OFFICE ADDRESS | `clinicOfficeAddress` | |
| AB | OUTLET INDICATOR | `outletIndicator` | e.g., MMC, AMC, IMH |
| AC | PROGRAMS TO BE IMPLEMENTED | `programsToImplement` | Dropdown: CME GRANT, REBATES/MONEY, REST AND RECREATION, MED SOCIETY PARTICIPATION |
| AD | SUPPORT DURING COVERAGE | `supportDuringCoverage` | Dropdown: STARTER DOSES, PROMATS, FULL DOSE, PATIENT DISCOUNT, AIR FRESHENER |
| AE-AG | TARGET PRODUCT 1-3 | `targetProducts[0..2]` | Product name strings |
| AH | LEVEL OF ENGAGEMENT | `engagementLevel` | Parse "1- The VIP was visited..." → integer 1-5 |
| AI | NAME OF SECRETARY | `secretaryName` | |
| AJ | CP # OF SECRETARY | `secretaryPhone` | |
| AK | BIRTHDAY | `birthday` | Date |
| AL | ANNIVERSARY | `anniversary` | Date |
| AM | OTHER DETAILS | `otherDetails` | Free-form |

**Day Sheet Engagement Columns** (cols G-K per day sheet, rows 11-40):

| Col | Engagement Type |
|---|---|
| G | TXT/PROMATS |
| H | MES/VIBER GIF |
| I | PICTURE |
| J | SIGNED CALL |
| K | VOICE CALL |
| L | TOTAL (formula: G+H+I+J+K) |
| T | DATE COVERED ("OK" = on target date, "mm/dd/yy" = different date, empty = not yet) |

**ImportBatch Model**:
```javascript
{
  uploadedBy: ObjectId,      // Admin who uploaded
  assignedToBDM: ObjectId,   // BDM this CPT belongs to
  fileName: String,
  status: 'pending' | 'approved' | 'rejected',
  rejectionReason: String,
  doctorCount: Number,        // Total VIP Clients in file
  duplicateCount: Number,     // How many will be overwritten
  rawData: Array,             // Parsed Excel rows (staged)
  approvedAt: Date,
  createdAt: Date
}
```

**Duplicate Detection Rule**:
- Match by `lastName + firstName` (case-insensitive, trimmed)
- If found: OVERWRITE all fields with warning shown to admin — "This will overwrite changes made to Dr. Santos in the app"
- If not found: CREATE new Doctor record
- Doctor is then linked to the BDM (`assignedTo`)

**Import Workflow**:
1. BDM prepares Excel externally, gives to admin
2. Admin uploads to CRM, selects the target BDM
3. System parses CPT master sheet (rows 9 to END sentinel) + 20 day sheets
4. System stages as `ImportBatch` (status: `pending`) with duplicate warnings
5. Admin reviews staged preview in CRM → approves or rejects ENTIRE batch
6. On approval: Doctor records created/updated + day flags become Schedule entries
7. On rejection: Admin adds reason, BDM revises and re-submits

**Quarterly Round-Trip** (export → edit → re-upload):
1. BDM exports current VIP Client data from CRM (structured format with all CPT fields)
2. BDM edits exported file (add/remove doctors, update info, adjust schedule)
3. BDM gives edited file to admin
4. Admin uploads back to CRM → normal approval flow

**Deliverables**:
- [x] ImportBatch staging model (status: pending/approved/rejected)
- [x] Excel parsing with `xlsx` npm package (parse CPT sheet rows 9-158, 20 day sheets rows 11-40)
- [x] Column mapping per `docs/EXCEL_SCHEMA_DOCUMENTATION.md` (39 CPT columns, day sheet engagement cols)
- [x] Day flag → Schedule entry conversion (cols E-X "1"s → Schedule model entries)
- [x] Duplicate VIP Client detection (lastName + firstName, case-insensitive)
- [x] Admin review UI with approve/reject entire batch (repurposed from Approvals page)
- [x] Remove old visit approval UI (client says no approval needed for visits)
- [x] Overwrite existing data with warning
- [x] Engagement data import from day sheets (5 types + date covered)
- [x] Export: CRM data in structured format containing all CPT fields (round-trip compatible)
- [x] Bulk approve performance fix (Doctor.insertMany + bulkWrite, 120s timeout)
- [x] Unassign old doctors not in new CPT file (remove assignedTo on re-import)
- [x] Region lock removed for BDMs — doctors filtered by `assignedTo` instead of region

**Region Lock Removal** (March 2026):
Client confirmed BDMs seeing doctors is NOT region-specific. Since the CPT import assigns doctors to specific BDMs via `assignedTo`, region-based access control was redundant. Changed 5 files:
- `backend/controllers/doctorController.js` — `getRegionFilter()` uses `{ assignedTo: user._id }` for employees
- `backend/utils/validateWeeklyVisit.js` — `canAccessDoctor()` checks assignedTo instead of region hierarchy
- `backend/controllers/visitController.js` — `getEmployeeReport()` uses `{ assignedTo: userId }`
- `backend/controllers/scheduleController.js` — `generateSchedule()` uses `{ assignedTo: userId }`
- `backend/middleware/roleCheck.js` — `isAssignedToDoctor()` checks assignedTo instead of region

---

### Task B.5b: BDM Performance — DCR Summary (CHANGE_LOG Change 14, remaining)
**Priority**: MEDIUM
**Depends on**: C.2 (DCR Summary data)
**Files**: `frontend/src/pages/employee/MyPerformancePage.jsx` (extend from B.5a)

**Deliverables**:
- [x] DCR Summary view: Call Rate per day + overall
- [x] Target vs Actual engagements breakdown

---

## Phase 5 Summary

| Task | Change # | Depends On | Notes |
|------|----------|------------|-------|
| C.2: CPT View + DCR Summary | 7 | C.1, B.6 | ✅ COMPLETE |
| C.3+D.3: Excel Import + Export + Approvals UI | 8+13 | C.1 | ✅ COMPLETE — region lock removed |
| B.5b: BDM Performance (DCR part) | 14 | C.2 | ✅ COMPLETE |

---

# PHASE 6: Admin Monitoring & Deployment
**Goal**: Complete admin monitoring tools, wire up scaffolded pages, deploy to production.
**Dependency**: C.2 (DCR Summary data) for D.1 and D.2.

---

### Task D.1: Admin View Per-BDM DCR Summary (CHANGE_LOG Change 15) ✅
**Priority**: HIGH
**Depends on**: C.2 (DCR Summary)
**Files**: `pages/admin/StatisticsPage.jsx` (4th tab: BDM Performance)

**Deliverables**:
- [x] Per-BDM drill-down with Call Rate, VIP coverage, engagement distribution
- [x] DCR Summary view per BDM: 20-row table (W1D1-W4D5) with Target/Total/Call Rate
- [x] Admin can evaluate if BDM's Call Rate justifies continuing partnership
- [x] Filter VIP Clients by support type and program (Change 17, admin view) — moved to B.7 ✅

---

### Task D.2: Wire Up Scaffolded Admin Pages ✅ COMPLETE (March 2026)
**Priority**: MEDIUM
**Depends on**: C.2 (DCR Summary data for StatisticsPage)
**Files**: `pages/admin/StatisticsPage.jsx`, `pages/admin/ActivityMonitor.jsx`, `pages/admin/GPSVerificationPage.jsx`, `controllers/auditLogController.js`, `controllers/visitController.js`

**Deliverables**:
- [x] Create backend audit log API endpoints (auditLogController.js, auditLogRoutes.js → `/api/audit-logs`)
- [x] Add backend quota-dumping and GPS review endpoints to visitController (GET `/api/visits/quota-dumping`, GET `/api/visits/gps-review`)
- [x] Wire StatisticsPage to real data — Overview (per-BDM call rates from CPT grid), Behind-Schedule (compliance API), Alerts (quota-dumping API)
- [x] Wire ActivityMonitor + LiveActivityFeed to real audit logs + visit data with 30s/60s auto-refresh
- [x] Wire GPS Verification to real visit GPS data with haversine distance calculation and 400m threshold

---

### Task D.4: Email Notifications (AWS SES)
**Priority**: LOW
**Depends on**: None
**Files**: NEW `backend/config/ses.js`, NEW `backend/services/emailService.js`

**Deliverables**:
- [ ] Configure AWS SES
- [ ] Password reset email
- [ ] Weekly compliance summary
- [ ] Behind-schedule alerts

---

### Task D.5: Deploy to AWS Lightsail
**Priority**: HIGH (when ready for production)
**Depends on**: None
**Files**: Various config files

**Deliverables**:
- [ ] Lightsail instance (Ubuntu), static IP, firewall
- [ ] Node.js, Nginx, PM2 setup
- [ ] SSL with Let's Encrypt
- [ ] PM2 ecosystem config
- [ ] Deploy documentation

---

### Task D.6: Offline Capability (Deferred)
**Priority**: LOW (future)

**Deliverables**:
- [ ] Service Worker for caching
- [ ] IndexedDB for offline photo storage
- [ ] Background Sync for upload queue

---

## Phase 6 Summary

| Task | Change # | Depends On | Notes |
|------|----------|------------|-------|
| D.1: Admin Per-BDM DCR Summary | 15 | C.2 | ✅ COMPLETE — 4th tab in StatisticsPage |
| D.2: Wire Up Scaffolded Pages | — | C.2 | ✅ COMPLETE — Real APIs for all 3 pages |
| D.4: Email Notifications | — | None | Independent |
| D.5: AWS Lightsail Deployment | — | None | Production hosting |
| D.6: Offline Capability | — | D.5 | Deferred |

---

# TASK DEPENDENCIES

## Critical Path
```
A.1 ✅ → A.3 → B.2 (Product Popup needs target products in BDM)
A.1 ✅ → A.4 → B.1 (Info Page needs BDM edit permissions)
A.1 ✅ → C.1+A.2 (Schedule + Alternating Weeks)
         C.1 → C.2 (CPT/DCR needs Schedule)
         C.1 → C.3+D.3 (Excel Import needs Schedule)
B.6 ───→ C.2 (Extra Call section needs Regular Clients)
C.2 ───→ D.1 (Admin DCR needs CPT data)
C.2 ───→ D.2 (Scaffolded pages need real DCR data)
C.2 ───→ B.5b (BDM Performance DCR part)
```

## Independent Tasks (can start anytime after A.1 ✅)
- B.3 (Photo upload flexibility) ✅
- B.6 (Regular clients) ✅ — unblocked C.2 ✅
- B.7 (Filter by support/program)
- B.4 (Engagement tracking display)
- B.5a (BDM performance basic stats)
- C.4 (VIP count minimums)
- D.4 (Email notifications)
- D.5 (AWS Lightsail deployment)

## Recommended Implementation Order
```
 1. A.3  — Remove MedRep Role ✅
 2. A.4  — BDM Edit Own VIP Clients ✅
 3. B.3  — Photo Upload Flexibility ✅
 4. B.6  — Regular Clients ✅
 5. C.1+A.2 — Schedule System + Alternating Weeks ✅
 6. B.1  — VIP Client Info Page (needs A.4) ✅
 7. B.2  — Product Detail Popup (needs A.3) ✅
 8. B.4  — Engagement Tracking Display ✅
 9. B.5a — BDM Performance (basic stats) ✅
10. B.7  — Filter by Support/Program ✅
11. C.4  — VIP Count Minimums (skipped)
12. C.2  — CPT View + DCR Summary (needs C.1 + B.6) ✅
13. C.3+D.3 — Excel Import + Export + Approvals UI (needs C.1) ✅
14. D.1  — Admin Per-BDM DCR Summary (needs C.2 ✅) ✅
15. D.2  — Wire Up Scaffolded Pages (needs C.2 ✅) ✅
16. B.5b — BDM Performance DCR part (needs C.2 ✅)
17. D.4  — Email Notifications
18. D.5  — AWS Lightsail Deployment
19. D.6  — Offline Capability (deferred)
```

---

# COMPLETE PHASE SUMMARY

| Phase | Tasks | Key Deliverables | Status |
|-------|-------|------------------|--------|
| **Phase 1: Foundation** | 20+ tasks | Auth, CRUD, visits, products, messaging, security | ✅ COMPLETE |
| **Phase 2: Role & Permissions** | 3 tasks (A.1 ✅, A.3 ✅, A.4 ✅) | Remove MedRep, BDM self-edit | ✅ COMPLETE |
| **Phase 3: Independent UX** | 6 tasks (B.3 ✅, B.6 ✅, B.7 ✅, B.4 ✅, B.5a ✅, C.4 ⏭) | Photos, regular clients, filters, engagement, stats | ✅ Complete (5 done + 1 skipped) |
| **Phase 4: Schedule System** | 3 tasks (C.1+A.2 ✅, B.1 ✅, B.2 ✅) | 4-week calendar, alternating weeks, info page, product popup | ✅ COMPLETE |
| **Phase 5: CPT & Excel** | 3 tasks (C.2 ✅, C.3+D.3 ✅, B.5b ✅) | CPT grid, DCR Summary, Excel import/export | ✅ COMPLETE |
| **Phase 6: Admin & Deploy** | 5 tasks (D.1 ✅, D.2 ✅, D.4, D.5, D.6) | Admin monitoring, deployment, offline | 🔄 In progress (2/5) |

---

## Key Changes from Original Phase Structure

| What Changed | Original | New | Why |
|---|---|---|---|
| A.2 (Alternating Weeks) | Phase A standalone | Merged into C.1 in Phase 4 | Needs Schedule model for carry-forward logic |
| B.6 (Regular Clients) | Phase B middle | Phase 3 early priority | Unblocks C.2's Extra Call section |
| C.3 + D.3 | Separate phases | Combined in Phase 5 | Same feature (Excel Import) split across phases |
| D.1, D.2 | Phase D no deps noted | Phase 6 with C.2 dependency | Need DCR data from C.2 |
| B.5 (BDM Performance) | Single task | Split: B.5a (Phase 3) + B.5b (Phase 5) | DCR part needs C.2 |

---

# PHASE M — MARKETING, ENGAGEMENT & PLATFORM PRODUCTIZATION

> **Status**: Plan drafted Apr 21, 2026. M1 ready to build. M2 gated on NPC filing. M3 gated on NPC + vippharmacy.online greenfield spec. M4 gated on M3 proof-of-life. M5 parked.
>
> **Strategic context** (locked after mentor-mode discovery):
> - **Money order**: pharma distribution funds e-commerce, e-commerce proof funds SaaS productization
> - **Year-1 (2026)**: VIP Integrated Projects Inc. runs the SaaS directly — revenue to VIP books
> - **Year-2 (2027)**: Spin out to new "Vios Software Solutions Inc." subsidiary — architecture must support entity-reassignment of subscriptions without breaking subscriber accounts
> - **MD Partner model**: Disclosed referral fees under signed MD Partner Agreement. MDs refer patients to vippharmacy.online via referral code; pharmacy pays disclosed rebate (% of order value, brand-agnostic). MDs do NOT handle stock, money, or dispensing — only referrals. BIR 2307 issued monthly with expanded withholding tax.
> - **Non-goal**: The MD Partner program is explicitly NOT a dispensing workaround for in-clinic physician-dispensing. Naming, UX, and contracts must reflect the referral-partner model only. LTO protection is the top constraint.
>
> **Compliance gates** (hard-blocking, not soft):
> - FDA LTO for vippharmacy.online — ✅ HAVE
> - NPC (RA 10173) registration as Personal Information Controller — ❌ NOT FILED. M2 + M3 outbound comms BLOCKED until filed. M1 inbound-only is safe.
> - BIR CAS PTU for VIP's own accounting system use — ❌ NOT FILED. See CLAUDE-ERP.md "BIR CAS Readiness" section. Parallel track, not a blocker for M1-M3 but blocker for M4 SaaS-on-VIP-books scale.

---

## PHASE M1 — Graceful Invite + Consent + MD Partner Scaffold

**Goal**: Contractors (BDMs) can send branded deep-link invites to existing MDs/non-MDs across Messenger/Viber/WhatsApp/Email. Inbound replies auto-bind external IDs to Doctor records (no more manual `messengerId` entry). Consent is captured per-channel with source + timestamp. MD Partner Program enrollment scaffold built (referral code, TIN, agreement PDF).

**Why M1 first**: Unlocks contractor-initiated outreach on the existing 56+ VIP Clients immediately. Safe to ship pre-NPC because everything is inbound-capture or 1:1 response — no broadcast sends. Delivers value in ~3 working days.

### M1 Backend

- [ ] **M1.1** — Extend `backend/models/Doctor.js`:
  - `marketingConsent: { MESSENGER: { consented: Boolean, at: Date, source: String, withdrawn_at: Date }, VIBER: {...}, WHATSAPP: {...}, EMAIL: {...}, SMS: {...} }`
  - `partnerProgram: { enrolled: Boolean, referralCode: String (unique, sparse), tin: String, enrolledAt: Date, agreementUrl: String, payoutMethod: String, withholdingCategory: String }`
  - Index: `{ 'partnerProgram.referralCode': 1 }` unique sparse
- [ ] **M1.2** — New `backend/models/InviteLink.js`: `doctor`, `channel` (MESSENGER/VIBER/WHATSAPP/EMAIL/SMS), `linkUrl`, `ref` (e.g., `doc_<doctorId>`), `sentAt`, `sentBy` (User ref), `openedAt`, `repliedAt`, `status` (sent/opened/converted/expired), `templateKey`. TTL index on `sentAt` (180 days).
- [ ] **M1.3** — Extend `backend/routes/webhookRoutes.js` Messenger handler:
  - Read `event.postback.referral?.ref` and `event.message.referral?.ref`
  - If `ref` matches `doc_<id>`, `Doctor.findByIdAndUpdate(id, { messengerId: senderId })` and write `marketingConsent.MESSENGER = { consented: true, at: now, source: 'invite_reply' }`
  - Stamp matching `InviteLink` as `status: converted, repliedAt: now`
  - Same pattern for Viber (`body.sender.context`) and WhatsApp (template click-through)
- [ ] **M1.4** — New endpoints on `backend/controllers/doctorController.js`:
  - `POST /api/doctors/:id/invite` body: `{ channel, templateKey }` → generates deep link (`m.me/<page>?ref=doc_<id>`, `viber://pa?...&context=doc_<id>`, `wa.me/<phone>?text=<rendered>`, or email via SES) → logs `InviteLink` → returns shareable link (for Messenger/Viber/WA manual send) or async status (for Email/SMS direct-send)
  - `POST /api/doctors/:id/partner/enroll` body: `{ tin, payoutMethod, withholdingCategory, agreedToTerms }` → generates unique `referralCode` (e.g., `DR-<LASTNAME>-<4digit>`) → creates signed agreement PDF via `services/pdfRenderer.js` → uploads to S3 → returns URL
  - `POST /api/doctors/:id/consent/:channel` body: `{ consented, source }` → manual fallback for offline consent (paper form)
  - `POST /api/unsubscribe` public route body: `{ token }` → decode JWT → write `marketingConsent.<channel>.withdrawn_at`
- [ ] **M1.5** — Seed lookups:
  - `INVITE_TEMPLATES` — per-channel default message templates with merge tokens (`{{bdmFirstName}}`, `{{doctorFirstName}}`, `{{pageHandle}}`)
  - `MD_PARTNER_SETTINGS` — `rebate_pct` (default 5%), `payout_threshold_php` (default 1000), `ewt_rate_pct` (default 5%), `agreement_template_version` (default v1)
- [ ] **M1.6** — Email sending via AWS SES (reuse AWS stack; same credentials as S3). New `backend/services/emailService.js` with `sendEmail({ to, subject, html, text, unsubscribeToken })`. Rate-limit per recipient (no more than 1 email/day from the same sender to the same address during M1).
- [x] **M1.11** — Inbound STOP/UNSUBSCRIBE/OPT OUT keyword handler (Apr 22, 2026). New `backend/utils/optOut.js` exporting `handleInboundOptOut()` + `isOptOutKeyword()`. Wired into Messenger, Viber, and WhatsApp webhook handlers **before** `bindFromInviteRef()` and any provider-ID / AI-match resolution so a STOP on an invite deep-link cannot auto-consent-then-withdraw. Settings-driven (`OPT_OUT_ENABLED`, `OPT_OUT_KEYWORDS`, `OPT_OUT_ACK_TEMPLATE`) with hardcoded fallbacks so a DB outage never defeats compliance. Known sender: withdraws `marketingConsent.<CHANNEL>.withdrawn_at`, writes CommunicationLog `source='opt_out'`, fires ack via `dispatchMessage()`. Unknown sender: still logged to pending-triage with `source='opt_out'` + ack sent. Idempotent (repeat STOP re-stamps timestamp). Also patches `autoReply.tryAutoReply()` to skip when the resolved Doctor has `withdrawn_at` set (prevents post-opt-out auto-reply regression). **Required integrity fixes shipped alongside**: `CommunicationLog.source` enum expanded to `['manual','api','invite_reply','opt_out','system']` — earlier M1 code wrote `'invite_reply'` against a `['manual','api']` enum and was silently losing logs to webhook try/catch. `Client` model got the `marketingConsent` block that M1 writes to but was missing, so strict-mode updates were dropping silently for non-VIP clients. Frontend build clean; 14/14 keyword unit tests pass. **Follow-up (M1.12)**: START keyword handler + CommLogsPage filter by `source='opt_out'`.

### M1 Frontend

- [ ] **M1.7** — Doctor profile: new **Engage** tab (`frontend/src/components/admin/DoctorEngageTab.jsx`):
  - 4 channel buttons (Messenger, Viber, WhatsApp, Email) — disabled if no contact info for that channel
  - Template picker (defaults + custom)
  - Preview pane showing rendered message with merge tokens filled
  - "Generate Link" → copies m.me/viber://wa.me link to clipboard (for Messenger/Viber/WhatsApp since those can't be sent server-side)
  - "Send Email" → fires SES send
  - Consent ledger table: per-channel row with status + timestamp + source
  - Unsubscribe button per channel (writes `withdrawn_at`)
- [ ] **M1.8** — `frontend/src/components/admin/MDPartnerEnrollmentWizard.jsx` — 4-step flow:
  1. Explain the program (rebate model, what MD does, what MD gets, disclosure obligation)
  2. Capture TIN + payout method + withholding category
  3. Preview agreement PDF
  4. Digital consent checkbox + submit
- [ ] **M1.9** — Invite helper banner on Doctor profile (`PageGuide` entry per Rule #1): step-by-step on when to use which channel and how consent capture works
- [ ] **M1.10** — New admin page `/admin/invites` showing all `InviteLink` records with filters (status, channel, BDM, date range) — triage list for unconverted invites

### M1 Acceptance

- [ ] BDM can tap "Invite via Messenger" on Doctor profile → copies `m.me/<page>?ref=doc_<id>` → sends manually to MD
- [ ] When MD taps that link and types first message, webhook auto-binds PSID → Doctor, writes consent, stamps InviteLink as converted
- [ ] CommunicationLog inbound entry links cleanly to the Doctor without AI-match fallback
- [ ] MD Partner enrollment produces unique referral code, PDF agreement, S3 URL
- [ ] Unsubscribe flow writes `withdrawn_at` and flips consent to false
- [ ] `/admin/invites` triage page shows pending invites
- [x] Inbound STOP on any of Messenger/Viber/WhatsApp writes `withdrawn_at`, logs `source='opt_out'`, and sends an ack on the same channel (M1.11)

### M1 Gating & Risk

- **Safe to build pre-NPC** (inbound-only + 1:1 email; no broadcast)
- **Legal review**: MD Partner Agreement template must be reviewed by counsel before any MD signs. Ship the wizard but hide the "Enroll" button behind a `MD_PARTNER_LIVE=false` flag until counsel clears it.
- **Meta App Review for `pages_messaging`** (1-3 weeks calendar time): Messenger outbound to non-admin/non-tester accounts requires `pages_messaging` Advanced Access. App is currently in Live mode but permission not granted → sends to real MDs silently drop until approved. Submit in parallel with M1 UX polish — calendar time runs regardless of when you start. Assets needed: Privacy Policy URL, ToS URL, Data Deletion Instructions URL (endpoint exists at `/api/webhooks/facebook/data-deletion`), 1024x1024 app icon, 45-90s screencast of the invite → reply flow, test admin + MD credentials for Meta reviewer, written use-case description. During review window, real MDs receive invites via **Viber** (no review needed) + **Email** (SES) — Messenger activates the day Meta approves, no code change.
- **Viber Bot URI**: set `VIBER_BOT_URI` in `backend/.env` for Viber invite deep links. No Meta-style review needed; Viber Business Messages API is open once the bot is registered.

---

## PHASE M2 — Campaign Engine (Segmented Outbound) 🚧 GATED on NPC filing receipt

**Goal**: Admin and entity presidents can launch segmented marketing campaigns across Email/Messenger/Viber/WhatsApp/SMS. System enforces per-recipient per-channel consent check, suppression list, and throttled delivery.

### Hard gate before M2 code ships

A Settings flag `CAN_SEND_CAMPAIGNS=false` (lookup-driven) blocks the dispatcher from firing a single send until:
1. NPC registration filing receipt uploaded to Settings (PDF)
2. DPO name + email captured per entity
3. Privacy Notice URL captured per entity
4. Flag flipped to `true` by admin

Dispatcher reads this flag on every send. No backdoor.

### M2 Backend

- [ ] **M2.1** — `backend/models/Campaign.js`: `name`, `entityId`, `channels[]`, `segmentFilter` (Doctor query DSL JSON), `templateId`, `scheduleAt`, `status` (draft/scheduled/sending/done/paused/cancelled), `createdBy`, `approvedBy`, `approvedAt`, `stats` (sent, delivered, read, replied, bounced, unsubscribed)
- [ ] **M2.2** — `backend/models/CampaignSend.js`: `campaignId`, `doctorId`, `channel`, `status`, `sentAt`, `externalMessageId`, `consentVerifiedAt`, `skippedReason`, `bouncedReason`, `openedAt`, `repliedAt`
- [ ] **M2.3** — `backend/models/SuppressionList.js`: `entityId`, `contact` (email/phone/psid), `channel`, `reason` (unsubscribe/hard_bounce/complaint), `addedAt`. Hard-block dispatcher lookup.
- [ ] **M2.4** — `backend/services/segmentBuilder.js` — compiles segment DSL JSON to Doctor.find() query. Supported filters: `clientType`, `specialization[]`, `visitFrequency`, `programsToImplement[]`, `supportDuringCoverage[]`, `levelOfEngagement`, `locality[]`, `province[]`, `assignedTo[]`, `partnerProgram.enrolled`, `isVipAssociated`
- [ ] **M2.5** — `backend/services/campaignDispatcher.js`:
  - Throttle per channel (e.g., 60 emails/min, 30 Messenger/min per Meta rate limits)
  - Pre-send check: gate flag, recipient consent for this channel, suppression list, opt-out token in link
  - Write `CampaignSend` per recipient (even skipped ones, with `skippedReason`)
  - On failure, retry with exponential backoff (3 attempts), then mark `failed`
- [ ] **M2.6** — New routes on `backend/routes/campaignRoutes.js`:
  - `POST /api/campaigns` create (draft)
  - `POST /api/campaigns/:id/preview` — returns count + sample 10 recipients with consent check results
  - `POST /api/campaigns/:id/launch` — calls `gateApproval()` (Finance approver threshold from lookup when recipient count > X), on approval kicks off dispatcher
  - `POST /api/campaigns/:id/pause`, `POST /api/campaigns/:id/resume`, `POST /api/campaigns/:id/cancel`
  - `GET /api/campaigns/:id/report` — per-recipient status table
- [ ] **M2.7** — Gate into ERP Approval Hub: campaign launch above `CAMPAIGN_APPROVAL_THRESHOLD` recipients (lookup, default 100) requires president/finance approval. Integrates with existing `gateApproval()` per Rule #20.
- [ ] **M2.8** — Bounce + complaint webhooks: AWS SES SNS topic → `POST /api/webhooks/ses` adds to `SuppressionList` on hard bounce or complaint

### M2 Frontend

- [ ] **M2.9** — `/admin/campaigns` page with tabs: All / Draft / Scheduled / Sending / Done
- [ ] **M2.10** — `CampaignWizard.jsx` 5-step flow: Channels → Segment (visual filter builder) → Template → Preview (sample + count) → Schedule/Launch
- [ ] **M2.11** — `SegmentBuilder.jsx` — visual UI over the DSL; lookup-driven option lists (no hardcoded specializations etc.) per Rule #3
- [ ] **M2.12** — `CampaignReportView.jsx` — funnel view (sent → delivered → read → replied → unsubscribed) + drill-down to per-recipient
- [ ] **M2.13** — Settings UI for entity admins to upload NPC receipt, enter DPO, flip `CAN_SEND_CAMPAIGNS` flag (gated on admin role)

### M2 Acceptance

- [ ] Admin uploads NPC receipt → flag flips true → dispatcher allows sends
- [ ] Preview shows accurate count with consent-check skip reasons
- [ ] Launch triggers gateApproval above threshold
- [ ] Post-launch report shows per-recipient status
- [ ] Unsubscribe link in email writes to Suppression List AND `marketingConsent.EMAIL.withdrawn_at`
- [ ] Hard bounce from SES adds email to Suppression List

---

## PHASE M3 — vippharmacy.online Integration 🚧 GATED on NPC + greenfield storefront spec

**Goal**: Consumer pharmacy storefront reads from ERP `ProductMaster`, runs its own siloed customer CRM (`PharmacyCustomer` — NOT the CRM's `Doctor`), and attributes orders to MD Partners via referral codes. Monthly rebate payout to MDs flows through the ERP Approval Hub and posts double-entry JE.

### M3 Pre-work (before any code)

- [ ] **M3.0a** — Storefront tech stack decision: (a) extend this repo with `frontend/src/pharmacy/` tree, (b) separate React SPA deployed at `vippharmacy.online`, (c) Medusa.js / Shopify Hydrogen / custom. **User to decide before M3 estimation.**
- [ ] **M3.0b** — Rx pharmacist verification workflow spec (FDA requirement): who verifies, SLA, rejection reasons, customer notification
- [ ] **M3.0c** — Delivery partner integration spec: Lalamove / Grab / own-fleet / click-and-collect

### M3 Backend (CRM + ERP shared)

- [ ] **M3.1** — `backend/models/PharmacyCustomer.js` — separate collection, NOT polluting Doctor. Fields: `firstName`, `lastName`, `email`, `phone`, `dateOfBirth`, `scPwdId`, `addresses[]` (barangay-validated), `rxHistory[]` (uploaded prescription URLs + verified by), `orderHistory`, `marketingConsent` (same shape as Doctor), `tenantEntity` (which entity owns the customer, for future multi-subsidiary pharmacies)
- [ ] **M3.2** — `backend/models/PharmacyOrder.js`: lines, totals, delivery (method, address, fee, ETA), payment (method, status, reference), `rxUploadUrl`, `rxVerifiedBy`, `rxVerifiedAt`, `status` (pending_rx_review → confirmed → packed → shipped → delivered → completed | rejected | cancelled), `referralCode`, `referralDoctor` (ref Doctor, set on checkout if referral code matches enrolled MD Partner)
- [ ] **M3.3** — `backend/models/RebateAccrual.js`: `doctor`, `pharmacyOrder`, `amount`, `ratePct`, `status` (accrued/approved/paid/reversed), `accruedAt`, `approvedAt`, `paidAt`, `payoutJeRef`, `ewtAmount`, `form2307Url`
- [ ] **M3.4** — Extend `ERP ProductMaster` (additive): `storefrontVisible`, `retailPrice`, `storefrontPhotoUrls[]`, `rxRequired`, `storefrontCategory`, `shortDescription`, `longDescription`, `storefrontSlug`
- [ ] **M3.5** — Public pharmacy routes (no auth): `GET /api/pharmacy/products` (filtered by storefrontVisible + in-stock FEFO from ERP), `GET /api/pharmacy/products/:slug`
- [ ] **M3.6** — Customer-scoped routes: `POST /api/pharmacy/register`, `POST /api/pharmacy/login`, `POST /api/pharmacy/cart`, `POST /api/pharmacy/checkout` (validates Rx upload for rx-required lines, reserves FIFO inventory, creates Order, attributes referral)
- [ ] **M3.7** — Pharmacist Rx verification queue: `GET /api/pharmacy/rx-queue`, `POST /api/pharmacy/rx/:orderId/verify`, `POST /api/pharmacy/rx/:orderId/reject` — emails customer on status change
- [ ] **M3.8** — Rebate engine `backend/services/rebateCalc.js`: on Order status transition to COMPLETED, if `referralCode` is set and matches enrolled MD Partner, create `RebateAccrual` with amount = `orderSubtotal * MD_PARTNER_SETTINGS.rebate_pct`. Brand-agnostic (no per-SKU accrual tables to avoid RA 6675 exposure).
- [ ] **M3.9** — Monthly payout agent `backend/erp/agents/mdPartnerPayoutAgent.js`: scheduled 1st of month, groups `RebateAccrual.status=accrued` per MD, creates single `ApprovalRequest` per MD (`module: MD_PARTNER_PAYOUT`), on approval posts JE (DR: Marketing & Promotions Expense, CR: Cash-in-Bank), marks accruals as paid, generates BIR 2307 PDF
- [ ] **M3.10** — Payment gateway integration: GCash + Maya + Xendit card processing + COD flag. `backend/services/paymentService.js` with provider abstraction.

### M3 Frontend (consumer + admin)

- [ ] **M3.11** — Consumer storefront (pending M3.0a decision): catalog, product detail, cart, checkout with Rx upload, order tracking, account, reorder, wishlist — per global CLAUDE.md Rules 11-18 (Filipino-mobile-first, 360px, SC/PWD, prescription handling)
- [ ] **M3.12** — Admin dashboards:
  - `/admin/pharmacy/orders` — order pipeline board
  - `/admin/pharmacy/rx-queue` — pharmacist Rx review
  - `/admin/pharmacy/partners` — MD Partner roster with lifetime referred GMV, accrued/paid rebates
  - `/admin/pharmacy/payouts` — monthly payout batches + approval hub link
- [ ] **M3.13** — CRM Doctor profile: new "Referral Performance" tab showing referred orders, accrued rebates, paid rebates, YTD 2307s (link to PDFs)

### M3 Acceptance

- [ ] Consumer completes OTC purchase end-to-end with GCash
- [ ] Consumer uploads Rx → pharmacist verifies → order progresses
- [ ] Order with referral code attributes to MD Partner on COMPLETED
- [ ] Monthly payout agent groups accruals per MD, creates ApprovalRequest
- [ ] President/Finance approves payout → JE posts → 2307 PDF generated
- [ ] MD sees lifetime performance on their (future) partner portal

### M3 Gating

- NPC registration in force
- Pharmacist on payroll (or contracted) — regulatory requirement
- Payment gateway merchant accounts active (GCash, Maya, Xendit)
- Delivery partner contract signed
- Legal-reviewed MD Partner Agreement rolled out to enrolled MDs before any rebate accrual

---

## PHASE M4 — SaaS Productization (Multi-Tenant) 🚧 GATED on M3 proof-of-life

**Goal**: VIP CRM/ERP becomes a rentable SaaS. Self-serve signup, tiered per-seat billing (Free / Starter ₱299 / Pro ₱799/user / Enterprise custom), Stripe + Xendit billing integration, and a freemium simple version on Play Store / App Store.

**Year-2 constraint (architectural requirement)**: Current year, all SaaS revenue books to VIP Integrated Projects Inc. Next year, it spins to "Vios Software Solutions Inc." Architecture must support **entity-reassignment of existing subscriptions without subscriber-facing breakage**.

### M4 Backend

- [ ] **M4.1** — Tenant isolation audit across ALL endpoints. Tag every controller function with one of `{scope: 'platform', 'tenant', 'public'}`. Any endpoint missing `req.entityId` enforcement is flagged as a leak. Automated test: spawn 2 tenants, verify tenant-A admin cannot GET any tenant-B record.
- [ ] **M4.2** — `backend/models/Subscription.js`: `tenant` (ref Entity), `billingEntity` (ref Entity — the entity that owns the revenue; NOT necessarily the tenant; this is the year-2 reassignment hinge), `plan`, `seats`, `mrrPhp`, `status`, `billingProvider` (stripe/xendit), `externalCustomerId`, `externalSubscriptionId`, `trialEndsAt`, `billingAnchorDay`, `currentPeriodStart`, `currentPeriodEnd`
- [ ] **M4.3** — `backend/models/SubscriptionInvoice.js` + `SubscriptionPayment.js` — billing ledger that feeds ERP JEs
- [ ] **M4.4** — Self-serve signup: `POST /api/signup` → creates Entity (new tenant) + admin User + seeds default Lookup rows (COA, modules, roles) + starts 14-day trial Subscription
- [ ] **M4.5** — Stripe webhook handler: `invoice.paid` → post receipt + JE (DR: Cash, CR: Subscription Revenue), `customer.subscription.updated`, `invoice.payment_failed` → status=past_due, downgrade to FREE after grace period
- [ ] **M4.6** — Xendit webhook handler (for GCash/Maya billing in PH): same event model as Stripe
- [ ] **M4.7** — Entity-reassignment migration: `POST /api/platform/subscriptions/:id/reassign` body: `{ newBillingEntity }` → moves future billing to new entity, creates crossing JE (closing old entity's AR-Subscriptions, opening new entity's), preserves `tenant` unchanged (subscriber sees no break). **Test in year-1 with a dummy subscription before year-2 real migration.**
- [ ] **M4.8** — Platform admin console (separate from tenant admin): `/platform/tenants`, `/platform/revenue`, `/platform/churn` — Vios Software Solutions president-only view
- [ ] **M4.9** — Feature flags per plan: `PLAN_FEATURES` lookup. FREE caps at 10 VIP Clients + 3 users + no campaigns. STARTER unlocks campaigns + 50 VIP Clients. PRO unlocks multi-entity + unlimited. ENTERPRISE unlocks API access + SSO.

### M4 Frontend (marketing site + in-app billing)

- [ ] **M4.10** — Public marketing site (separate repo OR `frontend/src/marketing/`) at the product's domain — pricing page, features, signup CTA
- [ ] **M4.11** — Tenant admin billing dashboard: current plan, seats, invoices, payment methods, upgrade/downgrade
- [ ] **M4.12** — Simple consumer app for Play/App Store — PWA or React Native shell. Feature-reduced: VIP Client list, schedule view, log visit, inbox. Upgrade prompt links to full web app. Free tier; monetize via in-app purchase of bulk SMS + Excel import.

### M4 Acceptance

- [ ] Prospective subscriber visits marketing site → signs up → lands in their trial tenant within 2 minutes
- [ ] Tenant A and Tenant B data fully isolated (audit script passes)
- [ ] Stripe invoice paid → JE posts to ERP in year-1 VIP books
- [ ] Dummy subscription reassigned from VIP to test entity without subscriber-visible break — year-2 migration is mechanical
- [ ] Simple app published to Play Store + App Store with store listing linking to vipcrm.com (or vioscrm.com)
- [ ] Plan-based feature gates enforced (FREE tenant cannot launch campaign)

### M4 Gating

- BIR CAS PTU filed for VIP Inc (to legitimize subscription revenue accounting pre-spin-out)
- Vios Software Solutions Inc. SEC registration in process (by Q3 year-1)
- Stripe + Xendit merchant accounts active
- Terms of Service + SaaS Subscriber Agreement drafted by counsel
- Data Processing Agreement template for tenants (DPA compliance on their data)

---

## PHASE M5 — Shared Services (HR / Bookkeeping / Accounting) ⏸ PARKED

Out of scope for 2026. Skeleton entry only. Will be replanned after M4 proof-of-life.

Likely shape when it revives:
- Services business (headcount-intensive) where VIP sells Judy Mae's team's bookkeeping to subscribers
- ERP becomes the delivery tool: subscribers give VIP access to their tenant, VIP bookkeepers do monthly closing remotely
- Commercial model: retainer ₱X/month per subscriber + per-transaction fee
- Staffing: minimum 2 CPAs + 3 bookkeepers + 1 HR generalist before launch
- Compliance: DOLE Private Employment Agency license (HR), BIR bookkeeping accreditation (CPAs on payroll), PRC-registered supervising CPA

Do NOT let M5 considerations influence M1-M4 architecture. It reuses existing multi-tenant bones.

---

## Phase M Sequencing Summary

| Phase | Status | Blocker | Rough estimate |
|---|---|---|---|
| M1 — Invite + Consent + Partner Scaffold | 🟢 Ready | None | 3-5 working days |
| M2 — Campaign Engine | 🟡 Gated | NPC filing receipt | 7-10 days once unblocked |
| M3 — vippharmacy.online | 🟡 Gated | NPC + storefront stack decision + pharmacist + payment merchants | 4-6 weeks once unblocked |
| M4 — SaaS Productization | 🟡 Gated | M3 live + Vios Software Solutions Inc. incorporation + BIR CAS | 6-8 weeks once unblocked |
| M5 — Shared Services | ⏸ Parked | Revive after M4 | TBD |

**Recommended order of parallel work starting today**:
1. Engineering: build M1 (3-5 days)
2. Judy Mae + consultant: start NPC registration (4-6 weeks processing)
3. You: finalize M3.0a storefront stack decision, sign pharmacist, open Stripe + Xendit merchant accounts
4. Legal: draft MD Partner Agreement + SaaS Terms + DPA templates
5. Judy Mae + BIR consultant: start BIR CAS PTU prep (3-6 months processing)

---

# PHASE VIP-1 — INTEGRATED VIP REBATE + COMMISSION ENGINE

> **Source plan**: `~/.claude/plans/no-show-me-the-shimmying-candy.md` (re-scoped April 26, 2026 with mentor-mode pushback baked in).
> **Strategy**: `~/.claude/projects/<repo>/memory/project_vios_modular_saas_strategy_apr2026.md`.
> **Spans both repos**: `vip-pharmacy-crm` (CRM/ERP) and `vip-pharmacy-express` (storefront).

## VIP-1.A — Doctor schema + MD Leads page ✅ SHIPPED Apr 26 2026

Foundation for the MD-rebate moat. Discovery is automated (Rx OCR + storefront customer attestation in VIP-1.D/E); conversion is human (BDM in-person visits).

### Backend (vip-pharmacy-crm)

- `backend/models/Doctor.js` — added 5 fields:
  - `partnership_status: enum('LEAD','CONTACTED','VISITED','PARTNER','INACTIVE')` (no default; pre-save hook stamps `LEAD` on new docs, `PARTNER` on legacy docs being saved without it)
  - `lead_source: enum('RX_PARSE','CUSTOMER_ATTESTATION','BDM_MANUAL','IMPORT','OTHER')` default `BDM_MANUAL`
  - `partner_agreement_date: Date` (rebate Gate #2)
  - `prc_license_number: String` (sparse partial index — VIP-1.B may flip to unique post-dedup)
  - `partnership_notes: String`
- Indexes: `{ partnership_status, isActive }`, `{ assignedTo, partnership_status, isActive }`, sparse `{ prc_license_number }`.
- `backend/utils/mdPartnerAccess.js` (NEW) — lookup-driven role gates (`MD_PARTNER_ROLES` category, codes `VIEW_LEADS`/`MANAGE_PARTNERSHIP`/`SET_AGREEMENT_DATE`). Mirrors `PROXY_ENTRY_ROLES` lazy-seed-from-defaults pattern in [resolveOwnerScope.js:58](backend/erp/utils/resolveOwnerScope.js#L58). Inline defaults = `[admin, president]`. 60-second cache, `invalidate(entityId)` on Lookup save.
- `backend/controllers/doctorController.js`:
  - `getAllDoctors` accepts `?partnership_status=LEAD` (single) or `?partnership_status=LEAD,CONTACTED,VISITED,PARTNER,INACTIVE` (comma-separated → `$in`). Invalid enum tokens silently dropped (Rule #21 — never fall back to a default that hides data).
  - NEW `setPartnershipStatus` controller. Authorization cascade:
    - PARTNER promotion: requires `SET_AGREEMENT_DATE` role from lookup AND `partner_agreement_date` payload (Gate #2).
    - Other transitions: `MANAGE_PARTNERSHIP` role OR (BDM owns the record AND target is in `BDM_SELF_TRANSITIONS = LEAD/CONTACTED/VISITED/INACTIVE`).
  - `updateDoctor` admin-allowed fields extended with `lead_source`, `prc_license_number`, `partnership_notes` (BDMs get only `partnership_notes`).
- `backend/routes/doctorRoutes.js` — `PUT /api/doctors/:id/partnership-status` mounted before the catch-all `PUT /:id`.

### Frontend (vip-pharmacy-crm)

- `frontend/src/pages/admin/MdLeadsPage.jsx` (NEW) — operator surface. Status pill counts client-side from a single fetch (`partnership_status=LEAD,CONTACTED,VISITED,PARTNER,INACTIVE`). Promote-to-PARTNER opens a modal that requires `partner_agreement_date`. Lookup-driven UI: status pills + colors from `DOCTOR_PARTNERSHIP_STATUS`, lead-source labels from `DOCTOR_LEAD_SOURCE` (uses `useLookupOptions` hook).
- `frontend/src/services/doctorService.js` — added `updatePartnershipStatus(id, payload)` calling `PUT /doctors/:id/partnership-status`.
- `frontend/src/App.jsx` — added route `/admin/md-leads` lazy-loaded, gated `ROLE_SETS.ADMIN_ONLY`.
- `frontend/src/components/common/Sidebar.jsx` — added "MD Leads" entry in admin Management section (Handshake icon).
- `frontend/src/components/common/PageGuide.jsx` — added `'md-leads'` PAGE_GUIDES entry per Rule #1.

### Verification (Rule 0b)

- Backend syntax: `node -c` clean on Doctor.js, doctorController.js, doctorRoutes.js, mdPartnerAccess.js
- Frontend build: `npx vite build` → ✅ 11.12s, `MdLeadsPage` chunk emitted, no errors
- Schema enum + controller `PARTNERSHIP_STATUSES` constant kept in sync (manual today; if changed, change both — health check should assert this in a future pass)

### Lookup categories (admin must seed for full UX, but defaults work without)

- `DOCTOR_PARTNERSHIP_STATUS` — codes `LEAD`, `CONTACTED`, `VISITED`, `PARTNER`, `INACTIVE`. Each row has `metadata: { color: '#hex', next: 'CODE_OF_NEXT_STAGE', description: 'tooltip' }`.
- `DOCTOR_LEAD_SOURCE` — codes `RX_PARSE`, `CUSTOMER_ATTESTATION`, `BDM_MANUAL`, `IMPORT`, `OTHER`. Each row has `metadata: { color: '#hex' }` (optional).
- `MD_PARTNER_ROLES` — codes `VIEW_LEADS`, `MANAGE_PARTNERSHIP`, `SET_AGREEMENT_DATE`. Each row has `metadata: { roles: ['admin', 'president'] }`. Without lookup rows, helper falls back to inline defaults `[admin, president]`.

### Open items / handoff to VIP-1.B

- Seed the 3 lookup categories above (Control Center → Lookup Tables) so the page renders with the intended pills/colors instead of fallback grey + status codes.
- VIP-1.B will introduce `MdProductRebate`, `NonMdPartnerRebateRule`, `MdCapitationRule`, `StaffCommissionRule` — all of these read `Doctor.partnership_status === 'PARTNER'` and `Doctor.partner_agreement_date` set as gates. The 3-gate guardrail (PARTNER + agreement_date + consent_log) is enforced at MdProductRebate / MdCapitationRule pre-save in VIP-1.B.



## Phase G9.R10 — Agent Dashboard Audit Surface (April 28, 2026)

**Status**: SHIPPED uncommitted on `dev`. Build green. Runs-side Playwright-smoked; messages-side build-green only (MCP lock prevented live smoke — manual smoke queued in `memory/handoff_phase_g9_r10_apr28_2026.md`).

### What changed

`/erp/agent-dashboard` is now a real audit surface. Two sections of the page got server-side filters + pagination + (for messages) click-to-view. The page no longer caps history at 10/20 rows and the Lookup Tables surface gets one new admin-tunable category.

### Files touched

1. `frontend/src/erp/pages/AgentDashboard.jsx` — split runs/messages into their own `loadRuns(page, filters)` / `loadMessages(page, filters)` callbacks; added filter bars, pagination via the shared `<Pagination>` component, and a click-to-view modal for messages with sender/recipient/priority metadata + an "Open in Inbox" link. Lookup-driven category labels via `useLookupOptions("AGENT_MESSAGE_CATEGORIES")` + inline `CAT_FALLBACK` so the page never goes dark on a Lookup outage.
2. `backend/controllers/messageInboxController.js` — `getInboxMessages` now accepts `?from=YYYY-MM-DD&to=YYYY-MM-DD`. Inclusive day boundaries on `createdAt`. Invalid dates are silently dropped.
3. `backend/erp/controllers/lookupGenericController.js` — new `AGENT_MESSAGE_CATEGORIES` SEED_DEFAULTS entry (3 rows: ai_coaching / ai_schedule / ai_alert with bg/fg/icon/sort_order metadata). Lazy-seeded on first GET per entity.
4. `frontend/src/erp/components/WorkflowGuide.jsx` — `agent-dashboard` banner expanded with the new filter / pagination steps and 2 new "Next steps" links (Inbox + Lookup Tables).

### Lookup-driven (Rule #3)

- Category pill labels + colors: `AGENT_MESSAGE_CATEGORIES` Lookup category (rows: `ai_coaching` / `ai_schedule` / `ai_alert`). Subscribers re-color or re-label without a code deploy.
- Schema enum `MessageInbox.category` is the validation gate (admin cannot introduce a code the schema rejects); the Lookup only supplies display metadata. Same split as VIP-1.A `partnership_status` / `DOCTOR_PARTNERSHIP_STATUS`.
- Recent Agent Runs agent dropdown: driven by backend `agentRegistry.AGENT_DEFINITIONS` via `/erp/agents/registry`. New agents auto-surface.

### Subscription-readiness posture

- Filters honor entity scope through existing `tenantFilter` on `/api/messages` and the `adminOnly` gate on `/erp/agents/runs` (Phase G9.R4 + Rule #21). A subscriber's president sees only their own entity's agent messages.
- Page-size constants (`RUNS_PER_PAGE=20`, `MSGS_PER_PAGE=15`) are platform UX choices, not subscriber-tunable. Defer Settings exposure until requested.

### Verification (Rule 0b)

- Backend syntax: `node -c` clean on `messageInboxController.js` + `lookupGenericController.js`.
- Frontend build: `npx vite build` → green, 11.02s, no errors.
- Removed `msgTab` state + orphan `filteredMsgs` computation. `grep` clean.
- Runs-side Playwright smoke (Apr 28 2026): filter narrows rows + total counter, Reset restores 28-of-28 + hides Reset button, Pagination Next loads page 2 with 8 remaining rows, empty-with-filters branch shows correct copy. Zero console errors.
- Messages-side smoke: BLOCKED on Playwright MCP profile lock at smoke time. Build-green only. The messages-side wiring mirrors the runs-side line-for-line — failure modes should be identical. Manual smoke checklist in handoff.

### Open items

- Manual Playwright smoke of the messages section (filter, pagination, click-to-view modal, mark-as-read on open). Walked into the handoff note.
- Seed `AGENT_MESSAGE_CATEGORIES` to the live cluster so the labels/colors honor the lookup instead of falling back to `CAT_FALLBACK`. The seed kicks in lazily on the first GET — no manual action needed unless admin wants to customize before the first lookup-fetch. To customize: Control Center → Lookup Tables → AGENT_MESSAGE_CATEGORIES → edit the 3 rows.
- Click-to-view for run rows (drill into full key_findings + error stack on a single run): deferred. Data is already on `AgentRun.summary` / `AgentRun.error_msg`; UI is one modal away.
- Sort toggle on Recent Agent Runs (newest first vs by agent name): deferred. Backend already sorts `run_date: -1`; subscribers haven't asked for grouping yet.

---

## Phase EC-1 — Executive Cockpit (CFO/CEO/COO at-a-glance) — April 28, 2026

> **Status**: SHIPPED on `feat/executive-cockpit`. Wiring + syntax verified. Vite full-bundle and Playwright smoke deferred to post-merge (worktree limitation, see Verification section).

### Why

Apr 28 audit of the CRM/ERP dashboard landscape (commit context: post-G9.R10 c7a2bef on `dev`) identified:
1. **CRM and ERP dashboards correctly separated** — CRM dashboards live under `/admin/*` and `/employee/*`, ERP dashboards live under `/erp/*`. No cross-contamination.
2. **Real C-suite gap**: 19 ERP dashboards scattered by domain (Sales Goals, Consignment, Expiry, IC AR, Cycle Status, P&L, Agent, etc.) but NO single roll-up surface. CFO/CEO/COO had to click through 5+ dashboards each morning to know "is anything on fire today / are we trending right."
3. **KPI duplication risk** flagged: visits/engagements counted differently in CRM Visit vs ERP SALES_GOALS_ENGAGEMENT, AR/IC AR overlap, inventory entity- vs warehouse-scoped. The cockpit avoids this by being a pure aggregator over canonical sources — never re-computes, only rolls up.
4. Four orphan dashboards exist as routes but aren't sidebar-linked (KpiLibrary, KpiSelfRating, CycleReports — each `/erp/*`). Tracked separately, not bundled into EC-1.

### What

Single page at `/erp/cockpit` with 10 tiles in two tiers, lookup-driven role gates, and per-tile error containment.

**Tier-1 (always shown if user has scope)**:
- Cash position (BankAccount + PettyCashFund) — top-3 accounts
- AR aging (5 buckets via `arEngine.getArAging`) — over-90% trend + top-3 overdue hospitals
- AP aging (5 buckets via `apService.getApAging`) — over-90% + top-3 vendors
- Period close % complete (via `monthEndClose.getCloseProgress`)
- Approval queue depth + SLA breaches (>48h pending)
- Agent health (failing/stale per `agent_key` over last 30d)

**Tier-2**:
- Gross margin % (via `dashboardService.getMtd().gross_margin` — same number as `/erp` shows)
- Inventory turns + days-on-hand
- MD partnership funnel (LEAD/CONTACTED/VISITED/PARTNER counts + conversion %)
- BIR calendar (overdue + due-in-30d + filed-this-quarter)

Every tile is clickable, drilling into the canonical detail page (`/erp/banking`, `/erp/collections/ar`, `/erp/purchasing/ap`, `/erp/month-end-close/:period`, `/erp/approvals`, `/erp/agent-dashboard`, `/erp/pnl`, `/erp/my-stock`, `/admin/md-leads`, `/admin/bir`).

### Files (8 new + 4 modified)

**New**:
- `backend/utils/executiveCockpitAccess.js` — role-gate helper (mirrors birAccess.js / scpwdAccess.js pattern; 60s cache TTL; lookup-driven)
- `backend/erp/services/cockpitService.js` — aggregator with `Promise.allSettled` per-tile error containment + 10 individual tile getters
- `backend/erp/controllers/cockpitController.js` — single endpoint that resolves VIEW_FINANCIAL/VIEW_OPERATIONAL scopes and dispatches to service
- `backend/erp/routes/cockpitRoutes.js` — mounts `requireCockpitRole('VIEW_COCKPIT')` gate
- `backend/scripts/healthcheckExecutiveCockpit.js` — 42-assertion static wiring check
- `frontend/src/erp/pages/ExecutiveCockpit.jsx` — page (Tier-1 + Tier-2 grids, 60s auto-refresh, click-through tiles, color thresholds)
- `frontend/src/erp/hooks/useCockpit.js` — fetcher

**Modified**:
- `backend/erp/controllers/lookupGenericController.js` — `EXECUTIVE_COCKPIT_ROLES` SEED_DEFAULTS entry (3 codes: VIEW_COCKPIT, VIEW_FINANCIAL, VIEW_OPERATIONAL) + cache invalidation hooked into all 4 mutation sites
- `backend/erp/routes/index.js` — mounts `/cockpit` after `/dashboard`
- `frontend/src/App.jsx` — lazy import + ROLE_SETS.MANAGEMENT-gated route
- `frontend/src/components/common/Sidebar.jsx` — Executive Cockpit pinned at the top of the ERP sidebar for management roles
- `frontend/src/erp/components/WorkflowGuide.jsx` — `WORKFLOW_GUIDES['cockpit']` banner with 7 steps + 5 next-step links + tip

### Lookup-driven (Rule #3)

`EXECUTIVE_COCKPIT_ROLES` Lookup category, 3 codes:
- **VIEW_COCKPIT** — page-level gate. Default: admin/finance/president.
- **VIEW_FINANCIAL** — gates Cash, AR aging, AP aging, Period close, Margin tiles. Default: same. Subscribers can revoke from operations roles to keep COA confidentiality while granting page access.
- **VIEW_OPERATIONAL** — gates Approval SLA, Inventory turns, Agent health, Partnership funnel, BIR calendar tiles. Default: same. Branch-manager-style roles can hold this without VIEW_FINANCIAL.

A subscriber adds `cfo` to all three lookup rows + adds `cfo` to `ROLE_SETS.MANAGEMENT` (the only code-side change), and a CFO-role user instantly sees the cockpit. Future refactor: lookup-drive `ROLE_SETS.MANAGEMENT` itself to remove the last code touch (out-of-scope here).

### Subscription-readiness posture (Rule #0d)

- Every tile query is `entity_id`-scoped (the eventual `tenant_id`). No cross-entity bleed.
- Hardcoded role names appear ONLY in the helper's `DEFAULT_*` arrays, used as fallbacks if the Lookup row is missing or empty (lazy-seed catches this on first read).
- New tile = new entry in `TILES` registry inside `getCockpit()`. No schema change, no new route.
- Per-tile error containment = high availability — degraded upstreams don't dark the cockpit.
- AR aging tile honors Rule #21: privileged users get entity-wide AR (passes `null` bdm_id). Never silently falls back to `req.bdmId`.

### Verification (Rule 0b)

- **Healthcheck**: `node backend/scripts/healthcheckExecutiveCockpit.js` → 42/42 ✓ (access helper exports, lookup invalidation at all 4 sites, SEED_DEFAULTS rows, service exports + Promise.allSettled, controller scope-resolution, route gate, routes/index mount, App.jsx, Sidebar, WorkflowGuide).
- **Backend syntax**: `node -c` clean on all 8 backend files (helper, service, controller, route, lookupGenericController, routes/index, healthcheck).
- **Frontend syntax**: `esbuild.transformSync` (the same parser Vite uses) clean on all 5 frontend files (ExecutiveCockpit.jsx, useCockpit.js, WorkflowGuide.jsx, Sidebar.jsx, App.jsx).
- **Vite full bundle: NOT verified inside the worktree**. Vite walks up to the main repo's root looking for a project root and lands on a `node_modules` that doesn't have vite installed (only `frontend/node_modules` does). Junctions don't help because Vite resolves real paths. Run `npm run build` from `frontend/` after merging to dev to confirm — esbuild parse + healthcheck wiring leave a low residual risk, but it's not zero.
- **Playwright UI smoke: deferred** — same blocker (no live dev server in the worktree). Smoke checklist (post-merge):
  1. login as `yourpartner@viosintegrated.net` → ERP sidebar shows "Executive Cockpit" pinned at top
  2. /erp/cockpit renders Tier-1 grid (6 tiles) and Tier-2 grid (4 tiles)
  3. auto-refresh ticks at 60s without console error
  4. tile click-through navigates to detail page
  5. login as a non-management role (`s3.vippharmacy@gmail.com` BDM) → /erp/cockpit returns 403 from API and the sidebar pin is hidden

### Open items

- Post-merge: run `cd frontend && npm run build` from main repo to validate Vite full bundle.
- Post-merge: Playwright smoke per checklist above.
- Future: lookup-drive `ROLE_SETS.MANAGEMENT` so adding a `cfo` role takes zero code changes (currently 1-line edit in `frontend/src/constants/roles.js`).
- Future: per-user tile preferences (drag-to-reorder, pin/hide). Out-of-scope today; cockpit ships with a fixed Tier-1 → Tier-2 ordering for predictability.

---

## Phase TA-1 — Team Activity Cockpit + Overview Drill-down (April 29, 2026)

### Why
COO needs a daily-scan surface answering "who do I talk to today and why." Existing surfaces (Overview compliance bar chart, BDM Performance one-at-a-time, Reports Excel export, Activity Monitor firehose) all answer different questions. None of them shorten time-to-detection for an idle BDM. A red-flag list with proactive cadence rules does.

Decision rejected: a full 11-BDMs × 20-days matrix view. That's a *reference* view, not a *decision* view — 220 cells to scan vs. an action list with built-in "who needs attention first" sort. Matrix can be built later if leadership genuinely wants it.

### What
- **New tab** `/admin/statistics` → Team Activity (leftmost, default badge counts red-flag + never)
- **One row per active BDM**: Today / This Week / This Month / Cycle / Cycle Target / Call Rate / Last Visit (relative) / Flag pill
- **Red-flag rule**: ≥ N consecutive Mon-Fri (Manila) workdays with zero visits. N is lookup-driven, default 2.
- **Click row** → drills into BDM Performance tab pre-selected
- **Quick Win bonus**: Overview tab's Per-BDM Call Rate bar chart bars are now clickable too — same drill handler

### Files (3 new + 4 modified)
- NEW: [backend/utils/teamActivityThresholds.js](../backend/utils/teamActivityThresholds.js) — lookup helper with inline DEFAULTS + 60s cache
- NEW: [backend/scripts/healthcheckTeamActivity.js](../backend/scripts/healthcheckTeamActivity.js) — 22-point static wiring verifier
- NEW (Playwright smoke artifacts): /tmp/playwright-test-team-activity-v{1,2,3}.js
- MODIFIED: [backend/controllers/scheduleController.js](../backend/controllers/scheduleController.js) — added `getTeamActivity` (~140 lines, Manila-time-correct cycle sweep + consecutive-gap walker)
- MODIFIED: [backend/routes/scheduleRoutes.js](../backend/routes/scheduleRoutes.js) — `GET /team-activity` mounted with `adminOnly`
- MODIFIED: [backend/erp/controllers/lookupGenericController.js](../backend/erp/controllers/lookupGenericController.js) — `TEAM_ACTIVITY_THRESHOLDS` seed entry
- MODIFIED: [frontend/src/services/scheduleService.js](../frontend/src/services/scheduleService.js) — `getTeamActivity()`
- MODIFIED: [frontend/src/pages/admin/StatisticsPage.jsx](../frontend/src/pages/admin/StatisticsPage.jsx) — `TeamActivityTab` component (~210 lines), tab button + lazy-load + refresh wiring, `handleBdmDrillDown` shared with Overview bar-chart `<Bar onClick>`, `userId` propagated through `perBdmCallRates`
- MODIFIED: [frontend/src/components/common/PageGuide.jsx](../frontend/src/components/common/PageGuide.jsx) — `statistics-page` banner updated for new tab + drill hint

### Lookup-driven (Rule #3)
Category `TEAM_ACTIVITY_THRESHOLDS`, code `DEFAULT`:
- `red_flag_consecutive_workdays: 2`
- `gap_warning_workdays: 1`
- `target_call_rate: 80`

`insert_only_metadata: true` so admin overrides survive `seedAllLookups.js` re-runs. Subscriber in Vios SaaS spin-out adds their own row per entity to tune cadence — zero code deploy.

### Verification (Rule 0b)
- Healthcheck: **22/22 PASS** — `node backend/scripts/healthcheckTeamActivity.js`
- Backend syntax: PASS — `node -c` on touched files
- Vite build: PASS — 10.79s, `StatisticsPage-Bvd2h-85.js` 69.27 kB
- Playwright smoke: 9/10 PASS in v2; v3 used dispatchEvent on the Recharts `<g class="recharts-bar-rectangle">` (11 bar groups detected) and confirmed bar click drills into BDM Performance with `cycle-nav-label` rendered = 1 (proves selectedBdmId is set). Test creds: yourpartner@viosintegrated.net / DevPass123!@#.
- Live data: 11 BDMs × 4 weeks of cycle 0 visit data → Team Activity rendered all 11 with sensible flag/count distribution.

### Subscription-readiness posture (Rule #0d)
- All thresholds lookup-driven — no hardcoded "2 workdays" or "80%" anywhere in business logic
- `entity_id` filter on the lookup row reaches through `req.entityId` so a multi-tenant SaaS could already shard
- `ROLES.STAFF` filter (Phase S2) instead of legacy `'employee'`/`'contractor'` — clean for the spin-out
- No `'VIP'` or single-cluster Mongo URI assumptions in the new code

### Open items
- Push notification when red-flag count crosses a threshold (8 AM daily digest) — UI is ready, just needs a cron job hooked into the existing `notificationService`
- "Mark as expected idle" override for legitimate gaps (annual leave, training week) — requires a per-BDM exception lookup
- Year-2 SaaS: per-tenant Team Activity widget — generalizes cleanly because everything is already lookup-driven

---

## Phase D.4c — CLM Pitch Performance Coaching Surface (May 2026, SHIPPED)

> Phase 2 follow-up from CLAUDE.md note 13b CLM gate v2 ("which slides do BDMs dwell on / which products convert best per pitch"). Closes the deferred D.4c entry from `handoff_deferred_index_may04_2026.md`.

### Why
Once Mae and the rest of the BDM team are pitching the partnership deck nightly, the president/COO needs to know:
- **Who is rushing through the deck?** (avg dwell per slide too low → didn't read out the headline + one bullet)
- **Who is pitching too short?** (avg session under target → MD never saw the partnership ask)
- **Where are MDs disengaging?** (drop-off% per slide spikes → that slide bleeds attention)
- **Which products land well per BDM?** (interest rate × times presented → which products to push)

Without this surface, coaching is anecdotal: admin tells the BDM "you need to sell better" with no data to point to a specific slide or product.

### What shipped
New tab in [/admin/statistics](../frontend/src/pages/admin/StatisticsPage.jsx) → **CLM Performance**. Three stacked panels over a 90-day default window:

1. **BDM Comparison Table** — sortable columns: Sessions / Avg duration / Avg slides / Avg dwell-per-slide / Conversion% / Avg interest / Early exits. Status pill: `on track` (green), `short` (yellow, sessions too brief), `coach` (red, low conversion or low dwell), `new BDM` (gray, < 5 sessions). Click row → drills into BDM Performance tab pre-selected (mirrors Team Activity drill-down).
2. **Slide Performance Heatmap** — bar chart per slide showing avg dwell + view count + drop-off%. Drop-off > 25% rendered red so admin sees immediately which slide loses MDs.
3. **Top Products × BDM Matrix** — per-BDM × per-product rows (timesPresented, interestRate%, avgTimeSpent). Sorted server-side by interestRate then count; capped at 30 rows on the frontend so the table stays readable.

### Files (3 new + 5 modified)
- NEW: [backend/utils/clmPerformanceThresholds.js](../backend/utils/clmPerformanceThresholds.js) — lookup helper with inline `DEFAULTS` + 60s cache + `invalidate()` (mirrors `teamActivityThresholds.js`)
- NEW: [backend/scripts/healthcheckClmPerformance.js](../backend/scripts/healthcheckClmPerformance.js) — 34-point static wiring verifier
- MODIFIED: [backend/controllers/clmController.js](../backend/controllers/clmController.js) — added `getPerformanceMatrix` asyncHandler (~190 lines, 3 independent aggregation pipelines + `resolveEntityId()` Rule-#21 scope)
- MODIFIED: [backend/routes/clmRoutes.js](../backend/routes/clmRoutes.js) — `GET /sessions/performance` mounted with `adminOnly` BEFORE `/sessions/:id` generic
- MODIFIED: [backend/erp/controllers/lookupGenericController.js](../backend/erp/controllers/lookupGenericController.js) — `CLM_PERFORMANCE_THRESHOLDS` seed entry with 5 metadata keys
- MODIFIED: [frontend/src/services/clmService.js](../frontend/src/services/clmService.js) — `getPerformanceMatrix(params)`
- MODIFIED: [frontend/src/pages/admin/StatisticsPage.jsx](../frontend/src/pages/admin/StatisticsPage.jsx) — `CLMPerformanceTab` component (~280 lines + styles), tab button + state + lazy-load + Refresh handler, drill-down via existing `handleBdmDrillDown`
- MODIFIED: [frontend/src/components/common/PageGuide.jsx](../frontend/src/components/common/PageGuide.jsx) — `statistics-page` banner mentions the new tab + threshold-tunability

### Lookup-driven (Rule #3)
Category `CLM_PERFORMANCE_THRESHOLDS`, code `DEFAULT`:
- `min_avg_dwell_seconds_per_slide: 10` — below = "rushing through the deck"
- `target_avg_session_minutes: 8` — below = "too rushed", aligns with 6-slide × ~80s designer intent
- `target_conversion_rate_pct: 30` — % of completed sessions ending in `interested` or `already_partner`
- `min_slides_viewed: 4` — sessions exiting before slide 4 (the partnership-ask slide) = "early exit"
- `flag_below_total_sessions: 5` — hide flags for new BDMs whose 1-2 sessions can't carry meaningful averages

`insert_only_metadata: true` so admin overrides survive `seedAllLookups.js` re-runs. Subscriber tunes per-entity in Control Center → Lookup Tables — zero code deploy.

### Verification (Rule 0b)
- Healthcheck: **34/34 PASS** — `node backend/scripts/healthcheckClmPerformance.js`
- Backend syntax: PASS — `node -c` on all 4 touched backend files
- Live HTTP smoke (admin / president): GET `/api/clm/sessions/performance` returns 200 with `window` + `thresholds` (5 default keys) + `bdmComparison` (1 row, Mae 8 sessions) + `slidePerformance` (5 slides) + `bdmProductMatrix` (6 rows). Threshold lookup-row not yet seeded for this entity but the helper falls back to inline `DEFAULTS` cleanly.
- Sibling regressions: see "Verification" section below in commit summary.

### Subscription-readiness posture (Rule #0d)
- All thresholds lookup-driven — no hardcoded "10 seconds" or "30%" anywhere in business logic
- `entity_id` filter through `resolveEntityId()` (Rule #21 — president cross-entity by default + admin/finance working entity + optional `?entity_id=` override). Helper caches per-entity_id with TTL+invalidate.
- `ROLES.STAFF` consistent with Phase S2 (no legacy `'employee'`/`'contractor'` strings)
- No `'VIP'` or single-cluster Mongo URI assumptions in the new code
- Existing `getAnalytics` endpoint untouched — no regression risk on existing callers

### Open items
- Optional: surface a date-range picker in the tab header (currently fixed at 90 days). Backend already accepts `?startDate&endDate`. ~30 min frontend wire-up.
- Optional: drill-down "click a slide" → list of sessions where that slide was the drop-off point. Backend already has the data; would be ~1 hr.
- Year-2 SaaS: per-tenant CLM Performance widget — generalizes cleanly because everything is already lookup-driven + entity-scoped.


## Phase A.6 — Admin-Driven One-Off Scheduling (May 5, 2026, SHIPPED)

### Why
The CPT Excel re-import (Phase C) is the bulk-load mechanism for refreshing a BDM's 4-week schedule, but it's overkill for one-off changes — admin promoting a single Regular client to VIP, adding a single new VIP, or moving one upcoming visit because the doctor's clinic schedule changed. Admin needed an inline mechanism that thinks in calendar dates (not W#D# coordinates).

### What shipped
- Add VIP / Upgrade-to-VIP modal step that sets the visit date(s) atomically with the Doctor create (one round-trip, transactional).
- Per-row Schedule / Reschedule action on every VIP row (DoctorManagement table) — opens the same modal in either 'schedule' (no upcoming entries yet) or 'reschedule' (1+ existing) mode.
- Per-row Reschedule action on EmployeeVisitReport rows (admin's daily call-plan view).
- 'Needs scheduling' badge on VIPs with 0 upcoming entries — bulk-fetched in one  aggregation per page render.

### Files (3 new + 8 modified)
**New:**
- backend/utils/scheduleSlotMapper.js — date↔slot math + alt-week + past-cycle validators.
- frontend/src/components/admin/ScheduleVisitsModal.jsx — three-mode shared modal.
- backend/scripts/healthcheckAdminScheduling.js — 36-check static contract verifier.

**Modified:**
- backend/controllers/scheduleController.js — adminReschedule, adminGetUpcoming, adminGetUpcomingCounts; adminCreate now accepts {date}.
- backend/controllers/doctorController.js — createDoctor accepts initialSchedule with txn + compensating-delete fallback.
- backend/routes/scheduleRoutes.js — PATCH /admin/:id, GET /admin/upcoming, GET /admin/upcoming-counts (mount order matters — /admin/upcoming before /admin/:id).
- frontend/src/services/scheduleService.js — adminReschedule, adminGetUpcoming, adminGetUpcomingCounts.
- frontend/src/pages/admin/DoctorsPage.jsx — modal state, handleScheduleClick, bulk-fetch effect, generateDefaultDatesClient mirror.
- frontend/src/components/admin/DoctorManagement.jsx — Schedule action + Needs-scheduling badge + new props.
- frontend/src/components/admin/EmployeeVisitReport.jsx — onReschedule prop + Actions column.
- frontend/src/pages/admin/ReportsPage.jsx — modal state + handleEvrReschedule.
- frontend/src/components/common/PageGuide.jsx — doctors-page + reports-page banners updated.
- CLAUDE.md — gotcha 12c.

### Lookup-driven (Rule #3)
- Role gating: `adminOnly` middleware today; documented migration path to `SCHEDULE_LIFECYCLE_ROLES` lookup category (codes RESCHEDULE, INITIAL_SCHEDULE_ON_CREATE) when subscribers need delegation. Mirrors MD_PARTNER_ROLES / PROXY_ENTRY_ROLES pattern.
- Smart-default day (Tuesday) and 2x/mo pattern (W1+W3) are inline constants in scheduleSlotMapper.generateDefaultDates — easy lift to SCHEDULE_DEFAULTS lookup if subscribers want different presets.

### Subscription-readiness posture (Rule #0d)
- Schedule rows already carry user (BDM) — no entity_id leak risk in the new code paths.
- All math (cycle/week/day) goes through scheduleCycleUtils which is Manila-time-correct.
- generateDefaultDatesClient mirrors backend exactly — single source of truth for cycle anchor (Jan 5, 2026); change here also requires backend update.
- Visit-date editing for *logged* visits is explicitly OUT of scope. Reason: BDMs editing their own logged visit dates would bypass weekly-limit enforcement.

### Verification (Rule 0b)
- Healthcheck: **36/36 PASS** — `node backend/scripts/healthcheckAdminScheduling.js`
- Backend syntax: PASS — `node -c` on all touched backend files
- Vite build: PASS — `npx vite build` (no errors, no warnings, 10.16s)
- API + UI smoke: see end of session

### Open items
- Visit-date edit (admin-only, with audit + period-lock) is a separate phase if/when needed. Currently visitController.js:455 still rejects visitDate updates.
- The lookup migration to SCHEDULE_LIFECYCLE_ROLES is not blocking — admin gate is correct for VIP today; subscribers will need it when SaaS spins out.
- Year-2 SaaS: every Schedule mutation already filters by user; tenant isolation will fall out naturally when Phase S6 generalizes user.entity_id.

---

## Phase O — Visit Photo Trust + Screenshot Block + Late-Log Cutoff (May 05, 2026, SHIPPED)

### Status: SHIPPED + smoke-ratified. See [CLAUDE.md note 13d](../CLAUDE.md) for the full contract.

### Why

The Jake Montero May 4 case (one Messenger screenshot, two different VIP Clients on the same minute, identical timestamp) proved the visit-photo fraud surface was open in two ways: (1) BDMs could back-date by setting `meta.capturedAt` to whatever they wanted (server trusted it blindly), and (2) Messenger screenshots were treated the same as in-person selfies. The 17-CHANGE_LOG had no item for this — it surfaced through real per-diem audit work, not pre-shipped requirements.

### What shipped

| File | Change |
|---|---|
| [backend/utils/photoMetadata.js](../backend/utils/photoMetadata.js) (NEW) | Server-side EXIF extraction via `exifr` (^7.1.3, new dep) + sharp dimensions; screenshot detection via no-EXIF + no-GPS + aspect-ratio + phone-resolution trifecta; `resolveAggregateVisitDate` picks earliest EXIF DateTimeOriginal across the upload set. |
| [backend/utils/visitPhotoValidation.js](../backend/utils/visitPhotoValidation.js) (NEW) | `getThresholds(entityId)` reads `VISIT_PHOTO_VALIDATION_RULES` Lookup with 60s TTL cache; falls back to inline DEFAULTS on miss; `invalidate()` hook for admin Lookup edits. Mirrors `clmPerformanceThresholds.js`. |
| [backend/middleware/upload.js](../backend/middleware/upload.js) | `processVisitPhotos` extracts EXIF from `file.buffer` BEFORE sharp re-encode; returns 422 `{ code: 'SCREENSHOT_DETECTED', redirect: ... }` when screenshot detected; attaches `serverMeta` + `photoValidationRules` to `req` for the controller. |
| [backend/controllers/visitController.js](../backend/controllers/visitController.js) | `createVisit` derives `visitDate` from earliest server-extracted EXIF (NOT from BDM-supplied body); enforces 14-day late-log cutoff; rejects future-dated photos (clock skew); emits 3 new signal flags (`no_exif_timestamp`, `gps_in_photo`, `late_log_cross_week`). |
| [backend/erp/controllers/lookupGenericController.js](../backend/erp/controllers/lookupGenericController.js) | Extended `PHOTO_FLAG` seed with 3 new codes; added `VISIT_PHOTO_VALIDATION_RULES` category with 5 metadata keys (`insert_only_metadata: true`). |
| [backend/erp/services/smerCrmBridge.js](../backend/erp/services/smerCrmBridge.js) | **Regression fix**: replaced `$size === 0` photoFlags filter with `$setIntersection` against constant `PERDIEM_DISQUALIFYING_FLAGS = ['date_mismatch', 'duplicate_photo']`. Phase O signal flags no longer kill per-diem. Future-Phase work: lift constant to a Lookup category. |
| [frontend/src/components/employee/CameraCapture.jsx](../frontend/src/components/employee/CameraCapture.jsx) | Accepts `initialPhotos` prop; useEffect seeds it on mount with `initialSeededRef` guard so user-captured photos can't be clobbered when parent's async restoration callback fires after capture started. Closes the offline-draft restoration UI gap (CLAUDE.md note 13b follow-up b). |
| [frontend/src/components/employee/VisitLogger.jsx](../frontend/src/components/employee/VisitLogger.jsx) | Passes `initialPhotos={photos}` to CameraCapture; handles 422 `SCREENSHOT_DETECTED` → navigate to `/bdm/comm-log?doctorId=<X>` with doctor pre-selected; handles 400 `VISIT_PHOTO_TOO_OLD` / `VISIT_PHOTO_FUTURE_DATED` / `CAMERA_PHOTO_MISSING_EXIF` with actionable toasts. |
| [frontend/src/components/common/PageGuide.jsx](../frontend/src/components/common/PageGuide.jsx) | Updated `'new-visit'` entry per Rule #1 — mentions GPS Map Camera, EXIF-derived visitDate, 14-day cutoff, screenshot-to-Comm-Log redirect. |
| [backend/scripts/healthcheckPhaseOPhotoTrust.js](../backend/scripts/healthcheckPhaseOPhotoTrust.js) (NEW) | 10-section static contract verifier (9 Phase O sections + 1 SMER bridge regression guard). |
| [backend/package.json](../backend/package.json) | Added `exifr@^7.1.3`. |

### Verification artefacts

- **Healthcheck**: `node backend/scripts/healthcheckPhaseOPhotoTrust.js` → **10/10 PASS**.
- **Vite build**: ✓ 14.17s, no warnings.
- **Backend syntax check**: `node -c` clean on all 5 modified backend files.
- **Helper unit smoke** (one-off temp script, deleted after run): 7/7 assertions pass — EXIF extraction from synthetic JPEG, screenshot detection on 1080×2400 PNG, NOT-screenshot on 1920×1080 16:9, `resolveAggregateVisitDate` earliest-wins + fallback, `daysBetween` arithmetic.
- **Live API smoke as Mae Navarro on dev cluster** (browser_evaluate from Playwright session):
  - Screenshot 422: `POST /api/visits` with 1080×2400 PNG → HTTP 422, `{ code: 'SCREENSHOT_DETECTED', redirect: '/bdm/comm-log', message: 'This looks like a screenshot...' }`
  - Camera 201: `POST /api/visits` with 1920×1080 JPEG → HTTP 201, `photoFlags: ['no_exif_timestamp']` (correct: canvas-output JPEGs have no EXIF), visitDate auto-derived from upload time (fallback because no EXIF)
  - SMER bridge regression check: `GET /api/erp/expenses/smer/crm-md-counts?period=2026-05&cycle=C1` → May 5 entry shows `md_count: 1, flagged_excluded: 0` confirming `no_exif_timestamp` does NOT kill per-diem post-fix
- **Live UI smoke**: PageGuide banner on `/bdm/visit/new` renders the Phase O text (verified via `browser_evaluate` after hard reload — Vite HMR needed a manual refresh to pick up the PageGuide.jsx edit). Screenshot saved to `phase-o-new-visit-banner.png` at repo root.

### Common gotchas

- **`exifr` is a NEW backend dependency** (^7.1.3, ~100KB pure JS, no native bindings). Survives prod deploy via `npm install` on AWS Lightsail; no extra build steps.
- **EXIF stripped → fallback to upload time, NOT rejection** — by default. Subscribers who want stricter posture flip `VISIT_PHOTO_VALIDATION_RULES.require_exif_for_camera_source: true` via Control Center → Lookup Tables (no code deploy).
- **Canvas-output photos have no EXIF**. The in-app `CameraCapture` uses canvas drawImage from getUserMedia → toDataURL — EXIF doesn't exist for those bytes. Every in-app camera capture post-Phase-O carries the `no_exif_timestamp` signal flag. The SMER bridge whitelist is what keeps these countable for per-diem.
- **Screenshot detection is conservative** — three signals must all fire (no EXIF date AND no EXIF GPS AND aspect ratio ≥1.85 AND width-or-height matches a known phone resolution). 16:9 photos (1920×1080, 1280×720) below the 1.85 floor pass through. Real-world fraudsters paste Messenger screenshots which check all three boxes.
- **The Vite HMR did not auto-pick up the PageGuide.jsx edit** during the live smoke — required a hard reload via `window.location.reload(true)` to surface the new banner copy. Production builds (where Vite output is static) are unaffected.
- **Test residue on dev**: one smoke visit row remains (`69f9d7ed0498a87019eb239d` — Mae→Amador Aguirre, 2026-05-05). Cancel route is admin-gated (`DELETE /api/visits/:id`); the row is otherwise legitimate test data and exercises the `no_exif_timestamp` flag end-to-end. Drop via admin login or Mongo shell if it pollutes weekly-cap testing later.

### Open items

- Promote `PERDIEM_DISQUALIFYING_FLAGS` constant to a Lookup category (subscribers tune which photo flags disqualify per-diem without a code deploy).
- OCR fallback for burned-in pixel metadata (GPS Map Camera overlay) — only when EXIF is suspicious or missing. Uses existing `tesseract.js` backend dep. Phase O.1 candidate.
- Mandate GPS Map Camera (or equivalent) as the BDM-onboarding camera app via a `BDM_REQUIRED_CAMERA_APP` lookup + onboarding banner. Policy + UI nudge, no code change. Phase O.2 candidate.
- Admin-only Visit-date edit + audit-log + period-lock — currently `visitController.js:455` rejects all `visitDate` updates. Phase O.3 candidate if admins ever need post-hoc backfill of pre-Phase-O visits whose timestamp drifted from intent.

---

## Phase PRG — Program & Support Type Resource Allocation (planned, NOT scoped for current sprint)

### Status: DEFERRED. Foundation ratified May 05 2026 (CLAUDE.md note 15). Build only when admin signals they want true ROI per program.

### Why
Programs (CME GRANT, MED SOCIETY PARTICIPATION, REBATES / MONEY, REST AND RECREATION) and Support Types (AIR FRESHENER, FULL DOSE, PATIENT DISCOUNT, PROMATS, STARTER DOSES) today are **labels** on doctors, not **cost objects**. The Statistics → Programs tab shows enrollment count + visited count + coverage% per cycle, which is useful for "is anyone visiting these MDs?" but cannot answer "are we getting return on what we spend?" The rebate engine flows MD spend through PRF/CALF correctly (Apr 29 2026 lock — all Tier-A → PRF/CALF, no IncentivePayout PAID_DIRECT path), but PRF / Expense / MdProductRebate rows have no `program_id` / `support_type_id` foreign key, so spend-per-program-per-MD is unmeasurable. Goal of this phase: turn Programs/Support Types into cost objects so admin can decide which MDs / programs to renew, cut, or upgrade.

### Phase PRG-1 — Tag spend with program/support type (foundation, ~1 day, schema-only)

**Schema additions** (all sparse — zero risk to the existing rebate engine):
- `backend/erp/models/PrfCalf.js` — add `program_id` (ref Program, sparse) + `support_type_id` (ref SupportType, sparse). Most CME / society / R&R cash spend lands here.
- `backend/erp/models/Expense.js` — same two fields, sparse. For direct disbursements outside PRF.
- `backend/erp/models/MdProductRebate.js` — add `program_id` (sparse). Defaults to "REBATES / MONEY" program if not set so the existing matrix flows continue working unchanged.

**UI additions**:
- PRF / Expense create modals: when `partner_id` resolves to a Doctor, the `program_id` dropdown is filtered to that doctor's `programsToImplement[]`. Hint to enroll the MD first if empty. Same pattern for `support_type_id` on sample-disbursement workflows.

**Migration**:
- `backend/scripts/backfillPrfCalfProgramId.js` — one-time idempotent backfill: any historical PRF/CALF row with a rebate context but no `program_id` defaults to the "REBATES / MONEY" program. Audit-rowed (`backend/erp/models/AuditLog.js`) per change.

**Acceptance**:
- Healthcheck script asserts every PrfCalf rebate context (ie. `linked_collection_id != null`) has `program_id` set.
- API smoke: create PRF for a doctor enrolled in CME GRANT → `program_id` persists; query PRFs by `program_id=<CME_GRANT_ID>` returns the new doc.

### Phase PRG-2 — Programs Statistics overhaul (~1 day, builds on PRG-1)

Rebuild the existing Programs tab into a resource-allocation cockpit, modeled on the [CLM Performance tab](frontend/src/pages/admin/StatisticsPage.jsx) shipped May 04 (Phase D.4c) and the [Team Activity Cockpit](frontend/src/pages/admin/StatisticsPage.jsx) shipped Apr 29 2026.

**Panels**:
- **Panel 1 — Program ROI table**: one row per program × period (default 90d). Columns: enrolled MDs, total spend (PRF + Expense + rebates joined via PRG-1 fields), total attributed sales (sum of `Collection.settled_csis[].md_rebate_lines[].rebate_amount` for enrolled MDs), spend ÷ sales %, status pill.
- **Panel 2 — Support Type distribution**: rows per support type. Count of MDs assigned, distribution events / period, average per-MD recurrence (proxy: how often that support type appears on PRFs for the MD).
- **Panel 3 — Outliers**: top 10 highest-spend MDs with low coverage rate (visited% from existing `coverageRate`) — the candidates for admin review.

**Lookup-driven thresholds** (Rule #3): new lookup category `PROGRAM_PERFORMANCE_THRESHOLDS` (codes `max_spend_per_md_pct_of_sales`, `min_coverage_rate_pct`, `flag_below_visits_per_cycle`). Inline DEFAULTS in `backend/utils/programPerformanceThresholds.js`, lazy-cache 60s, `insert_only_metadata: true` — same pattern as `CLM_PERFORMANCE_THRESHOLDS` and `TEAM_ACTIVITY_THRESHOLDS`.

**Tab badge**: red badge counts programs flagged below `target_conversion_rate_pct` OR above `max_spend_per_md_pct_of_sales`.

### Phase PRG-3 — Per-MD allocation drill-down (~half-day)

Click any MD row on the Programs cockpit OR from `/admin/md-leads` → modal/page showing: enrolled programs, support types, all PRF/Expense/rebate spend timeline, visit count, rebate sales attributed, last engagement. The decision surface for *renew / cut / upgrade*.

Reuses [DoctorDetailModal](frontend/src/components/admin/DoctorManagement.jsx) with a new Programs/ROI tab.

### Phase PRG-4 — Auto-join Rx attribution (deferred until VIP-1.D ships)

When `PatientMdAttribution` ([backend/erp/models/PatientMdAttribution.js](backend/erp/models/PatientMdAttribution.js)) starts capturing Rx counts (sub-phase referenced in CLAUDE.md notes 12b / 13), join `attributed patients × avg patient LTV` into the ROI denominator. No new code beyond the join — ROI just becomes more honest once the data flows.

### Subscription-readiness posture (Rule #0d / Rule #19)

PRG-1 schema additions are entity-neutral (program_id is per-tenant lookup ref). Stats endpoints will need entity-scope guards added during PRG-2 — current `getProgramStats` and `getSupportTypeStats` query `Doctor` + `Visit` globally without `req.entityId`. This is a pre-existing leak that is fine for VIP single-tenant today (CLAUDE.md note 15) but MUST be closed before SaaS spin-out. Closing this leak in PRG-2 is preferred; otherwise it falls into the broader Phase S6 sweep.

### What NOT to build (rejected during May 05 2026 design)

- **No "Program Budget" model with forecast vs actuals.** VIP is a 5-program shop, not a Fortune-500 brand-team. Track actuals, eyeball trends. Adding budgets adds approval workflows that PRF/CALF already enforces (Rule #20).
- **Don't gate program enrollment with approvals.** Authority sits on the *spend* (PRF post → gateApproval), not on the *tag*. Tagging Dr. Smith with CME GRANT costs nothing until you cut a PRF.
- **Don't build sample-inventory tracking for AIR FRESHENER / PROMATS.** Those are inventory items already; tag the disbursement to a Support Type via PRF, don't build a parallel ledger.

### Trigger to un-defer
Build PRG-1 + PRG-2 only when admin asks "how much did we spend on Dr. X under CME GRANT this quarter?" or "show me which program is wasting money." Until then, the existing coverage% signal is sufficient and any added complexity is premature.
