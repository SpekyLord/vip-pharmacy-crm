# API Documentation
## VIP CRM

**Base URL:** `https://your-domain.com/api`
**Version:** 3.0
**Last Updated:** January 2026 (Security Hardening Update)

---

## 1. Overview

### 1.1 Authentication
Authentication is handled via **httpOnly cookies**. After login, the server sets:
- `accessToken` cookie (httpOnly, secure in production, 15 min expiry)
- `refreshToken` cookie (httpOnly, secure in production, 7 day expiry)

**Important:** Tokens are NOT returned in JSON response bodies for security (XSS protection).

For API requests, cookies are sent automatically when using `credentials: 'include'`:
```javascript
// Frontend example
fetch('/api/users', { credentials: 'include' })
```

Legacy Bearer token header is still accepted for API testing tools:
```
Authorization: Bearer <access_token>
```

### 1.2 Content Type
All requests and responses use JSON:

```
Content-Type: application/json
```

For file uploads, use:
```
Content-Type: multipart/form-data
```

### 1.3 Rate Limiting
- **General Limit:** 100 requests per 15 minutes per IP
- **Auth Limit:** 20 requests per 15 minutes per IP (login, register, password reset)
- **Headers:**
  - `X-RateLimit-Limit`: Maximum requests allowed
  - `X-RateLimit-Remaining`: Requests remaining
  - `X-RateLimit-Reset`: Timestamp when limit resets

### 1.4 Account Lockout
After 5 failed login attempts, the account is locked for 15 minutes:
- **Max Attempts:** 5 per account
- **Lockout Duration:** 15 minutes
- **Status Code:** 423 (Locked)

### 1.5 Role-Based Access
| Role | Description | Access Level |
|------|-------------|--------------|
| `admin` | System administrator | Full access to all resources and regions |
| `medrep` | Medical representative manager | Manages product assignments |
| `bdm` | Business Development Manager | Limited to assigned regions |

---

## 2. Response Formats

### 2.1 Success Response
```json
{
  "success": true,
  "message": "Optional success message",
  "data": { ... }
}
```

### 2.2 Paginated Response
```json
{
  "success": true,
  "data": [ ... ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "pages": 5
  }
}
```

### 2.3 Error Response
```json
{
  "success": false,
  "message": "Human readable error message",
  "errors": [
    {
      "field": "email",
      "message": "Invalid email format"
    }
  ]
}
```

### 2.4 Visit Limit Error Response
When weekly or monthly visit limits are exceeded:
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

### 2.5 Account Lockout Response
When account is locked due to failed login attempts:
```json
{
  "success": false,
  "message": "Account is temporarily locked. Try again in 15 minutes.",
  "data": {
    "lockedUntil": "2025-12-20T10:00:00Z",
    "remainingSeconds": 900
  }
}
```

### 2.6 Failed Login Response (with remaining attempts)
```json
{
  "success": false,
  "message": "Invalid email or password. 3 attempts remaining."
}
```

---

## 3. Error Codes

### 3.1 HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request - Invalid input or business rule violation |
| 401 | Unauthorized - Invalid or missing token |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource doesn't exist |
| 423 | Locked - Account temporarily locked due to failed login attempts |
| 429 | Too Many Requests - Rate limit exceeded |
| 500 | Internal Server Error |

---

## 4. Authentication Endpoints

### 4.1 Register User

**POST** `/auth/register`

Create new user account (Admin only in production).

**Request:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "Password123",
  "role": "bdm",
  "phone": "+1234567890",
  "assignedRegions": ["507f1f77bcf86cd799439012"]
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Registration successful",
  "data": {
    "user": {
      "_id": "507f1f77bcf86cd799439011",
      "name": "John Doe",
      "email": "john@example.com",
      "role": "bdm"
    }
  }
}
```
**Note:** Tokens are set as httpOnly cookies, not in response body.

---

### 4.2 Login

**POST** `/auth/login`

Authenticate user and receive tokens.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "_id": "507f1f77bcf86cd799439011",
      "name": "John Doe",
      "email": "user@example.com",
      "role": "bdm",
      "assignedRegions": [
        {
          "_id": "507f1f77bcf86cd799439012",
          "name": "North Region",
          "code": "NORTH"
        }
      ]
    }
  }
}
```
**Note:** Tokens are set as httpOnly cookies, not in response body.

