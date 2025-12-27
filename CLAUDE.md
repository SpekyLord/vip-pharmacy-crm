# VIP Pharmacy CRM - Project Context

This file provides essential context for AI assistants working on this project. Read this before making any implementation decisions.

---

## Project Overview

**VIP Pharmacy CRM** is a pharmaceutical field sales management system designed for medical representatives to track doctor visits, manage product assignments, and ensure compliance with visit schedules.

---

## Business Rules (MUST Follow)

### 1. Visit Frequency Rules
- **Weekly Limit**: Maximum ONE visit per doctor per week (Monday-Friday only)
- **Monthly Quota**: Based on doctor's `visitFrequency` setting:
  - `2` = Maximum 2 visits per month
  - `4` = Maximum 4 visits per month
- **Enforcement**: These are HARD LIMITS - the system must BLOCK excess visits, not just warn
- **Week Definition**: Calendar weeks, work days only (Monday = Day 1, Friday = Day 5)

### 2. Role Hierarchy
| Role | Description | Access |
|------|-------------|--------|
| `admin` | System administrator | Full access to all regions, users, and data |
| `medrep` | Medical representative manager | Manages product-to-doctor assignments |
| `employee` | Field sales representative | Logs visits, sees only assigned region's doctors |

**Important**: There is NO "manager" role. Admin handles management functions.

### 3. Visit Proof Requirements
Every visit MUST include:
- GPS coordinates (latitude, longitude, accuracy)
- At least ONE photo as proof
- Visit date (must be a work day)

### 4. Region-Based Access
- Employees can ONLY see doctors in their assigned regions
- Employees can ONLY log visits for doctors they are assigned to
- Admins can see and access ALL regions

