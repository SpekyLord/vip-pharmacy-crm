# VIP CRM - Phase Task Breakdown

> **Last Updated**: February 2026
> **Status**: Phase 1 Complete. Phase 2 in progress (A.1 ✅, A.3 ✅ complete; A.4 remaining).
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

### Task A.4: BDM Edit Own VIP Clients (CHANGE_LOG Change 2)
**Priority**: HIGH
**Depends on**: A.1 ✅
**Files**:
- `backend/controllers/doctorController.js` — Add employee permission where `assignedTo === req.user._id`
- `backend/routes/doctorRoutes.js` — Allow PUT for employee role with ownership check
- `frontend/src/components/employee/DoctorList.jsx` — Add edit button per VIP Client card
- NEW: `frontend/src/components/employee/DoctorEditForm.jsx` — Edit form

**Deliverables**:
- [ ] BDMs can edit all fields EXCEPT `assignedTo`
- [ ] BDM-editable fields include: supportDuringCoverage, programsToImplement, levelOfEngagement (plus all other fields except assignedTo)
- [ ] Region IS editable (BDM might correct mistakes)
- [ ] Admin retains full edit control over everything

---

## Phase 2 Summary

| Task | Change # | Status | Notes |
|------|----------|--------|-------|
| A.1: VIP Client Model Extensions | 9 | ✅ Complete | Foundation for everything |
| A.3: Remove MedRep Role | 1 | ✅ Complete | Role architecture cleanup |
| A.4: BDM Edit Own VIP Clients | 2 | ⬜ Not started | Ownership permissions |

---

# PHASE 3: Independent UX Improvements
**Goal**: Quick wins that have no heavy dependencies. Can be parallelized.
**Dependency**: A.1 ✅ for some tasks. No cross-task blocking within this phase.
**Note**: B.6 (Regular Clients) should be done early — it unblocks C.2 in Phase 5.

---

### Task B.3: Photo Upload Flexibility (CHANGE_LOG Change 5)
**Priority**: HIGH
**Depends on**: None
**Files**: `frontend/src/components/employee/CameraCapture.jsx`

**Deliverables**:
- [ ] Camera capture (existing — keep)
- [ ] File picker / gallery: `<input type="file" accept="image/*" multiple>`
- [ ] Copy-paste: Clipboard API (`paste` event listener on upload area)
- [ ] EXIF parsing: `exifr` or `exif-js` library for photo timestamp extraction
- [ ] BDMs can take photos with any device, then upload when logging visit later

---

### Task B.6: Non-VIP Regular Clients Table (CHANGE_LOG Change 16)
**Priority**: HIGH — **do early, unblocks Phase 5 (C.2 Extra Call section)**
**Depends on**: None
**Files**:
- NEW: `backend/models/Client.js` — Simpler than Doctor (name, specialty, address, phone, notes)
- NEW: `backend/controllers/clientController.js` — CRUD
- NEW: `backend/routes/clientRoutes.js` — API endpoints
- `frontend/src/pages/employee/EmployeeDashboard.jsx` — Second table below VIP Client list
- NEW: `frontend/src/components/employee/ClientList.jsx`
- NEW: `frontend/src/services/clientService.js`

**Deliverables**:
- [ ] BDMs can add regular clients directly (no Excel/admin approval needed)
- [ ] Daily limit: up to 30 extra calls per day (system enforced)
- [ ] No visit frequency enforcement (no 2x/4x rules)
- [ ] No scheduling grid integration
- [ ] Visits appear in "EXTRA CALL (VIP NOT INCLUDED IN THE LIST)" section of CPT (Phase 5)
- [ ] May eventually be promoted to VIP status through Excel upload + admin approval

---

### Task B.7: Filter VIP Clients by Support Type & Program (CHANGE_LOG Change 17)
**Priority**: LOW
**Depends on**: A.1 ✅
**Files**: `pages/admin/DoctorsPage.jsx`, `pages/employee/EmployeeDashboard.jsx`, `controllers/doctorController.js`

