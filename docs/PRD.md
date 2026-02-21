# Product Requirements Document (PRD)
## VIP CRM

**Version:** 4.0
**Last Updated:** February 2026
**Status:** Phase 1 Complete. Phases A-D defined based on client change requests.

---

## 1. Project Overview

### 1.1 Executive Summary
VIP CRM is a pharmaceutical field sales management system designed for Business Development Managers (BDM) to track VIP Client visits, manage product assignments, and ensure compliance with visit schedules. The system enforces a 4-week scheduling cycle with performance tracking through DCR (Daily Call Rate) Summaries.

### 1.2 Problem Statement
Pharmaceutical companies struggle with:
- Enforcing visit compliance (ensuring BDMs visit VIP Clients on schedule)
- Tracking field BDM visits with proof (photos, GPS)
- Managing product-to-VIP Client assignments
- Monitoring weekly and monthly visit quotas
- Migrating data between Excel call plans and the CRM system
- Tracking BDM performance through Call Rate metrics

### 1.3 Solution
A phone-first web application that provides:
- **4-week scheduling cycles** with automated carry-forward and cutoff rules
- **DCR Summary** tracking (Call Rate = actual visits / scheduled visits)
- Real-time visit logging with GPS and photo verification
- **Excel import/export round-trip** (CRM ↔ Excel CPT format)
- Region-based VIP Client access control
- Level of Engagement tracking (1-5 scale)
- Non-VIP regular client tracking (Extra Calls)

### 1.4 Target Users
- **Primary:** Business Development Managers (BDM) — use phone for daily CRM work
- **Secondary:** System administrators (Admin) — manage users, regions, approve imports
- ~~**Tertiary:** MedReps~~ — being removed; BDMs now assign their own products

### 1.5 Device Usage
| Device | Primary Use |
|--------|-------------|
| **Phone (cellphone)** | Primary device for all CRM work: logging visits, uploading photos, browsing the app |
| **Tablet** | ONLY for presenting product images to VIP Clients during visits |

### 1.6 Terminology Mapping
| Business Term | Code Term | Note |
|---|---|---|
| VIP Client | Doctor | Model: `backend/models/Doctor.js` |
| BDM | employee (role) | Role enum in `backend/models/User.js` |

Documentation uses business terms. Code uses Doctor/Employee.

---

## 2. User Roles

### 2.1 Admin
**Description:** System administrators with full access to all features and data across all regions.

**Permissions:**
- Manage all users (create, edit, deactivate)
- Manage all VIP Clients across all regions
- Manage products and product categories
- Configure regions and territories
- Access all visits and reports
- Upload and approve/reject Excel import batches
- View any BDM's DCR Summary and performance metrics
- Send messages to BDMs
- Filter VIP Clients by support type and program

### 2.2 BDM (Business Development Manager)
**Code role:** `employee`
**Description:** Field representatives who visit VIP Clients and log their activities.

**Permissions:**
- View VIP Clients ONLY in their assigned regions
- Log visits with GPS and photo proof
- Assign 3 target products per VIP Client (self-service, no MedRep needed)
- Edit own VIP Client profiles (all fields except assignedTo)
- View VIP Client info page before logging visit
- View personal visit history and compliance dashboard
- View own DCR Summary and performance metrics
- Check weekly/monthly visit limits before visiting
- Add and visit regular (non-VIP) clients (up to 30 extra calls/day)
- Receive messages from admin

**Constraints:**
- Can only see VIP Clients in their assigned region(s)
- Limited to ONE visit per VIP Client per week
- Monthly quota: 2x (alternating weeks) or 4x (weekly)
- Can only visit VIP Clients scheduled for current week + carried visits
- Schedule is locked — cannot rearrange visits

### 2.3 MedRep (DEPRECATED — being removed)
> **Note:** The MedRep role is being removed in Phase A (Change 1). BDMs will assign their own products. Existing MedRep users will be migrated to employee or admin.

---

## 3. System Flow

### 3.1 Core Data Flow

This is the client's desired end-to-end system flow:

```
Excel CPT (BDM creates)
  → Gives to Admin (email, in person)
    → Admin reviews thoroughly, then uploads to CRM
      → Admin approves entire batch (or rejects with reason)
        → VIP Client profiles created/updated + Schedule imported
          → Schedule loops every 4-week cycle (anchored to Jan 5, 2026)
            → BDM logs visits on phone (photo + engagement type)
              → Only scheduled + carried VIP Clients are visitable
                → Missed visits auto-carry until end of cycle
                  → Extra visits allowed but don't count ahead
                    → Up to 30 extra calls (non-VIP) per day
                      → DCR Summary auto-calculates Call Rate + daily MD count
                        → Admin & BDM monitor performance
                          → Every ~3 months: export → edit → re-upload → cycle repeats
```

