# VIP CRM - Project Context

This file provides essential context for AI assistants working on this project. Read this before making any implementation decisions.

> **Last Updated**: February 2026
> **Version**: 4.0
> **Status**: Phase 1 Complete. Client change requests (17 items) documented in `docs/CHANGE_LOG.md`.

---

## Terminology Mapping (Business Terms vs Code)

> **Important**: Documentation uses business terminology (BDM, VIP Client). The code was renamed but the business still uses the original terms.

| Business Term | Code Term | Key File |
|---|---|---|
| **VIP Client** | Doctor | `backend/models/Doctor.js` |
| **BDM** (Business Development Manager) | employee (role) | `backend/models/User.js` role enum |
| VIP Client list | DoctorList | `frontend/src/components/employee/DoctorList.jsx` |
| BDM Dashboard | EmployeeDashboard | `frontend/src/pages/employee/EmployeeDashboard.jsx` |
| VIP Client service | doctorService | `frontend/src/services/doctorService.js` |
| VIP Client controller | doctorController | `backend/controllers/doctorController.js` |
| VIP Client routes | doctorRoutes | `backend/routes/doctorRoutes.js` → `/api/doctors` |
| BDM Management | EmployeeManagement | `frontend/src/components/admin/EmployeeManagement.jsx` |
| BDM Visit Report | EmployeeVisitReport | `frontend/src/components/admin/EmployeeVisitReport.jsx` |

When writing code, use the **code terms** (Doctor, employee). When writing UI labels and documentation, use the **business terms** (VIP Client, BDM).

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

### 4. Region-Based Access
- BDMs can ONLY see VIP Clients in their assigned regions (uses `Region.getDescendantIds()` for cascading access)
- BDMs can ONLY log visits for VIP Clients they are assigned to
- Admins can see and access ALL regions

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
| **Image Storage** | AWS S3 | NOT Cloudinary. Bucket: `vip-pharmacy-crm-devs` |
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

## What's OUT of Scope

| Feature | Status | Notes |
|---------|--------|-------|
| Mobile native apps | Not planned | Web-only, phone-first responsive |
| Offline mode | Phase D (deferred) | Service workers, IndexedDB |
| VIP Client A/B/C/D categories | Deprecated | Use visitFrequency instead |
| Cloudinary integration | Removed | Use AWS S3 |
| Generic VPS hosting | Removed | Use AWS Lightsail |

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
│   │   ├── doctorController.js        # VIP Client CRUD with region filter
│   │   ├── visitController.js         # Visit logging with enforcement
│   │   ├── productController.js       # Product CRUD (reads from website DB)
│   │   ├── productAssignmentController.js  # Product-to-VIP Client assignments
│   │   ├── regionController.js        # Region hierarchy
│   │   └── messageInboxController.js  # Admin→BDM messaging
│   ├── middleware/
│   │   ├── auth.js            # JWT protect, optionalAuth, verifyRefreshToken
│   │   ├── roleCheck.js       # adminOnly, medRepOnly, employeeOnly, etc.
│   │   ├── errorHandler.js    # Global error handling, catchAsync, custom errors
│   │   ├── validation.js      # Express-validator rules
│   │   └── upload.js          # Multer + S3 processors
│   ├── models/
│   │   ├── User.js            # Admin, medrep, employee roles; lockout fields
│   │   ├── Doctor.js          # VIP Client: visitFrequency (2/4), region-based
│   │   ├── Visit.js           # Weekly tracking, GPS, photos, unique constraint
│   │   ├── ProductAssignment.js  # Product-to-VIP Client assignments
│   │   ├── Region.js          # Hierarchical regions
│   │   ├── WebsiteProduct.js  # Read-only website products (separate DB)
│   │   ├── MessageInbox.js    # Admin→BDM messages with categories/priority
│   │   └── AuditLog.js        # Security audit logging (90-day TTL)
│   ├── routes/
│   │   ├── authRoutes.js      # /api/auth
│   │   ├── userRoutes.js      # /api/users
│   │   ├── doctorRoutes.js    # /api/doctors (VIP Clients)
│   │   ├── visitRoutes.js     # /api/visits
│   │   ├── productRoutes.js   # /api/products
│   │   ├── productAssignmentRoutes.js  # /api/assignments
│   │   ├── regionRoutes.js    # /api/regions
│   │   ├── messageInbox.js    # /api/messages
│   │   └── sentRoutes.js      # /api/sent (admin sent messages)
│   ├── utils/
│   │   ├── generateToken.js       # JWT access + refresh tokens
│   │   ├── validateWeeklyVisit.js # Visit limit enforcement
│   │   ├── controllerHelpers.js   # Shared controller utilities
│   │   ├── auditLogger.js        # Security event logging
│   │   ├── calculateProgress.js   # Progress calculation helpers
│   │   └── pagination.js         # Pagination utilities
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
│   │   │   │   └── AdminSentMessageBox.jsx # View admin sent messages
│   │   │   ├── admin/
│   │   │   │   ├── Dashboard.jsx         # Admin stats display
│   │   │   │   ├── DoctorManagement.jsx  # VIP Client CRUD, cascading regions
│   │   │   │   ├── EmployeeManagement.jsx # BDM CRUD, multi-region assignment
│   │   │   │   ├── RegionManagement.jsx  # Region tree CRUD
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
│   │   │   │   └── EMP_InboxPage.jsx      # BDM inbox
│   │   │   ├── admin/
│   │   │   │   ├── AdminDashboard.jsx     # System-wide stats
│   │   │   │   ├── DoctorsPage.jsx        # VIP Client management (CRUD, filters)
│   │   │   │   ├── EmployeesPage.jsx      # BDM management (CRUD, filters)
│   │   │   │   ├── RegionsPage.jsx        # Region hierarchy tree
│   │   │   │   ├── ReportsPage.jsx        # BDM Visit Report, Excel/CSV export
│   │   │   │   ├── StatisticsPage.jsx     # Scaffolded (mock data, Recharts)
│   │   │   │   ├── ActivityMonitor.jsx    # Scaffolded (mock data)
│   │   │   │   ├── PendingApprovalsPage.jsx # Scaffolded (mock data)
│   │   │   │   ├── GPSVerificationPage.jsx  # Scaffolded (mock coordinates)
│   │   │   │   └── SentPage.jsx           # Admin sent messages history
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
│   │   │   ├── regionService.js       # Region API calls
│   │   │   ├── assignmentService.js   # Product assignment API calls
│   │   │   ├── userService.js         # User CRUD API calls
│   │   │   ├── messageInboxService.js # Inbox messaging API calls
│   │   │   └── complianceService.js   # Compliance endpoints (calls non-existent backend)
│   │   └── utils/
│   │       ├── exportCallPlan.js      # VIP Client export (Call Plan Template format)
│   │       ├── exportEmployeeReport.js # BDM Visit Report export
│   │       ├── validators.js          # Client-side validation
│   │       └── formatters.js          # Data formatting helpers
│   └── vite.config.js
├── docs/
│   ├── CHANGE_LOG.md      # 17 client change requests (February 2026)
│   ├── PHASE-TASKS.md     # Phase task breakdown
│   ├── PRD.md             # Product Requirements Document
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
2. [ ] Does it respect region-based access control?
3. [ ] Does it enforce weekly/monthly visit limits?
4. [ ] Does it use AWS S3 for file storage (not Cloudinary)?
5. [ ] Does it use `getWebsiteProductModel()` for cross-DB product queries (not populate)?
6. [ ] Does it align with the client's 17 change requests in `docs/CHANGE_LOG.md`?