**Deliverables**:
- [ ] Filter by Support During Coverage (e.g., "Show all VIP Clients with STARTER DOSES")
- [ ] Filter by Programs to Implement (e.g., "Show all under CME GRANT")
- [ ] Both admin and BDM views — admin sees all, BDMs see assigned only

---

### Task B.4: Level of Engagement Tracking (CHANGE_LOG Change 12)
**Priority**: MEDIUM
**Depends on**: A.1 ✅
**Files**: `components/employee/DoctorList.jsx`, new `DoctorDetailPage.jsx`, `components/admin/DoctorManagement.jsx`

**Deliverables**:
- [ ] Display engagement badge (1-5) on VIP Client cards and detail pages
- [ ] BDMs can update engagement level from VIP Client detail page
- [ ] Scale: 1=Visited 4x, 2=Knows BDM/products, 3=Tried products, 4=In group chat, 5=Active partner

---

### Task B.5a: BDM Self-Service Performance — Basic Stats (CHANGE_LOG Change 14, partial)
**Priority**: MEDIUM
**Depends on**: None
**Files**: NEW `frontend/src/pages/employee/MyPerformancePage.jsx`

**Deliverables**:
- [ ] Total visits/month, compliance %, engagement distribution
- [ ] VIP coverage breakdown (2x vs 4x)
- [ ] Behind-schedule warnings

> **Note**: DCR Summary view (Call Rate, Target vs Actual) requires C.2 — see Task B.5b in Phase 5.

---

### Task C.4: VIP Count Minimums & Validation (CHANGE_LOG Change 11)
**Priority**: LOW
**Depends on**: A.1 ✅
**Files**: `pages/employee/EmployeeDashboard.jsx`, `pages/admin/AdminDashboard.jsx`, `pages/admin/StatisticsPage.jsx`

**Deliverables**:
- [ ] BDM dashboard: Warning banner when assigned VIP Clients < 20
- [ ] Admin dashboard: Warning when total active VIP Clients < 130
- [ ] Statistics page: VIP count breakdown (2x vs 4x per BDM)
- [ ] Schedule validation: Ensure planned visits adequately fill 20 working days

---

## Phase 3 Summary

| Task | Change # | Depends On | Notes |
|------|----------|------------|-------|
| B.3: Photo Upload Flexibility | 5 | None | Independent |
| B.6: Regular Clients | 16 | None | **Do early — unblocks C.2** |
| B.7: Filter by Support/Program | 17 | A.1 ✅ | Independent |
| B.4: Engagement Tracking | 12 | A.1 ✅ | Independent |
| B.5a: BDM Performance (basic) | 14 | None | DCR part deferred to Phase 5 |
| C.4: VIP Count Minimums | 11 | A.1 ✅ | Independent |

---

# PHASE 4: Schedule System + Remaining UX
**Goal**: Build the core scheduling system (the biggest feature) and complete UX pages that depend on Phase 2.
**Dependency**: Phase 2 (A.3, A.4 must be done). A.2 (alternating weeks) is merged into C.1 here.

---

### Task C.1 + A.2: Schedule Model + 4-Week Calendar + Alternating Week Rule (CHANGE_LOG Changes 6 + 10)
**Priority**: CRITICAL (core system flow)
**Depends on**: A.1 ✅

**Why A.2 is merged here**: The 2x alternating week rule (W1+W3 or W2+W4) was deferred from the original Task A.2.
Without the Schedule model, a calendar-week parity check incorrectly blocks valid carry-forward visits
(e.g., a missed W1 visit being legitimately logged in W2). The alternating pattern must be enforced
through schedule entries, not raw visit counts.

**Files**:
- NEW: `backend/models/Schedule.js`
- NEW: `backend/controllers/scheduleController.js`
- NEW: `backend/routes/scheduleRoutes.js`
- NEW: `frontend/src/components/employee/ScheduleCalendar.jsx`
- NEW: `frontend/src/services/scheduleService.js`
- UPDATE: `backend/utils/validateWeeklyVisit.js` — validate against Schedule entries for alternating rule

