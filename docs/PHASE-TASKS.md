# VIP Pharmacy CRM - Phase Task Breakdown for Team Assignment

## Project Overview
A pharmaceutical field sales CRM system to replace manual Excel tracking with automated visit management, compliance monitoring, and product intelligence.

---

# PHASE 1: Foundation & Core System
**Goal**: Complete working system with authentication, doctor management, visit logging, and basic dashboards

## Backend Tasks

### Task 1.1: Database Connection Setup
**Assignee**: Backend Developer
**Priority**: CRITICAL (blocks all other backend work)
**Files**: `backend/config/db.js`

**Deliverables**:
- [x] Implement MongoDB Atlas connection in `db.js` (currently empty skeleton)
- [x] Add connection pooling configuration
- [x] Add connection event handlers (connected, error, disconnected)
- [x] Add graceful shutdown handling
- [x] Create MongoDB Atlas cluster (M0 free tier for dev)
- [x] Generate connection string and add to `.env`
- [x] Test connection with `npm run dev`

**Acceptance Criteria**:
- [x] Server starts without errors
- [x] Console shows "MongoDB Connected: [cluster-name]"
- [x] Handles connection failures gracefully

**Status**: ✅ COMPLETED

---

### Task 1.2: AWS S3 Bucket Configuration
**Assignee**: Backend Developer / DevOps
**Priority**: HIGH (blocks photo uploads)
**Files**: `backend/config/s3.js` (code ready), AWS Console

**Deliverables**:
- [x] Create S3 bucket: `vip-pharmacy-crm-devs`
- [x] Configure bucket CORS for frontend domain
- [x] Create IAM user with minimal S3 permissions
- [x] Generate access keys
- [x] Add credentials to `.env`:
  - AWS_ACCESS_KEY_ID
  - AWS_SECRET_ACCESS_KEY
  - AWS_REGION=ap-southeast-1
  - S3_BUCKET_NAME
- [x] Create folder structure: `visits/`, `products/`, `avatars/` (auto-created on upload)
- [x] Test upload functionality

**Acceptance Criteria**:
- [x] Can upload test image via API
- [x] Images accessible via signed URLs
- [x] No public access to bucket

**Status**: ✅ COMPLETED

---

### Task 1.3: Seed Data & Initial Admin User
**Assignee**: Backend Developer
**Priority**: HIGH
**Files**: New file `backend/scripts/seedData.js`

**Deliverables**:
- [x] Create seed script for initial admin user
- [x] Create seed script for sample regions (based on "Whole Panay" example from proposal)
- [x] Create seed script for sample doctors (56 doctors across 3 districts)
- [x] Create seed script for sample products with images
- [x] Add `npm run seed` script to package.json
- [x] Document seed data structure

**Acceptance Criteria**:
- [x] Running `npm run seed` creates all initial data
- [x] Admin can login with seeded credentials
- [x] Sample data matches proposal requirements

**Status**: ✅ COMPLETED

**Seeded Data:**
- 12 regions (Panay Island hierarchy)
- 5 users (1 admin, 1 medrep, 3 employees)
- 5 products
- 56 doctors

**Login Credentials:**
- Admin: admin@vippharmacy.com / Admin123!@#
- MedRep: medrep@vippharmacy.com / Medrep123!@#
- Employees: juan/maria/pedro@vippharmacy.com / Employee123!@#

---

### Task 1.4: Backend API Testing & Validation
**Assignee**: Backend Developer / QA
**Priority**: HIGH
**Files**: `backend/tests/` (new directory)

**Deliverables**:
- [x] Test auth endpoints (register, login, logout, refresh)
- [x] Test doctor CRUD with region filtering
- [x] Test visit creation with weekly limit enforcement
- [x] Test product CRUD
- [x] Test product assignment
- [x] Test region hierarchy
- [x] Create Postman collection in `backend/postman/VIP-Pharmacy-CRM.postman_collection.json`
- [x] Document all API endpoints

**Acceptance Criteria**:
- [x] All API endpoints return expected responses
- [x] Weekly visit limit (1 per doctor per week) enforced via `/visits/can-visit/:doctorId`
- [x] Monthly visit limit (2x or 4x) enforced
- [x] Region filtering works for employees
- [x] Error responses follow standard format

**Status**: ✅ COMPLETED

**Tested Endpoints:**
- `POST /api/auth/login` - Login with JWT tokens
- `GET /api/auth/me` - Get current user profile
- `GET /api/doctors` - List doctors with pagination
- `GET /api/regions` - List all regions
- `GET /api/products` - List all products
- `GET /api/visits` - List visits (role-based)
- `GET /api/visits/can-visit/:doctorId` - Check visit limits
- `GET /api/health` - Health check

---

## Frontend Tasks

### Task 1.5: Authentication Flow Implementation
**Assignee**: Frontend Developer
**Priority**: CRITICAL (blocks all other frontend work)
**Files**:
- `frontend/src/context/AuthContext.jsx`
- `frontend/src/components/auth/LoginForm.jsx`
- `frontend/src/components/auth/ProtectedRoute.jsx`
- `frontend/src/pages/LoginPage.jsx`
- `frontend/src/services/authService.js`
- `frontend/src/services/api.js`
- `frontend/src/hooks/useAuth.js`
- `frontend/src/hooks/useApi.js`

**Deliverables**:
- [x] Complete LoginForm with email/password validation
- [x] Implement AuthContext with token management
- [x] Handle token refresh on 401 errors
- [x] Implement ProtectedRoute with role checking
- [x] Role-based redirect after login:
  - admin → /admin
  - medrep → /medrep
  - employee → /employee
- [x] Implement logout with token cleanup
- [ ] Add "Remember me" functionality (optional - deferred)

**Acceptance Criteria**:
- [x] User can login with valid credentials
- [x] Invalid credentials show error message
- [x] Token automatically refreshes before expiry
- [x] Unauthorized routes redirect to login
- [x] Role-based routes are protected

**Status**: ✅ COMPLETED

---

### Task 1.6: Employee Dashboard & Doctor List
**Assignee**: Frontend Developer
**Priority**: HIGH
**Files**:
- `frontend/src/pages/employee/EmployeeDashboard.jsx`
- `frontend/src/components/employee/DoctorList.jsx`
- `frontend/src/services/doctorService.js`
- `frontend/src/services/visitService.js`