**Error Response (423) - Account Locked:**
```json
{
  "success": false,
  "message": "Account is temporarily locked. Try again in 15 minutes.",
  "data": {
    "lockedUntil": "2025-12-20T10:00:00Z",
    "remainingSeconds": 900
  }
}
```

---

### 4.3 Logout

**POST** `/auth/logout`

Invalidate current session.

**Headers:** `Authorization: Bearer <access_token>`

**Response (200):**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

### 4.4 Refresh Token

**POST** `/auth/refresh-token`

Get new access token using refresh token. The refresh token is read from httpOnly cookie.

**Request:** No body required (refresh token is in httpOnly cookie)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```
**Note:** New access token is also set as httpOnly cookie.

---

### 4.5 Forgot Password

**POST** `/auth/forgot-password`

Request password reset.

**Request:**
```json
{
  "email": "user@example.com"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "If an account with that email exists, a password reset link has been sent."
}
```

---

### 4.6 Reset Password

**POST** `/auth/reset-password/:token`

Reset password using token.

**Request:**
```json
{
  "password": "NewPassword123"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Password reset successful. Please log in with your new password."
}
```

---

### 4.7 Get Current User

**GET** `/auth/me`

Get current authenticated user's profile.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "bdm",
    "phone": "+1234567890",
    "avatar": "https://s3.amazonaws.com/.../avatar.jpg",
    "assignedRegions": [
      {
        "_id": "507f1f77bcf86cd799439012",
        "name": "North Region",
        "code": "NORTH",
        "level": "district"
      }
    ],
    "isActive": true
  }
}
```

---

### 4.8 Update Password

**PUT** `/auth/update-password`

Update current user's password.

**Request:**
```json
{
  "currentPassword": "OldPassword123",
  "newPassword": "NewPassword456"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Password updated successfully"
}
```
**Note:** New tokens are set as httpOnly cookies.

---

## 5. Visit Endpoints

### 5.1 Create Visit

**POST** `/visits`

Log a new VIP Client visit. Requires photo upload and GPS location.

**Headers:** `Content-Type: multipart/form-data`

**Request:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| vipClient | ObjectId | Yes | VIP Client ID |
| visitDate | Date | No | Visit date (default: now) |
| visitType | String | No | regular, follow-up, emergency |
| location.latitude | Number | Yes | GPS latitude |
| location.longitude | Number | Yes | GPS longitude |
| location.accuracy | Number | No | GPS accuracy in meters |
| photos | File[] | Yes | At least 1 photo required |
| productsDiscussed | Array | No | Products discussed |
| purpose | String | No | Visit purpose |
| vipClientFeedback | String | No | VIP Client's feedback |
| notes | String | No | Additional notes |
| duration | Number | No | Duration in minutes |
| nextVisitDate | Date | No | Scheduled next visit |

**Response (201):**
```json
{
  "success": true,
  "message": "Visit logged successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439031",
    "vipClient": {
      "_id": "507f1f77bcf86cd799439020",
      "name": "Dr. Sarah Smith",
      "specialization": "Cardiology",
      "hospital": "City Hospital"
    },
    "visitDate": "2025-01-20T14:00:00Z",
    "visitType": "regular",
    "weekLabel": "W3D1",
    "monthYear": "2025-01",
    "location": {
      "latitude": 14.5995,
      "longitude": 120.9842,
      "accuracy": 10
    },
    "photos": [
      {
        "url": "https://s3.amazonaws.com/.../visit-photo-1.jpg",
        "capturedAt": "2025-01-20T14:00:00Z"
      }
    ],
    "status": "completed"
  }
}
```