**Schedule Model**:
```javascript
{
  doctor: ObjectId,
  user: ObjectId,
  cycleStart: Date,        // Start date of 4-week cycle (e.g., 2026-01-05)
  scheduledDay: String,    // Original: "W2D1" (Monday of Week 2)
  currentDay: String,      // Where carried to (starts same as scheduledDay)
  status: String,          // planned | carried | completed | missed
  completedAt: Date,
  visit: ObjectId,         // Reference to Visit record once completed
}
```

**4-Week Cycle Rules**:
- Anchor date: **January 5, 2026 (Monday) = W1D1**
- 4-week cycle rolls continuously from this date
- January through November fit neatly; December has extra weeks (still W1-W4 rolling)
- Schedule loops every 4-week cycle until new Excel replaces it (~quarterly)
- Schedule is LOCKED after approval — BDMs cannot rearrange visits

**Carry & Cutoff Rules**:
- Scheduled day = target, entire week = open window (W2D1 missed → can visit W2D2-W2D5)
- If not visited during scheduled week → carries to next week
- Carries continue until **W4D5 = hard cutoff** → marked `missed`
- BDMs can only visit VIP Clients scheduled for current week + carried from previous weeks
- VIP Client scheduled for Week 3 does NOT appear as visitable during Week 1

**Visit Rules**:
- Once a VIP Client is visited this week, they are **blocked** until next week — UNLESS there are carried/missed weeks to clear
- If carried weeks exist, the VIP Client stays visitable for additional logs within the same calendar week
- **Current week priority**: When logging a visit, the system ticks off the **current week first**, then carried weeks (oldest first)
  - Example: W1 missed, now W2. First log → counts for W2 (current). Second log → counts for W1 (carried).