### 5. Doctor Categorization
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
{ doctor: 1, user: 1, yearWeekKey: 1 } // unique: true
```

---

## What's IN Scope (Phase 1)

- User authentication (register, login, password reset)
- Doctor management (CRUD, region assignment)
- Visit logging with GPS + photo proof
- Weekly/monthly visit enforcement
- Product catalog management
- Product-to-doctor assignments
- Compliance reporting and alerts
- Admin dashboard with all-region access
- Employee dashboard with assigned-region access

---

## What's OUT of Scope

| Feature | Status | Notes |
|---------|--------|-------|
| Mobile native apps | Not planned | Web-only, mobile-responsive |
| Offline mode | Phase 3 | Service workers, IndexedDB |
| Email notifications | Phase 2 | SES integration |
| Push notifications | Phase 2 | Web push API |
| Doctor A/B/C/D categories | Deprecated | Use visitFrequency instead |
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
  "message": "Weekly visit limit reached for this doctor",
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

1. [ ] Does it align with the three roles (admin, medrep, employee)?
2. [ ] Does it respect region-based access control?
3. [ ] Does it enforce weekly/monthly visit limits?
4. [ ] Does it use AWS S3 for file storage (not Cloudinary)?
5. [ ] Is it within Phase 1 scope?

If any answer is NO, clarify with the user before proceeding.

---

## Common Gotchas

1. **Week numbers**: Use ISO week numbers (1-53), not simple division
2. **Work days only**: Visits can only be logged Monday-Friday
3. **Unique constraint**: The yearWeekKey prevents same user visiting same doctor twice in one week
4. **Region filtering**: Always apply region filter for employee queries
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
S3_BUCKET_NAME=vip-pharmacy-crm
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
- [x] `models/User.js` - Admin, medrep, employee roles
- [x] `models/Doctor.js` - visitFrequency (2/4), region-based
- [x] `models/Visit.js` - Weekly tracking, GPS, photos, unique constraint
- [x] `models/Product.js` - Product catalog with specializations
- [x] `models/ProductAssignment.js` - Product-to-doctor assignments
- [x] `models/Region.js` - Hierarchical regions
- [x] `models/WebsiteProduct.js` - Read-only website products

#### Middleware (5/5 Complete & Working)
- [x] `middleware/auth.js` - JWT protect, optionalAuth, verifyRefreshToken
- [x] `middleware/roleCheck.js` - adminOnly, medRepOnly, employeeOnly, etc.
- [x] `middleware/errorHandler.js` - Global error handling, custom errors
- [x] `middleware/validation.js` - Express-validator rules
- [x] `middleware/upload.js` - Multer + S3 processors

#### Controllers (7/7 Complete & Tested)
- [x] `controllers/authController.js` - Login, register, password reset
- [x] `controllers/userController.js` - User CRUD, profile management
- [x] `controllers/doctorController.js` - Doctor CRUD with region filter
- [x] `controllers/visitController.js` - Visit logging with enforcement
- [x] `controllers/productController.js` - Product CRUD (reads from website DB)
- [x] `controllers/productAssignmentController.js` - Assignments
- [x] `controllers/regionController.js` - Region hierarchy

#### Routes (7/7 Complete & Tested)
- [x] `routes/authRoutes.js` → `/api/auth`
- [x] `routes/userRoutes.js` → `/api/users`
- [x] `routes/doctorRoutes.js` → `/api/doctors`
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

### Frontend Status: IN PROGRESS (Tasks 1.5-1.14 Complete, Task 1.13 Complete)

#### Core Setup
- [x] `package.json` - Dependencies configured
- [x] `vite.config.js` - Vite configuration
- [x] `App.jsx` - Route structure defined
- [x] `main.jsx` - Entry point
- [ ] `index.css` - Global styles (needs completion)

#### Services Layer
- [x] `services/api.js` - Axios instance with interceptors
- [x] `services/authService.js` - Login, logout, refresh, profile
- [x] `services/doctorService.js` - Doctor API calls + getAssignedProducts
- [x] `services/visitService.js` - Visit API calls + getToday, canVisit, getWeeklyCompliance
- [ ] `services/productService.js` - Product API calls
- [ ] `services/regionService.js` - Region API calls

#### Context & Hooks
- [x] `context/AuthContext.jsx` - Auth state, token management (WORKING)
- [x] `hooks/useAuth.js` - Auth hook
- [x] `hooks/useApi.js` - API hook with loading/error states

#### Components - Auth
- [x] `components/auth/LoginForm.jsx` - Email/password form (WORKING)
- [x] `components/auth/ProtectedRoute.jsx` - Role-based route protection (WORKING)

#### Components - Common
- [x] `components/common/Navbar.jsx` - Scaffolded
- [x] `components/common/Sidebar.jsx` - Scaffolded
- [x] `components/common/LoadingSpinner.jsx` - Working
- [x] `components/common/ErrorMessage.jsx` - Working

#### Components - Employee
- [x] `components/employee/DoctorList.jsx` - COMPLETE (visitFrequency filter, visit status, Log Visit button)
- [x] `components/employee/VisitLogger.jsx` - COMPLETE (FormData upload, GPS, products discussed)
- [x] `components/employee/CameraCapture.jsx` - COMPLETE (GPS watchPosition, accuracy badges, photo preview)
- [x] `components/employee/ProductRecommendations.jsx` - COMPLETE (assigned products display, detail modal)

#### Components - Admin
- [x] `components/admin/Dashboard.jsx` - COMPLETE (stats display, activity feed)
- [x] `components/admin/DoctorManagement.jsx` - COMPLETE (full CRUD, cascading region dropdowns)
- [x] `components/admin/EmployeeManagement.jsx` - COMPLETE (CRUD, multi-region assignment)
- [x] `components/admin/RegionManagement.jsx` - COMPLETE (tree view, stats modal)
- [x] `components/admin/ProductManagement.jsx` - COMPLETE
- [ ] `components/admin/VisitApproval.jsx` - Scaffolded (Phase 2)

#### Components - MedRep
- [x] `components/medrep/ProductAssignment.jsx` - COMPLETE (assignment cards, filtering, view/edit/deactivate)
- [x] `components/medrep/DoctorProductMapping.jsx` - COMPLETE (doctor selection, product assignment, priority)

#### Pages
- [x] `pages/LoginPage.jsx` - COMPLETE (role-based redirect)
- [x] `pages/admin/AdminDashboard.jsx` - COMPLETE (real API data, stats)
- [x] `pages/admin/DoctorsPage.jsx` - COMPLETE (CRUD, filters, pagination)
- [x] `pages/admin/EmployeesPage.jsx` - COMPLETE (CRUD, filters, pagination)
- [x] `pages/admin/RegionsPage.jsx` - COMPLETE (hierarchy tree, CRUD)
- [ ] `pages/admin/ReportsPage.jsx` - Scaffolded (UI only, Phase 2)
- [x] `pages/employee/EmployeeDashboard.jsx` - COMPLETE (real API data, stats)
- [x] `pages/employee/MyVisits.jsx` - COMPLETE (filters, pagination, photo gallery)
- [x] `pages/employee/NewVisitPage.jsx` - COMPLETE (canVisit check, VisitLogger)
- [x] `pages/medrep/MedRepDashboard.jsx` - COMPLETE (stats, tabs, assignment CRUD, modals)

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

### Frontend Dependencies (Planned)
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
| Employee Dashboard | ✅ WORKING | Real API data, doctor list |
| Visit Logger | ✅ WORKING | Photo + GPS capture, FormData upload |
| My Visits History | ✅ WORKING | Filters, pagination, photo gallery |
| Admin Dashboard | ✅ WORKING | Real API data, stats |
| Doctor Management | ✅ WORKING | Full CRUD, cascading regions |
| Employee Management | ✅ WORKING | Full CRUD, multi-region assignment |
| Region Management | ✅ WORKING | Tree view, hierarchy CRUD |
| MedRep Dashboard | ✅ WORKING | Full assignment CRUD, doctor mapping |

---

## Completed Tasks

1. ✅ **Task 1.1** - MongoDB Atlas setup & connection
2. ✅ **Task 1.2** - AWS S3 bucket configuration
3. ✅ **Task 1.3** - Seed data script (12 regions, 5 users, 56 doctors)
4. ✅ **Task 1.4** - Backend API testing (all endpoints verified)
5. ✅ **Task 1.5** - Authentication flow (login, logout, token refresh)
6. ✅ **Task 1.6** - Employee Dashboard & Doctor List (visitFrequency filter)
7. ✅ **Task 1.7** - Visit Logger with Photo & GPS capture
8. ✅ **Task 1.8** - My Visits history page (filters, pagination, photo gallery)
9. ✅ **Task 1.9** - Admin Dashboard (real API data, stats)
10. ✅ **Task 1.10** - Doctor Management (full CRUD, cascading regions)
11. ✅ **Task 1.10b** - Cascading Region Dropdown Fix
12. ✅ **Task 1.11** - Employee Management (CRUD, multi-region assignment)
13. ✅ **Task 1.12** - Region Management (tree view, hierarchy CRUD)
14. ✅ **Task 1.12b** - Cascading Region Assignment Fix (parentRegions field)
15. ✅ **Task 1.14** - Product Recommendations in Visit Interface
16. ✅ **Task 1.13** - MedRep Dashboard & Product Assignment (full CRUD, doctor mapping)

## Next Steps Priority

1. **Task 1.15** - Complete CSS styling (mobile responsive)
2. **Task 1.16** - Development Environment Documentation (.env.example files)
3. **Task 1.17** - Deploy to AWS Lightsail (provision instance, deploy app)

---

## Test Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@vippharmacy.com | Admin123!@# |
| MedRep | medrep@vippharmacy.com | Medrep123!@# |
| Employee | juan@vippharmacy.com | Employee123!@# |
| Employee | maria@vippharmacy.com | Employee123!@# |
| Employee | pedro@vippharmacy.com | Employee123!@# |