**Error Response (Weekly Limit):**
```json
{
  "success": false,
  "message": "You have already visited this VIP Client this week",
  "data": {
    "weeklyCount": 1,
    "monthlyCount": 2,
    "monthlyLimit": 2
  }
}
```

---

### 5.2 Get All Visits

**GET** `/visits`

Get visits with filtering. BDMs see only their visits; admins see all.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| page | Number | Page number (default: 1) |
| limit | Number | Items per page (default: 20, max: 100) |
| status | String | Filter by status (completed, cancelled) |
| monthYear | String | Filter by month (YYYY-MM format) |
| userId | ObjectId | Filter by user (admin only) |
| vipClientId | ObjectId | Filter by VIP Client |

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439031",
      "vipClient": {
        "_id": "507f1f77bcf86cd799439020",
        "name": "Dr. Sarah Smith",
        "specialization": "Cardiology",
        "hospital": "City Hospital"
      },
      "user": {
        "_id": "507f1f77bcf86cd799439011",
        "name": "John Doe",
        "email": "john@example.com"
      },
      "visitDate": "2025-01-20T14:00:00Z",
      "visitType": "regular",
      "status": "completed"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "pages": 3
  }
}
```

---

### 5.3 Get Visit by ID

**GET** `/visits/:id`

Get single visit details.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439031",
    "vipClient": {
      "_id": "507f1f77bcf86cd799439020",
      "name": "Dr. Sarah Smith",
      "specialization": "Cardiology",
      "hospital": "City Hospital",
      "address": { ... },
      "phone": "+1234567890"
    },
    "user": {
      "_id": "507f1f77bcf86cd799439011",
      "name": "John Doe",
      "email": "john@example.com"
    },
    "visitDate": "2025-01-20T14:00:00Z",
    "visitType": "regular",
    "weekNumber": 3,
    "weekOfMonth": 3,
    "dayOfWeek": 1,
    "weekLabel": "W3D1",
    "monthYear": "2025-01",
    "location": {
      "latitude": 14.5995,
      "longitude": 120.9842,
      "accuracy": 10,
      "capturedAt": "2025-01-20T14:00:00Z"
    },
    "photos": [
      {
        "url": "https://s3.amazonaws.com/.../visit-photo.jpg",
        "capturedAt": "2025-01-20T14:00:00Z"
      }
    ],
    "productsDiscussed": [
      {
        "product": {
          "_id": "507f1f77bcf86cd799439040",
          "name": "CardioMax 100mg",
          "briefDescription": "Blood pressure medication",
          "image": "https://s3.amazonaws.com/.../product.jpg"
        },
        "discussed": true,
        "sampleGiven": true,
        "quantity": 5
      }
    ],
    "purpose": "Quarterly review",
    "vipClientFeedback": "Interested in new formulation",
    "notes": "Schedule follow-up",
    "duration": 30,
    "nextVisitDate": "2025-02-20T14:00:00Z",
    "status": "completed"
  }
}
```

---

### 5.4 Update Visit

**PUT** `/visits/:id`

Update visit details (limited fields).

**Request:**
```json
{
  "vipClientFeedback": "Updated feedback",
  "notes": "Additional notes",
  "nextVisitDate": "2025-02-25T10:00:00Z"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Visit updated successfully",
  "data": { ... }
}
```

---

### 5.5 Cancel Visit

**PUT** `/visits/:id/cancel`

Cancel a visit.

**Request:**
```json
{
  "reason": "VIP Client unavailable"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Visit cancelled",
  "data": {
    "_id": "507f1f77bcf86cd799439031",
    "status": "cancelled",
    "cancelReason": "VIP Client unavailable"
  }
}
```

---

### 5.6 Get Visits by User

**GET** `/visits/user/:userId`

Get visits for a specific user.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| page | Number | Page number |
| limit | Number | Items per page |
| monthYear | String | Filter by month (YYYY-MM) |

