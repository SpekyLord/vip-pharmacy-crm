# VIP CRM - Project Context

This file provides essential context for AI assistants working on this project. Read this before making any implementation decisions.

---

## Project Overview

**VIP CRM** is a pharmaceutical field sales management system designed for Business Development Managers (BDM) to track VIP Client visits, manage product assignments, and ensure compliance with visit schedules.

---

## Business Rules (MUST Follow)

### 1. Visit Frequency Rules
- **Weekly Limit**: Maximum ONE visit per VIP Client per week (Monday-Friday only)
- **Monthly Quota**: Based on VIP Client's `visitFrequency` setting:
  - `2` = Maximum 2 visits per month
  - `4` = Maximum 4 visits per month
- **Enforcement**: These are HARD LIMITS - the system must BLOCK excess visits, not just warn
- **Week Definition**: Calendar weeks, work days only (Monday = Day 1, Friday = Day 5)

### 2. Role Hierarchy
| Role | Description | Access |
|------|-------------|--------|
| `admin` | System administrator | Full access to all regions, users, and data |
| `medrep` | Medical representative manager | Manages product-to-VIP Client assignments |
| `bdm` | Business Development Manager (BDM) | Logs visits, sees only assigned region's VIP Clients |

**Important**: There is NO "manager" role. Admin handles management functions.

### 3. Visit Proof Requirements
Every visit MUST include:
- GPS coordinates (latitude, longitude, accuracy)
- At least ONE photo as proof
- Visit date (must be a work day)

### 4. Region-Based Access
- BDMs can ONLY see VIP Clients in their assigned regions
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
| **Database** | MongoDB Atlas | Cloud-hosted |
| **Hosting** | AWS Lightsail | NOT a VPS provider |
| **Image Storage** | AWS S3 | NOT Cloudinary |
| **Authentication** | JWT | Access (15min) + Refresh (7d) tokens |

### AWS Configuration
- Default Region: `ap-southeast-1` (configurable via env)
- S3 Bucket Structure:
  - `visits/` - Visit proof photos
  - `products/` - Product images
  - `avatars/` - User profile pictures

---

## Database Schema Key Points

### Visit Model - Weekly Tracking Fields
```javascript
{
  weekNumber: Number,      // 1-53 (ISO week number)
  weekOfMonth: Number,     // 1-5 (week within month)
  dayOfWeek: Number,       // 1-5 (Mon-Fri only)
  weekLabel: String,       // "W2D3" format
  monthYear: String,       // "2024-01" format
  yearWeekKey: String      // "2024-W52" format (for unique constraint)
}
```

### Unique Constraint for Visit Enforcement
```javascript
// Compound unique index prevents duplicate visits
{ vipClient: 1, user: 1, yearWeekKey: 1 } // unique: true
```

---

## What's IN Scope (Phase 1)

- User authentication (register, login, password reset)
- VIP Client management (CRUD, region assignment)
- Visit logging with GPS + photo proof
- Weekly/monthly visit enforcement
- Product catalog management
- Product-to-VIP Client assignments
- Compliance reporting and alerts
- Admin dashboard with all-region access
- BDM dashboard with assigned-region access

---

## What's OUT of Scope

| Feature | Status | Notes |
|---------|--------|-------|
| Mobile native apps | Not planned | Web-only, mobile-responsive |
| Offline mode | Phase 3 | Service workers, IndexedDB |
| Email notifications | Phase 2 | SES integration |
| Push notifications | Phase 2 | Web push API |
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
vip-crm/
├── backend/
│   ├── config/          # Database and S3 configuration
│   ├── controllers/     # Route handlers
│   ├── middleware/      # Auth, validation, uploads
│   ├── models/          # Mongoose schemas
│   ├── routes/          # Express routes
│   ├── utils/           # Helper functions
│   └── server.js        # Entry point
├── frontend/
│   ├── src/
│   │   ├── components/  # React components
│   │   ├── contexts/    # Auth context
│   │   ├── pages/       # Page components
│   │   ├── services/    # API calls
│   │   └── App.jsx      # Root component
│   └── vite.config.js
├── docs/                # Documentation
└── CLAUDE.md            # This file
```

---

## Decision Checklist

Before implementing a feature, verify:

1. [ ] Does it align with the three roles (admin, medrep, bdm)?
2. [ ] Does it respect region-based access control?
3. [ ] Does it enforce weekly/monthly visit limits?
4. [ ] Does it use AWS S3 for file storage (not Cloudinary)?
5. [ ] Is it within Phase 1 scope?

If any answer is NO, clarify with the user before proceeding.

---

## Common Gotchas

1. **Week numbers**: Use ISO week numbers (1-53), not simple division
2. **Work days only**: Visits can only be logged Monday-Friday
3. **Unique constraint**: The yearWeekKey prevents same user visiting same VIP Client twice in one week
4. **Region filtering**: Always apply region filter for BDM queries
5. **Photo requirement**: Visits without photos should be rejected

---

## Environment Variables Reference

```bash
# Server
NODE_ENV=development
PORT=5000