**Key rule:** If a new Excel is uploaded with different info for the same VIP Client, it **overwrites** CRM data (with warning shown to admin).

### 3.2 4-Week Scheduling Cycle

**Anchor Date:** January 5, 2026 (Monday) = W1D1

The 4-week cycle rolls continuously from this anchor date:
- W1: Jan 5-9, W2: Jan 12-16, W3: Jan 19-23, W4: Jan 26-30
- Then resets: W1: Feb 2-6, W2: Feb 9-13, ...and so on
- January through November fit neatly into 4-week cycles
- December has extra weeks (2-3 extra) — same W1-W4 rolling pattern, no special handling

**Schedule Looping:** Approved schedule automatically repeats every 4-week cycle until a new Excel is uploaded (~quarterly).

**Schedule Locking:** Once approved, the schedule is locked. BDMs cannot manually move visits.

**Weekly Open Window:** Scheduled day is the target, but the entire week is the window (D1-D5).

**Carry Rules:**
| Scenario | Rule |
|----------|------|
| BDM misses scheduled day | Can visit any other day that week (D1-D5) |
| BDM misses entire week | Visit carries to next week |
| Carry continues | Until W4D5 (end of cycle) = **hard cutoff** |
| Not visited by W4D5 | Marked `missed` — counts against compliance |