- No advance credit: extra visits in W1 do NOT tick off W2 or W3
- Each week's requirement stands on its own
- Missed weeks carry forward but still need their own visit
- W4 catch-up: BDM might need up to 3 visits for same VIP Client in final week (missed W1 + missed W2 + W4's own)

**Alternating Week Enforcement (A.2)**:
- 2x doctors must have their 2 schedule entries placed in alternating weeks (W1+W3 or W2+W4)
- `canVisitDoctor()` in `validateWeeklyVisit.js` validates against Schedule entries instead of raw Visit counts
- Remove the deferred NOTE comments in `validateWeeklyVisit.js` (both `canVisitDoctor` and `canVisitDoctorsBatch`) once Schedule-based validation is in place

**Deliverables**:
- [ ] Schedule model with cycle tracking
- [ ] Calendar grid matching CPT format (W1D1 through W4D5, 20 workdays)
- [ ] Auto-carry logic for missed visits
- [ ] W4D5 hard cutoff → missed status
- [ ] Schedule looping (auto-repeat every 4-week cycle)
- [ ] BDM daily view: "Today you need to visit: Dr. A, Dr. B, Dr. C"
- [ ] Enforce 2x alternating week pattern through schedule entries (W1+W3 or W2+W4)
- [ ] Update `validateWeeklyVisit.js` to validate against Schedule entries for alternating rule

---

### Task B.1: VIP Client Info Page Before Log Visit (CHANGE_LOG Change 3)
**Priority**: HIGH (major UX flow change)
**Depends on**: A.4 (BDM edit permissions)
**Files**:
- NEW: `frontend/src/pages/employee/DoctorDetailPage.jsx` — Full VIP Client profile + visit history + "Log Visit" button
- `frontend/src/App.jsx` — Add route `/employee/doctor/:id`
- `frontend/src/components/employee/DoctorList.jsx` — Card click → detail page (not visit logger)
- `frontend/src/pages/employee/EmployeeDashboard.jsx` — Update handleSelectDoctor navigation

**Deliverables**:
- [ ] Clicking a VIP Client shows info page first (all fields from A.1)
- [ ] "Log Visit" button at bottom of info page
- [ ] Visit history for that VIP Client shown on the page
- [ ] BDM can edit VIP Client fields from this page (per A.4)

---

### Task B.2: Product Detail Popup — Tablet-Friendly (CHANGE_LOG Change 4)
**Priority**: MEDIUM
**Depends on**: A.3 (target products moved to BDM)
**Files**: `frontend/src/components/employee/ProductRecommendations.jsx`, `frontend/src/components/employee/VisitLogger.jsx`

**Deliverables**:
- [ ] Clicking a product shows full-screen modal with image + description
- [ ] Tablet-optimized: large image, readable text, easy to show to VIP Client
- [ ] Product cards instead of simple checkboxes in VisitLogger
- [ ] BDM picks 3 products from catalog → assigns as target products → presents on tablet

---

## Phase 4 Summary

| Task | Change # | Depends On | Notes |
|------|----------|------------|-------|
| C.1+A.2: Schedule + Alternating Weeks | 6+10 | A.1 ✅ | **Core system flow** — biggest feature |
| B.1: VIP Client Info Page | 3 | A.4 | Navigation flow change |
| B.2: Product Detail Popup | 4 | A.3 | Tablet UX |

---

# PHASE 5: CPT, DCR & Excel Import
**Goal**: Build the Call Planning Tool, DCR Summary tracking, and Excel import/export round-trip.
**Dependency**: C.1 (Schedule model from Phase 4), B.6 (Regular Clients from Phase 3).

---

### Task C.2: Call Planning Tool / CPT View (CHANGE_LOG Change 7)
**Priority**: HIGH
**Depends on**: C.1 (Schedule model), B.6 (Regular Clients for Extra Call section)
**Files**:
- NEW: `frontend/src/components/employee/CallPlanView.jsx`
- Enhance: `pages/admin/ReportsPage.jsx`

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

**Engagement Types** (tracked per visit):
- TXT/PROMAT, MES/VIBER GIF, PICTURE, SIGNED CALL, VOICE CALL

**Daily MD Count**: MDs visited per day, split into:
- Included in List (VIP Clients from schedule)
- Not Included in List (Extra Calls — non-VIP, see B.6)

**Extra Call Section**: Bottom of each daily sheet for non-VIP visits (from B.6). Own engagement type tracking but does NOT count toward Call Rate.

**Deliverables**:
- [ ] Editable 20-day grid (planning mode)
- [ ] Auto-distribution algorithm
- [ ] Read-only grid (actual mode)
- [ ] DCR Summary table with Call Rate per day + overall
- [ ] Engagement type tracking per visit
- [ ] Daily MD count (VIP vs Extra Call split)
- [ ] Extra Call section for non-VIP visits

---

### Task C.3 + D.3: Excel Import + Approvals UI (CHANGE_LOG Changes 8 + 13)
**Priority**: HIGH
**Depends on**: C.1 (Schedule model), A.1 ✅
**Note**: These were originally separate tasks (C.3 in Phase C, D.3 in Phase D) but are the same feature — Excel import backend + approval review UI. Implementing together.

**Files**:
- NEW: `backend/models/ImportBatch.js` — Staging model for pending imports
- NEW: `backend/controllers/importController.js` — Excel parsing with `xlsx` library
- NEW: `backend/routes/importRoutes.js`
- NEW: `frontend/src/pages/admin/ImportPage.jsx` — Upload + review/approve UI
- NEW: `frontend/src/services/importService.js`
- Repurpose: `pages/admin/PendingApprovalsPage.jsx` (scaffolded) → Excel import batch review
- Repurpose: `components/admin/VisitApproval.jsx` → Import batch approval

**Excel Template Columns** (must match client's CPT exactly):
```
#, LASTNAME, FIRSTNAME, VIP SPECIALTY (free-form),
[20-day grid: W1 mo, W1 tu, W1 we, W1 th, W1 fr, W2 mo, ... W4 fr],
Count of 1 Status (auto-calculated SUM),
CLINIC/OFFICE ADDRESS, OUTLET INDICATOR,
PROGRAMS TO BE IMPLEMENTED, SUPPORT DURING COVERAGE,
TARGET PRODUCT 1, TARGET PRODUCT 2, TARGET PRODUCT 3,
LEVEL OF ENGAGEMENT (1-5), BIRTHDAY, ANNIVERSARY, OTHER DETAILS
```

**Workflow**:
1. BDM prepares Excel externally, gives to admin
2. Admin reviews thoroughly, then uploads to CRM
3. System checks for duplicate VIP Clients (by name match) — shows warning + navigates to potential duplicate
4. Admin does final review in CRM → approves or rejects ENTIRE batch
5. On approval: VIP Client profiles created/updated + schedule "1"s become schedule entries
6. **If VIP Client already exists → Excel data OVERWRITES with warning**: "This will overwrite changes made to Dr. Santos in the app"
7. On rejection: Admin adds reason, BDM revises and re-submits

**Quarterly Round-Trip** (export → edit → re-upload):
1. BDM exports current VIP Client data from CRM to Excel
2. BDM edits exported Excel (add/remove doctors, update info, adjust schedule)
3. BDM gives edited file to admin
4. Admin uploads back to CRM → normal approval flow

**Deliverables**:
- [ ] ImportBatch staging model (status: pending/approved/rejected)
- [ ] Excel parsing with `xlsx` npm package
- [ ] Column mapping matching client's CPT template exactly
- [ ] Duplicate VIP Client detection (name match)
- [ ] Admin review UI with approve/reject entire batch (repurposed from Approvals page)
- [ ] Remove old visit approval UI (client says no approval needed for visits)
- [ ] Overwrite existing data with warning
- [ ] Schedule entries created from "1"s in grid
- [ ] Export format matches import format (round-trip compatible)

---

### Task B.5b: BDM Performance — DCR Summary (CHANGE_LOG Change 14, remaining)
**Priority**: MEDIUM
**Depends on**: C.2 (DCR Summary data)
**Files**: `frontend/src/pages/employee/MyPerformancePage.jsx` (extend from B.5a)

**Deliverables**:
- [ ] DCR Summary view: Call Rate per day + overall
- [ ] Target vs Actual engagements breakdown

---

## Phase 5 Summary

| Task | Change # | Depends On | Notes |
|------|----------|------------|-------|
| C.2: CPT View + DCR Summary | 7 | C.1, B.6 | Core reporting feature |
| C.3+D.3: Excel Import + Approvals UI | 8+13 | C.1 | **Combined** — same feature |
| B.5b: BDM Performance (DCR part) | 14 | C.2 | Extends B.5a from Phase 3 |

---

# PHASE 6: Admin Monitoring & Deployment
**Goal**: Complete admin monitoring tools, wire up scaffolded pages, deploy to production.
**Dependency**: C.2 (DCR Summary data) for D.1 and D.2.

---

### Task D.1: Admin View Per-BDM DCR Summary (CHANGE_LOG Change 15)
**Priority**: HIGH
**Depends on**: C.2 (DCR Summary)
**Files**: `pages/admin/StatisticsPage.jsx` (wire up), `components/admin/EmployeeAnalytics.jsx` (wire up)

**Deliverables**:
- [ ] Per-BDM drill-down with Call Rate, VIP coverage, engagement distribution
- [ ] DCR Summary view per BDM: 20-row table (W1D1-W4D5) with Target/Total/Call Rate
- [ ] Admin can evaluate if BDM's Call Rate justifies continuing partnership
- [ ] Filter VIP Clients by support type and program (Change 17, admin view)

---

### Task D.2: Wire Up Scaffolded Admin Pages
**Priority**: MEDIUM
**Depends on**: C.2 (DCR Summary data for StatisticsPage)
**Files**: `pages/admin/StatisticsPage.jsx`, `pages/admin/ActivityMonitor.jsx`, `pages/admin/GPSVerificationPage.jsx`, `services/complianceService.js`

**Deliverables**:
- [ ] Create backend compliance API endpoints (complianceController.js, complianceRoutes.js)
- [ ] Wire StatisticsPage to real data (replace mock/Recharts with actual compliance stats)
- [ ] Wire ActivityMonitor to real activity data (audit log or activity collection)
- [ ] Wire GPS Verification to real visit GPS data with distance calculation

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
| D.1: Admin Per-BDM DCR Summary | 15 | C.2 | Performance monitoring |
| D.2: Wire Up Scaffolded Pages | — | C.2 | Replace mock data with real APIs |
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
- B.3 (Photo upload flexibility)
- B.6 (Regular clients) — **prioritize early, unblocks C.2**
- B.7 (Filter by support/program)
- B.4 (Engagement tracking display)
- B.5a (BDM performance basic stats)
- C.4 (VIP count minimums)
- D.4 (Email notifications)
- D.5 (AWS Lightsail deployment)

## Recommended Implementation Order
```
 1. A.3  — Remove MedRep Role ✅
 2. A.4  — BDM Edit Own VIP Clients
 3. B.3  — Photo Upload Flexibility (independent)
 4. B.6  — Regular Clients (independent, unblocks C.2)
 5. C.1+A.2 — Schedule System + Alternating Weeks (core feature)
 6. B.1  — VIP Client Info Page (needs A.4)
 7. B.2  — Product Detail Popup (needs A.3)
 8. B.4  — Engagement Tracking Display
 9. B.5a — BDM Performance (basic stats)
10. B.7  — Filter by Support/Program
11. C.4  — VIP Count Minimums
12. C.2  — CPT View + DCR Summary (needs C.1 + B.6)
13. C.3+D.3 — Excel Import + Approvals UI (needs C.1)
14. D.1  — Admin Per-BDM DCR Summary (needs C.2)
15. D.2  — Wire Up Scaffolded Pages (needs C.2)
16. B.5b — BDM Performance DCR part (needs C.2)
17. D.4  — Email Notifications
18. D.5  — AWS Lightsail Deployment
19. D.6  — Offline Capability (deferred)
```

---

# COMPLETE PHASE SUMMARY

| Phase | Tasks | Key Deliverables | Status |
|-------|-------|------------------|--------|
| **Phase 1: Foundation** | 20+ tasks | Auth, CRUD, visits, products, messaging, security | ✅ COMPLETE |
| **Phase 2: Role & Permissions** | 3 tasks (A.1 ✅, A.3 ✅, A.4) | Remove MedRep, BDM self-edit | 🔄 In progress (2/3 complete) |
| **Phase 3: Independent UX** | 6 tasks (B.3, B.6, B.7, B.4, B.5a, C.4) | Photos, regular clients, filters, engagement, stats | ⬜ Not started |
| **Phase 4: Schedule System** | 3 tasks (C.1+A.2, B.1, B.2) | 4-week calendar, alternating weeks, info page | ⬜ Not started |
| **Phase 5: CPT & Excel** | 3 tasks (C.2, C.3+D.3, B.5b) | CPT grid, DCR Summary, Excel import/export | ⬜ Not started |
| **Phase 6: Admin & Deploy** | 5 tasks (D.1, D.2, D.4, D.5, D.6) | Admin monitoring, deployment, offline | ⬜ Not started |

---

## Key Changes from Original Phase Structure

| What Changed | Original | New | Why |
|---|---|---|---|
| A.2 (Alternating Weeks) | Phase A standalone | Merged into C.1 in Phase 4 | Needs Schedule model for carry-forward logic |
| B.6 (Regular Clients) | Phase B middle | Phase 3 early priority | Unblocks C.2's Extra Call section |
| C.3 + D.3 | Separate phases | Combined in Phase 5 | Same feature (Excel Import) split across phases |
| D.1, D.2 | Phase D no deps noted | Phase 6 with C.2 dependency | Need DCR data from C.2 |
| B.5 (BDM Performance) | Single task | Split: B.5a (Phase 3) + B.5b (Phase 5) | DCR part needs C.2 |