# Database
MONGODB_URI=mongodb+srv://...

# JWT
JWT_SECRET=your-secret
JWT_EXPIRE=15m
JWT_REFRESH_SECRET=your-refresh-secret
JWT_REFRESH_EXPIRE=7d

# AWS
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=ap-southeast-1
S3_BUCKET_NAME=vip-crm
```

---

## Implementation Progress Checklist

### Backend Status: ✅ FULLY FUNCTIONAL

#### Infrastructure
- [x] MongoDB Atlas - Connected (cluster0.wv27nfk.mongodb.net)
- [x] AWS S3 - Bucket `vip-pharmacy-crm-devs` configured (ap-southeast-1)
- [ ] AWS Lightsail - Instance not provisioned

#### Config Files
- [x] `config/db.js` - MongoDB connection (WORKING)
- [x] `config/s3.js` - AWS S3 integration (WORKING)
- [x] `config/websiteDb.js` - Dual DB connection for website products

#### Models (7/7 Complete & Tested)
- [x] `models/User.js` - Admin, medrep, bdm roles
- [x] `models/VIPClient.js` - visitFrequency (2/4), region-based
- [x] `models/Visit.js` - Weekly tracking, GPS, photos, unique constraint
- [x] `models/Product.js` - Product catalog with specializations
- [x] `models/ProductAssignment.js` - Product-to-VIP Client assignments
- [x] `models/Region.js` - Hierarchical regions
- [x] `models/WebsiteProduct.js` - Read-only website products

#### Middleware (5/5 Complete & Working)
- [x] `middleware/auth.js` - JWT protect, optionalAuth, verifyRefreshToken
- [x] `middleware/roleCheck.js` - adminOnly, medRepOnly, bdmOnly, etc.
- [x] `middleware/errorHandler.js` - Global error handling, custom errors
- [x] `middleware/validation.js` - Express-validator rules
- [x] `middleware/upload.js` - Multer + S3 processors

#### Controllers (7/7 Complete & Tested)
- [x] `controllers/authController.js` - Login, register, password reset
- [x] `controllers/userController.js` - User CRUD, profile management
- [x] `controllers/vipClientController.js` - VIP Client CRUD with region filter
- [x] `controllers/visitController.js` - Visit logging with enforcement
- [x] `controllers/productController.js` - Product CRUD (reads from website DB)
- [x] `controllers/productAssignmentController.js` - Assignments
- [x] `controllers/regionController.js` - Region hierarchy

#### Routes (7/7 Complete & Tested)
- [x] `routes/authRoutes.js` → `/api/auth`
- [x] `routes/userRoutes.js` → `/api/users`
- [x] `routes/vipClientRoutes.js` → `/api/vip-clients`
- [x] `routes/visitRoutes.js` → `/api/visits`
- [x] `routes/productRoutes.js` → `/api/products`
- [x] `routes/productAssignmentRoutes.js` → `/api/assignments`
- [x] `routes/regionRoutes.js` → `/api/regions`

#### Utils (2/2 Complete)
- [x] `utils/generateToken.js` - JWT access + refresh tokens
- [x] `utils/validateWeeklyVisit.js` - Visit limit enforcement

#### Scripts
- [x] `scripts/seedData.js` - Seed data for testing (npm run seed)

#### Entry Point
- [x] `server.js` - Express app, all routes mounted, health check

---

### Frontend Status: ✅ PHASE 1 COMPLETE (All Tasks + Optimization)

#### Core Setup
- [x] `package.json` - Dependencies configured
- [x] `vite.config.js` - Vite configuration
- [x] `App.jsx` - Route structure defined
- [x] `main.jsx` - Entry point
- [ ] `index.css` - Global styles (needs completion)

#### Services Layer
- [x] `services/api.js` - Axios instance with interceptors, auth:logout event dispatch
- [x] `services/authService.js` - Login, logout, refresh, profile
- [x] `services/vipClientService.js` - VIP Client API calls + getAssignedProducts
- [x] `services/visitService.js` - Visit API calls + getToday, canVisit, getWeeklyCompliance, getBDMReport, AbortController support
- [x] `services/productService.js` - Product API calls
- [x] `services/regionService.js` - Region API calls
- [x] `services/assignmentService.js` - Product assignment API calls
- [x] `services/userService.js` - User CRUD API calls

#### Context & Hooks
- [x] `context/AuthContext.jsx` - Auth state, token management, auth:logout event listener
- [x] `hooks/useAuth.js` - Auth hook
- [x] `hooks/useApi.js` - API hook with loading/error states
- [x] `hooks/useDebounce.js` - Debounce hook for search inputs (300ms default)

#### Components - Auth
- [x] `components/auth/LoginForm.jsx` - Email/password form (WORKING)
- [x] `components/auth/ProtectedRoute.jsx` - Role-based route protection, redirects to role dashboard

#### Components - Common
- [x] `components/common/Navbar.jsx` - User info and logout
- [x] `components/common/Sidebar.jsx` - Role-based navigation
- [x] `components/common/LoadingSpinner.jsx` - Loading states
- [x] `components/common/ErrorMessage.jsx` - Error display with retry
- [x] `components/common/ErrorBoundary.jsx` - Catches React errors, shows fallback UI
- [x] `components/common/Pagination.jsx` - Shared pagination with React.memo

#### Components - BDM
- [x] `components/bdm/VIPClientList.jsx` - COMPLETE (React.memo, useMemo, visit status, Log Visit)
- [x] `components/bdm/VisitLogger.jsx` - COMPLETE (FormData upload, GPS, products discussed)
- [x] `components/bdm/CameraCapture.jsx` - COMPLETE (GPS watchPosition, 5-min timeout, accuracy badges)
- [x] `components/bdm/ProductRecommendations.jsx` - COMPLETE (assigned products display, detail modal)

#### Components - Admin
- [x] `components/admin/Dashboard.jsx` - COMPLETE (stats display, activity feed)
- [x] `components/admin/VIPClientManagement.jsx` - COMPLETE (full CRUD, cascading region dropdowns)
- [x] `components/admin/BDMManagement.jsx` - COMPLETE (CRUD, multi-region assignment)
- [x] `components/admin/RegionManagement.jsx` - COMPLETE (tree view, stats modal)
- [x] `components/admin/ProductManagement.jsx` - COMPLETE
- [x] `components/admin/BDMVisitReport.jsx` - COMPLETE (Call Plan Template format, visit grid)
- [ ] `components/admin/VisitApproval.jsx` - Scaffolded (Phase 2)

#### Components - MedRep
- [x] `components/medrep/ProductAssignment.jsx` - COMPLETE (assignment cards, filtering, view/edit/deactivate)
- [x] `components/medrep/VIPClientProductMapping.jsx` - COMPLETE (VIP Client selection, product assignment, priority)

#### Pages
- [x] `pages/LoginPage.jsx` - COMPLETE (role-based redirect)
- [x] `pages/admin/AdminDashboard.jsx` - COMPLETE (optimized API calls with limit:0)
- [x] `pages/admin/VIPClientsPage.jsx` - COMPLETE (useCallback, CRUD, filters, pagination)
- [x] `pages/admin/BDMsPage.jsx` - COMPLETE (CRUD, filters, pagination)
- [x] `pages/admin/RegionsPage.jsx` - COMPLETE (hierarchy tree, CRUD)
- [x] `pages/admin/ReportsPage.jsx` - COMPLETE (BDM Visit Report, Call Plan Template format, Excel/CSV export)
- [x] `pages/bdm/BDMDashboard.jsx` - COMPLETE (real API data, stats)
- [x] `pages/bdm/MyVisits.jsx` - COMPLETE (AbortController, debounced search, pagination)
- [x] `pages/bdm/NewVisitPage.jsx` - COMPLETE (isMounted cleanup, canVisit check)
- [x] `pages/medrep/MedRepDashboard.jsx` - COMPLETE (react-hot-toast, assignment CRUD)

---

## File Connection Map

### Backend Dependencies
```
server.js
├── config/db.js (MongoDB connection)
├── middleware/errorHandler.js (notFound, errorHandler)
└── routes/*.js
    ├── controllers/*.js
    │   ├── models/*.js
    │   └── middleware/errorHandler.js (catchAsync, errors)
    ├── middleware/auth.js (protect)
    ├── middleware/roleCheck.js (adminOnly, etc.)
    ├── middleware/validation.js (validators)
    └── middleware/upload.js (multer + S3)

config/s3.js
└── Used by: middleware/upload.js, controllers (delete operations)

utils/generateToken.js
└── Used by: controllers/authController.js

utils/validateWeeklyVisit.js
└── Used by: controllers/visitController.js
```

### Frontend Dependencies
```
App.jsx
├── contexts/AuthContext.jsx
├── components/auth/ProtectedRoute.jsx
└── pages/*.jsx
    ├── components/*.jsx
    └── services/*.js
        └── services/api.js (base axios instance)
```

---

## Quick Reference: Current Status

| Feature | Status | Notes |
|---------|--------|-------|
| Backend Code | ✅ WORKING | All APIs tested with Postman |
| MongoDB Atlas | ✅ CONNECTED | cluster0.wv27nfk.mongodb.net |
| AWS S3 | ✅ CONFIGURED | vip-pharmacy-crm-devs (ap-southeast-1) |
| AWS Lightsail | NOT PROVISIONED | Need to set up instance |
| Frontend Auth | ✅ WORKING | Login, logout, token refresh |
| BDM Dashboard | ✅ WORKING | Real API data, VIP Client list |
| Visit Logger | ✅ WORKING | Photo + GPS capture, FormData upload |
| My Visits History | ✅ WORKING | Filters, pagination, photo gallery |
| Admin Dashboard | ✅ WORKING | Real API data, stats |
| VIP Client Management | ✅ WORKING | Full CRUD, cascading regions |
| BDM Management | ✅ WORKING | Full CRUD, multi-region assignment |
| Region Management | ✅ WORKING | Tree view, hierarchy CRUD |
| MedRep Dashboard | ✅ WORKING | Full assignment CRUD, VIP Client mapping |
| Reports Page | ✅ WORKING | BDM Visit Report, Excel/CSV export |

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
12. ✅ **Task 1.11** - BDM Management (CRUD, multi-region assignment)
13. ✅ **Task 1.12** - Region Management (tree view, hierarchy CRUD)
14. ✅ **Task 1.12b** - Cascading Region Assignment Fix (parentRegions field)
15. ✅ **Task 1.14** - Product Recommendations in Visit Interface
16. ✅ **Task 1.13** - MedRep Dashboard & Product Assignment (full CRUD, VIP Client mapping)
17. ✅ **Backend Optimization** - Pre-deployment code review and optimization (Dec 2024)
18. ✅ **Frontend Optimization** - ErrorBoundary, useDebounce, Pagination, AbortController, React.memo (Dec 2024)
19. ✅ **Task 1.16** - Development Environment Documentation (DEVELOPMENT_GUIDE.md, .env.example files)
20. ✅ **Task 1.14c** - Cross-Database Product Population Fix (Dec 2024)
21. ✅ **Task 1.10c** - VIP Client Export to Excel/CSV (Call Plan Template format)
22. ✅ **BDM Visit Report** - Reports page with BDM selector, month picker, actual visit data, Excel/CSV export (Dec 2024)
23. ✅ **Visit Week Calculation Fix** - Fixed weekOfMonth calculation and 5th week handling (Dec 2024)

## Cross-Database Product Fix (Completed Dec 2024)

### Problem
Products are stored in a separate website database (`vip-pharmacy`), but the CRM uses Mongoose `populate()` which only works within the same database connection. This caused `MissingSchemaError: Schema hasn't been registered for model "Product"` errors.

### Solution
Replace Mongoose populate with manual product fetching using `getWebsiteProductModel()`:

```javascript
// Pattern used in visitController.js and vipClientController.js:
const { getWebsiteProductModel } = require('../models/WebsiteProduct');

// 1. Get documents without product population
const visits = await Visit.find(query).populate('vipClient', 'name');

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

### Files Modified
| File | Function | Change |
|------|----------|--------|
| `visitController.js` | `getMyVisits` | Manual product population for visit history |
| `visitController.js` | `getVisitById` | Manual product population for single visit |
| `visitController.js` | `getWeeklyCompliance` | Default to current user when no userId param |
| `vipClientController.js` | `getVIPClientById` | Manual product population for assigned products |
| `vipClientController.js` | `getVIPClientProducts` | Manual product population for VIP Client's products |

## Visit Week Calculation Fix (Completed Dec 2024)

### Problem
BDM Visit Report showed visits in Excel export totals (SUM OF column) but not in the correct week/day cells in the grid. Root cause: inconsistent `getWeekOfMonth` formulas and months with more than 4 calendar weeks.

### Solution
1. **Aligned `getWeekOfMonth` formula** in `validateWeeklyVisit.js` to match `Visit.js` (ISO week standard)
2. **Added 5th week → next month logic** in Visit.js pre-save hook:
   - If `weekOfMonth > 4`, visit counts towards NEXT month's report as Week 1
   - Grid supports 20 days (4 weeks × 5 days)
3. **Created migration script** `backend/scripts/fixVisitWeeks.js` to fix existing visits

### Files Modified
| File | Change |
|------|--------|
| `backend/utils/validateWeeklyVisit.js` | Aligned `getWeekOfMonth` formula with Visit.js |
| `backend/models/Visit.js` | Added 5th week → next month logic in pre-save hook |
| `backend/scripts/fixVisitWeeks.js` | NEW: Migration script for existing data |

### Business Rule
- **Week 1-4 visits**: Stay in current month
- **Week 5+ visits**: Count towards NEXT month's Week 1
- Example: Dec 30, 2024 (week 6) → January 2025 Week 1

---

## Backend Optimization Summary (Completed Dec 2024)

### Critical Fixes
- ✅ Fixed ISO 8601 week calculation in Visit.js (handles year boundaries correctly)
- ✅ Fixed canAccessAllRegions default logic bug in User.js
- ✅ Added rate limiting to all API endpoints (express-rate-limit)
- ✅ Fixed CORS origin bypass vulnerability (requires Origin header in production)

### Performance Optimizations
- ✅ Optimized Region.getDescendantIds() - single query + in-memory traversal (was N+1)
- ✅ Added canVisitVIPClientsBatch() - 3 queries instead of N+1 for batch checks
- ✅ Added compound indexes to User, VIPClient, Region, Product, Visit models
- ✅ Added TTL index for password reset token auto-expiration

### Security Enhancements
- ✅ Added HSTS headers via helmet configuration
- ✅ Added request timeout middleware (30 seconds)
- ✅ Added stricter auth rate limiting (20 requests/15 min)
- ✅ Added array bounds validation (max 100 products in bulk assign)
- ✅ Added photos array limit (1-10 per visit)

### Code Quality
- ✅ Created controllerHelpers.js utility functions for code deduplication
- ✅ Added cascade delete hooks to VIPClient and Product models
- ✅ Improved email validation regex (handles modern TLDs)
- ✅ Removed console.log statements from production code

## Frontend Optimization Summary (Completed Dec 2024)

### Critical Fixes
- ✅ Created ErrorBoundary component (`components/common/ErrorBoundary.jsx`)
- ✅ Fixed ProtectedRoute unauthorized redirect (redirects to role dashboard)
- ✅ Fixed API interceptor logout flow (dispatches CustomEvent instead of redirect)
- ✅ Removed console.log statements from ReportsPage
- ✅ Added request cancellation (AbortController) to MyVisits
- ✅ Added GPS timeout (5 minutes) to CameraCapture

### Performance Optimizations
- ✅ Created useDebounce hook (`hooks/useDebounce.js`)
- ✅ Created shared Pagination component with React.memo
- ✅ Added React.memo to VIPClientList
- ✅ Added useMemo for filtered lists in VIPClientList
- ✅ Fixed AdminDashboard API calls (limit: 0 for count queries)

### Code Quality
- ✅ Fixed useEffect dependencies in VIPClientsPage (useCallback)
- ✅ Fixed useEffect cleanup in NewVisitPage (isMounted pattern)
- ✅ Replaced custom toast with react-hot-toast in MedRepDashboard
- ✅ Updated visitService.getMy to support AbortController signal

### New Files Created
| File | Purpose |
|------|---------|
| `frontend/src/components/common/ErrorBoundary.jsx` | Catches React errors, shows fallback UI |
| `frontend/src/components/common/Pagination.jsx` | Shared pagination with React.memo |
| `frontend/src/hooks/useDebounce.js` | Debounces values (search input, 300ms default) |

### Files Modified
| File | Changes |
|------|---------|
| `App.jsx` | Wrapped routes with ErrorBoundary |
| `ProtectedRoute.jsx` | Redirect to role dashboard instead of showing error |
| `api.js` | Dispatch auth:logout event instead of redirect |
| `AuthContext.jsx` | Listen for auth:logout events |
| `ReportsPage.jsx` | Removed console.log statements |
| `MyVisits.jsx` | Added AbortController, debounced search |
| `visitService.js` | Added signal support to getMy() |
| `CameraCapture.jsx` | Added 5-minute GPS timeout |
| `VIPClientsPage.jsx` | useCallback for fetchVIPClients |
| `NewVisitPage.jsx` | isMounted pattern for async cleanup |
| `MedRepDashboard.jsx` | Use react-hot-toast |
| `AdminDashboard.jsx` | Changed limit:1 to limit:0 |
| `VIPClientList.jsx` | React.memo, useMemo for filtered list |

## Security Hardening (Completed Dec 2024)

### Critical Security Fixes
- ✅ **Token Storage (SEC-001)**: Removed localStorage token storage, now using httpOnly cookies only
  - Frontend no longer stores or accesses tokens directly
  - Cookies sent automatically with `withCredentials: true`
  - Protects against XSS attacks stealing tokens
- ✅ **Visit Race Condition (SEC-002)**: Added duplicate key error handling in visitController
  - Prevents duplicate visits when two requests arrive simultaneously
  - Returns user-friendly error message
- ✅ **Account Lockout (SEC-003)**: Implemented brute force protection
  - 5 failed login attempts = 15 minute account lockout
  - Added `failedLoginAttempts` and `lockoutUntil` fields to User model
  - Shows remaining attempts and lockout time to user

### Security Enhancements
- ✅ **JWT Secret Validation (SEC-006)**: Server startup validates JWT secrets are 32+ characters
- ✅ **CORS Validation (SEC-009)**: Production requires CORS_ORIGINS environment variable
- ✅ **Password Complexity (SEC-004)**: Enhanced password requirements
  - Minimum 8 characters
  - Must contain uppercase, lowercase, number, and special character (@$!%*?&)
- ✅ **S3 URL Expiry (SEC-007)**: Reduced signed URL expiry from 24 hours to 1 hour
- ✅ **Token Response Cleanup (SEC-008)**: Tokens no longer returned in JSON response body
- ✅ **Email Validation (SEC-010)**: Updated regex to support modern TLDs

### Audit Logging (SEC-005)
Security events are now logged to MongoDB `auditlogs` collection:
- `LOGIN_SUCCESS` / `LOGIN_FAILURE` - With IP address and user agent
- `LOGOUT` - When user logs out
- `PASSWORD_CHANGE` - When user changes password
- `PASSWORD_RESET_REQUEST` / `PASSWORD_RESET_COMPLETE` - Password reset flow
- `ACCOUNT_LOCKED` - After 5 failed login attempts

**Configuration:**
- Logs auto-expire after 90 days (TTL index)
- Query example: `db.auditlogs.find({ action: 'LOGIN_FAILURE', timestamp: { $gte: new Date(Date.now() - 24*60*60*1000) }})`

### New Files Created
| File | Purpose |
|------|---------|
| `backend/models/AuditLog.js` | Audit log schema with TTL index |
| `backend/utils/auditLogger.js` | Utility functions for logging security events |

### Files Modified
| File | Changes |
|------|---------|
| `frontend/src/context/AuthContext.jsx` | Removed localStorage, cookie-based auth |
| `frontend/src/services/api.js` | Removed token injection, cookie-based refresh |
| `frontend/src/services/authService.js` | Updated for cookie-based auth |
| `backend/controllers/authController.js` | Added lockout logic, audit logging, removed tokens from response |
| `backend/controllers/visitController.js` | Added duplicate key error handling |
| `backend/models/User.js` | Added lockout fields, isLocked(), handleFailedLogin() methods |
| `backend/middleware/validation.js` | Enhanced password complexity validation |
| `backend/server.js` | Added JWT secret and CORS validation at startup |
| `backend/config/s3.js` | Reduced signed URL expiry to 1 hour |

---

## Next Steps Priority

1. **Task 1.15** - Complete CSS styling (mobile responsive)
2. **Task 1.17** - Deploy to AWS Lightsail (provision instance, deploy app)

---

## Test Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@vipcrm.com | Admin123!@# |
| MedRep | medrep@vipcrm.com | Medrep123!@# |
| BDM | juan@vipcrm.com | BDM123!@# |
| BDM | maria@vipcrm.com | BDM123!@# |
| BDM | pedro@vipcrm.com | BDM123!@# |