---

## Common Gotchas

1. **Week numbers**: Use ISO week numbers (1-53), not simple division
2. **Work days only**: Visits can only be logged Monday-Friday
3. **Unique constraint**: The `{ doctor, user, yearWeekKey }` index prevents same user visiting same VIP Client twice in one week
4. **Region filtering**: Always apply region filter for BDM (employee) queries using `Region.getDescendantIds()`
5. **Photo requirement**: Visits without photos should be rejected (1-10 photos)
6. **Cross-database products**: NEVER use Mongoose `populate()` for products. Use `getWebsiteProductModel()` manual fetching.
7. **httpOnly cookies**: Tokens are in cookies, NOT in localStorage or response body. Frontend uses `withCredentials: true`.
8. **Code vs business terms**: Code uses Doctor/employee, business uses VIP Client/BDM
9. **Scaffolded pages**: Statistics, Activity Monitor, Approvals, GPS Verification have UI but use mock data — backend endpoints don't exist yet for these

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
S3_BUCKET_NAME=vip-pharmacy-crm-devs

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
| `/admin/regions` | RegionsPage | admin |
| `/admin/reports` | ReportsPage | admin |
| `/admin/statistics` | StatisticsPage (scaffolded) | admin |
| `/admin/activity` | ActivityMonitor (scaffolded) | admin |
| `/admin/approvals` | PendingApprovalsPage (scaffolded) | admin |
| `/admin/gps-verification` | GPSVerificationPage (scaffolded) | admin |
| `/medrep` | MedRepDashboard | medrep, admin |
| `/notifications/preferences` | NotificationPreferences | all roles |

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
| `regionRoutes.js` | regionController | `/api/regions` |
| `messageInbox.js` | messageInboxController | `/api/messages` |
| `sentRoutes.js` | (admin sent messages) | `/api/sent` |

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
- [x] AWS S3 - Bucket `vip-pharmacy-crm-devs` configured (ap-southeast-1)
- [ ] AWS Lightsail - Instance not provisioned

#### Config Files
- [x] `config/db.js` - MongoDB connection
- [x] `config/s3.js` - AWS S3 integration (1-hour signed URL expiry)
- [x] `config/websiteDb.js` - Dual DB connection for website products

