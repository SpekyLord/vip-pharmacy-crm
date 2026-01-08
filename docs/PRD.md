# Product Requirements Document (PRD)
## VIP CRM

**Version:** 3.0
**Last Updated:** January 2026 (Security Hardening Complete)
**Status:** Phase 1 Complete - Ready for Phase 2

---

## 1. Project Overview

### 1.1 Executive Summary
VIP CRM is a pharmaceutical field sales management system designed for Business Development Managers (BDM) to track VIP Client visits, manage product assignments, and ensure compliance with visit schedules. The system enforces weekly and monthly visit quotas to ensure proper coverage of healthcare providers.

### 1.2 Problem Statement
Pharmaceutical companies struggle with:
- Enforcing visit compliance (ensuring BDMs visit VIP Clients on schedule)
- Tracking field BDM visits with proof (photos, GPS)
- Managing product-to-VIP Client assignments
- Monitoring weekly and monthly visit quotas
- Maintaining accurate, region-based VIP Client databases

### 1.3 Solution
A tablet-optimized web application that provides:
- **Weekly visit enforcement** (one visit per VIP Client per week)
- **Monthly quota tracking** (2x or 4x visits per VIP Client per month)
- Real-time visit logging with GPS and photo verification
- Region-based VIP Client access control
- Compliance reporting and alerts
- Role-based dashboards for different user types

### 1.4 Target Users
- **Primary:** Business Development Managers (BDM)
- **Secondary:** Medical Representative Managers (MedReps)
- **Tertiary:** System administrators (Admins)

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
- View compliance alerts (behind-schedule BDMs)
- Configure system settings

### 2.2 MedRep (Medical Representative Manager)
**Description:** Manages product-to-VIP Client assignments for their region.

**Permissions:**
- View VIP Clients in their assigned regions
- Assign products to VIP Clients (priority-based)
- View product assignment reports
- View visits for their region
- Cannot create/edit VIP Clients or users

### 2.3 Business Development Manager (BDM)
**Description:** Field representatives who visit VIP Clients and log their activities.

**Permissions:**
- View VIP Clients ONLY in their assigned regions
- Log visits with GPS and photo proof
- View recommended products for each VIP Client
- View personal visit history
- Check weekly/monthly visit limits before visiting
- View personal compliance dashboard

**Important Constraints:**
- Can only see VIP Clients in their assigned region(s)
- Limited to ONE visit per VIP Client per week
- Limited by VIP Client's monthly quota (2x or 4x)

---

## 3. Core Business Rules

### 3.1 Weekly Visit Enforcement
| Rule | Description |
|------|-------------|
| One visit per week | Maximum ONE visit per VIP Client per user per calendar week |
| Work days only | Visits can only be logged Monday through Friday |
| Week definition | Calendar weeks (Monday = Day 1, Friday = Day 5) |
| Enforcement | **Hard limit** - system blocks excess visits |

### 3.2 Monthly Visit Quota
| VIP Client Type | Monthly Limit | Weekly Pattern |
|-----------------|---------------|----------------|
| `visitFrequency: 4` | 4 visits/month | ~1 visit per week |
| `visitFrequency: 2` | 2 visits/month | ~1 visit per 2 weeks |

### 3.3 Visit Proof Requirements
Every visit MUST include:
- GPS coordinates (latitude, longitude)
- At least ONE photo as proof
- Visit date (must be a work day)

### 3.4 Region-Based Access
| Role | Region Access |
|------|---------------|
| Admin | All regions |
| MedRep | Assigned regions only |
| BDM | Assigned regions only |

---

## 4. Core Features

### 4.1 Authentication & Authorization
- Secure login with email/password
- JWT-based authentication (15min access, 7d refresh)
- **httpOnly cookie token storage** (XSS protection)
- Role-based access control (admin, medrep, bdm)
- Password reset functionality
- **Account lockout after 5 failed attempts** (15 min lockout)
- **Security audit logging** (login/logout/password events)

### 4.2 User Management (Admin Only)
- User CRUD operations
- Role assignment (admin, medrep, bdm)
- Region assignment (multiple regions per user)
- Account activation/deactivation

### 4.3 VIP Client Management
- VIP Client database with detailed profiles
- **Visit frequency setting** (2 or 4 per month) - NOT A/B/C/D categories
- Specialization and hospital tracking
- Region assignment (required)
- Clinic schedule (available days/hours)
- Contact information

