# Security Checklist
## VIP Pharmacy CRM

**Version:** 2.1
**Last Updated:** December 2024

Use this checklist before deploying to production and during regular security audits.

---

## ✅ Phase 1 Security Implementation Summary

The following security features have been **implemented** as of December 2024:

### Backend Security
| Feature | Status | Details |
|---------|--------|---------|
| Rate Limiting | ✅ Implemented | 100 req/15min general, 20 req/15min auth (express-rate-limit) |
| Request Timeout | ✅ Implemented | 30 second timeout middleware |
| HSTS Headers | ✅ Implemented | 1 year max-age via helmet |
| Security Headers | ✅ Implemented | helmet with CSP in production |
| Input Validation | ✅ Implemented | express-validator on all endpoints |
| Password Hashing | ✅ Implemented | bcrypt with 12 salt rounds |
| JWT Auth | ✅ Implemented | 15min access, 7d refresh tokens |
| CORS | ✅ Implemented | Whitelist-based, credentials enabled |

### Frontend Security
| Feature | Status | Details |
|---------|--------|---------|
| ErrorBoundary | ✅ Implemented | Catches errors, prevents info leakage |
| Auth Token Handling | ✅ Implemented | CustomEvent for cross-context logout |
| Request Cancellation | ✅ Implemented | AbortController on unmount |
| GPS Timeout | ✅ Implemented | 5-minute timeout prevents hanging |

### Database Security
| Feature | Status | Details |
|---------|--------|---------|
| Compound Indexes | ✅ Implemented | Performance + constraint enforcement |
| TTL Index | ✅ Implemented | Password reset tokens auto-expire |
| Cascade Delete | ✅ Implemented | Doctor/Product cleanup hooks |
| Array Bounds | ✅ Implemented | Max 100 products bulk, 1-10 photos/visit |

### Critical Fixes Applied
| Fix | Details |
|-----|---------|
| CORS Middleware Order | Moved before rate limiter (429 responses now have CORS headers) |
| ISO Week Calculation | Fixed year boundary handling in Visit.js |
| canAccessAllRegions | Fixed default logic bug in User.js |

---

## 1. Pre-Deployment Security Tasks

### 1.1 Environment Configuration
- [ ] All sensitive data stored in environment variables
- [ ] `.env` files added to `.gitignore`
- [ ] No hardcoded credentials in source code
- [ ] Production environment variables set on server
- [ ] Different secrets for development and production
- [ ] `NODE_ENV` set to `production` on server

### 1.2 Dependencies
- [ ] Run `npm audit` and fix vulnerabilities
- [ ] Update outdated packages
- [ ] Remove unused dependencies
- [ ] Lock dependency versions in `package-lock.json`
- [ ] Review dependencies for known vulnerabilities
- [ ] Use only trusted, well-maintained packages

### 1.3 Code Review
- [ ] No `console.log` with sensitive data
- [ ] No commented-out code with secrets
- [ ] No TODO comments with security implications
- [ ] Error messages don't expose system details
- [ ] Stack traces disabled in production

---

## 2. Authentication Checklist

### 2.1 Password Security
- [ ] Passwords hashed with bcrypt (minimum 12 salt rounds)
- [ ] Minimum password length enforced (8+ characters)
- [ ] Password complexity requirements implemented
- [ ] Password not logged or exposed in responses
- [ ] Password reset tokens are single-use and expire
- [ ] Old password required to change password

### 2.2 JWT Implementation
- [ ] Strong, random JWT secret (256+ bits)
- [ ] Short access token expiry (15-30 minutes)
- [ ] Longer refresh token expiry (7 days)
- [ ] Tokens include only necessary claims
- [ ] Token signature verified on every request
- [ ] Tokens invalidated on logout
- [ ] Refresh token rotation implemented

### 2.3 Session Security
- [ ] HTTP-only cookies for refresh tokens
- [ ] Secure flag set on cookies (HTTPS only)
- [ ] SameSite cookie attribute set
- [ ] Session timeout after inactivity
- [ ] Concurrent session handling defined
- [ ] Session invalidation on password change

### 2.4 Login Security
- [ ] Rate limiting on login endpoint (5 attempts/15 min)
- [ ] Account lockout after failed attempts
- [ ] Login attempt logging
- [ ] Brute force protection
- [ ] Generic error messages (no user enumeration)
- [ ] CAPTCHA for repeated failures (future)

