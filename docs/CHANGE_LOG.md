# VIP Pharmacy CRM - System Change Requirements & Recommendations

> **Created**: February 16, 2026
> **Purpose**: Document the gap between current implementation and client requirements, with technical recommendations for each change.
> **Note**: The existing `CLAUDE.md` is very outdated. This document reflects the ACTUAL current state of the codebase.

---

## Table of Contents

1. [Current System State](#part-1-current-system-state)
2. [Client Requirements → Changes Needed](#part-2-client-requirements--changes-needed)
3. [Recommendations & Priority Phases](#part-3-recommendations--priority-phases)
4. [Critical Technical Notes](#critical-technical-notes)

---

## PART 1: CURRENT SYSTEM STATE

### Terminology Mapping (Business Terms vs Code)

> **Important**: The business still uses "VIP Client" and "BDM" terminology. The code was renamed to "Doctor" and "employee" but this does NOT match how the client/business refers to these entities. Consider renaming back to align code with business language.

| Business Term | Code Term | File |
|---|---|---|
| **VIP Client** | Doctor model | `backend/models/Doctor.js` |
| **BDM** (Business Development Manager) | employee role | `backend/models/User.js` |
| VIP Client List | DoctorList | `frontend/src/components/employee/DoctorList.jsx` |
| BDM Dashboard | EmployeeDashboard | `frontend/src/pages/employee/EmployeeDashboard.jsx` |
| vipClientService | doctorService | `frontend/src/services/doctorService.js` |
| vipClientController | **doctorController** | `backend/controllers/doctorController.js` |

### Backend Architecture

**8 Models**: User, Doctor, Visit, Region, ProductAssignment, WebsiteProduct, MessageInbox, AuditLog

**8 Controllers**: auth, user, doctor, visit, productAssignment, product, region, messageInbox

**Key Infrastructure**:
- JWT httpOnly cookie auth (NOT localStorage - XSS-proof)
- Account lockout (5 failed attempts = 15 min lockout)
- Audit logging (13 event types, 90-day TTL)
- GPS tracking on every visit
- S3 photo storage with signed URLs (1-hour expiry)
- Visit frequency enforcement (2x/4x monthly, hard limits)
- Region hierarchy with cascading access
- Cross-database product fetching (products in separate `vip-pharmacy` DB)
- Rate limiting (100 req/15min general, 20 req/15min auth)
- Messaging system (admin → employee)

### Frontend Pages

| Page | Route | Status | Description |
|---|---|---|---|
| Employee Dashboard | `/employee` | **Working** | Stats, doctor list, visit status, Log Visit buttons |
| New Visit | `/employee/visit/new` | **Working** | Camera/GPS capture → visit form → FormData submit |
| My Visits | `/employee/visits` | **Working** | Visit history, filters, pagination, photo gallery |
| Employee Inbox | `/employee/inbox` | **Working** | Receives messages from admin |
| Admin Dashboard | `/admin` | **Working** | System-wide stats, activity preview |
| Admin Doctors | `/admin/doctors` | **Working** | Full CRUD, cascading region dropdowns, Excel/CSV export |
| Admin Employees | `/admin/employees` | **Working** | Full CRUD, multi-region assignment |
| Admin Regions | `/admin/regions` | **Working** | Region hierarchy tree management |
| Admin Reports | `/admin/reports` | **Working** | Employee visit report (20-day grid), Excel/CSV export |
| Admin Statistics | `/admin/statistics` | **Scaffolded** | UI with Recharts, but uses mock data |
| Admin Activity | `/admin/activity` | **Scaffolded** | Activity feed with mock data |
| Admin Approvals | `/admin/approvals` | **Scaffolded** | Visit approval UI with mock data |
| GPS Verification | `/admin/gps-verification` | **Scaffolded** | Demo page with mock coordinates |
| MedRep Dashboard | `/medrep` | **Working** | Product-to-doctor assignment CRUD |

### Current Doctor Model Fields

```javascript
// backend/models/Doctor.js
{
  name: String,                          // Single name field (no first/last split)
  specialization: String (enum: 16),     // Fixed enum - DOES NOT match client data
  hospital: String,
  address: { street, city, province, postalCode },
  location: { type: 'Point', coordinates: [lng, lat] },  // GeoJSON - UNUSED
  region: ObjectId (ref: Region),
  parentRegions: [ObjectId],             // Auto-populated ancestor chain
  phone: String,
  email: String,
  visitFrequency: Number (2 or 4),
  assignedTo: ObjectId (ref: User),
  notes: String,
  isActive: Boolean,
  clinicSchedule: { mon-fri: Boolean },  // EXISTS but UNUSED
}
```

### Current Visit Model Fields

```javascript
// backend/models/Visit.js
{
  doctor: ObjectId,
  user: ObjectId,
  visitDate: Date,
  visitType: String (regular|follow-up|emergency),
  weekNumber: Number (1-53),             // ISO week number
  weekOfMonth: Number (1-5),
  dayOfWeek: Number (1-5),              // Mon=1, Fri=5
  weekLabel: String,                     // "W1D1", "W2D3" format
  monthYear: String,                     // "2026-02" format
  yearWeekKey: String,                   // "2026-W07" for unique constraint
  location: { latitude, longitude, accuracy, capturedAt },
  photos: [{ url, capturedAt }],         // S3 URLs, 1-10 required
  productsDiscussed: [{ product, presented, feedback }],
  purpose: String,
  doctorFeedback: String,
  notes: String,
  duration: Number,
  status: String (completed|cancelled),
  cancelReason: String,
  nextVisitDate: Date,                   // EXISTS but UNUSED (informational only)
}
```

### What's MISSING from Current System

| Feature | Status | Impact |
|---|---|---|
| Offline photo capture | Not implemented | BDMs can't log visits without internet |
| Scheduling/calendar system | Not implemented | No visit planning capability |
| BDM self-service doctor editing | Not implemented | Only admin can edit doctors |
| BDM product assignment | Not implemented | Only medrep/admin can assign products |
| Excel upload/import | Not implemented | All data entry is manual |
| Level of engagement tracking | Not in schema | No field exists |
| Program tracking (CME Grant, etc.) | Not in schema | No field exists |
| Support type tracking (Starter Doses, etc.) | Not in schema | No field exists |
| Secretary info on Doctor | Not in schema | No field exists |
| Birthday/anniversary on Doctor | Not in schema | No field exists |
| Outlet indicator on Doctor | Not in schema | No field exists |
| VIP partnership approval workflow | Not implemented | No admin approval for doctors |
| Alternating week enforcement (2x) | Not implemented | Any 2 weeks allowed, not W1+W3 pattern |

### Scaffolded Features (UI Built, Backend Incomplete)

| Feature | Issue |
|---|---|
| Activity Monitor (`/admin/activity`) | Hardcoded mock data, no backend activity logging API |
| Compliance Statistics (`/admin/statistics`) | Full Recharts UI, but `complianceService.js` calls non-existent endpoints |
| Visit Approvals (`/admin/approvals`) | UI modal complete, approve/reject endpoints untested |
| Report Generation (`/admin/reports`) | Shows report cards, no actual generation |
| GPS Verification (`/admin/gps-verification`) | Demo with mock coordinates only |
| Pending Approvals badge (Sidebar) | Hardcoded to "3", not from API |
| Employee Analytics (`EmployeeAnalytics.jsx`) | Charts ready, no data source |
| Performance Charts (`PerformanceChart.jsx`) | Component exists, no data source |

### Existing But Unused Fields

- `Doctor.clinicSchedule` (Mon-Fri booleans) - stored but never queried
- `Visit.nextVisitDate` - stored but purely informational, not enforced
- `Doctor.location` (GeoJSON) - stored but geospatial queries not used
- Export templates have **hardcoded empty columns** for: OUTLET INDICATOR, PROGRAMS TO BE IMPLEMENTED, SUPPORT DURING COVERAGE

---

## PART 2: CLIENT REQUIREMENTS → CHANGES NEEDED

### CHANGE 1: Remove MedRep Role — BDMs Assign Their Own Products

**Requirement**: Combine MedRep and BDM modules so BDMs can assign products to their doctors directly.

**Decision**: Remove MedRep role entirely.

**Current State**: `ProductAssignment.js` pre-save hook (line 94-108) blocks anyone except `medrep` or `admin`. Employee role cannot assign products.

**Files to Modify**:
| File | Change |
|---|---|
| `backend/models/User.js` | Remove `medrep` from role enum |
| `backend/models/ProductAssignment.js` | Update pre-save hook to allow `employee` role |
| `backend/middleware/roleCheck.js` | Remove `medRepOnly` middleware |
| `backend/controllers/productAssignmentController.js` | Update all role checks |
| `backend/routes/productAssignmentRoutes.js` | Update route middleware |
| `frontend/src/App.jsx` | Remove `/medrep` routes |
| `frontend/src/pages/medrep/MedRepDashboard.jsx` | Delete or repurpose |
| `frontend/src/components/common/Sidebar.jsx` | Remove medrep menu, add product assignment to employee menu |
| `frontend/src/components/employee/` | Add product assignment UI (adapt from medrep components) |

**Migration**: Convert existing medrep users to `employee` or `admin`.

---

### CHANGE 2: BDM Can Edit Their Own Doctors

**Requirement**: Enable BDMs to edit doctor profiles for doctors assigned to them.

**Current State**: `doctorController.js` restricts update/delete to admin only.

**Files to Modify**:
| File | Change |
|---|---|
| `backend/controllers/doctorController.js` | Add employee permission where `assignedTo === req.user._id` |
| `backend/routes/doctorRoutes.js` | Allow PUT for employee role with ownership check |
| `frontend/src/components/employee/DoctorList.jsx` | Add edit button per doctor card |
| NEW: `frontend/src/components/employee/DoctorEditForm.jsx` | Edit form component |

**Restriction**: BDMs can edit all fields EXCEPT `assignedTo`. Region IS editable (BDM might need to correct mistakes). `assignedTo` is automatically set — whoever's Excel was uploaded owns those doctors. Admin retains full edit control over everything.

**Client-confirmed BDM-editable fields** (explicitly called out):
- `supportDuringCoverage` — update support type for each VIP Client
- `programsToImplement` — update programs for each VIP Client
- `levelOfEngagement` — update engagement level (1-5) as the relationship progresses

---

### CHANGE 3: Doctor Info Page Before Log Visit

**Requirement**: Clicking a doctor shows info first (not log interface). "Log Visit" button at bottom.

**Current State**: `EmployeeDashboard.jsx` line 229-231 navigates directly to `/employee/visit/new?doctorId=`.

**Files to Modify**:
| File | Change |
|---|---|
| NEW: `frontend/src/pages/employee/DoctorDetailPage.jsx` | Full doctor profile + visit history + "Log Visit" button |
| `frontend/src/App.jsx` | Add route `/employee/doctor/:id` |
| `frontend/src/components/employee/DoctorList.jsx` | Card click → doctor detail page (not visit logger) |
| `frontend/src/pages/employee/EmployeeDashboard.jsx` | Update `handleSelectDoctor` navigation |

---

### CHANGE 4: Product Detail Popup (Tablet-Friendly)

**Requirement**: Clicking assigned product shows image + description popup for presenting to doctors. The **tablet is the only device BDMs use for product presentation** — they show the tablet screen to the doctor during visits. The product view must be **tablet-friendly and full-screen capable**. BDMs do all other CRM work on their phone (see Change 5).

**Current State**: Products shown as simple checkboxes with names only in VisitLogger.

**Files to Modify**:
| File | Change |
|---|---|
| `frontend/src/components/employee/ProductRecommendations.jsx` | Add modal with product image + description, full-screen view for tablet |
| `frontend/src/components/employee/VisitLogger.jsx` (line 379-389) | Enhance product checkboxes to clickable cards |

**Product Catalog & Selection Flow**: Admin uploads products to the catalog (name, image, description → stored in S3). BDM picks 3 products from the catalog to assign as target products for each VIP Client. BDM opens a VIP Client's profile → sees the 3 target products with images and descriptions → taps a product to view full-screen for showing to the doctor on the tablet. This is the BDM's guide for knowing what products to promote during visits. BDMs don't upload product images — they browse the catalog, pick 3, and present them.

---

### CHANGE 5: Photo Upload Flexibility

**Requirement**: BDMs need flexibility in how visit proof photos get into the system. They may not always take photos through the app — they might take photos with their phone or tablet's normal camera during the visit, then upload them when logging the visit afterwards. Support multiple upload methods so BDMs can use whatever device is handy.

**Device usage clarification**: BDMs prefer to use their **phone (cellphone) as the primary device** for daily CRM work — logging visits, uploading photos, browsing the app. It's easier to operate than a tablet. The **tablet is ONLY used for presenting product images** to doctors during visits (see Change 4). The CRM must be **mobile-phone friendly first**, tablet second.

**Current State**: CameraCapture.jsx requires live GPS and only supports camera capture through the app.

**Photo Upload Methods** (all should be supported):
| Method | Use Case |
|---|---|
| Camera capture | Take photo directly in the app |
| File picker / gallery | Select existing photo from phone or tablet gallery (taken earlier during the visit) |
| Copy-paste | Paste image from clipboard (copied from another app) |

**Key clarification**: BDMs do NOT have to take photos through the app at the exact moment of the visit. The typical flow is:
1. Visit the doctor → take photos with whatever device is handy (phone camera, tablet camera)
2. After the visit (or when they have signal), open the CRM and log the visit
3. Upload the photos from their phone/tablet gallery when logging

**Implementation**:
| Component | Technology |
|---|---|
| File picker | Standard `<input type="file" accept="image/*">` with multiple selection |
| Copy-paste | Clipboard API (`paste` event listener on the upload area) |
| EXIF parsing | `exifr` or `exif-js` library (extract timestamp from photo metadata) |

**Offline Capture (Phase 2/3)**: Full offline visit logging (IndexedDB photo storage, Service Worker caching, Background Sync upload queue) is a future enhancement. The immediate need is just photo upload flexibility — not full offline mode.

---

### CHANGE 6: 4-Week Calendar / Scheduling System

**Requirement**: Add editable 4-week calendar view to BDM dashboard, integrate with logging. The calendar should look exactly like the client's Excel CPT format (20-day grid: 4 weeks × 5 workdays).

**4-Week Cycle Anchor**: The cycle is anchored to **January 5, 2026 (Monday) as W1D1**. The 4-week cycle rolls continuously from this date — it is NOT based on calendar months. Every 4 weeks = 1 cycle:
- W1: Jan 5-9, W2: Jan 12-16, W3: Jan 19-23, W4: Jan 26-30
- Then resets: W1: Feb 2-6, W2: Feb 9-13, W3: Feb 16-20, W4: Feb 23-27
- ...and so on indefinitely
- **January through November fit neatly** into the 4-week cycle — no leftover days
- **December is the only month with extra weeks** (2-3 extra weeks depending on the year). These extra December weeks still follow the same W1-W4 rolling pattern — no special handling, just more cycles before the year ends

**Current State**: No scheduling system exists.

**New Files Needed**:
| File | Purpose |
|---|---|
| `backend/models/Schedule.js` | Planned visits (doctor, user, plannedDate, status: planned/completed/missed) |
| `backend/controllers/scheduleController.js` | CRUD for schedules |
| `backend/routes/scheduleRoutes.js` | API endpoints |
| `frontend/src/components/employee/ScheduleCalendar.jsx` | 4-week (20 workday) grid view matching CPT format |
| `frontend/src/services/scheduleService.js` | API service layer |

**The Excel IS the Schedule**: The client's Excel CPT grid is literally the scheduling system. Each "1" in the 20-day grid means "I plan to visit this VIP Client on this specific day." The schedule follows exactly what the BDM marked — no assumptions about repeating patterns. For example:
- Dr. Santos (4x): "1" on W1D1 (Mon), W2D4 (Thu), W3D2 (Tue), W4D5 (Fri) → different day each week, whatever the BDM planned
- Dr. Cruz (2x): "1" on W1D3 (Wed), W3D1 (Mon) → Week 1 Wednesday and Week 3 Monday — not the same day, just follows what was marked
- The schedule is per-day, per-week, per-VIP Client — no recurring pattern is assumed

**Calendar ↔ Excel Integration Flow**:
1. BDM creates their schedule in Excel (placing "1"s in the grid for each VIP Client on specific days)
2. BDM gives the Excel to the admin → Admin uploads and approves the batch (see Change 8)
3. Each "1" in the grid becomes a **scheduled visit entry** in the calendar system
4. BDM opens calendar on any given day → sees: "Today (Wednesday W2) you need to visit: Dr. Santos, Dr. Reyes, Dr. Garcia" — i.e., all VIP Clients who had a "1" on that day column
5. When a BDM logs a visit, the corresponding schedule entry is marked as `completed`
6. Unvisited scheduled entries auto-carry to the next workday (see auto-carry rules below)

**Visit Logging Flexibility**: BDMs do NOT have to log the visit at the exact moment they are with the doctor. The typical flow is: visit the doctor → take photos with phone or tablet → after the visit (or when they have signal), open the CRM → log the visit and upload the photos. The system accepts photos from any device — BDMs can take photos on their phone and log the visit on their tablet, or vice versa (see Change 5).

**The calendar view IS the CPT grid** — same format, same layout. The only difference is that the calendar is interactive (click a cell to log a visit) while the Excel is static.

**Schedule Looping**: The approved schedule automatically **repeats every 4-week cycle** until a new Excel is uploaded (typically every ~3 months / quarterly). Each new cycle gets a fresh copy of the schedule with all entries reset to `planned`.

**Schedule Locking & Auto-Carry Rules**:

Once a schedule is approved, it is **locked until the next Excel replacement** (typically every ~3 months / quarterly). BDMs cannot manually move visits around (no "I'll do it tomorrow because I don't feel like it"). The schedule loops every cycle with the same pattern.

**Weekly Open Window**: The BDM sees the daily schedule, but the **entire week is open** (D1 through D5). If a visit is scheduled for W2D1 (Monday) but the BDM can't visit that day, they can visit any other day that week (W2D2 through W2D5). The scheduled day is the *target*, but the whole week is the *window*.

**Carry to next week**: If the BDM still couldn't visit during the scheduled week, the visit carries forward to the next week — and continues carrying until **W4D5 (end of cycle) = hard cutoff**. If not visited by W4D5, it's marked `missed`.

**Who can be visited**: BDMs can only visit VIP Clients that are **scheduled for the current week** plus any **carried/missed visits from previous weeks**. A VIP Client scheduled for Week 3 does NOT appear as visitable during Week 1. The schedule controls who shows up on the BDM's daily list.

**Visit Rules**:
- For those VIP Clients who ARE open (scheduled this week or carried), BDMs can visit them **as many times as they want** — the system does not block extra visits
- However, only **1 visit per week counts** towards that week's scheduled requirement
- **No advance credit**: Visiting a VIP Client 3 times in W1 does NOT tick off W2 or W3. Each week's requirement must be fulfilled in its own week (or carried forward if missed)
- **Catch-up**: If W1's requirement was missed, it can be fulfilled in W2, W3, or W4 — but the W2/W3/W4 requirements are still separate
- **W4 catch-up**: In the final week, a BDM might need to fulfill up to 3 carried requirements for the same VIP Client (missed W1 + missed W2 + W4's own), which means up to 3 visits that week to clear them all
- **W4D5 = hard cutoff**: Any week's requirement still not fulfilled by the last day is marked `missed`

**The core rule**: Each week has its own visit requirement. It stands on its own. Extra visits don't pre-fulfill future weeks. Missed weeks carry forward but still need their own visit. You can go backwards (catch up), but you can't go forwards (advance).

**Schedule entry statuses**:
| Status | Meaning |
|---|---|
| `planned` | Visit scheduled for this day, not yet due |
| `carried` | Missed the original day, auto-carried to next workday |
| `completed` | BDM logged the visit (photo + GPS proof) |
| `missed` | Not visited by end of the 4-week cycle — counts against compliance |

**Schedule Model fields**:
```javascript
{
  doctor: ObjectId,
  user: ObjectId,
  cycleStart: Date,        // Start date of the 4-week cycle (e.g., 2026-01-05, 2026-02-02, etc.)
  scheduledDay: String,    // Original: "W2D1" (Monday of Week 2)
  currentDay: String,      // Where it's been carried to: "W2D3" (starts same as scheduledDay)
  status: String,          // planned | carried | completed | missed
  completedAt: Date,       // When the visit was logged (null if not completed)
  visit: ObjectId,         // Reference to the Visit record once completed
}
```

**Recommendation**: Reuse the existing 20-day grid format (W1D1-W4D5) from Reports. The grid must match the client's Excel CPT format exactly (columns: W1D1 through W4D5, rows: VIP Clients, cells: "1" for scheduled, checkmark or colored for completed, orange for carried, red for missed).

---

### CHANGE 7: Call Planning Tool (CPT) — 20-Day Monthly View

**Requirement**: Auto-calculate daily VIP distribution based on total VIPs and frequency rules. The CPT view and exports must match the client's Excel CPT format exactly.

**Relationship to Change 6**: The CPT and the Calendar are essentially the **same system**. The CPT is the grid view (matching the Excel format), and the calendar is the day-by-day view of that same data. Both read from the same Schedule model.

**Current State**: `getEmployeeReport` in `visitController.js` already generates a 20-day grid with daily VIP counts — but it's admin-only and read-only.

**What Needs to Change**:
- Expose CPT view to employees (not just admin reports)
- Make the grid **editable during planning phase** — BDMs can place/remove "1"s to plan their schedule in the app (not just via Excel upload). Once approved, the schedule is **locked** for the month (see Change 6 locking rules)
- Add auto-distribution algorithm for even visit spreading (suggested schedule that BDM can adjust)
- Algorithm logic:
  - 4x doctors: 1 visit per week, spread across M-F (e.g., W1D1, W2D3, W3D2, W4D4)
  - 2x doctors: Alternating weeks (W1+W3 or W2+W4), spread across different days
- Grid format: Each row = 1 VIP Client. Columns = W1D1 through W4D5 (20 workdays). Cell = "1" if visit is scheduled on that day. Final column = SUM OF (total visits for the month)
- Daily VIP count row at bottom: Shows how many VIPs are scheduled per day (auto-calculated)
- Two modes: **Planned** (schedule, shows "1"s) and **Actual** (after visits are logged, shows completed/missed)

**DCR Summary (Daily Call Rate Tracking)**:

The CPT system must generate a **DCR Summary** table — this is the core metric for evaluating BDM performance:

| Column | Description |
|---|---|
| Week | W1, W2, W3, W4 |
| Day | D1-D5 (Mon-Fri) |
| Sheet | W1 D1, W1 D2, ... W4 D5 (day label) |
| Total Engagements | Actual visits completed on that day |
| Target Engagements | Number of "1"s scheduled for that day (from the approved Excel/schedule) |
| Call Rate | `Total Engagements / Target Engagements × 100%` |

**How it works**:
- Target is determined by the schedule: if the BDM put 19 "1"s on W1D1 (meaning 19 VIP Clients to visit that Monday), the target for W1D1 = 19
- If the BDM actually completes all 19, Call Rate for that day = 100%
- If the BDM completes 18 out of 19, Call Rate = 94.7%
- Bottom row shows **TOTAL (All Days)**: sum of all engagements vs sum of all targets, with overall Call Rate %
- The **overall Call Rate is the average across all 20 days** — this is the key metric to determine if the BDM is worth continuing to partner with (low engagement = questionable partnership value)

**Daily MD Count**: The DCR Summary must also include a count of **MDs visited per day**, split into:
- **Included in List**: VIP Clients from the scheduled list who were visited
- **Not Included in List**: Extra Call clients (non-VIP) who were visited (see Change 16)
- Both numbers shown separately per day (W1D1 through W4D5) and in the TOTAL row

**Extra Call Section**: Each day sheet also has a section at the bottom for **"EXTRA CALL (VIP NOT INCLUDED IN THE LIST)"** — these are visits to regular clients (see Change 16) who are not part of the scheduled VIP Client list. Extra calls have their own engagement type tracking (TXT/PROMAT, MES/VIBER GIF, PICTURE, SIGNED CALL, VOICE CALL) but do NOT count towards the Call Rate target.

**Type of Engagement**: Each VIP Client on the daily sheet tracks the TYPE of engagement made — the BDM marks "1" on the type used:

| Engagement Type | Description |
|---|---|
| TXT/PROMAT | Text message or promotional materials sent |
| MES/VIBER GIF | Messenger or Viber GIF sent |
| PICTURE | Photo engagement |
| SIGNED CALL | Signed call (in-person visit with physical sign-off) |
| VOICE CALL | Phone/voice call |

The sum of engagement types per VIP Client is shown in the TOTAL column on the daily sheet. The "DATE COVERED" column shows whether the VIP was covered on the target date ("OK") or the actual date if rescheduled (mm/dd/yy format).

---

### CHANGE 8: Excel Upload (Admin Uploads & Approves)

**Requirement**: Admin uploads the BDM's Excel (Call Plan Template) to the CRM, reviews the data, and approves or rejects the whole batch. BDMs give their Excel to the admin externally (email, in person, etc.) — there is NO BDM upload UI.

**Current State**: Only Excel/CSV EXPORT exists (Reports page). No import.

**New Files Needed**:
| File | Purpose |
|---|---|
| `backend/controllers/importController.js` | Excel parsing with `xlsx` library |
| `backend/routes/importRoutes.js` | Import API endpoints |
| `backend/models/ImportBatch.js` | Staging model for pending import batches |
| NEW: `frontend/src/pages/admin/ImportPage.jsx` | Admin upload + review/approve UI |

**Excel Template Columns** (exact order from client's CPT — must match exactly):
```
#  (Alphabetical Order - auto-numbered row)
LASTNAME
FIRSTNAME
VIP SPECIALTY (free-form text — too many specializations to enumerate)
[20-day grid: W1 mo, W1 tu, W1 we, W1 th, W1 fr, W2 mo, W2 tu, ... W4 fr]
Count of 1 Status (auto-calculated SUM of "1"s)
CLINIC/OFFICE ADDRESS (single field — includes hospital if applicable)
OUTLET INDICATOR
PROGRAMS TO BE IMPLEMENTED
SUPPORT DURING COVERAGE
TARGET PRODUCT 1
TARGET PRODUCT 2
TARGET PRODUCT 3
LEVEL OF ENGAGEMENT (1-5)
BIRTHDAY
ANNIVERSARY
OTHER DETAILS (free-form — any additional info not covered above)
```

**Region Handling**: The Excel is region-specific (e.g., "Davao Region" Excel). Admin assigns the region when reviewing the batch. BDMs can edit the region later if it's wrong (see Change 2).

**Enum Values** (from client's template):

| PROGRAMS TO BE IMPLEMENTED | SUPPORT DURING COVERAGE |
|---|---|
| CME GRANT | STARTER DOSES |
| REBATES / MONEY | PROMATS |
| REST AND RECREATION | FULL DOSE |
| MED SOCIETY PARTICIPATION | PATIENT DISCOUNT |
| | AIR FRESHENER |

**Workflow**:
1. BDM prepares their Excel and gives it to the admin (email, in person, etc.)
2. Admin **reviews the Excel thoroughly first** (before uploading) — checking doctor info, schedule correctness, duplicates, etc.
3. Admin uploads the Excel to the CRM → entire batch goes to `ImportBatch` with `status: pending`
4. System checks for **duplicate VIP Clients** (by name match). If duplicates found, show a warning and auto-navigate to the potential duplicate so the admin can verify
5. Admin does a final review in the CRM interface → **approves or rejects the ENTIRE batch** (not individual doctors)
6. On approval — **ALL data from the Excel populates the system**:
   - VIP Client profiles are created/updated with ALL fields (name, specialty, address, outlet indicator, programs, support, target products, engagement level, birthday, anniversary, other details)
   - The coverage schedule (the "1" markers in the 20-day grid) is imported into the calendar scheduling system (see Change 6)
   - This is the primary data entry method — the Excel IS the source of truth for VIP Client info
   - **If a VIP Client already exists** (from a previous import or CRM edits), the Excel data OVERWRITES the existing data. Show a warning: "This will overwrite changes made to Dr. Santos in the app"
7. On rejection: Admin can add a reason; BDM can revise and re-submit

**Schedule Rotation**: Excels are typically updated every **~3 months (quarterly)** — the client may change doctors or adjust schedules each quarter. The approved schedule **loops every 4-week cycle** automatically until a new Excel replaces it. The schedule is **locked** — BDMs cannot rearrange visits (see Change 6 locking rules). To change the schedule, a new Excel must be uploaded and approved.

**Quarterly Update Workflow (Export → Edit → Re-upload)**: When it's time to update the VIP Client list (~every 3 months), BDMs don't start from scratch. Instead:
1. BDM **exports** current VIP Client data from the CRM to Excel (gets all their latest edits — support, programs, engagement level, etc.)
2. BDM **edits** the exported Excel — adds new doctors, removes old ones, updates info, adjusts the schedule grid
3. BDM gives the **same file** to admin
4. Admin uploads it back to the CRM → normal approval flow (see workflow above)

This is a **round trip**: CRM → Excel → CRM. The export IS the template for the next import. This is why the export format must match the client's Excel CPT format exactly (same columns, same formatting, same structure).

**Data Migration Note**: The client is migrating a LOT of data from Excel to this CRM. Data must flow both ways seamlessly: Excel → CRM (import) and CRM → Excel (export).

**Note**: Repurpose the existing scaffolded Approvals page (`/admin/approvals`) for this batch review workflow.

---

### CHANGE 9: Doctor Model Field Extensions

**Requirement**: Add many new fields to Doctor profiles matching the client's Excel template.

**New Fields for `backend/models/Doctor.js`**:

| Field | Type | Notes |
|---|---|---|
| `firstName` | String, required | Split from current `name` field |
| `lastName` | String, required | For alphabetical sorting (Excel format) |
| `outletIndicator` | String | Enum: MMC, CDH, IMH, etc. |
| `programsToImplement` | [String] | Enum array: `CME GRANT`, `REBATES / MONEY`, `REST AND RECREATION`, `MED SOCIETY PARTICIPATION` |
| `supportDuringCoverage` | [String] | Enum array: `STARTER DOSES`, `PROMATS`, `FULL DOSE`, `PATIENT DISCOUNT`, `AIR FRESHENER` |
| `levelOfEngagement` | Number (1-5) | See engagement scale below |
| `secretaryName` | String | Secretary/assistant name |
| `secretaryPhone` | String | Secretary contact number |
| `birthday` | Date | Doctor's birthday |
| `anniversary` | Date | Doctor's anniversary |
| `otherDetails` | String | Free-form notes |
| `targetProducts` | [{ product: ObjectId, status: 'showcasing'\|'accepted' }] | 3 product slots — BDM showcases products, marks as `accepted` when VIP Client likes it, swaps failed ones for new picks |
| `isVipAssociated` | Boolean | Whether admin has approved this doctor as VIP partner |

**Field Changes**:
- `specialization`: **Remove enum, change to free-form String** (client uses "Pedia Hema", "Coloretal Surg", "Im Car", "Breast Surg", "Nuero Surg", etc.)
- `name`: **Split into `firstName` + `lastName`**, add virtual `fullName` getter
- `hospital` + `address`: **Merge into single `clinicOfficeAddress` field** (free-form String). BDMs can include hospital name in the address if applicable. Remove the structured address object (`street`, `city`, `province`, `postalCode`).
- `targetProducts`: **Always 3 slots**. Each has a status: `showcasing` or `accepted`. When a product showcase succeeds (VIP Client liked it), BDM marks that product as `accepted` — it stays locked in. The remaining failed slots get swapped for new products to try next visit. Example: 3 products showcased → Product A accepted, B and C failed → BDM picks 2 new products D and E → next visit showcases A (accepted), D, E. Rotation continues per-product until all 3 slots are accepted.

**Level of Engagement Scale**:
| Level | Description |
|---|---|
| 1 | The VIP was visited 4 times |
| 2 | The VIP knows the BDM or the product/s |
| 3 | The VIP tried the products |
| 4 | The VIP is in the group chat (GC) |
| 5 | The VIP is an active and established partner |

---

### CHANGE 10: Visit Frequency Rule — 2x Alternating Weeks

**Requirement**: 2x monthly doctors must follow every-other-week pattern (W1+W3 or W2+W4), not any 2 random weeks.

**Current State**: `backend/utils/validateWeeklyVisit.js` enforces max 1/week and max 2/month, but allows W1+W2 (consecutive weeks).

**What Needs to Change**:
| File | Change |
|---|---|
| `backend/utils/validateWeeklyVisit.js` | Add alternating week validation for 2x frequency |

**Logic**: If doctor is 2x frequency and has a visit in W1, next allowed visit is W3 (not W2). If visit in W2, next allowed is W4.

---

### CHANGE 11: VIP Count Minimums & Validation

**Requirement**: Minimum 20 VIPs per BDM, recommended 130 total, track by frequency.

**What Needs to Change**:
- Employee dashboard: Warning banner when assigned doctors < 20
- Admin dashboard: Warning when total active doctors < 130
- Statistics page: VIP count breakdown (2x vs 4x per BDM)
- Schedule validation: Ensure planned visits adequately fill 20 working days

---

### CHANGE 12: Level of Engagement Tracking (1-5 Scale)

**Requirement**: Track and display engagement level per doctor.

**What Needs to Change**:
- Add `levelOfEngagement` to Doctor model (see Change 9)
- Display engagement badge on doctor cards and detail pages
- Allow BDMs to update engagement level
- Consider: engagement history tracking (optional, future)

---

### CHANGE 13: Remove Visit Approval System

**Requirement**: No approval needed for logging visits. Visits are auto-completed.

**Current State**: Already correct — visits are created with `status: completed` by default. The Approvals page is scaffolded but uses mock data.

**Action**: Repurpose Approvals page for Excel import approvals (Change 8) instead of removing it.

---

### CHANGE 14: BDM Self-Service Performance Metrics

**Requirement**: BDMs can view their own statistics and performance.

**Current State**: Employee dashboard shows basic stats only. Detailed views are admin-only.

**New Files**:
| File | Purpose |
|---|---|
| NEW: `frontend/src/pages/employee/MyPerformancePage.jsx` | Detailed performance metrics |

**Metrics to Show**: Total visits/month, compliance %, engagement distribution, VIP coverage (2x vs 4x), behind-schedule warnings.

---

### CHANGE 15: Admin View Individual BDM Performance

**Requirement**: Admin can view per-BDM performance and VIP coverage stats. The **DCR Summary** (see Change 7) is the primary evaluation tool — it shows whether a BDM is meeting their scheduled visit targets.

**What Needs to Change**:
- Enhance `StatisticsPage.jsx` with per-BDM drill-down
- Add **DCR Summary view** per BDM: 20-row table (W1D1 through W4D5) showing Total Engagements vs Target Engagements with Call Rate % per day and overall
- Add VIP coverage stats: 2x count, 4x count, total per BDM
- Add engagement level distribution per BDM
- Wire up to real backend data (replace mock data)
- **Key decision metric**: If a BDM's overall Call Rate is consistently low, admin can evaluate whether the partnership is worth continuing

---

### CHANGE 16: Non-VIP Regular Clients Table

**Requirement**: BDMs also cater to regular clients who are NOT part of the VIP Client list. These need a separate table below the VIP Client list on the BDM dashboard.

**Current State**: Only VIP Clients (Doctor model) exist. No concept of non-VIP regular clients.

**What Needs to Change**:
| File | Purpose |
|---|---|
| NEW: `backend/models/Client.js` | Regular client model (simpler than Doctor — basic info, no visit frequency enforcement) |
| NEW: `backend/controllers/clientController.js` | CRUD for regular clients |
| NEW: `backend/routes/clientRoutes.js` | API endpoints |
| `frontend/src/pages/employee/EmployeeDashboard.jsx` | Add second table below VIP Client list for regular clients |
| NEW: `frontend/src/components/employee/ClientList.jsx` | Regular client list component |
| NEW: `frontend/src/services/clientService.js` | API service layer |

**Key Differences from VIP Clients**:
- BDMs can **add regular clients directly** (no Excel upload or admin approval needed)
- **Daily limit: up to 30 extra calls (unlisted VIP clients) per day** — system must enforce this cap
- No visit frequency enforcement (no 2x/4x rules)
- No scheduling grid / CPT integration
- Simpler profile (name, specialty, address, phone, notes)
- These clients may eventually be promoted to VIP status through the Excel upload + admin approval process
- **Reporting**: Visits to regular clients appear in the **"EXTRA CALL (VIP NOT INCLUDED IN THE LIST)"** section at the bottom of each daily CPT sheet. They have their own engagement type columns (TXT/PROMAT, MES/VIBER GIF, PICTURE, SIGNED CALL, VOICE CALL) but do NOT count towards the Call Rate target (see DCR Summary in Change 7)

---

### CHANGE 17: Filter VIP Clients by Support Type & Program

**Requirement**: Admin and BDMs need to look up which VIP Clients are under a specific support type or program — a reverse lookup instead of opening each doctor's profile individually.

**Current State**: No filtering by support or program exists. These fields are not yet in the Doctor model (see Change 9).

**What Needs to Change**:
- Add filter/search on VIP Client list pages (both admin and BDM views):
  - **Filter by Support During Coverage**: e.g., "Show me all VIP Clients with STARTER DOSES"
  - **Filter by Programs to Implement**: e.g., "Show me all VIP Clients under CME GRANT"
- Results show a list of VIP Clients grouped by the selected support type or program
- Both admin and BDMs can use this — admin sees all VIP Clients, BDMs see only their assigned ones

**Depends on**: Change 9 (Doctor model field extensions — `supportDuringCoverage` and `programsToImplement` fields must exist first)

---

## PART 3: RECOMMENDATIONS & PRIORITY PHASES

### Implementation Priority

#### Phase A — Core Schema Changes (Do First)
| # | Change | Reason |
|---|---|---|
| 1 | **Change 9**: Doctor model field extensions | Foundation for everything else |
| 2 | **Change 10**: 2x alternating week rule | Core business logic |
| 3 | **Change 1**: Remove MedRep, BDM assigns products | Role architecture change |
| 4 | **Change 2**: BDM edit own doctors | Depends on new Doctor fields |

#### Phase B — UX Improvements
| # | Change | Reason |
|---|---|---|
| 5 | **Change 3**: Doctor info page before log visit | Major UX flow change |
| 6 | **Change 4**: Product detail popup | Quick win, improves field visits |
| 7 | **Change 12**: Level of engagement tracking | Uses new Doctor field |
| 8 | **Change 14**: BDM performance self-view | Employee satisfaction |
| 9 | **Change 16**: Non-VIP regular clients table | BDMs also cater to non-VIP clients |
| 10 | **Change 17**: Filter by support/program | Reverse lookup, depends on Change 9 |

#### Phase C — New Features
| # | Change | Reason |
|---|---|---|
| 9 | **Change 6**: Schedule calendar (4-week) | New feature, significant scope |
| 10 | **Change 7**: Call Planning Tool (CPT) | Builds on scheduling |
| 11 | **Change 8**: Excel upload/import | Complex: parsing + staging + approval |
| 12 | **Change 11**: VIP count minimums | Compliance validation |

#### Phase D — Advanced (Future)
| # | Change | Reason |
|---|---|---|
| 13 | **Change 5**: Offline capability | Service worker + IndexedDB |
| 14 | **Change 13**: Repurpose approvals for Excel import | Depends on Change 8 |
| 15 | **Change 15**: Enhanced admin performance views | Wire up mock data to real backend |

---

### Critical Technical Notes

1. **Specialization → free-form text**: Remove the 16-option enum from Doctor model. Client's doctors have specialties like "Pedia Hema", "Im Car", "Breast Surg" that will never fit a fixed list.

2. **Name splitting is a breaking change**: Changing `name` to `firstName`/`lastName` affects every query, index, and frontend component that references `name`. Requires a migration script to split existing names.

3. **2x alternating week rule**: Core business logic change in `validateWeeklyVisit.js`. Must be thoroughly tested — wrong logic blocks valid visits or allows invalid ones.

4. **Excel import library**: Use `xlsx` npm package. Create a staging collection (`ImportBatch`) for pending imports so admin review doesn't block main data.

5. **Offline GPS works on phones**: Browser GPS works offline if the device has hardware GPS chip (all modern phones). WiFi-based location requires internet. Use `exifr` library for EXIF timestamp parsing.

6. **Cross-database products**: Products live in separate `vip-pharmacy` database. All product population uses `getWebsiteProductModel()` manual fetching (NOT Mongoose populate). New product features must follow this pattern.

7. **MedRep removal scope**: Affects 9+ files across backend and frontend. Existing medrep users need migration to employee/admin.

8. **Export format must match client's Excel CPT exactly**: `exportCallPlan.js` and `exportEmployeeReport.js` currently output empty strings for OUTLET INDICATOR, PROGRAMS, SUPPORT. Once Doctor model has these fields, exports read from the model. **Critical**: The client is migrating massive amounts of data from Excel to this CRM and back. Exported files must match the client's Excel CPT format exactly — same columns, same ordering, same formatting — so imported and exported data are interchangeable. The 20-day grid columns (W1D1 through W4D5), SUM OF column, and all supplementary fields must align precisely with the client's template.

9. **Scaffolded admin features need backend**: Activity Monitor, Statistics, Compliance pages use mock data. The `complianceService.js` calls endpoints that don't exist yet. These need backend API implementation.

10. **Unused existing fields are opportunities**: `Doctor.clinicSchedule`, `Visit.nextVisitDate`, and `Doctor.location` (GeoJSON) are already stored. The scheduling system (Change 6) can leverage `clinicSchedule` immediately.

---

### Files Most Impacted

| File | Changes |
|---|---|
| `backend/models/Doctor.js` | 15+ new fields, specialization change, name split |
| `backend/models/User.js` | Remove medrep role |
| `backend/models/ProductAssignment.js` | Allow employee role in pre-save hook |
| `backend/utils/validateWeeklyVisit.js` | 2x alternating week logic |
| `backend/controllers/doctorController.js` | Employee edit permissions |
| `backend/controllers/productAssignmentController.js` | Employee role access |
| `backend/middleware/roleCheck.js` | Remove medRepOnly middleware |
| `frontend/src/App.jsx` | Remove medrep routes, add new employee routes |
| `frontend/src/components/common/Sidebar.jsx` | Remove medrep menu, expand employee menu |
| `frontend/src/components/employee/DoctorList.jsx` | Navigate to detail page instead of visit logger |
| `frontend/src/pages/employee/EmployeeDashboard.jsx` | Calendar integration, VIP minimum warning |

### New Files to Create

| File | Purpose |
|---|---|
| `backend/models/Schedule.js` | Planned visit scheduling model |
| `backend/models/ImportBatch.js` | Excel import staging model |
| `backend/controllers/scheduleController.js` | Schedule CRUD |
| `backend/controllers/importController.js` | Excel parsing + staging |
| `backend/routes/scheduleRoutes.js` | Schedule API endpoints |
| `backend/routes/importRoutes.js` | Import API endpoints |
| `frontend/src/pages/employee/DoctorDetailPage.jsx` | Doctor info page (Change 3) |
| `frontend/src/pages/employee/MyPerformancePage.jsx` | Self performance view (Change 14) |
| `frontend/src/components/employee/ScheduleCalendar.jsx` | 4-week calendar (Change 6) |
| `frontend/src/components/employee/CallPlanView.jsx` | CPT view (Change 7) |
| `frontend/src/components/employee/DoctorEditForm.jsx` | Doctor edit form (Change 2) |
| `frontend/src/pages/admin/ImportPage.jsx` | Excel import review (Change 8) |
| `frontend/src/services/scheduleService.js` | Schedule API service |
| `frontend/src/services/importService.js` | Import API service |

---

## Summary

| Metric | Count |
|---|---|
| Total changes identified | 17 |
| New Doctor model fields | 13+ |
| Files to modify | 11+ |
| New files to create | 20+ |
| Roles affected | All 3 (admin, employee, medrep removed) |
| Implementation phases | 4 (A through D) |
| Breaking changes | 3 (name split, medrep removal, hospital→clinicOfficeAddress) |