### 4.4 Visit Logging
- Create visit records with required fields:
  - VIP Client selection
  - GPS location (required)
  - Photo(s) (required, minimum 1)
  - Visit date (work days only)
  - Products discussed (optional)
  - VIP Client feedback (optional)
  - Notes (optional)
- **Automatic weekly tracking** (week number, day of week, yearWeekKey)
- **Automatic monthly tracking** (monthYear)
- Visit status (completed, cancelled)

### 4.5 Visit Compliance
- Check if user can visit VIP Client (`/api/visits/can-visit/:vipClientId`)
- Weekly compliance report per user
- Monthly compliance report
- Compliance alerts for behind-schedule BDMs
- Visit statistics and breakdowns

### 4.6 Product Management (Admin Only)
- Product catalog with:
  - Name and category
  - Brief description (200 chars)
  - Full description
  - Key benefits (up to 10)
  - Usage information
  - Price
  - Image (S3 storage)

### 4.7 Product Assignments (MedRep Only)
- Assign products to VIP Clients
- Priority levels (1=High, 2=Medium, 3=Low)
- Assignment status (active/inactive)
- Notes per assignment

### 4.8 Region Management (Admin Only)
- Hierarchical region structure (country > province > city > district > area)
- Region codes (unique)
- Parent-child relationships
- Active/inactive status

### 4.9 Reporting & Analytics
- Visit completion statistics
- Weekly/monthly breakdowns
- BDM compliance rates
- Behind-schedule alerts

---

## 5. User Stories

### 5.1 BDM User Stories

| ID | User Story | Priority | Acceptance Criteria |
|----|------------|----------|---------------------|
| E1 | As a BDM, I want to see only VIP Clients in my region | High | VIP Client list filtered by assigned regions |
| E2 | As a BDM, I want to check if I can visit a VIP Client before going | High | `/can-visit` endpoint returns limit status |
| E3 | As a BDM, I want to log a visit with GPS and photo proof | High | Visit created only with valid GPS and photo |
| E4 | As a BDM, I want to see my weekly compliance status | High | Dashboard shows week-by-week progress |
| E5 | As a BDM, I want to be blocked from duplicate weekly visits | High | System rejects second visit to same VIP Client in week |
| E6 | As a BDM, I want to see products assigned to each VIP Client | Medium | Product list shown per VIP Client |
| E7 | As a BDM, I want to see my visit history | Medium | Filterable list of past visits |

### 5.2 Admin User Stories

| ID | User Story | Priority | Acceptance Criteria |
|----|------------|----------|---------------------|
| A1 | As an admin, I want to see all visits across all regions | High | Unfiltered visit list with all data |
| A2 | As an admin, I want to see BDMs who are behind schedule | High | Compliance alerts list with details |
| A3 | As an admin, I want to manage users and their regions | High | Full CRUD on users with region assignment |
| A4 | As an admin, I want to manage the VIP Client database | High | Full CRUD on VIP Clients |
| A5 | As an admin, I want to manage products | Medium | Full CRUD on products with image upload |
| A6 | As an admin, I want to manage regions | Medium | Hierarchical region management |

### 5.3 MedRep User Stories

| ID | User Story | Priority | Acceptance Criteria |
|----|------------|----------|---------------------|
| M1 | As a medrep, I want to assign products to VIP Clients | High | Product-VIP Client mapping with priority |
| M2 | As a medrep, I want to see which products are assigned to which VIP Clients | High | Assignment list filtered by region |
| M3 | As a medrep, I want to update assignment priorities | Medium | Edit existing assignments |

---

## 6. Implementation Phases

### 6.1 Phase 1 - MVP ✅ COMPLETED (December 2025)

**Must Have:**
- [x] User authentication (login/logout/refresh)
- [x] Role-based access control (admin, medrep, bdm)
- [x] JWT with access and refresh tokens
- [x] User management (CRUD)
- [x] VIP Client model with visitFrequency
- [x] VIP Client management (CRUD with cascading region dropdowns)
- [x] Visit model with weekly tracking
- [x] Visit logging with GPS + photo (S3)
- [x] Weekly visit enforcement
- [x] Monthly quota enforcement
- [x] Basic dashboards per role (Admin, MedRep, BDM)
- [x] Compliance reporting