**Deliverables**:
- [x] Fetch and display dashboard stats (today's visits, weekly progress, pending)
- [x] Display assigned regional doctors list
- [x] Implement doctor search by name/specialization
- [x] **FIX**: Replace deprecated A/B/C/D categories with visitFrequency (2/4)
- [x] Show visit status for each doctor (visited this week? this month?)
- [x] Add "Log Visit" button per doctor
- [x] Show weekly progress: "Week 1: 8/10 doctors visited"
- [x] Show monthly completion percentage

**Acceptance Criteria**:
- [x] Employee sees only doctors in their assigned region
- [x] Can search/filter doctors
- [x] Visit frequency shows 2x or 4x (not A/B/C/D)
- [x] Weekly and monthly progress displayed

**Status**: ✅ COMPLETED

**Implementation Details:**
- `visitService.js`: Added `getToday()`, `getMy()`, `canVisit()`, `getWeeklyCompliance()`
- `doctorService.js`: Added `getAssignedProducts()`
- `EmployeeDashboard.jsx`: Connected to real APIs, displays stats cards and compliance bar
- `DoctorList.jsx`: Replaced A/B/C/D with visitFrequency (2x/4x), added visit status per doctor, added Log Visit button with limit checking

---

### Task 1.7: Visit Logger Component with Photo & GPS
**Assignee**: Frontend Developer
**Priority**: HIGH
**Files**:
- `frontend/src/components/employee/VisitLogger.jsx`
- `frontend/src/components/employee/CameraCapture.jsx`
- `frontend/src/services/visitService.js`
- `frontend/src/pages/employee/NewVisitPage.jsx`
- `frontend/src/App.jsx`

**Deliverables**:
- [x] Implement visit logging form:
  - Visit type selector
  - Purpose/notes field
  - Products discussed (from recommendations)
  - Doctor feedback
  - Next visit date
- [x] Integrate CameraCapture component for photo proof
- [x] Require minimum 1 photo before submit
- [x] Capture GPS coordinates with each photo (not separately)
- [x] Show GPS accuracy indicator per photo
- [x] Validate work day (Monday-Friday only)
- [x] Check weekly limit before allowing submission (on page load)
- [x] Upload photos to S3 on submit (via FormData)
- [x] Show success/error feedback (toast messages)

**Acceptance Criteria**:
- [x] Cannot submit without photo
- [x] Cannot submit without GPS location
- [x] Cannot submit on weekends
- [x] Cannot submit if already visited this doctor this week
- [x] Photos upload to S3 successfully
- [x] Visit appears in history after creation

**Status**: ✅ COMPLETED

**Implementation Details:**
- `CameraCapture.jsx`: Captures GPS location with each photo, shows accuracy badge
- `VisitLogger.jsx`: Full form with photo integration, FormData submission
- `NewVisitPage.jsx`: Page wrapper that checks canVisit before rendering form
- `visitService.js`: Updated create() for multipart/form-data
- Route: `/employee/visit/new?doctorId=xxx`

---

### Task 1.8: My Visits History Page
**Assignee**: Frontend Developer
**Priority**: MEDIUM
**Files**:
- `frontend/src/pages/employee/MyVisits.jsx`
- `frontend/src/services/visitService.js`

**Deliverables**:
- [x] Fetch and display visit history
- [x] Filter by status (all/completed/pending/cancelled)
- [x] Filter by date range
- [x] Filter by doctor
- [x] Show visit details (date, doctor, photos, GPS, products)
- [x] Display week label (W1D2, W2D3 format)
- [x] Implement pagination
- [x] Show visit proof photos

**Acceptance Criteria**:
- [x] All visits displayed with correct details
- [x] Filters work correctly
- [x] Photos viewable
- [x] Week labels shown

**Status**: COMPLETED

**Implementation Details:**
- `MyVisits.jsx`: Full implementation with filters, pagination, and visit details modal
- Filters: Status dropdown, date range pickers, doctor search input
- Table shows: Date/time, week label (W1D2), doctor info, visit type, status, photo count
- Visit details modal shows: All visit info, doctor details, GPS with Google Maps link, photo gallery
- Full image modal for viewing photos
- Responsive design for mobile

---

### Task 1.9: Admin Dashboard
**Assignee**: Frontend Developer
**Priority**: HIGH
**Files**:
- `frontend/src/pages/admin/AdminDashboard.jsx`
- `frontend/src/components/admin/Dashboard.jsx`

**Deliverables**:
- [x] Replace hardcoded mock data with API calls
- [x] Display stats grid:
  - Total doctors (all regions)
  - Total employees
  - Total visits (today/week/month)
  - Pending approvals
- [x] Recent activity feed
- [x] Quick action buttons
- [ ] Regional overview summary (deferred)

**Acceptance Criteria**:
- [x] All stats fetched from API
- [x] Real-time data display
- [x] Admin sees ALL regions data

**Status**: ✅ COMPLETED

**Implementation Details:**
- `AdminDashboard.jsx`: Fetches real data from doctorService, visitService, and users API
- `Dashboard.jsx`: Full CSS styling with stat cards, activity feed
- Quick action buttons link to Doctors, Employees, Reports pages

---

### Task 1.10: Admin Doctor Management (Master Database)
**Assignee**: Frontend Developer
**Priority**: HIGH
**Files**:
- `frontend/src/pages/admin/DoctorsPage.jsx`
- `frontend/src/components/admin/DoctorManagement.jsx`
- `frontend/src/services/doctorService.js`
- `frontend/src/services/regionService.js` (NEW)

**Deliverables**:
- [x] Display ALL doctors across ALL regions (master database)
- [x] Advanced filtering:
  - By region
  - By specialization (search)
  - By visitFrequency (2x/4x)
- [x] Add new doctor form with all fields:
  - Name, contact, email
  - Specialization
  - Region assignment
  - Visit frequency (2 or 4)
  - Address, notes
- [x] Edit existing doctor
- [x] Delete doctor (with confirmation)
- [ ] Bulk import from Excel (optional, Phase 1 stretch)
- [ ] Export to CSV (optional)

**Acceptance Criteria**:
- [x] Admin sees all doctors in paginated table
- [x] Can filter and search effectively
- [x] CRUD operations work
- [x] **Uses visitFrequency (2/4), NOT categories (A/B/C/D)**

**Status**: ✅ COMPLETED

**Implementation Details:**
- `regionService.js`: New service for region API calls
- `DoctorsPage.jsx`: Full CRUD with pagination, filtering, API integration
- `DoctorManagement.jsx`: Complete rewrite with search/filter bar, data table, Add/Edit modal, Delete confirmation modal, full CSS styling

**Doctor Region Cascading Dropdown Fix (Task 1.10b):**
- **Problem**: Validation error when editing doctors - address field sent as string instead of object
- **Problem**: Region dropdown used indented "──" format, hard to navigate for deep hierarchies
- **Solution**:
  - Fixed `address` field to send as nested object `{street: "..."}` matching Doctor model schema
  - Replaced single region dropdown with cascading dropdowns: Country → Region → Province → City → District
  - Each dropdown dynamically loads children from parent selection using `regionService.getChildren()`
  - Edit mode auto-populates all dropdown levels by traversing the region hierarchy
  - Added loading indicator during region fetch

---

### Task 1.11: Admin Employee Management
**Assignee**: Frontend Developer
**Priority**: HIGH
**Files**:
- `frontend/src/pages/admin/EmployeesPage.jsx`
- `frontend/src/components/admin/EmployeeManagement.jsx`
- `frontend/src/services/userService.js` (new)

**Deliverables**:
- [x] Create userService.js for user API calls
- [x] Display all employees with their assigned regions
- [x] Add new employee form:
  - Name, email, password
  - Role selection (employee/medrep)
  - Region assignment
- [x] Edit employee details
- [x] Toggle employee active/inactive status
- [ ] View employee performance summary (deferred to Phase 2)
- [x] Reassign employee to different region

**Acceptance Criteria**:
- [x] Can create new employees
- [x] Can assign employees to regions
- [x] Can deactivate employees
- [x] Historical data preserved on reassignment

**Status**: ✅ COMPLETED

**Implementation Details:**
- `userService.js`: Full CRUD operations for users (getAll, create, update, delete, assignRegions)
- `EmployeesPage.jsx`: Complete API integration with filters, pagination, toast notifications
- `EmployeeManagement.jsx`: Full UI with filters (search, role, status, region), data table with role/status badges, Add/Edit modal with multi-region checkbox selection, deactivate confirmation modal

---

### Task 1.12: Region Management
**Assignee**: Frontend Developer
**Priority**: MEDIUM
**Files**:
- `frontend/src/pages/admin/RegionsPage.jsx` (new)
- `frontend/src/components/admin/RegionManagement.jsx` (new)
- `frontend/src/services/regionService.js`

**Deliverables**:
- [x] Create RegionsPage and RegionManagement components
- [x] Display region hierarchy tree
- [x] Add new region with parent assignment
- [x] Edit region details
- [x] View doctors and employees per region
- [ ] Display geographical boundaries (optional - deferred)

**Acceptance Criteria**:
- [x] Hierarchical region display
- [x] Can create nested regions
- [x] Clear parent-child relationships

**Status**: ✅ COMPLETED

**Implementation Details:**
- `RegionsPage.jsx`: Page component with data fetching, state management, CRUD handlers
- `RegionManagement.jsx`: Full tree view UI with expand/collapse, level badges, filters, Add/Edit/Delete modals, Stats modal
- `regionService.js`: Extended with create, update, delete, getHierarchy, getStats, getByLevel, getChildren methods
- Added `/admin/regions` route to App.jsx
- Added "Regions" navigation item to Sidebar.jsx
- Added 'region' level to Region model enum (country > region > province > city > district > area)
- Added 18 Philippine regions (REG-I through REG-XIII, NCR, CAR, BARMM, MIMAROPA, NIR) to seed data
- Provinces (Iloilo, Capiz, Aklan, Antique) now under REG-VI (Western Visayas)

**Cascading Region Assignment Fix (Task 1.12b):**
- **Problem**: Employees assigned to Region VI couldn't see doctors from child provinces/cities
- **Backend Fix**: Updated `doctorController.js` to use `Region.getDescendantIds()` for cascading region access
- **Doctor Model**: Added `parentRegions` field with pre-save hook to auto-populate ancestor chain when doctor is assigned to a region
- **Frontend Updates**:
  - `DoctorsPage.jsx` & `EmployeesPage.jsx`: Fetch region hierarchy and flatten with depth for indented display
  - `DoctorManagement.jsx`: Indented dropdown showing hierarchy (──Region VI, ────Iloilo, etc.)
  - `EmployeeManagement.jsx`: Indented region checkboxes with "(+X sub-regions)" count for each parent region
  - Filter dropdowns also show indented hierarchy

---

### Task 1.13: MedRep Dashboard & Product Assignment
**Assignee**: Frontend Developer
**Priority**: HIGH
**Files**:
- `frontend/src/pages/medrep/MedRepDashboard.jsx`
- `frontend/src/components/medrep/ProductAssignment.jsx`
- `frontend/src/components/medrep/DoctorProductMapping.jsx`
- `frontend/src/services/assignmentService.js` (NEW)

**Deliverables**:
- [x] MedRep dashboard with assignment overview
- [x] Stats cards (active assignments, total doctors, products, total assignments)
- [x] Doctor list with specializations and product count
- [x] Assign products to specific doctors:
  - Select doctor from searchable list
  - Select products to recommend
  - Set priority (1=high, 2=medium, 3=low)
- [x] View current assignments with filtering (search, status)
- [x] Edit assignment (priority, notes)
- [x] Deactivate/remove assignments

**Acceptance Criteria**:
- [x] MedRep can assign products to doctors
- [x] Assignments show in employee visit interface
- [x] Priority ordering works
- [x] Only medrep and admin can manage assignments

**Status**: ✅ COMPLETED

**Implementation Details:**
- `assignmentService.js`: New service with getAll, getMyAssignments, getByDoctor, create, bulkCreate, update, delete
- `MedRepDashboard.jsx`: Full implementation with tabs (Assignments/Mapping), stats, modals, toast notifications
- `ProductAssignment.jsx`: Assignment cards with search/filter, view/edit/deactivate actions
- `DoctorProductMapping.jsx`: Two-panel layout with doctor search, product assignment with priority

---

### Task 1.14: Product Recommendations in Visit Interface
**Assignee**: Frontend Developer
**Priority**: HIGH
**Files**:
- `frontend/src/components/employee/ProductRecommendations.jsx`
- `frontend/src/components/employee/VisitLogger.jsx` (integration)

**Deliverables**:
- [x] When employee selects doctor to visit, show assigned products
- [x] Display product image, name, description, key benefits
- [x] Click product to view full details modal
- [x] Track which products were discussed in visit
- [x] Save discussed products with visit record

**Acceptance Criteria**:
- [x] Products shown based on MedRep assignments for that doctor
- [x] Employee can view product details
- [x] Discussed products recorded with visit

**Status**: ✅ COMPLETED

**Implementation Details:**
- `ProductRecommendations.jsx`: Shows assigned products for selected doctor with image, name, key benefits, and product detail modal
- `VisitLogger.jsx`: Integrates ProductRecommendations and tracks discussed products with visit submission

---

### Task 1.14c: Cross-Database Product Population Fix
**Assignee**: Backend Developer
**Priority**: CRITICAL
**Files**:
- `backend/controllers/visitController.js`
- `backend/controllers/doctorController.js`

**Problem**: Products are stored in a separate website database (`vip-pharmacy`), but the CRM uses Mongoose `populate()` which only works within the same database connection. This caused `MissingSchemaError: Schema hasn't been registered for model "Product"` errors.

**Deliverables**:
- [x] Remove Mongoose populate for products (fails across databases)
- [x] Add manual product population using `getWebsiteProductModel()` helper
- [x] Fix `getMyVisits` - manually fetch product data after getting visits
- [x] Fix `getVisitById` - manually fetch product data after getting visit
- [x] Fix `getDoctorById` - manually fetch product data for assigned products
- [x] Fix `getDoctorProducts` - manually fetch product data for assigned products
- [x] Fix `getWeeklyCompliance` - default to current user when no userId param

**Acceptance Criteria**:
- [x] No MissingSchemaError when fetching visits
- [x] Product names display correctly in My Visits page
- [x] Product names display correctly in Visit Logger
- [x] No 403 error on weekly compliance endpoint

**Status**: ✅ COMPLETED

**Implementation Details:**
- Import `getWebsiteProductModel` from `models/WebsiteProduct.js`
- Collect all product IDs from documents
- Query website database for product data
- Map product data back to original documents
- Pattern matches `productAssignmentController.js` approach

---

### Task 1.14b: Frontend Optimization
**Assignee**: Frontend Developer
**Priority**: HIGH
**Files**:
- `frontend/src/components/common/ErrorBoundary.jsx` (new)
- `frontend/src/components/common/Pagination.jsx` (new)
- `frontend/src/hooks/useDebounce.js` (new)
- Multiple existing files (see below)

**Deliverables**:
- [x] Create ErrorBoundary component to catch React errors
- [x] Create useDebounce hook for search inputs (300ms default)
- [x] Create shared Pagination component with React.memo
- [x] Fix ProtectedRoute to redirect to role dashboard instead of showing error
- [x] Fix API interceptor logout flow (dispatch CustomEvent instead of redirect)
- [x] Add request cancellation (AbortController) to MyVisits
- [x] Add GPS timeout (5 minutes) to CameraCapture
- [x] Fix useEffect dependencies in DoctorsPage (useCallback)
- [x] Fix useEffect cleanup in NewVisitPage (isMounted pattern)
- [x] Replace custom toast with react-hot-toast in MedRepDashboard
- [x] Fix AdminDashboard API calls (limit: 0 for count queries)
- [x] Add React.memo to DoctorList
- [x] Add useMemo for filtered lists in DoctorList
- [x] Remove console.log statements from ReportsPage

**Acceptance Criteria**:
- [x] ErrorBoundary catches errors and shows fallback UI
- [x] Search inputs are debounced (no excessive API calls)
- [x] Pagination is memoized and shared across components
- [x] Auth logout events handled properly across contexts
- [x] API requests are cancellable on component unmount
- [x] GPS timeout prevents infinite waiting
- [x] No useEffect dependency warnings
- [x] No console.log in production code
- [x] React.memo prevents unnecessary re-renders

**Status**: ✅ COMPLETED

**Implementation Details:**
- `ErrorBoundary.jsx`: Class component that catches errors, shows fallback UI with retry button
- `Pagination.jsx`: React.memo wrapped component for consistent pagination
- `useDebounce.js`: Custom hook using setTimeout/clearTimeout pattern
- `api.js`: Dispatches `auth:logout` CustomEvent for cross-context communication
- `AuthContext.jsx`: Listens for `auth:logout` events to trigger logout
- `MyVisits.jsx`: Uses AbortController for request cancellation on unmount
- `CameraCapture.jsx`: 5-minute watchPosition timeout for GPS
- `DoctorsPage.jsx`: useCallback for fetchDoctors to stabilize useEffect deps
- `NewVisitPage.jsx`: isMounted ref pattern for async cleanup

---

### Task 1.15: Common UI Components & Styling
**Assignee**: Frontend Developer
**Priority**: MEDIUM
**Files**:
- `frontend/src/components/common/Navbar.jsx`
- `frontend/src/components/common/Sidebar.jsx`
- `frontend/src/components/common/LoadingSpinner.jsx`
- `frontend/src/components/common/ErrorMessage.jsx`
- `frontend/src/index.css`
- `frontend/src/styles/` (new directory)

**Deliverables**:
- [x] Complete Navbar with user info and logout
- [x] Role-based Sidebar navigation
- [x] Consistent loading spinners
- [x] Error message component with retry
- [ ] Complete CSS styling:
  - Forms and inputs
  - Tables
  - Cards
  - Buttons
  - Modals
  - Responsive breakpoints
- [ ] Mobile-responsive design (tablet/phone)

**Acceptance Criteria**:
- Consistent visual design across app
- Works on desktop, tablet, mobile
- Role-specific navigation

**Status**: ⚠️ IN PROGRESS (Navbar and Sidebar functional. index.css has base styles but missing comprehensive component styles)

---

## Infrastructure Tasks

### Task 1.16: Development Environment Setup Documentation
**Assignee**: DevOps / Backend Developer
**Priority**: HIGH
**Files**: `docs/DEVELOPMENT_GUIDE.md`

**Deliverables**:
- [x] Document local development setup steps
- [x] Document environment variables
- [x] Document MongoDB Atlas setup
- [x] Document AWS S3 setup
- [x] Create `.env.example` files for both backend and frontend
- [x] Add troubleshooting section

**Acceptance Criteria**:
- [x] New developer can set up project using documentation
- [x] All required env vars documented

**Status**: ✅ COMPLETED

**Implementation Details:**
- `docs/DEVELOPMENT_GUIDE.md`: Comprehensive 923-line development guide covering:
  - Prerequisites and software requirements
  - Local environment setup with step-by-step instructions
  - Backend and frontend configuration
  - AWS S3 setup for image storage
  - Database setup (local MongoDB and Atlas)
  - Testing, Git workflow, and code standards
  - IDE setup with VS Code extensions
- `backend/.env.example`: 89 lines with all environment variables documented
- `frontend/.env.example`: Frontend environment variables for Vite

---

### Task 1.17: Initial Deployment to AWS Lightsail
**Assignee**: DevOps
**Priority**: HIGH (end of Phase 1)
**Files**: Various config files, AWS Console

**Deliverables**:
- [ ] Create Lightsail instance (Ubuntu 22.04)
- [ ] Attach static IP
- [ ] Configure firewall (22, 80, 443)
- [ ] Install Node.js 18 LTS
- [ ] Install Nginx
- [ ] Install PM2
- [ ] Clone repository
- [ ] Build frontend
- [ ] Configure Nginx as reverse proxy
- [ ] Set up SSL with Let's Encrypt
- [ ] Configure PM2 for process management
- [ ] Create `ecosystem.config.js`
- [ ] Document deployment process

**Acceptance Criteria**:
- Application accessible via HTTPS
- API responds correctly
- PM2 manages Node process
- Auto-restart on crash

---

## Phase 1 Summary

| Category | Tasks | Estimated Complexity |
|----------|-------|---------------------|
| Backend Infrastructure | 4 tasks | High |
| Frontend Auth | 1 task | High |
| Frontend Employee Features | 3 tasks | High |
| Frontend Admin Features | 4 tasks | High |
| Frontend MedRep Features | 2 tasks | Medium |
| Frontend Optimization | 1 task | High |
| Frontend UI/UX | 1 task | Medium |
| DevOps | 2 tasks | High |
| **Total** | **18 tasks** | |

---

# PHASE 2: Compliance & Monitoring
**Goal**: Add real-time monitoring, alerts, notifications, and visit approval workflow

## Backend Tasks

### Task 2.1: Compliance Alerts API
**Assignee**: Backend Developer
**Priority**: HIGH
**Files**:
- `backend/controllers/complianceController.js` (new)
- `backend/routes/complianceRoutes.js` (new)
- `backend/utils/validateWeeklyVisit.js` (enhance)

**Deliverables**:
- [ ] Create compliance controller with:
  - `getComplianceAlerts()` - employees behind schedule
  - `getBehindScheduleEmployees()` - less than 80% weekly target
  - `getQuotaDumpingAlerts()` - detect multiple visits in short period
  - `getWeeklyComplianceReport()` - all employees weekly status
  - `getMonthlyComplianceReport()` - monthly completion rates
- [ ] Add routes and protect with admin middleware
- [ ] Implement 80% threshold for "behind schedule" alerts
- [ ] Track visit patterns for quota dumping detection

**Acceptance Criteria**:
- Admin can see who is behind schedule
- Quota dumping patterns flagged
- Weekly/monthly reports accurate

---

### Task 2.2: Email Notification System (AWS SES)
**Assignee**: Backend Developer
**Priority**: HIGH
**Files**:
- `backend/config/ses.js` (new)
- `backend/services/emailService.js` (new)
- `backend/templates/emails/` (new directory)

**Deliverables**:
- [ ] Configure AWS SES
- [ ] Create email service with templates:
  - Welcome email (new user registration)
  - Password reset
  - Weekly compliance summary (to managers)
  - Behind schedule alert
  - Visit approval notification
- [ ] Create HTML email templates
- [ ] Add email sending to relevant controllers
- [ ] Handle SES sandbox mode for development

**Acceptance Criteria**:
- Emails sent successfully via SES
- Templates render correctly
- Password reset email works
- Weekly summary emails scheduled

---

### Task 2.3: Push Notification System (Web Push)
**Assignee**: Backend Developer
**Priority**: MEDIUM
**Files**:
- `backend/services/pushService.js` (new)
- `backend/models/PushSubscription.js` (new)

**Deliverables**:
- [ ] Implement Web Push API support
- [ ] Store push subscriptions in database
- [ ] Send notifications for:
  - Daily visit reminders
  - Behind schedule warnings
  - Visit approval status changes
- [ ] Handle subscription management (subscribe/unsubscribe)

**Acceptance Criteria**:
- Users can subscribe to push notifications
- Notifications appear in browser
- Unsubscribe works

---

### Task 2.4: Visit Approval Workflow
**Assignee**: Backend Developer
**Priority**: HIGH
**Files**:
- `backend/controllers/visitController.js` (enhance)
- `backend/models/Visit.js` (enhance status field)

**Deliverables**:
- [ ] Add visit statuses: `pending_approval`, `approved`, `rejected`
- [ ] Add `approvedBy`, `approvedAt`, `rejectionReason` fields
- [ ] Create `approveVisit()` endpoint
- [ ] Create `rejectVisit(reason)` endpoint
- [ ] Add notification on approval/rejection
- [ ] Allow admin/manager to bulk approve

**Acceptance Criteria**:
- Visits require approval before counting
- Admin can approve/reject with reason
- Employee notified of approval status

---

### Task 2.5: Scheduled Jobs (Cron Tasks)
**Assignee**: Backend Developer
**Priority**: HIGH
**Files**:
- `backend/jobs/scheduler.js` (new)
- `backend/jobs/weeklyReport.js` (new)
- `backend/jobs/dailyReminder.js` (new)

**Deliverables**:
- [ ] Set up node-cron for scheduled tasks
- [ ] Daily job: Send visit reminders (8 AM)
- [ ] Weekly job: Generate compliance reports (Monday 7 AM)
- [ ] Weekly job: Send behind-schedule alerts
- [ ] Monthly job: Generate monthly summary
- [ ] Add job logging and error handling

**Acceptance Criteria**:
- Jobs run on schedule
- Reports generated correctly
- Errors logged but don't crash server

---

## Frontend Tasks

### Task 2.6: Real-Time Activity Monitor (Admin)
**Assignee**: Frontend Developer
**Priority**: HIGH
**Files**:
- `frontend/src/pages/admin/ActivityMonitor.jsx` (new)
- `frontend/src/components/admin/LiveActivityFeed.jsx` (new)

**Deliverables**:
- [ ] Real-time activity feed showing:
  - Recent visits logged
  - Employee login/logout
  - Doctor updates
  - Product assignments
- [ ] Filter by region, employee, activity type
- [ ] Auto-refresh every 30 seconds
- [ ] Click to view activity details
- [ ] Optional: WebSocket for true real-time updates

**Acceptance Criteria**:
- Admin sees live activity
- Filters work correctly
- Updates without manual refresh

---

### Task 2.7: Compliance Dashboard
**Assignee**: Frontend Developer
**Priority**: HIGH
**Files**:
- `frontend/src/pages/admin/ComplianceDashboard.jsx` (new)
- `frontend/src/components/admin/ComplianceAlerts.jsx` (new)
- `frontend/src/components/admin/EmployeeComplianceCard.jsx` (new)

**Deliverables**:
- [ ] Overview metrics:
  - Team-wide compliance rate
  - Employees on track vs behind
  - Weekly completion percentage
- [ ] Alert list with:
  - Behind schedule warnings
  - Quota dumping flags
  - Missed visits
- [ ] Per-employee compliance cards:
  - Weekly progress (8/10 doctors)
  - Monthly progress percentage
  - Trend indicator (improving/declining)
- [ ] Drill-down to employee details

**Acceptance Criteria**:
- Clear visibility into compliance status
- Alerts actionable
- Easy to identify problems

---

### Task 2.8: Visit Approval Interface
**Assignee**: Frontend Developer
**Priority**: HIGH
**Files**:
- `frontend/src/components/admin/VisitApproval.jsx`
- `frontend/src/pages/admin/PendingApprovalsPage.jsx` (new)

**Deliverables**:
- [ ] List pending visits awaiting approval
- [ ] Show visit details:
  - Employee name
  - Doctor visited
  - Date/time
  - GPS location (map view)
  - Photo proofs
  - Products discussed
- [ ] Approve button (single and bulk)
- [ ] Reject button with reason input
- [ ] Filter by employee, date, region
- [ ] Sort by date

**Acceptance Criteria**:
- Easy to review visit proofs
- Can approve/reject efficiently
- Bulk operations work

---

### Task 2.9: GPS Location Verification Map
**Assignee**: Frontend Developer
**Priority**: MEDIUM
**Files**:
- `frontend/src/components/admin/VisitLocationMap.jsx` (new)
- `frontend/src/components/common/MapView.jsx` (new)

**Deliverables**:
- [ ] Integrate map library (Leaflet or Google Maps)
- [ ] Show visit location on map
- [ ] Show doctor clinic location (if available)
- [ ] Display distance between visit GPS and clinic
- [ ] Flag suspicious locations (too far from clinic)
- [ ] Accuracy indicator

**Acceptance Criteria**:
- Map displays correctly
- Can verify visit location visually
- Distance calculation works

---

### Task 2.10: Employee Performance Analytics
**Assignee**: Frontend Developer
**Priority**: MEDIUM
**Files**:
- `frontend/src/pages/admin/EmployeeAnalytics.jsx` (new)
- `frontend/src/components/admin/PerformanceChart.jsx` (new)

**Deliverables**:
- [ ] Individual employee performance view:
  - Visits over time (chart)
  - Completion rate trend
  - Doctor coverage
  - Products presented
- [ ] Compare employees (optional)
- [ ] Export performance data
- [ ] Date range selector

**Acceptance Criteria**:
- Charts display correctly
- Data is accurate
- Can export for reports

---

### Task 2.11: Notification Center (Frontend)
**Assignee**: Frontend Developer
**Priority**: MEDIUM
**Files**:
- `frontend/src/components/common/NotificationCenter.jsx` (new)
- `frontend/src/hooks/usePushNotifications.js` (new)

**Deliverables**:
- [ ] Notification bell icon in navbar
- [ ] Dropdown showing recent notifications
- [ ] Mark as read functionality
- [ ] Push notification subscription UI
- [ ] Notification preferences page
- [ ] Badge count for unread

**Acceptance Criteria**:
- Notifications visible
- Can manage preferences
- Push subscription works

---

### Task 2.12: Reports Page Implementation
**Assignee**: Frontend Developer
**Priority**: HIGH
**Files**:
- `frontend/src/pages/admin/ReportsPage.jsx`
- `frontend/src/components/admin/ReportGenerator.jsx` (new)

**Deliverables**:
- [ ] Report types:
  - Weekly compliance report
  - Monthly visit summary
  - Employee performance report
  - Regional comparison report
  - Product presentation report
- [ ] Date range selection
- [ ] Filter by region/employee
- [ ] Export to PDF/CSV
- [ ] Schedule recurring reports (optional)

**Acceptance Criteria**:
- Reports generate correctly
- Export works
- Data matches backend

---

## Phase 2 Summary

| Category | Tasks | Estimated Complexity |
|----------|-------|---------------------|
| Backend Compliance | 2 tasks | High |
| Backend Notifications | 2 tasks | High |
| Backend Jobs | 1 task | Medium |
| Frontend Monitoring | 2 tasks | High |
| Frontend Approvals | 2 tasks | High |
| Frontend Analytics | 2 tasks | Medium |
| Frontend Notifications | 1 task | Medium |
| **Total** | **12 tasks** | |

---

# PHASE 3: Product Intelligence
**Goal**: Advanced product-doctor matching, analytics, and smart recommendations

## Backend Tasks

### Task 3.1: Product Analytics API
**Assignee**: Backend Developer
**Priority**: HIGH
**Files**:
- `backend/controllers/analyticsController.js` (new)
- `backend/routes/analyticsRoutes.js` (new)

**Deliverables**:
- [ ] Product presentation stats:
  - Most presented products
  - Products by specialization
  - Products by region
  - Presentation success rate (if tracking)
- [ ] Doctor coverage analytics:
  - Products presented per doctor
  - Doctors not receiving target products
  - Specialization-product gaps
- [ ] Time-based trends:
  - Monthly product trends
  - Seasonal patterns
- [ ] Create aggregation pipelines

**Acceptance Criteria**:
- Analytics endpoints return accurate data
- Performance optimized with indexes

---

### Task 3.2: Smart Product Matching Engine
**Assignee**: Backend Developer
**Priority**: HIGH
**Files**:
- `backend/services/productMatchingService.js` (new)
- `backend/models/Product.js` (enhance)

**Deliverables**:
- [ ] Auto-suggest products based on doctor specialization
- [ ] Analyze historical visit data for patterns
- [ ] Identify gaps (products not being presented to target specialists)
- [ ] Recommend products to assign based on:
  - Doctor specialization match
  - Similar doctor patterns
  - Regional trends
- [ ] API endpoint for recommendations

**Acceptance Criteria**:
- Recommendations relevant to specialization
- Gaps identified correctly
- Performance acceptable

---

### Task 3.3: Product Performance Tracking
**Assignee**: Backend Developer
**Priority**: MEDIUM
**Files**:
- `backend/models/ProductPresentation.js` (new)
- `backend/controllers/productController.js` (enhance)

**Deliverables**:
- [ ] Track product presentations per visit
- [ ] Record doctor interest level (optional)
- [ ] Calculate presentation frequency
- [ ] Track regional product performance
- [ ] Generate product effectiveness scores

**Acceptance Criteria**:
- Presentation data captured
- Scores calculated correctly

---

## Frontend Tasks

### Task 3.4: Product Analytics Dashboard
**Assignee**: Frontend Developer
**Priority**: HIGH
**Files**:
- `frontend/src/pages/admin/ProductAnalytics.jsx` (new)
- `frontend/src/components/admin/ProductCharts.jsx` (new)

**Deliverables**:
- [ ] Product overview metrics:
  - Total products
  - Active assignments
  - Presentation count
- [ ] Charts:
  - Top 10 presented products
  - Products by category
  - Presentation trends over time
- [ ] Filter by date range, region, category
- [ ] Drill-down to product details

**Acceptance Criteria**:
- Charts render correctly
- Data accurate
- Responsive design

---

### Task 3.5: Smart Assignment Recommendations UI
**Assignee**: Frontend Developer
**Priority**: HIGH
**Files**:
- `frontend/src/components/medrep/SmartRecommendations.jsx` (new)
- `frontend/src/pages/medrep/AssignmentSuggestions.jsx` (new)

**Deliverables**:
- [ ] Show AI-suggested product assignments
- [ ] Display matching score/confidence
- [ ] One-click accept recommendation
- [ ] Bulk accept multiple suggestions
- [ ] Show reasoning (e.g., "Doctor is Gastro specialist, product targets Gastro")
- [ ] Dismiss/ignore suggestion

**Acceptance Criteria**:
- Recommendations displayed clearly
- Easy to accept/reject
- Reasoning understandable

---

### Task 3.6: Product-Specialization Matrix View
**Assignee**: Frontend Developer
**Priority**: MEDIUM
**Files**:
- `frontend/src/components/admin/SpecializationMatrix.jsx` (new)
- `frontend/src/pages/admin/ProductCoverage.jsx` (new)

**Deliverables**:
- [ ] Grid showing products vs specializations
- [ ] Color-coded coverage (assigned/not assigned)
- [ ] Click cell to see details
- [ ] Identify gaps in coverage
- [ ] Filter by region

**Acceptance Criteria**:
- Matrix displays correctly
- Gaps visible at a glance
- Interactive cells

---

### Task 3.7: Product Catalog Enhancement
**Assignee**: Frontend Developer
**Priority**: MEDIUM
**Files**:
- `frontend/src/pages/admin/ProductCatalog.jsx` (new)
- `frontend/src/components/admin/ProductManagement.jsx`

**Deliverables**:
- [ ] Rich product details view:
  - Large image gallery
  - Full description
  - Key benefits list
  - Target specializations
  - Usage information
- [ ] Product comparison (side by side)
- [ ] Product search and filter
- [ ] Category navigation
- [ ] Print-friendly product sheet

**Acceptance Criteria**:
- Product information easily accessible
- Images display well
- Search works effectively

---

### Task 3.8: Visit Product Tracking Enhancement
**Assignee**: Frontend Developer
**Priority**: MEDIUM
**Files**:
- `frontend/src/components/employee/VisitLogger.jsx` (enhance)
- `frontend/src/components/employee/ProductSelector.jsx` (new)

**Deliverables**:
- [ ] Enhanced product selection during visit logging:
  - Quick multi-select
  - Interest level indicator (optional)
  - Notes per product
- [ ] Show product details while logging
- [ ] Track time spent discussing (optional)
- [ ] Save as draft and continue later

**Acceptance Criteria**:
- Easy to select multiple products
- Data captured correctly
- Good mobile UX

---

## Phase 3 Summary

| Category | Tasks | Estimated Complexity |
|----------|-------|---------------------|
| Backend Analytics | 3 tasks | High |
| Frontend Analytics | 2 tasks | High |
| Frontend Recommendations | 1 task | High |
| Frontend Catalog | 2 tasks | Medium |
| **Total** | **8 tasks** | |

---

# PHASE 4: Go-Live & Training
**Goal**: Production deployment, data migration, user training, and support

## Infrastructure Tasks

### Task 4.1: Production Environment Hardening
**Assignee**: DevOps
**Priority**: CRITICAL
**Files**: Various server configs

**Deliverables**:
- [ ] Security audit:
  - Review all environment variables
  - Ensure no secrets in code
  - Check CORS configuration
  - Verify rate limiting
- [ ] Performance optimization:
  - Database indexes verified
  - Nginx caching configured
  - Static asset compression
- [ ] Monitoring setup:
  - PM2 metrics
  - Error tracking (Sentry optional)
  - Uptime monitoring
- [ ] Backup configuration:
  - MongoDB Atlas backups enabled
  - S3 versioning enabled
- [ ] SSL certificate auto-renewal verified

**Acceptance Criteria**:
- Passes security checklist
- Performance acceptable under load
- Backups tested

---

### Task 4.2: Data Migration from Excel
**Assignee**: Backend Developer + Data Entry
**Priority**: CRITICAL
**Files**:
- `backend/scripts/migrateFromExcel.js` (new)
- `docs/data-migration-template.xlsx` (new)

**Deliverables**:
- [ ] Create Excel template matching database schema
- [ ] Build migration script:
  - Parse Excel file
  - Validate data
  - Handle duplicates
  - Report errors
- [ ] Migrate:
  - 150+ doctor profiles
  - Regional territories
  - Employee assignments
  - Product catalog
  - Existing visit history (if available)
- [ ] Verify migrated data
- [ ] Create rollback procedure

**Acceptance Criteria**:
- All data migrated correctly
- No duplicates
- Relationships intact

---

### Task 4.3: User Acceptance Testing (UAT)
**Assignee**: QA + Stakeholders
**Priority**: HIGH
**Files**: `docs/UAT-checklist.md` (new)

**Deliverables**:
- [ ] Create UAT test cases for:
  - Employee: Login, view doctors, log visit, view history
  - MedRep: Assign products, view assignments
  - Admin: All CRUD operations, reports, approvals
- [ ] Test on multiple devices (desktop, tablet, phone)
- [ ] Test with real users
- [ ] Document bugs and issues
- [ ] Fix critical bugs
- [ ] Get sign-off from stakeholders

**Acceptance Criteria**:
- All critical flows work
- No blocking bugs
- User feedback addressed

---

### Task 4.4: Training Materials Creation
**Assignee**: Documentation Specialist
**Priority**: HIGH
**Files**: `docs/training/` (new directory)

**Deliverables**:
- [ ] User guides:
  - Employee Quick Start Guide
  - MedRep User Guide
  - Admin User Guide
- [ ] Video tutorials (optional):
  - How to log a visit
  - How to assign products
  - How to approve visits
- [ ] FAQ document
- [ ] Troubleshooting guide
- [ ] In-app help tooltips (optional)

**Acceptance Criteria**:
- Guides clear and complete
- Screenshots up-to-date
- Accessible to all users

---

### Task 4.5: User Training Sessions
**Assignee**: Project Lead + Trainers
**Priority**: HIGH

**Deliverables**:
- [ ] Schedule training sessions:
  - Session 1: Employees (field reps)
  - Session 2: MedReps
  - Session 3: Administrators
- [ ] Conduct live training with demo
- [ ] Hands-on practice time
- [ ] Q&A session
- [ ] Collect feedback
- [ ] Follow-up support channel (WhatsApp group, email, etc.)

**Acceptance Criteria**:
- All users trained
- Users can perform basic tasks independently
- Support channel active

---

### Task 4.6: Phased Rollout Plan
**Assignee**: Project Lead
**Priority**: HIGH
**Files**: `docs/rollout-plan.md` (new)

**Deliverables**:
- [ ] Define rollout phases:
  - Pilot: 1 region, 5-10 users (1 week)
  - Expansion: Additional regions (1-2 weeks)
  - Full rollout: All users
- [ ] Define success criteria for each phase
- [ ] Create rollback plan
- [ ] Monitor closely during pilot
- [ ] Address issues before expansion
- [ ] Full go-live announcement

**Acceptance Criteria**:
- Pilot successful
- Issues resolved before expansion
- Smooth full rollout

---

### Task 4.7: Post-Launch Support Plan
**Assignee**: Project Lead + Support Team
**Priority**: HIGH
**Files**: `docs/support-plan.md` (new)

**Deliverables**:
- [ ] Define support channels:
  - Primary: In-app help/FAQ
  - Secondary: WhatsApp/Email support
  - Escalation: Direct contact
- [ ] Define SLA for issue resolution
- [ ] Create bug reporting process
- [ ] Weekly check-in meetings (first month)
- [ ] Collect ongoing feedback
- [ ] Plan for continuous improvement

**Acceptance Criteria**:
- Support channels active
- Issues tracked and resolved
- Feedback loop established

---

## Phase 4 Summary

| Category | Tasks | Estimated Complexity |
|----------|-------|---------------------|
| Infrastructure | 2 tasks | High |
| Data Migration | 1 task | High |
| Testing | 1 task | High |
| Training | 3 tasks | Medium |
| **Total** | **7 tasks** | |

---

# COMPLETE PHASE SUMMARY

| Phase | Tasks | Key Deliverables |
|-------|-------|------------------|
| **Phase 1: Foundation** | 18 tasks | Working app with auth, doctors, visits, products, optimization |
| **Phase 2: Compliance** | 12 tasks | Alerts, approvals, notifications, reports |
| **Phase 3: Intelligence** | 8 tasks | Analytics, smart recommendations, insights |
| **Phase 4: Go-Live** | 7 tasks | Deployment, migration, training, support |
| **TOTAL** | **45 tasks** | |

---

# TASK ASSIGNMENT MATRIX

## Recommended Team Structure

| Role | Count | Primary Phases |
|------|-------|----------------|
| Backend Developer | 1-2 | Phase 1, 2, 3 |
| Frontend Developer | 1-2 | Phase 1, 2, 3 |
| DevOps | 1 | Phase 1, 4 |
| QA/Tester | 1 | Phase 1, 2, 4 |
| Project Lead | 1 | All phases |
| Documentation | 1 | Phase 4 |

## Task Dependencies

### Phase 1 Critical Path
```
Task 1.1 (DB Connection) → All other backend tasks
Task 1.2 (S3 Setup) → Task 1.7 (Visit Logger with photos)
Task 1.5 (Auth Flow) → All other frontend tasks
Task 1.6 (Doctor List) → Task 1.7 (Visit Logger)
Task 1.13 (MedRep Assignment) → Task 1.14 (Product Recommendations)
```

### Phase 2 Dependencies
```
Phase 1 complete → Phase 2 start
Task 2.1 (Compliance API) → Task 2.7 (Compliance Dashboard)
Task 2.2 (Email) → Task 2.5 (Scheduled Jobs)
Task 2.4 (Approval Workflow) → Task 2.8 (Approval Interface)
```

### Phase 3 Dependencies
```
Phase 2 complete → Phase 3 start
Task 3.1 (Analytics API) → Task 3.4 (Analytics Dashboard)
Task 3.2 (Matching Engine) → Task 3.5 (Recommendations UI)
```

### Phase 4 Dependencies
```
Phase 3 complete → Phase 4 start
Task 4.1 (Hardening) → Task 4.2 (Data Migration)
Task 4.2 (Migration) → Task 4.3 (UAT)
Task 4.4 (Training Materials) → Task 4.5 (Training Sessions)
Task 4.3 (UAT) → Task 4.6 (Rollout)
```