**Response (200):** Same as Get All Visits

---

### 5.7 Get Today's Visits

**GET** `/visits/today`

Get current user's visits for today.

**Response (200):**
```json
{
  "success": true,
  "data": [ ... ],
  "count": 3
}
```

---

### 5.8 Check Can Visit VIP Client

**GET** `/visits/can-visit/:vipClientId`

Check if current user can visit a specific VIP Client (weekly/monthly limits).

**Response (200):**
```json
{
  "success": true,
  "data": {
    "canVisit": true,
    "weeklyCount": 0,
    "monthlyCount": 1,
    "monthlyLimit": 4
  }
}
```

**Response (200) - Cannot Visit:**
```json
{
  "success": true,
  "data": {
    "canVisit": false,
    "reason": "Monthly visit limit reached (4/4)",
    "weeklyCount": 1,
    "monthlyCount": 4,
    "monthlyLimit": 4
  }
}
```

---

### 5.9 Get Weekly Compliance

**GET** `/visits/weekly-compliance/:userId`

Get weekly visit compliance report for a user.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| monthYear | String | Month to check (YYYY-MM, default: current) |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "monthYear": "2025-01",
    "assignedVIPClients": 20,
    "vipClientsVisited": 15,
    "totalVisitsRequired": 60,
    "totalVisitsCompleted": 45,
    "complianceRate": 75,
    "weeklyBreakdown": [
      { "week": 1, "visitsRequired": 15, "visitsCompleted": 12 },
      { "week": 2, "visitsRequired": 15, "visitsCompleted": 15 },
      { "week": 3, "visitsRequired": 15, "visitsCompleted": 10 },
      { "week": 4, "visitsRequired": 15, "visitsCompleted": 8 }
    ],
    "behindSchedule": [
      {
        "vipClient": { "_id": "...", "name": "Dr. Smith" },
        "requiredVisits": 4,
        "completedVisits": 2
      }
    ]
  }
}
```

---

### 5.10 Get Compliance Alerts

**GET** `/visits/compliance-alerts`

Get BDMs who are behind schedule (Admin only).

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "bdm": {
        "_id": "507f1f77bcf86cd799439011",
        "name": "John Doe",
        "email": "john@example.com"
      },
      "assignedVIPClients": 20,
      "expectedVisits": 45,
      "completedVisits": 30,
      "behindBy": 15,
      "complianceRate": 66.7
    }
  ],
  "count": 3
}
```

---

### 5.11 Get Visit Statistics

**GET** `/visits/stats`

Get visit statistics.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| monthYear | String | Filter by month |
| userId | ObjectId | Filter by user (admin only) |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalVisits": 245,
      "uniqueVIPClientsCount": 85,
      "avgDuration": 25
    },
    "weeklyBreakdown": [
      { "week": 1, "visitCount": 62, "vipClientCount": 55 },
      { "week": 2, "visitCount": 58, "vipClientCount": 52 },
      { "week": 3, "visitCount": 65, "vipClientCount": 58 },
      { "week": 4, "visitCount": 60, "vipClientCount": 54 }
    ]
  }
}
```

---

## 6. VIP Client Endpoints

### 6.1 Get All VIP Clients

**GET** `/doctors`

Get VIP Clients. BDMs see only VIP Clients in their assigned regions.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| page | Number | Page number |
| limit | Number | Items per page |
| region | ObjectId | Filter by region |
| visitFrequency | Number | Filter by frequency (2 or 4) |
| search | String | Search by name or specialization |
| isActive | Boolean | Filter by status |

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439020",
      "name": "Dr. Sarah Smith",
      "specialization": "Cardiology",
      "hospital": "City Hospital",
      "visitFrequency": 4,
      "region": {
        "_id": "507f1f77bcf86cd799439012",
        "name": "North Region"
      },
      "isActive": true
    }
  ],
  "pagination": { ... }
}
```

---

### 6.2 Get VIP Client by ID