**Visit Rules:**
| Rule | Description |
|------|-------------|
| Blocked after visit | Once visited this week, VIP Client is blocked — UNLESS carried/missed weeks exist to clear |
| Carried weeks keep visitable | If carried weeks exist, VIP Client stays visitable for additional logs in the same calendar week |
| Current week priority | When logging, system ticks off **current week first**, then carried weeks (oldest first). Example: W1 missed, now W2 → first log = W2, second log = W1 |
| No advance credit | Visiting 3x in W1 does NOT count for W2/W3/W4 |
| Each week is independent | Missed W1 can be caught up in W2-W4, but W2's own requirement still stands |
| W4 catch-up | BDM might need up to 3 visits for same VIP Client in W4 (missed W1 + missed W2 + W4's own) |
| Who is visitable | Only VIP Clients scheduled for current week + carried from previous weeks |

### 3.3 Visit Frequency Rules
| VIP Client Type | Monthly Limit | Weekly Pattern |
|-----------------|---------------|----------------|
| `visitFrequency: 4` | 4 visits/month | 1 visit per week across different days |
| `visitFrequency: 2` | 2 visits/month | **Alternating weeks**: W1+W3 or W2+W4 (not consecutive) |

- **Enforcement**: Hard limits — system blocks excess visits
- **Work days only**: Monday through Friday (Day 1 = Monday, Day 5 = Friday)

### 3.4 DCR Summary (Daily Call Rate)

The DCR Summary is the core metric for evaluating BDM performance:

| Column | Description |
|--------|-------------|
| Day | W1 D1, W1 D2, ... W4 D5 (20 workdays) |
| Target Engagements | Number of "1"s scheduled for that day |
| Total Engagements | Actual visits completed on that day |
| Call Rate | Total / Target × 100% |
| TOTAL row | Sum of all engagements, overall Call Rate % |

**Daily MD Count** (shown per day and in TOTAL row):
- **Included in List**: VIP Clients from scheduled list who were visited
- **Not Included in List**: Extra Call clients (non-VIP) who were visited

**Key decision metric:** If a BDM's overall Call Rate is consistently low, admin evaluates whether the partnership is worth continuing.

### 3.5 Engagement Types (tracked per visit)
| Type | Description |
|------|-------------|
| TXT/PROMAT | Text message or promotional materials sent |
| MES/VIBER GIF | Messenger or Viber GIF sent |
| PICTURE | Photo engagement |
| SIGNED CALL | In-person visit with physical sign-off |
| VOICE CALL | Phone/voice call |

### 3.6 Level of Engagement (1-5 Scale)
| Level | Meaning |
|-------|---------|
| 1 | The VIP was visited 4 times |
| 2 | The VIP knows the BDM or the products |
| 3 | The VIP tried the products |
| 4 | The VIP is in the group chat (GC) |
| 5 | The VIP is an active and established partner |

### 3.7 Regular (Non-VIP) Clients
- BDMs add regular clients directly (no Excel upload or admin approval)
- **Daily limit: up to 30 extra calls per day** (system enforced)
- No visit frequency enforcement (no 2x/4x rules)
- No scheduling grid / CPT integration
- Simpler profile: name, specialty, address, phone, notes
- Appear in **"EXTRA CALL (VIP NOT INCLUDED IN THE LIST)"** section of CPT
- Have their own engagement type columns but do NOT count toward Call Rate
- May eventually be promoted to VIP status through Excel upload + admin approval

### 3.8 Visit Proof Requirements
Every visit MUST include:
- GPS coordinates (latitude, longitude, accuracy)
- At least ONE photo as proof (1-10 photos per visit)
- Visit date (must be a work day)
- Photo upload methods: camera capture, file picker/gallery, clipboard paste

### 3.9 Region-Based Access
| Role | Region Access |
|------|---------------|
| Admin | All regions |
| BDM | Assigned regions only (cascading — includes child regions) |

### 3.10 Target Products
- BDMs assign 3 target products per VIP Client (self-service)
- Each product has status: `showcasing` or `accepted`
- When a product showcase succeeds → BDM marks as `accepted` (locked in)
- Failed products → BDM swaps for new picks from catalog
- Rotation continues per-product until all 3 slots accepted

---

## 4. Core Features

### 4.1 Authentication & Authorization
- Secure login with email/password
- JWT-based authentication via **httpOnly cookies** (NOT localStorage)
- Role-based access control (admin, employee)
- Password reset functionality
- **Account lockout** after 5 failed attempts (15 min)
- **Audit logging** (all auth events, 90-day TTL)
- Password complexity: uppercase + lowercase + number + special char, 8+ chars

### 4.2 User Management (Admin Only)
- User CRUD operations
- Role assignment (admin, employee)
- Region assignment (multiple regions per user)
- Account activation/deactivation

### 4.3 VIP Client Management
- VIP Client database with detailed profiles (15+ fields after Phase A)
- Visit frequency setting (2 or 4 per month)
- Free-form specialization (not enum)
- Region assignment with cascading dropdowns
- Level of Engagement (1-5)
- Target products (3 slots with showcasing/accepted status)
- Programs to implement, support during coverage
- Secretary info, birthday, anniversary, other details
- BDMs can edit own VIP Clients (except assignedTo)

### 4.4 Visit Logging
- Create visit records with required fields:
  - VIP Client selection (from schedule + carried)
  - GPS location (required)
  - Photo(s) (required, 1-10, from camera/gallery/clipboard)
  - Visit date (work days only)
  - Engagement type (TXT/PROMAT, MES/VIBER GIF, PICTURE, SIGNED CALL, VOICE CALL)
  - Products discussed (optional)
  - VIP Client feedback (optional)
- **Automatic weekly tracking** (week number, day of week, yearWeekKey)
- Visit status (completed, cancelled)

### 4.5 Scheduling & Calendar System
- 4-week cycle calendar matching CPT format (20 workdays)
- Schedule model with planned/carried/completed/missed statuses
- Auto-carry for missed visits, W4D5 hard cutoff
- Schedule looping every 4-week cycle
- Cycle anchor: January 5, 2026
- Schedule locked after admin approval

### 4.6 Call Planning Tool (CPT)
- Editable 20-day grid (W1D1-W4D5) during planning phase
- Auto-distribution algorithm for even visit spreading
- Planned vs Actual modes
- DCR Summary with Target/Total/Call Rate per day
- Daily MD count (VIP vs Extra Call split)
- Extra Call section for non-VIP visits

### 4.7 Excel Import/Export
- Admin uploads BDM's Excel CPT → stages as ImportBatch → approves/rejects entire batch
- On approval: VIP Client profiles + schedule imported
- Duplicate detection by name match
- Overwrites existing data with warning
- Quarterly round-trip: CRM → Excel → edit → re-upload
- Export format matches import format exactly (same columns, same ordering)

### 4.8 Product Management (Admin Only)
- Product catalog with images (S3), descriptions, key benefits
- Cross-database access (products in separate `vip-pharmacy` DB)
- BDMs browse catalog and pick 3 target products per VIP Client

### 4.9 Product Assignments (BDM Self-Service)
- BDMs assign 3 target products per VIP Client
- Status tracking: showcasing → accepted
- Failed products swapped for new picks
- Admin retains full override access

### 4.10 Region Management (Admin Only)
- Hierarchical structure (country > region > province > city > district > area)
- Cascading dropdowns for selection
- Parent-child relationships with descendant access

### 4.11 Reporting & Analytics
- BDM Visit Report (Call Plan Template format, 20-day grid)
- DCR Summary per BDM (Target/Total/Call Rate)
- Excel/CSV export matching client's template
- Per-BDM performance drill-down
- VIP coverage stats (2x vs 4x breakdown)
- Engagement level distribution

### 4.12 Messaging System
- Admin → BDM messaging
- Categories: announcement, payroll, leave, policy, system, compliance_alert
- Priority levels, read tracking, archive

### 4.13 Regular Client Management
- BDMs add regular (non-VIP) clients directly
- 30 extra calls per day cap
- No visit frequency enforcement
- Separate table on BDM dashboard

---

## 5. User Stories

### 5.1 BDM User Stories

| ID | User Story | Priority | Phase |
|----|------------|----------|-------|
| E1 | As a BDM, I want to see only VIP Clients in my region | High | 1 ✅ |
| E2 | As a BDM, I want to check if I can visit a VIP Client this week | High | 1 ✅ |
| E3 | As a BDM, I want to log a visit with GPS, photo, and engagement type | High | 1 ✅ |
| E4 | As a BDM, I want to see my weekly compliance status | High | 1 ✅ |
| E5 | As a BDM, I want to be blocked from duplicate weekly visits | High | 1 ✅ |
| E6 | As a BDM, I want to see my VIP Client's info page before logging a visit | High | B |
| E7 | As a BDM, I want to assign 3 target products to each VIP Client | High | A |
| E8 | As a BDM, I want to edit my own VIP Client profiles | High | A |
| E9 | As a BDM, I want to upload photos from my gallery (not just camera) | High | B |
| E10 | As a BDM, I want to view my DCR Summary and Call Rate | Medium | B |
| E11 | As a BDM, I want to see my daily schedule (which VIP Clients to visit today) | High | C |
| E12 | As a BDM, I want to add and visit regular (non-VIP) clients | Medium | B |
| E13 | As a BDM, I want to update the engagement level for my VIP Clients | Medium | B |
| E14 | As a BDM, I want to present product images on my tablet to VIP Clients | Medium | B |

### 5.2 Admin User Stories

| ID | User Story | Priority | Phase |
|----|------------|----------|-------|
| A1 | As an admin, I want to see all visits across all regions | High | 1 ✅ |
| A2 | As an admin, I want to manage users and their regions | High | 1 ✅ |
| A3 | As an admin, I want to manage the VIP Client database | High | 1 ✅ |
| A4 | As an admin, I want to upload and approve BDM Excel call plans | High | C |
| A5 | As an admin, I want to view any BDM's DCR Summary and Call Rate | High | D |
| A6 | As an admin, I want to filter VIP Clients by support type and program | Medium | B |
| A7 | As an admin, I want to see which BDMs are behind schedule | High | D |
| A8 | As an admin, I want to send messages to BDMs | Medium | 1 ✅ |
| A9 | As an admin, I want to see warnings when VIP Client counts are below minimums | Low | C |
| A10 | As an admin, I want to export VIP Client data in Excel CPT format | High | 1 ✅ |

---

## 6. Implementation Phases

### 6.1 Phase 1 - Foundation ✅ COMPLETE
- [x] Authentication (httpOnly cookie JWT, lockout, audit logging)
- [x] User management (CRUD, multi-region assignment)
- [x] VIP Client management (CRUD, cascading regions, export)
- [x] Visit logging (GPS + photo, weekly/monthly enforcement)
- [x] Product management + assignments
- [x] Region management (hierarchy tree)
- [x] BDM Visit Report (Call Plan Template format, Excel/CSV export)
- [x] Messaging system (admin → BDM)
- [x] Security hardening (10 items)
- [x] Frontend optimization (ErrorBoundary, debounce, AbortController, React.memo)

### 6.2 Phase A - Core Schema + Role Changes
- [ ] VIP Client model field extensions (15+ new fields, name split, specialization→free-form)
- [ ] 2x alternating week enforcement (W1+W3 or W2+W4)
- [ ] Remove MedRep role — BDMs assign own products
- [ ] BDM edit own VIP Clients (ownership-based permissions)

### 6.3 Phase B - UX + Visit Flow Improvements
- [ ] VIP Client info page before log visit
- [ ] Product detail popup (tablet-friendly, full-screen)
- [ ] Photo upload flexibility (gallery, clipboard, EXIF)
- [ ] Level of engagement display + update
- [ ] BDM self-service performance / DCR Summary view
- [ ] Non-VIP regular clients table (30/day cap)
- [ ] Filter VIP Clients by support type & program

### 6.4 Phase C - Scheduling, CPT & Excel Import
- [ ] 4-week schedule calendar (Schedule model, cycle rules, carry/cutoff)
- [ ] Call Planning Tool (editable grid, DCR Summary, engagement types)
- [ ] Excel upload & import (admin review, approve/reject, overwrite with warning)
- [ ] VIP count minimums & validation

### 6.5 Phase D - Admin Monitoring & Advanced
- [ ] Admin per-BDM DCR Summary view
- [ ] Wire up scaffolded pages (Statistics, Activity, GPS Verification)
- [ ] Repurpose approvals page for Excel import
- [ ] Email notifications (AWS SES)
- [ ] Deploy to AWS Lightsail
- [ ] Offline capability (deferred)

### 6.6 Out of Scope
- Mobile native apps (web-only, phone-first responsive)
- VIP Client A/B/C/D categories (use visitFrequency)
- Cloudinary integration (use AWS S3)
- Visit approval workflow (visits auto-complete, no approval needed)
- AI-powered recommendations

---

## 7. Success Metrics

### 7.1 Functional Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Visit logging time | < 2 minutes | Average time from opening form to submission |
| System uptime | 99.5% | Monthly availability |
| Page load time | < 3 seconds | Average on 4G connection |
| Photo upload success | > 95% | Successful uploads / total attempts |

### 7.2 Business Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Overall Call Rate | > 90% | DCR Summary: total engagements / total targets |
| Weekly compliance | > 85% | Scheduled visits completed per week |
| BDM adoption | > 90% | Active daily users / total BDMs |
| Visit with proof | 100% | Visits with GPS + photo / total visits |
| VIP Client minimum | 20+ per BDM | Assigned VIP Clients per BDM |

---

## 8. Technical Infrastructure

### 8.1 Hosting & Storage

| Component | Technology | Notes |
|-----------|------------|-------|
| Application | AWS Lightsail | $10/month (2GB RAM) |
| Database | MongoDB Atlas | Free tier (M0) |
| File Storage | AWS S3 | vip-pharmacy-crm-devs (ap-southeast-1) |
| SSL | Let's Encrypt | Auto-renewal |

### 8.2 Key Dependencies

| Dependency | Purpose |
|------------|---------|
| express-rate-limit | API rate limiting (100 req/15min general, 20/15min auth) |
| helmet | Security headers (HSTS) |
| cookie-parser | httpOnly cookie reading |
| xlsx | Excel import/export |
| exifr | EXIF photo metadata parsing (Phase B) |
| recharts | Admin statistics charts |
| react-hot-toast | Toast notifications |

---

## 9. Constraints & Assumptions

### 9.1 Constraints
- **Phone is primary device** — CRM must be phone-friendly first, tablet second
- Tablet ONLY for product presentation to VIP Clients
- Limited internet connectivity in field (online-only for now, offline deferred to Phase D)
- Budget for AWS Lightsail (~$10-20/month)
- Photo storage costs managed via S3
- Excel CPT format must match client's template EXACTLY (columns, ordering, formatting)

### 9.2 Assumptions
- Users have basic smartphone literacy
- Phones have camera and GPS functionality
- 4G/LTE connectivity available in most areas
- BDMs prepare Excel call plans externally (~quarterly)
- Admin reviews and uploads Excel on behalf of BDMs

---

## 10. Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Poor connectivity | High | Medium | Phase D offline mode |
| User resistance | Medium | Medium | Phone-first UX, training |
| Data loss | High | Low | MongoDB Atlas backups, S3 durability |
| Security breach | High | Low | httpOnly cookies, lockout, audit logging |
| Excel format mismatch | High | Medium | Strict column validation on import |
| Scope creep | Medium | High | Phase definitions aligned with client changes |
| Name split migration | Medium | Low | Migration script with rollback |

---

## Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Product Owner | | | |
| Technical Lead | | | |
| Stakeholder | | | |
