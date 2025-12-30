# Technical Specification
## VIP CRM

**Version:** 2.0
**Last Updated:** December 2024

---

## 1. Tech Stack

### 1.1 Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| React | 18.3.x | UI library |
| Vite | 5.4.x | Build tool & dev server |
| React Router | 6.28.x | Client-side routing |
| React Context | (built-in) | State management (AuthContext) |
| Axios | 1.7.x | HTTP client |
| React Hot Toast | 2.4.x | Toast notifications |
| React Icons | 5.3.x | Icon library |

### 1.2 Backend
| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | 18.x+ | Runtime environment |
| Express.js | 4.18.x | Web framework |
| Mongoose | 8.x | MongoDB ODM |
| JWT | 9.x | Authentication tokens |
| bcryptjs | 2.4.x | Password hashing |
| Multer | 1.4.x | File upload handling |
| @aws-sdk/client-s3 | 3.x | AWS S3 integration |
| @aws-sdk/lib-storage | 3.x | Multipart uploads |
| Helmet | 8.x | Security headers |
| express-rate-limit | 8.x | Rate limiting |
| express-validator | 7.x | Input validation |
| cookie-parser | 1.4.x | Cookie handling |
| cors | 2.8.x | CORS middleware |

### 1.3 Database
| Technology | Version | Purpose |
|------------|---------|---------|
| MongoDB | 7.x | Primary database |
| MongoDB Atlas | - | Cloud hosting |

### 1.4 Cloud Services & DevOps
| Technology | Purpose |
|------------|---------|
| AWS Lightsail | Application hosting |
| AWS S3 | Image and file storage |
| PM2 | Process management |
| Let's Encrypt | SSL certificates |
| Git | Version control |

---

## 2. System Architecture

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENTS                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                          │
│  │   Tablet    │  │   Desktop   │  │   Mobile    │                          │
│  │  (Primary)  │  │  (Admin)    │  │  (Browser)  │                          │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                          │
└─────────┼────────────────┼────────────────┼─────────────────────────────────┘
          │                │                │
          └────────────────┼────────────────┘
                           │ HTTPS
                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        AWS LIGHTSAIL INSTANCE                                │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         PM2 Process Manager                          │    │