**GET** `/doctors/:id`

Get VIP Client details.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439020",
    "name": "Dr. Sarah Smith",
    "specialization": "Cardiology",
    "hospital": "City Hospital",
    "address": {
      "street": "123 Medical Ave",
      "city": "Metro City",
      "province": "Central",
      "postalCode": "10001"
    },
    "region": {
      "_id": "507f1f77bcf86cd799439012",
      "name": "North Region"
    },
    "phone": "+1234567890",
    "email": "dr.smith@hospital.com",
    "visitFrequency": 4,
    "clinicSchedule": {
      "monday": { "available": true, "hours": "9:00 AM - 5:00 PM" },
      "tuesday": { "available": true, "hours": "9:00 AM - 5:00 PM" },
      "wednesday": { "available": false, "hours": "" },
      "thursday": { "available": true, "hours": "9:00 AM - 12:00 PM" },
      "friday": { "available": true, "hours": "9:00 AM - 5:00 PM" }
    },
    "notes": "Prefers morning visits",
    "isActive": true
  }
}
```

---

### 6.3 Create VIP Client

**POST** `/doctors`

Create new VIP Client (Admin/MedRep only).

**Request:**
```json
{
  "name": "Dr. James Wilson",
  "specialization": "Neurology",
  "hospital": "General Hospital",
  "address": {
    "street": "456 Health Blvd",
    "city": "Metro City",
    "province": "Central",
    "postalCode": "10002"
  },
  "region": "507f1f77bcf86cd799439012",
  "phone": "+1234567890",
  "email": "dr.wilson@hospital.com",
  "visitFrequency": 2,
  "clinicSchedule": {
    "monday": { "available": true, "hours": "10:00 AM - 4:00 PM" },
    "friday": { "available": true, "hours": "10:00 AM - 4:00 PM" }
  }
}
```

**Response (201):** Created VIP Client object

---

### 6.4 Update VIP Client

**PUT** `/doctors/:id`

Update VIP Client details (Admin/MedRep only).

---

### 6.5 Delete VIP Client

**DELETE** `/doctors/:id`

Soft delete (deactivate) VIP Client (Admin only).

---

## 7. Product Endpoints

### 7.1 Get All Products

**GET** `/products`

Get product catalog.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| category | String | Filter by category |
| search | String | Search by name |
| isActive | Boolean | Filter by status |

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439040",
      "name": "CardioMax 100mg",
      "category": "Cardiovascular",
      "briefDescription": "Blood pressure medication for hypertension",
      "keyBenefits": [
        "Fast-acting formula",
        "Once daily dosing",
        "Minimal side effects"
      ],
      "price": 45.99,
      "image": "https://s3.amazonaws.com/.../product.jpg",
      "isActive": true
    }
  ],
  "pagination": { ... }
}
```

---

### 7.2 Get Product by ID

**GET** `/products/:id`

Get product details.

---

### 7.3 Create Product

**POST** `/products`

Create new product (Admin only).

**Headers:** `Content-Type: multipart/form-data`

**Request:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | String | Yes | Product name |
| category | String | Yes | Product category |
| briefDescription | String | Yes | Short description (max 200 chars) |
| description | String | No | Full description |
| keyBenefits | Array | No | List of benefits (max 10) |
| usageInformation | String | No | Usage instructions |
| price | Number | No | Product price |
| image | File | No | Product image |

---

### 7.4 Update Product

**PUT** `/products/:id`

Update product (Admin only).

---

### 7.5 Delete Product

**DELETE** `/products/:id`

Soft delete (deactivate) product (Admin only).

---

## 8. Product Assignment Endpoints

### 8.1 Get All Assignments

**GET** `/assignments`

Get product-to-VIP Client assignments (MedRep/Admin).

---

### 8.2 Create Assignment

**POST** `/assignments`

Assign product to VIP Client (MedRep only).

