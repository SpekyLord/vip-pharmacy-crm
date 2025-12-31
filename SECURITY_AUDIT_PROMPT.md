# Security Audit & Production Readiness Prompt for VIP CRM

## Instructions

Copy the entire prompt below (everything inside the code block) and paste it into a new Claude AI Opus 4.5 conversation. Then share the relevant code files for Claude to analyze.

---

## COMPLETE PROMPT (COPY-PASTE READY)

```
You are an expert Application Security Engineer and Production Readiness Consultant with deep expertise in Node.js/Express/MongoDB applications, OWASP security standards, AWS cloud security, and React frontend security. You are conducting a comprehensive security audit and production readiness assessment.

## PROJECT CONTEXT

**Application**: VIP CRM - Pharmaceutical Field Sales Management System
**Purpose**: Track BDM (Business Development Manager) visits to VIP Clients, manage product assignments, enforce visit schedules

**Technology Stack**:
- Backend: Node.js + Express.js (REST API)
- Database: MongoDB Atlas (cloud-hosted)
- Frontend: React + Vite (SPA)
- File Storage: AWS S3 (visit photos, product images)
- Authentication: JWT (access token: 15min, refresh token: 7d)
- Hosting: AWS Lightsail (planned)

**User Roles**:
- `admin`: Full system access, manages users and regions
- `medrep`: Medical representative, manages product-to-VIP Client assignments
- `bdm`: Business Development Manager, logs visits (restricted to assigned regions)

**Critical Business Rules**:
1. Maximum ONE visit per VIP Client per week (Monday-Friday only)
2. Monthly quota based on visitFrequency (2 or 4 visits/month)
3. Visits require GPS coordinates + photo proof
4. BDMs can only access VIP Clients in their assigned regions

---

## YOUR MISSION

Perform a thorough security vulnerability assessment and production readiness review covering ALL of the following areas:

### 1. AUTHENTICATION & AUTHORIZATION SECURITY
Review these files:
- `backend/middleware/auth.js` - JWT token validation, protect middleware
- `backend/middleware/roleCheck.js` - RBAC implementation, region access
- `backend/controllers/authController.js` - Login, register, password reset
- `backend/utils/generateToken.js` - JWT generation
- `backend/models/User.js` - Password hashing, user schema
- `frontend/src/context/AuthContext.jsx` - Token storage, session management
- `frontend/src/services/api.js` - API interceptors, token injection

Check for:
[ ] JWT secret strength requirements and rotation policy
[ ] Token expiration adequacy (access: 15min, refresh: 7d)
[ ] Refresh token storage and validation security
[ ] Password reset token security (hashing, expiration)
[ ] Bcrypt salt rounds (should be 12+)
[ ] Session invalidation on password change
[ ] Account lockout after failed login attempts
[ ] Token revocation mechanism
[ ] Secure token storage (localStorage vs httpOnly cookies)
[ ] Authentication bypass vulnerabilities

### 2. OWASP TOP 10 (2021) ASSESSMENT

**A01: Broken Access Control**
- Review `backend/middleware/roleCheck.js` for RBAC enforcement
- Check for IDOR vulnerabilities in `backend/controllers/visitController.js`
- Verify region-based access in `backend/controllers/vipClientController.js`
- Test for horizontal/vertical privilege escalation

**A02: Cryptographic Failures**
- Verify password hashing in `backend/models/User.js`
- Check JWT signing algorithm strength
- Review sensitive data exposure in API responses

**A03: Injection**
- Check for NoSQL injection in all MongoDB queries
- Review `backend/middleware/validation.js` for input sanitization
- Check for command injection in file operations
- Verify XSS prevention in React components

**A04: Insecure Design**
- Assess business logic vulnerabilities (visit limit bypass)
- Review API rate limiting in `backend/server.js`
- Check for mass assignment vulnerabilities

**A05: Security Misconfiguration**
- Review `backend/server.js` for security middleware (Helmet, CORS)
- Check environment variable handling
- Verify error messages don't leak sensitive info

**A06: Vulnerable Components**
- Audit `backend/package.json` dependencies
- Audit `frontend/package.json` dependencies
- Check for outdated packages with known CVEs

**A07: Authentication Failures**
- Covered in Section 1 above

**A08: Software and Data Integrity Failures**
- Check for insecure deserialization
- Review file upload integrity in `backend/middleware/upload.js`

**A09: Security Logging and Monitoring**
- Assess audit trail completeness
- Review error logging practices
- Check for security event logging

**A10: Server-Side Request Forgery (SSRF)**
- Check for URL-based operations that could be exploited

### 3. INPUT VALIDATION & INJECTION PREVENTION
Review these files:
- `backend/middleware/validation.js` - Express-validator rules
- `backend/middleware/upload.js` - File upload handling
- `backend/controllers/*.js` - All controller query patterns

Check for:
[ ] NoSQL injection vulnerabilities ($where, $regex without sanitization)
[ ] Missing validation on any endpoint
[ ] File upload path traversal attacks
[ ] File type validation bypass (magic bytes vs extension)
[ ] GPS coordinate manipulation
[ ] Email/phone validation completeness
[ ] ObjectId validation for BOLA/IDOR prevention
[ ] Array/object size limits to prevent DoS

### 4. API SECURITY
Review these files:
- `backend/server.js` - Security middleware setup
- `backend/routes/*.js` - Route definitions
- `backend/middleware/errorHandler.js` - Error handling

Check for:
[ ] Rate limiting effectiveness (general: 100/15min, auth: 20/15min)
[ ] CORS misconfiguration (production vs development)
[ ] Error message information disclosure
[ ] Missing authentication on sensitive endpoints
[ ] HTTP method restrictions
[ ] Request body/payload size limits
[ ] Request timeout configuration
[ ] API versioning security

### 5. FRONTEND SECURITY
Review these files:
- `frontend/src/services/api.js` - Axios configuration
- `frontend/src/context/AuthContext.jsx` - Auth state management
- `frontend/src/components/auth/ProtectedRoute.jsx` - Route protection
- `frontend/src/components/**/*.jsx` - React components

Check for:
[ ] XSS vulnerabilities (dangerouslySetInnerHTML usage)
[ ] Token storage security (localStorage exposure)
[ ] Sensitive data in browser storage/console
[ ] CSRF protection mechanisms
[ ] Secure redirect handling after login
[ ] Client-side validation bypass potential
[ ] React component security patterns

### 6. FILE UPLOAD SECURITY
Review these files:
- `backend/middleware/upload.js` - Multer configuration
- `backend/config/s3.js` - AWS S3 configuration

Check for:
[ ] MIME type validation (should check magic bytes, not just extension)
[ ] File size limits (currently 5MB)
[ ] File count limits (currently 5 files)
[ ] Path traversal prevention (UUID filenames)
[ ] S3 bucket policy security
[ ] Signed URL expiration (currently 24 hours)
[ ] Malicious file content scanning

### 7. DATABASE SECURITY
Review these files:
- `backend/config/db.js` - MongoDB connection
- `backend/models/*.js` - Mongoose schemas

Check for:
[ ] Connection string security (no credentials in code)
[ ] Query injection prevention
[ ] Index optimization for security queries
[ ] Data encryption at rest considerations
[ ] Sensitive field exclusion (password select: false)

### 8. INFRASTRUCTURE & CONFIGURATION
Review these files:
- `backend/server.js` - Express configuration
- `backend/.env.example` - Environment variables
- `backend/config/s3.js` - AWS configuration

Check for:
[ ] Environment variable validation on startup
[ ] Production vs development configuration separation
[ ] HTTPS enforcement
[ ] Security headers (HSTS, CSP, X-Frame-Options, etc.)
[ ] Helmet.js configuration completeness
[ ] AWS IAM least privilege principle
[ ] S3 bucket public access settings

---

## DELIVERABLES REQUIRED

### 1. Executive Summary
- Overall security posture rating: CRITICAL / HIGH / MEDIUM / LOW / SECURE
- Production readiness assessment: READY / NEEDS WORK / NOT READY
- Top 5 critical findings requiring immediate attention

### 2. Detailed Findings Report
Present findings in this table format:

| ID | Severity | Category | Finding | File:Line | Recommendation |
|----|----------|----------|---------|-----------|----------------|
| SEC-001 | CRITICAL | Auth | [Description] | backend/middleware/auth.js:45 | [Fix] |
| SEC-002 | HIGH | Injection | [Description] | backend/controllers/visitController.js:123 | [Fix] |

### 3. Severity Classification Guide
- **CRITICAL**: Immediate exploitation possible, severe data breach/system compromise potential
- **HIGH**: Exploitable with moderate effort, significant security impact
- **MEDIUM**: Requires specific conditions to exploit, moderate impact
- **LOW**: Minimal impact, security hardening recommendation
- **INFO**: Best practice suggestion, no immediate risk

### 4. Code Examples for Each Finding
For every vulnerability found, provide:
```
VULNERABLE CODE:
[Show the problematic code snippet]

ATTACK SCENARIO:
[Explain how an attacker could exploit this]

FIXED CODE:
[Show the corrected implementation]

REFERENCES:
- OWASP: [relevant link]
- CWE: [CWE number]
```

### 5. Production Readiness Checklist
```
SECURITY HARDENING:
[ ] All CRITICAL vulnerabilities resolved
[ ] All HIGH vulnerabilities resolved or mitigated
[ ] Rate limiting on all public endpoints
[ ] CORS restricted to production domains only
[ ] Helmet.js with strict CSP
[ ] Security logging and monitoring
[ ] Dependency vulnerabilities patched

DEPLOYMENT READINESS:
[ ] Environment variables documented and validated
[ ] Production build tested
[ ] Health check endpoints functional
[ ] Database indexes optimized
[ ] Error handling production-safe (no stack traces)
[ ] Graceful shutdown implemented
[ ] Backup and recovery tested

COMPLIANCE:
[ ] Password policy enforced
[ ] Session management secure
[ ] Audit trail complete
[ ] Data retention policy implemented
[ ] GDPR considerations addressed
```

### 6. Prioritized Remediation Roadmap
Organize fixes by priority:
1. **Immediate (P0)**: CRITICAL vulnerabilities - fix before any deployment
2. **Short-term (P1)**: HIGH vulnerabilities - fix within 1 sprint
3. **Medium-term (P2)**: MEDIUM vulnerabilities - fix within 1 month
4. **Long-term (P3)**: LOW/INFO items - address in future sprints

---

## ADDITIONAL CONTEXT

### Existing Security Measures Already Implemented
- JWT authentication with access/refresh tokens
- Bcrypt password hashing (12 rounds)
- Rate limiting (express-rate-limit)
- CORS with Origin header enforcement in production
- Helmet.js security headers (HSTS enabled)
- Express-validator for input validation
- Multer with file type/size limits
- MongoDB unique constraints for visit enforcement
- Role-based access control (admin, medrep, bdm)
- Region-based hierarchical access
- Error handling with production/development modes
- Request timeout (30 seconds)

### Known Areas of Concern
1. localStorage used for token storage (vs httpOnly cookies)
2. No account lockout after failed login attempts
3. No security logging/monitoring system
4. No CSP policy defined
5. Dependency audit not recently performed

### Business Logic Security
The visit enforcement system is critical:
- Weekly limit: 1 visit per VIP Client per week (yearWeekKey unique constraint)
- Monthly quota: 2 or 4 visits based on visitFrequency
- GPS coordinates required for proof
- Photo evidence required (1-10 photos)
- Region-based access (BDMs see only their assigned regions)

Any bypass of these rules would be a CRITICAL business vulnerability.

---

## OUTPUT FORMAT

Please structure your response as:
1. **Executive Summary** (1 paragraph)
2. **Findings Table** (sorted by severity)
3. **Detailed Analysis by Category** (with code examples)
4. **Production Readiness Verdict**
5. **Remediation Roadmap**

Be direct, specific, and provide actionable recommendations. Reference OWASP guidelines and CWE numbers where applicable. Focus on practical fixes that can be implemented.
```

---

## Files to Share with Claude

After pasting the prompt, share these files in order of priority:

### Backend (Critical)
1. `backend/middleware/auth.js`
2. `backend/middleware/roleCheck.js`
3. `backend/controllers/authController.js`
4. `backend/middleware/validation.js`
5. `backend/middleware/upload.js`
6. `backend/middleware/errorHandler.js`
7. `backend/server.js`
8. `backend/controllers/visitController.js`
9. `backend/controllers/vipClientController.js`
10. `backend/models/User.js`

### Frontend (Important)
1. `frontend/src/services/api.js`
2. `frontend/src/context/AuthContext.jsx`
3. `frontend/src/components/auth/ProtectedRoute.jsx`

### Configuration
1. `backend/config/s3.js`
2. `backend/config/db.js`
3. `backend/.env.example`
4. `backend/package.json`
5. `frontend/package.json`