---

## 3. Authorization Checklist

### 3.1 Role-Based Access Control
- [ ] Roles defined (admin, medrep, employee)
- [ ] Permissions documented per role
- [ ] Role check middleware implemented
- [ ] Default role is least privileged
- [ ] Role escalation prevented
- [ ] Admin actions logged

### 3.2 Resource Authorization
- [ ] Users can only access their own data
- [ ] Region-based data filtering
- [ ] Owner verification on updates/deletes
- [ ] Horizontal privilege escalation prevented
- [ ] Vertical privilege escalation prevented
- [ ] API endpoints protected by role

### 3.3 Authorization Testing
- [ ] Test access with no token
- [ ] Test access with expired token
- [ ] Test access with invalid token
- [ ] Test access with wrong role
- [ ] Test access to other users' resources
- [ ] Test admin-only endpoints as regular user

---

## 4. Input Validation Checklist

### 4.1 General Validation
- [ ] All input validated on server side
- [ ] Client-side validation is supplementary only
- [ ] Whitelist validation where possible
- [ ] Input length limits enforced
- [ ] Data type validation
- [ ] Required fields enforced

### 4.2 String Validation
- [ ] Email format validation
- [ ] Phone number format validation
- [ ] URL validation
- [ ] No script tags allowed
- [ ] Special characters escaped/sanitized
- [ ] Unicode normalization applied

### 4.3 Numeric Validation
- [ ] Range validation (min/max)
- [ ] Integer vs float validation
- [ ] Negative number handling
- [ ] Precision limits for decimals
- [ ] Currency values validated

### 4.4 Date Validation
- [ ] Date format validation
- [ ] Future/past date validation
- [ ] Date range validation
- [ ] Timezone handling

### 4.5 Object ID Validation
- [ ] MongoDB ObjectId format validated
- [ ] Referenced documents exist
- [ ] User has access to referenced resource

---

## 5. File Upload Security

### 5.1 Upload Restrictions
- [ ] File type whitelist (JPEG, PNG, WebP only)
- [ ] MIME type validation
- [ ] File extension validation
- [ ] Magic number verification
- [ ] Maximum file size limit (5MB)
- [ ] Maximum files per request (5)

### 5.2 Storage Security (AWS S3)
- [ ] Files stored in private S3 bucket
- [ ] Unique filenames generated (UUID)
- [ ] Original filename not used
- [ ] S3 bucket configured with Block Public Access
- [ ] Signed URLs for private files (if needed)
- [ ] CORS configured for frontend origin only

### 5.3 Processing Security
- [ ] Images processed/resized on upload
- [ ] Metadata stripped from images
- [ ] Virus scanning (future consideration)
- [ ] Memory limits on upload processing
- [ ] Timeout on upload processing

---

## 6. API Security

### 6.1 Rate Limiting
- [ ] Global rate limit configured (100 req/15 min)
- [ ] Per-endpoint rate limits where needed
- [ ] Rate limit headers returned
- [ ] Rate limit bypass for trusted services
- [ ] DDoS protection considered

### 6.2 Request Security
- [ ] Request body size limited (10MB)
- [ ] Request timeout configured
- [ ] Malformed JSON rejected
- [ ] Query parameter limits
- [ ] Header size limits

### 6.3 Response Security
- [ ] Sensitive data excluded from responses
- [ ] Password never in responses
- [ ] Internal IDs not exposed
- [ ] Error details hidden in production
- [ ] Response headers secured

### 6.4 Security Headers (Helmet)
- [ ] `X-Content-Type-Options: nosniff`
- [ ] `X-Frame-Options: DENY`
- [ ] `X-XSS-Protection: 1; mode=block`
- [ ] `Strict-Transport-Security` (HSTS)
- [ ] `Content-Security-Policy` configured
- [ ] `Referrer-Policy` configured

### 6.5 CORS Configuration
- [ ] Origin whitelist configured
- [ ] Credentials allowed only for trusted origins
- [ ] Methods whitelist (GET, POST, PUT, DELETE)
- [ ] Headers whitelist
- [ ] Preflight caching configured

---

## 7. Database Security

### 7.1 MongoDB Security
- [ ] Authentication enabled
- [ ] Strong database password
- [ ] User has minimal required permissions
- [ ] Database not exposed to internet
- [ ] IP whitelist configured (Atlas)
- [ ] SSL/TLS connection enforced