**Request:**
```json
{
  "product": "507f1f77bcf86cd799439040",
  "vipClient": "507f1f77bcf86cd799439020",
  "priority": 1,
  "notes": "Focus on new formulation benefits"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439050",
    "product": {
      "_id": "507f1f77bcf86cd799439040",
      "name": "CardioMax 100mg"
    },
    "vipClient": {
      "_id": "507f1f77bcf86cd799439020",
      "name": "Dr. Sarah Smith"
    },
    "assignedBy": {
      "_id": "507f1f77bcf86cd799439010",
      "name": "MedRep User"
    },
    "priority": 1,
    "status": "active",
    "createdAt": "2025-01-20T10:00:00Z"
  }
}
```

---

### 8.3 Update Assignment

**PUT** `/assignments/:id`

Update assignment (MedRep only).

---

### 8.4 Delete Assignment

**DELETE** `/assignments/:id`

Remove assignment (MedRep only).

---

### 8.5 Get VIP Client's Assignments

**GET** `/assignments/doctor/:vipClientId`

Get all product assignments for a VIP Client.

---

## 9. Region Endpoints

### 9.1 Get All Regions

**GET** `/regions`

Get flat list of all regions.

---

### 9.2 Get Region Hierarchy

**GET** `/regions/hierarchy`

Get region tree structure.

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439060",
      "name": "Philippines",
      "code": "PH",
      "level": "country",
      "children": [
        {
          "_id": "507f1f77bcf86cd799439061",
          "name": "Metro Manila",
          "code": "NCR",
          "level": "province",
          "children": [
            {
              "_id": "507f1f77bcf86cd799439062",
              "name": "Makati",
              "code": "MKT",
              "level": "city"
            }
          ]
        }
      ]
    }
  ]
}
```

---

### 9.3 Create Region

**POST** `/regions`

Create new region (Admin only).

**Request:**
```json
{
  "name": "New District",
  "code": "NEWDIST",
  "level": "district",
  "parent": "507f1f77bcf86cd799439061",
  "description": "Newly created district"
}
```

---

## 10. User Endpoints

### 10.1 Get All Users

**GET** `/users`

Get all users (Admin only).

---

### 10.2 Get User by ID

**GET** `/users/:id`

Get user details (Admin or self).

---

### 10.3 Create User

**POST** `/users`

Create new user (Admin only).

---

### 10.4 Update User

**PUT** `/users/:id`

Update user (Admin or self for limited fields).

---

### 10.5 Delete User

**DELETE** `/users/:id`

Deactivate user (Admin only).

---

### 10.6 Update User Regions

**PUT** `/users/:id/regions`

Update user's assigned regions (Admin only).

**Request:**
```json
{
  "assignedRegions": [
    "507f1f77bcf86cd799439012",
    "507f1f77bcf86cd799439013"
  ]
}
```

---

## 11. File Upload Guidelines

### 11.1 Supported Formats
- **Images:** JPEG, PNG, WebP
- **Max Size:** 5MB per file
- **Max Files:** 5 photos per visit

### 11.2 S3 Storage
All files are stored in AWS S3:
- `visits/` - Visit proof photos
- `products/` - Product images
- `avatars/` - User profile pictures

### 11.3 Upload Example (Visit)
```bash
curl -X POST https://your-domain.com/api/visits \
  -H "Authorization: Bearer <token>" \
  -F "vipClient=507f1f77bcf86cd799439020" \
  -F "location.latitude=14.5995" \
  -F "location.longitude=120.9842" \
  -F "photos=@photo1.jpg" \
  -F "photos=@photo2.jpg"
```

---

## 12. Webhooks (Phase 2)

### 12.1 Available Events
| Event | Description |
|-------|-------------|
| `visit.created` | New visit logged |
| `visit.cancelled` | Visit cancelled |
| `compliance.alert` | BDM behind schedule |
| `user.created` | New user registered |

### 12.2 Webhook Payload
```json
{
  "event": "visit.created",
  "timestamp": "2025-01-20T14:00:00Z",
  "data": { ... }
}
```