**Should Have:**
- [x] Password reset functionality
- [x] Visit statistics endpoint
- [x] Weekly compliance endpoint
- [x] Compliance alerts endpoint
- [x] Product management
- [x] Product-to-VIP Client assignments (MedRep dashboard)

**Optimization (Added December 2025):**
- [x] Backend: Rate limiting, HSTS headers, request timeout, compound indexes
- [x] Frontend: ErrorBoundary, useDebounce hook, AbortController, React.memo
- [x] Security: CORS middleware order fix, array bounds validation

**Security Hardening (Added January 2026):**
- [x] httpOnly cookie authentication (SEC-001)
- [x] Account lockout after 5 failed attempts (SEC-003)
- [x] Security audit logging with TTL (SEC-005)
- [x] Password complexity enforcement (SEC-004)
- [x] JWT secret validation at startup (SEC-006)
- [x] Visit race condition handling (SEC-002)

### 6.2 Phase 2 - Enhanced Features

- [ ] Email notifications (AWS SES)
- [ ] Advanced analytics and charts
- [ ] Export reports (PDF, Excel)
- [ ] Bulk import/export (VIP Clients, products)
- [ ] Visit scheduling calendar
- [ ] Push notifications (web)

### 6.3 Phase 3 - Advanced Features

- [ ] Offline mode with sync (IndexedDB, Service Workers)
- [ ] Advanced search with filters
- [ ] Custom report builder
- [ ] Audit logging
- [ ] Multi-language support

### 6.4 Out of Scope (Not Planned)

- Mobile native apps (web-only, mobile-responsive)
- VIP Client A/B/C/D categories (use visitFrequency instead)
- Cloudinary integration (use AWS S3)
- Generic VPS hosting (use AWS Lightsail)
- Integration with pharmacy systems
- AI-powered recommendations

---

## 7. Success Metrics

### 7.1 Functional Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Visit logging time | < 2 minutes | Average time to complete visit form |
| System uptime | 99.5% | Monthly availability |
| Page load time | < 3 seconds | Average on 4G connection |
| Photo upload success | > 95% | Successful uploads / total attempts |

### 7.2 Business Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Weekly compliance | > 85% | Visits logged / visits required per week |
| Monthly compliance | > 90% | Monthly quota completion rate |
| BDM adoption | > 90% | Active daily users / total BDMs |
| Visit with proof | 100% | Visits with GPS + photo / total visits |

### 7.3 Compliance Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Duplicate visit blocks | 100% | Blocked attempts / duplicate attempts |
| Work day enforcement | 100% | Rejected weekend visits / attempts |
| Photo requirement | 100% | Rejected no-photo visits / attempts |

---

## 8. Technical Infrastructure

### 8.1 Hosting & Storage

| Component | Technology | Notes |
|-----------|------------|-------|
| Application | AWS Lightsail | $10/month (2GB RAM) |
| Database | MongoDB Atlas | Free tier (M0) |
| File Storage | AWS S3 | Pay-per-use |
| SSL | Let's Encrypt | Auto-renewal |

### 8.2 Dependencies

| Dependency | Purpose |
|------------|---------|
| AWS Account | Lightsail + S3 hosting |
| MongoDB Atlas Account | Database hosting |
| Domain Name | Application access |
| Git Repository | Source control |

---

## 9. Constraints & Assumptions

### 9.1 Constraints
- Must work on tablets (primary device)
- Limited internet connectivity in field (online-only for Phase 1)
- Budget for AWS Lightsail (~$10-20/month)
- Photo storage costs must be managed (S3 pricing)

### 9.2 Assumptions
- Users have basic smartphone/tablet literacy
- Tablets have camera and GPS functionality
- 4G/LTE connectivity available in most areas
- Company will provide user training

---

## 10. Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Poor connectivity | High | Medium | Phase 3 offline mode |
| User resistance | Medium | Medium | Training, intuitive UI |
| Data loss | High | Low | Regular backups, S3 durability |
| Security breach | High | Low | AWS security best practices |
| Scope creep | Medium | High | Strict phase definitions |
| Performance issues | Medium | Medium | Optimization, monitoring |

---

## Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Product Owner | | | |
| Technical Lead | | | |
| Stakeholder | | | |