### 7.2 Query Security
- [ ] Parameterized queries only
- [ ] No string concatenation in queries
- [ ] Query result limits enforced
- [ ] Projection used to limit returned fields
- [ ] Indexes for common queries
- [ ] Query timeout configured

### 7.3 Data Protection
- [ ] Sensitive fields encrypted at rest
- [ ] Backup encryption enabled
- [ ] Backup access restricted
- [ ] Data retention policy defined
- [ ] PII handling documented
- [ ] Audit logging for sensitive operations

---

## 8. Infrastructure Security (AWS)

### 8.1 AWS Lightsail Security
- [ ] OS updated and patched regularly
- [ ] Lightsail firewall configured (only ports 22, 80, 443)
- [ ] SSH key authentication only
- [ ] Root login disabled
- [ ] Fail2ban configured (optional)
- [ ] Instance snapshots enabled for backup

### 8.2 AWS IAM Security
- [ ] IAM user created for application (not root)
- [ ] Minimal permissions (S3 only)
- [ ] Access keys rotated periodically
- [ ] MFA enabled on AWS root account
- [ ] IAM policy uses least-privilege principle
- [ ] Access keys never committed to git

### 8.3 AWS S3 Security
- [ ] Block Public Access enabled
- [ ] Bucket policy restricts access
- [ ] CORS configured for specific origins
- [ ] Versioning enabled (optional)
- [ ] Server-side encryption enabled
- [ ] Access logging enabled (optional)

### 8.4 HTTPS/SSL
- [ ] SSL certificate installed (Let's Encrypt)
- [ ] HTTP redirected to HTTPS
- [ ] TLS 1.2+ only
- [ ] Strong cipher suites
- [ ] Certificate auto-renewal configured (Certbot)
- [ ] HSTS enabled

### 8.5 Nginx Security
- [ ] Server tokens hidden
- [ ] Directory listing disabled
- [ ] Unnecessary modules disabled
- [ ] Request size limits (10MB)
- [ ] Timeout configuration
- [ ] Access logs enabled

---

## 9. Logging & Monitoring

### 9.1 Security Logging
- [ ] Failed login attempts logged
- [ ] Authentication events logged
- [ ] Authorization failures logged
- [ ] Admin actions logged
- [ ] File upload attempts logged
- [ ] Suspicious activity logged

### 9.2 Log Security
- [ ] Logs don't contain sensitive data
- [ ] Passwords never logged
- [ ] Tokens not logged
- [ ] Log rotation configured
- [ ] Log access restricted
- [ ] Logs backed up

### 9.3 Monitoring
- [ ] Uptime monitoring
- [ ] Error rate monitoring
- [ ] Resource usage monitoring
- [ ] Security event alerts
- [ ] Anomaly detection (future)

---

## 10. Incident Response

### 10.1 Preparation
- [ ] Security contact defined
- [ ] Incident response plan documented
- [ ] Backup restoration tested
- [ ] Communication plan defined

### 10.2 Response Procedures
- [ ] How to revoke all tokens
- [ ] How to force password resets
- [ ] How to disable user accounts
- [ ] How to restore from backup
- [ ] How to check audit logs

---

## 11. Compliance Considerations

### 11.1 Data Privacy
- [ ] Data collection minimized
- [ ] Privacy policy documented
- [ ] User consent obtained
- [ ] Data export capability
- [ ] Data deletion capability
- [ ] Third-party data sharing documented

### 11.2 Healthcare Data (if applicable)
- [ ] PHI handling reviewed
- [ ] Access controls documented
- [ ] Audit trails maintained
- [ ] Encryption requirements met
- [ ] Business associate agreements

---

## 12. Regular Security Tasks

### 12.1 Weekly
- [ ] Review error logs
- [ ] Check failed login attempts
- [ ] Monitor resource usage

### 12.2 Monthly
- [ ] Run `npm audit`
- [ ] Review access logs
- [ ] Check SSL certificate expiry
- [ ] Verify backups

### 12.3 Quarterly
- [ ] Update dependencies
- [ ] Review user access
- [ ] Password policy review
- [ ] Security training refresh

### 12.4 Annually
- [ ] Full security audit
- [ ] Penetration testing
- [ ] Policy review
- [ ] Incident response drill

---

## Signature

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Security Review | | | |
| Technical Lead | | | |
| Project Manager | | | |