│  │                     (Auto-restart, Clustering)                       │    │
│  └───────────────────────────┬─────────────────────────────────────────┘    │
│                              │                                               │
│         ┌────────────────────┼────────────────────┐                         │
│         │                    │                    │                         │
│         ▼                    ▼                    ▼                         │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                   │
│  │  Frontend   │     │   Backend   │     │   Static    │                   │
│  │   (React)   │     │  (Express)  │     │   Files     │                   │
│  │  /app/*     │     │  /api/*     │     │  /public/*  │                   │
│  └─────────────┘     └──────┬──────┘     └─────────────┘                   │
│                             │                                               │
│                      Port 5000                                              │
│                             │                                               │
└─────────────────────────────┼───────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ▼                   ▼                   ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  MongoDB Atlas  │  │     AWS S3      │  │  Email Service  │
│   (Database)    │  │ (Image Storage) │  │   (Phase 2)     │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

### 2.2 Request Flow

```
┌──────────┐     ┌───────────┐     ┌────────────┐     ┌──────────────┐     ┌──────────┐
│  Client  │────▶│ Lightsail │────▶│ Express.js │────▶│  Middleware  │────▶│Controller│
└──────────┘     └───────────┘     └────────────┘     └──────────────┘     └────┬─────┘
                                                                                │
     ┌───────────────────────────────────────────────────────────────────────────┘
     │
     ▼
┌──────────┐     ┌──────────┐     ┌──────────┐
│  Model   │────▶│ MongoDB  │────▶│ Response │
└──────────┘     └──────────┘     └──────────┘
```

### 2.3 Authentication Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         LOGIN FLOW                                           │
│                                                                              │
│  ┌────────┐  1. Login Request    ┌────────┐  2. Validate     ┌────────┐    │
│  │ Client │─────────────────────▶│ Server │─────────────────▶│  DB    │    │
│  └────────┘  (email, password)   └────────┘                  └────────┘    │
│       ▲                               │                           │         │
│       │                               │  3. User Data             │         │
│       │                               │◀──────────────────────────┘         │
│       │                               │                                      │
│       │  5. Return Tokens             │  4. Generate Tokens                 │
│       │◀──────────────────────────────│  (Access + Refresh)                 │
│       │  (accessToken,                │                                      │
│       │   refreshToken)               │                                      │
└───────┼───────────────────────────────┼──────────────────────────────────────┘
        │                               │
┌───────┼───────────────────────────────┼──────────────────────────────────────┐
│       │          AUTHENTICATED REQUEST                                       │
│       │                               │                                      │
│       │  1. Request + Bearer Token    │                                      │
│       │──────────────────────────────▶│  2. Verify JWT                      │
│       │                               │                                      │
│       │  4. Response                  │  3. Process Request                 │
│       │◀──────────────────────────────│                                      │
└───────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Database Schema

### 3.1 Entity Relationship Diagram

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│      USER       │       │     REGION      │       │   VIP_CLIENT    │
├─────────────────┤       ├─────────────────┤       ├─────────────────┤
│ _id             │       │ _id             │       │ _id             │
│ name            │       │ name            │       │ name            │
│ email           │──┐    │ code            │    ┌──│ specialization  │
│ password        │  │    │ parent (ref)    │    │  │ hospital        │
│ role            │  │    │ level           │    │  │ address         │
│ assignedRegions │──┼───▶│ description     │    │  │ region (ref)────┼──┐
│ phone           │  │    │ isActive        │    │  │ phone           │  │
│ avatar          │  │    │ createdAt       │    │  │ email           │  │
│ isActive        │  │    └─────────────────┘    │  │ visitFrequency  │  │
│ canAccessAll    │  │                           │  │ clinicSchedule  │  │
│ createdAt       │  │                           │  │ isActive        │  │
└─────────────────┘  │                           │  └─────────────────┘  │
         │           │                           │          │            │
         │           │                           │          │            │
         │           └───────────────────────────┼──────────┼────────────┘
         │                                       │          │
         ▼                                       │          ▼
┌─────────────────┐       ┌─────────────────┐   │  ┌─────────────────┐
│     VISIT       │       │    PRODUCT      │   │  │ PRODUCT_ASSIGN  │
├─────────────────┤       ├─────────────────┤   │  ├─────────────────┤
│ _id             │       │ _id             │   │  │ _id             │
│ vipClient (ref) ┼───────│ name            │◀──┼──│ product (ref)   │
│ user (ref)──────┼──┐    │ category        │   │  │ vipClient (ref) ┼───┐
│ visitDate       │  │    │ briefDescription│   │  │ assignedBy (ref)│   │
│ visitType       │  │    │ description     │   │  │ priority        │   │
│ weekNumber      │  │    │ keyBenefits[]   │   │  │ status          │   │
│ weekOfMonth     │  │    │ usageInfo       │   │  │ notes           │   │
│ dayOfWeek       │  │    │ price           │   │  └─────────────────┘   │
│ weekLabel       │  │    │ image           │   │                        │
│ monthYear       │  │    │ isActive        │   │                        │
│ yearWeekKey     │  │    └─────────────────┘   │                        │
│ location{}      │  │                          │                        │
│ photos[]        │  │                          │                        │
│ purpose         │  │                          │                        │
│ productsDiscussed│ │                          │                        │
│ status          │  │                          │                        │
└─────────────────┘  │                          │                        │
         ▲           │                          │                        │
         └───────────┴──────────────────────────┴────────────────────────┘
```

### 3.2 Collection Schemas

#### User Schema
```javascript
{
  _id: ObjectId,
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true, minlength: 8, select: false },
  role: { type: String, enum: ['admin', 'medrep', 'bdm'], default: 'bdm' },
  phone: { type: String },
  avatar: { type: String }, // S3 URL
  assignedRegions: [{ type: ObjectId, ref: 'Region' }],
  canAccessAllRegions: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  lastLogin: { type: Date },
  refreshToken: { type: String, select: false },
  passwordResetToken: { type: String },
  passwordResetExpires: { type: Date },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}
// Indexes: email (unique), role, isActive
// Virtual: canAccessRegion(regionId) method
```

#### VIPClient Schema
```javascript
{
  _id: ObjectId,
  name: { type: String, required: true, trim: true, maxlength: 100 },
  specialization: { type: String, required: true },
  hospital: { type: String, required: true, maxlength: 200 },
  address: {
    street: String,
    city: String,
    province: String,
    postalCode: String
  },
  region: { type: ObjectId, ref: 'Region', required: true },
  phone: { type: String },
  email: { type: String, lowercase: true },
  visitFrequency: { type: Number, enum: [2, 4], default: 4 }, // visits per month
  clinicSchedule: {
    monday: { available: Boolean, hours: String },
    tuesday: { available: Boolean, hours: String },
    wednesday: { available: Boolean, hours: String },
    thursday: { available: Boolean, hours: String },
    friday: { available: Boolean, hours: String }
  },
  notes: { type: String, maxlength: 1000 },
  isActive: { type: Boolean, default: true },
  createdBy: { type: ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}
// Indexes: name (text), region, visitFrequency, isActive
// NOTE: No category field (A/B/C/D removed, use visitFrequency instead)
```

#### Visit Schema
```javascript
{
  _id: ObjectId,
  vipClient: { type: ObjectId, ref: 'VIPClient', required: true },
  user: { type: ObjectId, ref: 'User', required: true },
  visitDate: { type: Date, required: true },
  visitType: { type: String, enum: ['regular', 'follow-up', 'emergency'], default: 'regular' },

  // Weekly tracking fields (auto-calculated)
  weekNumber: { type: Number, min: 1, max: 53 },      // ISO week number
  weekOfMonth: { type: Number, min: 1, max: 5 },      // Week within month
  dayOfWeek: { type: Number, min: 1, max: 5 },        // 1=Mon, 5=Fri
  weekLabel: { type: String },                         // "W2D3" format
  monthYear: { type: String },                         // "2024-01" format
  yearWeekKey: { type: String },                       // "2024-W52" format

  // Location (required)
  location: {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    accuracy: { type: Number },
    capturedAt: { type: Date, default: Date.now }
  },

  // Photos (required, at least 1)
  photos: [{
    url: { type: String, required: true },            // S3 URL
    capturedAt: { type: Date, default: Date.now }
  }],

  // Visit details
  productsDiscussed: [{
    product: { type: ObjectId, ref: 'Product' },
    discussed: { type: Boolean, default: true },
    sampleGiven: { type: Boolean, default: false },
    quantity: { type: Number, default: 0 }
  }],
  purpose: { type: String, maxlength: 500 },
  vipClientFeedback: { type: String, maxlength: 1000 },
  notes: { type: String, maxlength: 1000 },
  duration: { type: Number },                          // in minutes
  nextVisitDate: { type: Date },

  status: { type: String, enum: ['completed', 'cancelled'], default: 'completed' },
  cancelReason: { type: String },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}

// CRITICAL INDEX: Prevents duplicate visits in same week
// Compound unique index: { vipClient: 1, user: 1, yearWeekKey: 1 }

// Other indexes: vipClient, user, visitDate, monthYear, status
```

#### Product Schema
```javascript
{
  _id: ObjectId,
  name: { type: String, required: true, trim: true, maxlength: 100 },
  category: { type: String, required: true },
  briefDescription: { type: String, required: true, maxlength: 200 },
  description: { type: String, maxlength: 2000 },
  keyBenefits: [{ type: String, maxlength: 200 }],    // Max 10 items
  usageInformation: { type: String, maxlength: 1000 },
  price: { type: Number, min: 0 },
  image: { type: String },                             // S3 URL
  isActive: { type: Boolean, default: true },
  createdBy: { type: ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}
// Indexes: name (text), category, isActive
```

#### Region Schema
```javascript
{
  _id: ObjectId,
  name: { type: String, required: true, trim: true, maxlength: 100 },
  code: { type: String, required: true, unique: true, uppercase: true, maxlength: 20 },
  parent: { type: ObjectId, ref: 'Region', default: null },
  level: { type: String, enum: ['country', 'province', 'city', 'district', 'area'], required: true },
  description: { type: String, maxlength: 500 },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}
// Indexes: code (unique), parent, level, isActive
// Virtual: getChildren(), getFullPath()
```

#### ProductAssignment Schema
```javascript
{
  _id: ObjectId,
  product: { type: ObjectId, ref: 'Product', required: true },
  vipClient: { type: ObjectId, ref: 'VIPClient', required: true },
  assignedBy: { type: ObjectId, ref: 'User', required: true },
  priority: { type: Number, enum: [1, 2, 3], default: 2 },  // 1=High, 2=Medium, 3=Low
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  notes: { type: String, maxlength: 500 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}
// Indexes: (product + vipClient: compound unique), assignedBy, status
```

---

## 4. API Endpoints

### 4.1 Authentication
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/auth/register` | Register new user | Admin |
| POST | `/api/auth/login` | User login | Public |
| POST | `/api/auth/logout` | User logout | User |
| POST | `/api/auth/refresh-token` | Refresh access token | Public |
| POST | `/api/auth/forgot-password` | Request password reset | Public |
| POST | `/api/auth/reset-password/:token` | Reset password | Public |
| GET | `/api/auth/me` | Get current user profile | User |
| PUT | `/api/auth/update-password` | Update password | User |

### 4.2 Users
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/users` | Get all users | Admin |
| GET | `/api/users/:id` | Get user by ID | Admin/Self |
| POST | `/api/users` | Create user | Admin |
| PUT | `/api/users/:id` | Update user | Admin/Self |
| DELETE | `/api/users/:id` | Deactivate user | Admin |
| GET | `/api/users/bdms` | Get all BDMs | Admin/MedRep |
| PUT | `/api/users/:id/regions` | Update assigned regions | Admin |

### 4.3 VIP Clients
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/doctors` | Get VIP Clients (region-filtered) | User |
| GET | `/api/doctors/:id` | Get VIP Client by ID | User |
| POST | `/api/doctors` | Create VIP Client | Admin/MedRep |
| PUT | `/api/doctors/:id` | Update VIP Client | Admin/MedRep |
| DELETE | `/api/doctors/:id` | Deactivate VIP Client | Admin |
| GET | `/api/doctors/region/:regionId` | Get VIP Clients by region | User |
| GET | `/api/doctors/:id/visits` | Get VIP Client's visit history | User |
| GET | `/api/doctors/:id/products` | Get assigned products | User |

### 4.4 Visits
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/visits` | Get visits (role-filtered) | User |
| GET | `/api/visits/:id` | Get visit by ID | User |
| POST | `/api/visits` | Create visit (with photos) | BDM |
| PUT | `/api/visits/:id` | Update visit notes | User |
| PUT | `/api/visits/:id/cancel` | Cancel visit | User |
| GET | `/api/visits/user/:userId` | Get visits by user | User/Admin |
| GET | `/api/visits/today` | Get today's visits | BDM |
| GET | `/api/visits/stats` | Get visit statistics | User |
| GET | `/api/visits/can-visit/:vipClientId` | Check if can visit VIP Client | BDM |
| GET | `/api/visits/weekly-compliance/:userId` | Get weekly compliance report | User |
| GET | `/api/visits/compliance-alerts` | Get behind-schedule BDMs | Admin |

### 4.5 Products
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/products` | Get all products | User |
| GET | `/api/products/:id` | Get product by ID | User |
| POST | `/api/products` | Create product (with image) | Admin |
| PUT | `/api/products/:id` | Update product | Admin |
| DELETE | `/api/products/:id` | Deactivate product | Admin |
| GET | `/api/products/category/:category` | Get by category | User |

### 4.6 Product Assignments
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/assignments` | Get all assignments | MedRep/Admin |
| GET | `/api/assignments/:id` | Get assignment by ID | User |
| POST | `/api/assignments` | Create assignment | MedRep |
| PUT | `/api/assignments/:id` | Update assignment | MedRep |
| DELETE | `/api/assignments/:id` | Remove assignment | MedRep |
| GET | `/api/assignments/doctor/:vipClientId` | Get VIP Client's assignments | User |
| GET | `/api/assignments/product/:productId` | Get product's assignments | MedRep |

### 4.7 Regions
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/regions` | Get all regions | User |
| GET | `/api/regions/:id` | Get region by ID | User |
| POST | `/api/regions` | Create region | Admin |
| PUT | `/api/regions/:id` | Update region | Admin |
| DELETE | `/api/regions/:id` | Deactivate region | Admin |
| GET | `/api/regions/hierarchy` | Get region tree | User |
| GET | `/api/regions/:id/children` | Get child regions | User |

---

## 5. Security Requirements

### 5.1 Authentication
- JWT-based authentication with short-lived access tokens (15 minutes)
- Refresh tokens stored in database (7 days expiry)
- Password hashing with bcrypt (salt rounds: 12)
- Rate limiting on login attempts (5 attempts per 15 minutes)

### 5.2 Authorization
- Role-based access control (RBAC): admin, medrep, bdm
- Region-based access control for BDMs
- Resource-level permissions checking
- API endpoint protection with middleware

### 5.3 Data Protection
- HTTPS only in production
- Input validation on all endpoints
- NoSQL injection prevention
- XSS protection via helmet
- Request sanitization

### 5.4 API Security
- Rate limiting (100 requests per 15 minutes)
- Request size limits (10MB max for file uploads)
- CORS configuration (whitelist frontend origin)
- Security headers via helmet

### 5.5 AWS Security
- IAM users with least-privilege access
- S3 bucket private by default
- Signed URLs for file access (optional)
- AWS credentials via environment variables (never committed)

---

## 6. File Upload Strategy

### 6.1 Architecture
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │────▶│   Multer    │────▶│   AWS S3    │
│  (Browser)  │     │ (Memory)    │     │   (Cloud)   │
└─────────────┘     └─────────────┘     └─────────────┘
```

### 6.2 Implementation
- **Multer** for handling multipart/form-data
- **Memory storage** (buffer) for direct S3 upload
- **AWS SDK v3** for S3 operations
- **UUID** for unique file naming

### 6.3 Constraints
| Parameter | Value |
|-----------|-------|
| Max file size | 5MB |
| Allowed types | JPEG, PNG, WebP |
| Max files per visit | 5 |
| Image naming | `{folder}/{uuid}.{ext}` |

### 6.4 S3 Bucket Structure
```
vip-crm-bucket/
├── visits/
│   └── {uuid}.jpg
├── products/
│   └── {uuid}.jpg
└── avatars/
    └── {uuid}.jpg
```

### 6.5 S3 Configuration
```javascript
// CORS Configuration
{
  AllowedHeaders: ["*"],
  AllowedMethods: ["GET", "PUT", "POST"],
  AllowedOrigins: ["https://yourdomain.com"],
  ExposeHeaders: []
}

// Bucket Policy (private, server-side access only)
// No public access - all URLs generated server-side
```

---

## 7. Deployment Architecture

### 7.1 Production Environment (AWS Lightsail)
```
┌─────────────────────────────────────────────────────────────────┐
│                  AWS LIGHTSAIL INSTANCE                          │
│                  (Ubuntu 22.04 / 2GB RAM)                        │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                        PM2                                  │ │
│  │  - Process Management                                       │ │
│  │  - Auto-restart on crash                                   │ │
│  │  - Cluster mode (2 instances)                              │ │
│  │  - Log management                                          │ │
│  │                                                             │ │
│  │  ┌─────────────────────────────────────────────────────┐   │ │
│  │  │              Node.js Application                     │   │ │
│  │  │                                                      │   │ │
│  │  │  ┌─────────────┐     ┌─────────────────────────┐    │   │ │
│  │  │  │   Express   │     │   React Build (static)  │    │   │ │
│  │  │  │   Backend   │     │       /dist folder      │    │   │ │
│  │  │  │   Port 5000 │     │                         │    │   │ │
│  │  │  └─────────────┘     └─────────────────────────┘    │   │ │
│  │  └─────────────────────────────────────────────────────┘   │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    Let's Encrypt                            │ │
│  │              (SSL via Certbot + Nginx)                      │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                               │
           ┌───────────────────┼───────────────────┐
           ▼                   ▼                   ▼
   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
   │MongoDB Atlas │   │    AWS S3    │   │ Email Service│
   │  (Database)  │   │   (Images)   │   │  (Phase 2)   │
   └──────────────┘   └──────────────┘   └──────────────┘
```

### 7.2 Lightsail Instance Sizing
| Size | RAM | vCPU | Storage | Monthly Cost | Recommended For |
|------|-----|------|---------|--------------|-----------------|
| $5 | 1GB | 1 | 40GB | $5 | Development |
| $10 | 2GB | 1 | 60GB | $10 | **Production (Start)** |
| $20 | 4GB | 2 | 80GB | $20 | High traffic |

### 7.3 Scaling Strategy
- **Vertical:** Upgrade Lightsail instance size
- **Horizontal:** Move to AWS ECS/EKS (future)
- **Database:** MongoDB Atlas handles scaling
- **Storage:** S3 scales automatically

---

## 8. Weekly Visit Enforcement

### 8.1 Business Rules
- Maximum ONE visit per VIP Client per user per week
- Week = Monday to Friday (work days only)
- Monthly limit based on VIP Client's `visitFrequency` (2 or 4)
- Hard enforcement - excess visits are BLOCKED

### 8.2 Implementation
```javascript
// Compound unique index prevents duplicate visits
visitSchema.index(
  { vipClient: 1, user: 1, yearWeekKey: 1 },
  { unique: true, partialFilterExpression: { status: 'completed' } }
);

// Week calculation (ISO week number)
function getYearWeekKey(date) {
  const year = date.getFullYear();
  const week = getISOWeekNumber(date);
  return `${year}-W${week.toString().padStart(2, '0')}`;
}
```

### 8.3 Validation Flow
```
1. User attempts to create visit
2. Check if work day (Mon-Fri)
3. Calculate yearWeekKey for visit date
4. Check if visit exists for (vipClient, user, yearWeekKey)
5. Check monthly count against visitFrequency
6. If all pass → Create visit
7. If any fail → Return error with details
```

---

## 9. Performance Requirements

| Metric | Target |
|--------|--------|
| API Response Time | < 200ms (p95) |
| Page Load Time | < 3s (first contentful paint) |
| Image Upload | < 5s for 5MB file |
| Database Query | < 100ms (indexed queries) |
| Concurrent Users | 100+ simultaneous |
| Uptime | 99.5% monthly |

---

## 10. Environment Variables

```bash
# Server
NODE_ENV=production
PORT=5000

# Database
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/vip-crm

# JWT
JWT_SECRET=your-super-secret-key-min-32-chars
JWT_EXPIRE=15m
JWT_REFRESH_SECRET=your-refresh-secret-key-min-32-chars
JWT_REFRESH_EXPIRE=7d

# AWS S3
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=ap-southeast-1
S3_BUCKET_NAME=vip-crm

# Frontend URL (for CORS)
CLIENT_URL=https://your-domain.com

# CORS Origins (production - comma-separated)
CORS_ORIGINS=https://your-domain.com,https://www.your-domain.com
```

---

## 11. Phase 1 Optimizations (December 2024)

### 11.1 Backend Optimizations

| Optimization | Implementation |
|--------------|----------------|
| Rate Limiting | `express-rate-limit` - 100 req/15min general, 20 req/15min auth |
| Request Timeout | 30 second timeout middleware |
| Security Headers | HSTS via helmet (1 year max-age) |
| Database Indexes | Compound indexes on User, VIPClient, Region, Product, Visit |
| TTL Index | Password reset tokens auto-expire |
| Cascade Delete | VIPClient and Product models have cascade delete hooks |

### 11.2 Frontend Optimizations

| Component | Purpose |
|-----------|---------|
| `ErrorBoundary.jsx` | Catches React errors, shows fallback UI with retry |
| `useDebounce.js` | Debounces search inputs (300ms default) |
| `Pagination.jsx` | Shared pagination component with React.memo |
| AbortController | Request cancellation on component unmount (MyVisits) |
| React.memo | Prevents unnecessary re-renders (VIPClientList) |
| useMemo | Memoized filtered lists |
| useCallback | Stable function references (VIPClientsPage) |

### 11.3 Security Fixes

| Fix | Details |
|-----|---------|
| CORS Middleware Order | Moved before rate limiter (429 responses now have CORS headers) |
| Array Bounds Validation | Max 100 products in bulk assign, 1-10 photos per visit |
| Auth Event Handling | CustomEvent dispatch for cross-context logout |
| GPS Timeout | 5-minute watchPosition timeout in CameraCapture |