#### Models (8/8 Complete)
- [x] `models/User.js` - Admin, medrep, employee roles; lockout fields
- [x] `models/Doctor.js` - VIP Client: visitFrequency (2/4), region-based, clinicSchedule
- [x] `models/Visit.js` - Weekly tracking, GPS, photos, unique constraint
- [x] `models/ProductAssignment.js` - Product-to-VIP Client assignments
- [x] `models/Region.js` - Hierarchical regions with getDescendantIds()
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
- [x] `controllers/doctorController.js` - VIP Client CRUD with region filter
- [x] `controllers/visitController.js` - Visit logging with enforcement, getBDMReport
- [x] `controllers/productController.js` - Product CRUD (reads from website DB)
- [x] `controllers/productAssignmentController.js` - Assignments
- [x] `controllers/regionController.js` - Region hierarchy
- [x] `controllers/messageInboxController.js` - Admin→BDM messaging

#### Routes (9/9 Complete)
- [x] `routes/authRoutes.js` → `/api/auth` (stricter rate limiting: 20 req/15min)
- [x] `routes/userRoutes.js` → `/api/users`
- [x] `routes/doctorRoutes.js` → `/api/doctors`
- [x] `routes/visitRoutes.js` → `/api/visits`
- [x] `routes/productRoutes.js` → `/api/products`
- [x] `routes/productAssignmentRoutes.js` → `/api/assignments`
- [x] `routes/regionRoutes.js` → `/api/regions`
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
- [x] `services/regionService.js` - Region API calls, getChildren, getHierarchy
- [x] `services/assignmentService.js` - Product assignment API calls
- [x] `services/userService.js` - User CRUD API calls
- [x] `services/messageInboxService.js` - Inbox messaging API calls
- [x] `services/complianceService.js` - Compliance endpoints (calls non-existent backend APIs)

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
- [x] `components/admin/DoctorManagement.jsx` - VIP Client CRUD, cascading region dropdowns
- [x] `components/admin/EmployeeManagement.jsx` - BDM CRUD, multi-region assignment
- [x] `components/admin/RegionManagement.jsx` - Tree view, stats modal
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
- [x] `pages/admin/RegionsPage.jsx` - Hierarchy tree, CRUD
- [x] `pages/admin/ReportsPage.jsx` - BDM Visit Report, Excel/CSV export
- [x] `pages/admin/SentPage.jsx` - Admin sent messages
- [ ] `pages/admin/StatisticsPage.jsx` - **Scaffolded** (Recharts UI, mock data)
- [ ] `pages/admin/ActivityMonitor.jsx` - **Scaffolded** (mock activity feed)
- [ ] `pages/admin/PendingApprovalsPage.jsx` - **Scaffolded** (mock approval data)
- [ ] `pages/admin/GPSVerificationPage.jsx` - **Scaffolded** (mock GPS coordinates)
- [x] `pages/medrep/MedRepDashboard.jsx` - Product assignment CRUD
- [x] `pages/common/NotificationPreferences.jsx` - Notification settings

---

## Quick Reference: Current Status

| Feature | Status | Notes |
|---------|--------|-------|
| Backend Code | ✅ WORKING | All APIs tested |
| MongoDB Atlas | ✅ CONNECTED | cluster0.wv27nfk.mongodb.net |
| AWS S3 | ✅ CONFIGURED | vip-pharmacy-crm-devs (ap-southeast-1) |
| AWS Lightsail | NOT PROVISIONED | Need to set up instance |
| Frontend Auth | ✅ WORKING | httpOnly cookie-based login/logout/refresh |
| BDM Dashboard | ✅ WORKING | Real API data, VIP Client list |
| Visit Logger | ✅ WORKING | Photo + GPS capture, FormData upload |
| My Visits History | ✅ WORKING | Filters, pagination, photo gallery |
| Admin Dashboard | ✅ WORKING | Real API data, stats |
| VIP Client Management | ✅ WORKING | Full CRUD, cascading regions |
| BDM Management | ✅ WORKING | Full CRUD, multi-region assignment |
| Region Management | ✅ WORKING | Tree view, hierarchy CRUD |
| MedRep Dashboard | ✅ WORKING | Full assignment CRUD, VIP Client mapping |
| Reports Page | ✅ WORKING | BDM Visit Report, Excel/CSV export |
| Messaging System | ✅ WORKING | Admin→BDM messaging with categories |
| BDM Inbox | ✅ WORKING | Message read/archive |
| Admin Statistics | ⚠️ SCAFFOLDED | Recharts UI built, uses mock data |
| Activity Monitor | ⚠️ SCAFFOLDED | UI built, uses mock data |
| Pending Approvals | ⚠️ SCAFFOLDED | UI built, uses mock data |
| GPS Verification | ⚠️ SCAFFOLDED | Demo page with mock coordinates |
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

### Phase D — Advanced
16. **Change 15**: Admin per-BDM DCR Summary view
17. **Change 13**: Repurpose approvals for Excel import

---

## Test Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@vipcrm.com | Admin123!@# |
| MedRep | medrep@vipcrm.com | Medrep123!@# |
| BDM | juan@vipcrm.com | BDM123!@# |
| BDM | maria@vipcrm.com | BDM123!@# |
| BDM | pedro@vipcrm.com | BDM123!@# |
