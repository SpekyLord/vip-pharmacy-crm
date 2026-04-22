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

