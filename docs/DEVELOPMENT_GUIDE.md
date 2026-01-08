# Development Guide
## VIP CRM

**Version:** 3.0
**Last Updated:** January 2026 (Security Hardening Update)

This guide helps developers set up their local environment and contribute to the project.

---

## Table of Contents
1. [Prerequisites](#1-prerequisites)
2. [Local Environment Setup](#2-local-environment-setup)
3. [Running the Backend](#3-running-the-backend)
4. [Running the Frontend](#4-running-the-frontend)
5. [Database Setup](#5-database-setup)
6. [Testing](#6-testing)
7. [Git Workflow](#7-git-workflow)
8. [Code Standards](#8-code-standards)
9. [Project Structure](#9-project-structure)
10. [Common Tasks](#10-common-tasks)
11. [Debugging](#11-debugging)
12. [IDE Setup](#12-ide-setup)

---

## 1. Prerequisites

### 1.1 Required Software
| Software | Version | Download |
|----------|---------|----------|
| Node.js | 18.x LTS | [nodejs.org](https://nodejs.org) |
| npm | 9.x+ | Included with Node.js |
| Git | Latest | [git-scm.com](https://git-scm.com) |
| MongoDB | 7.x | [mongodb.com](https://www.mongodb.com/try/download/community) OR use Atlas |
| VS Code | Latest | [code.visualstudio.com](https://code.visualstudio.com) (recommended) |

### 1.2 Verify Installation
```bash
node --version    # Should show v18.x.x
npm --version     # Should show 9.x.x or 10.x.x
git --version     # Should show git version x.x.x
mongod --version  # Should show MongoDB version (if local)
```

### 1.3 Accounts Needed
- GitHub account (for repository access)
- MongoDB Atlas account (free tier) OR local MongoDB
- AWS Account (for S3 image storage) - free tier available

---

## 2. Local Environment Setup

### 2.1 Clone Repository
```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/vip-crm.git

# Navigate to project directory
cd vip-crm
```

### 2.2 Install All Dependencies
```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install

# Return to root
cd ..
```

### 2.3 Configure Environment Variables

**Backend (.env):**
```bash
cd backend
cp .env.example .env
```

Edit `backend/.env`:
```bash
# Server Configuration
NODE_ENV=development
PORT=5000

# Database - Use local MongoDB or Atlas
MONGODB_URI=mongodb://localhost:27017/vip-crm
# OR for Atlas:
# MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/vip-crm

# JWT Configuration
# SECURITY: JWT secrets must be at least 32 characters! Server will fail to start otherwise.
JWT_SECRET=dev_jwt_secret_change_in_production_min_32_chars
JWT_EXPIRE=15m
JWT_REFRESH_SECRET=dev_refresh_secret_change_in_production_min_32
JWT_REFRESH_EXPIRE=7d

# AWS S3 Configuration (see Section 2.5 for setup)
AWS_ACCESS_KEY_ID=your_access_key_id
AWS_SECRET_ACCESS_KEY=your_secret_access_key
AWS_REGION=ap-southeast-1
S3_BUCKET_NAME=vip-crm-dev

# Frontend URL (for CORS)
CLIENT_URL=http://localhost:5173

# CORS Origins (REQUIRED in production, comma-separated)
# Server will not start in production without this!
# CORS_ORIGINS=https://your-domain.com,https://www.your-domain.com

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Login Rate Limiting (Account Lockout)
LOGIN_MAX_ATTEMPTS=5
LOGIN_LOCKOUT_DURATION=15
```

**Frontend (.env.local):**
```bash
cd frontend
cp .env.example .env.local
```

Edit `frontend/.env.local`:
```bash
VITE_API_URL=http://localhost:5000/api
VITE_APP_ENV=development
```

### 2.5 AWS S3 Setup for Development

**Step 1: Create AWS Account**
1. Go to [AWS Console](https://aws.amazon.com/console/)
2. Create account or sign in
3. AWS Free Tier includes 5GB S3 storage

**Step 2: Create IAM User**
1. Go to **IAM** > **Users** > **Create user**
2. User name: `vip-crm-dev`
3. Attach policy: `AmazonS3FullAccess`
4. Create and download access keys

**Step 3: Create S3 Bucket**
1. Go to **S3** > **Create bucket**
2. Bucket name: `vip-crm-dev` (must be unique globally)
3. Region: `ap-southeast-1` (or closest to you)
4. Keep "Block all public access" enabled
5. Create bucket

**Step 4: Configure CORS**
1. Select your bucket > **Permissions** > **CORS**
2. Add configuration:
```json
[
    {
        "AllowedHeaders": ["*"],
        "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
        "AllowedOrigins": ["http://localhost:5173", "http://localhost:5000"],
        "ExposeHeaders": ["ETag"]
    }
]
```

**Step 5: Update .env**
Add your AWS credentials to `backend/.env`:
```bash
AWS_ACCESS_KEY_ID=AKIA...your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_REGION=ap-southeast-1
S3_BUCKET_NAME=vip-crm-dev
```

**Note:** Never commit AWS credentials to git. The `.env` file is in `.gitignore`.

---

## 3. Running the Backend

### 3.1 Start Development Server
```bash
cd backend
npm run dev
```

Expected output:
```
[nodemon] watching path(s): server.js config/ controllers/ middleware/ models/ routes/ utils/
[nodemon] watching extensions: js,json
[nodemon] starting `node server.js`
Server running in development mode on port 5000
MongoDB Connected: cluster0-shard-00-00.xxxxx.mongodb.net
```

### 3.2 Available Scripts
| Command | Description |
|---------|-------------|
| `npm start` | Start production server |
| `npm run dev` | Start with nodemon (auto-reload) |
| `npm test` | Run tests with Jest |

### 3.3 API Endpoints
Backend runs at: `http://localhost:5000`

Test the API:
```bash
# Health check (add this endpoint)
curl http://localhost:5000/api/health

# Or open in browser
http://localhost:5000/api
```

---

## 4. Running the Frontend

### 4.1 Start Development Server
```bash
cd frontend
npm run dev
```

Expected output:
```
  VITE v5.4.10  ready in 500 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
  ➜  press h + enter to show help
```

### 4.2 Available Scripts
| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |

### 4.3 Access Application
Open browser: `http://localhost:5173`

### 4.4 API Proxy
Vite is configured to proxy `/api` requests to the backend:
- Frontend request: `http://localhost:5173/api/users`
- Proxied to: `http://localhost:5000/api/users`

---

## 5. Database Setup

### 5.1 Option A: Local MongoDB

**Install MongoDB Community Edition:**
- [Windows Installation Guide](https://docs.mongodb.com/manual/tutorial/install-mongodb-on-windows/)
- [macOS Installation Guide](https://docs.mongodb.com/manual/tutorial/install-mongodb-on-os-x/)
- [Linux Installation Guide](https://docs.mongodb.com/manual/administration/install-on-linux/)

**Start MongoDB:**
```bash
# Windows
net start MongoDB

# macOS/Linux
sudo systemctl start mongod
# or
mongod --dbpath /path/to/data
```

**Connection string for local:**
```
MONGO_URI=mongodb://localhost:27017/vip-crm
```

### 5.2 Option B: MongoDB Atlas (Recommended)

1. Create free account at [MongoDB Atlas](https://www.mongodb.com/atlas)
2. Create new cluster (free M0 tier)
3. Create database user
4. Whitelist your IP (or 0.0.0.0/0 for development)
5. Get connection string
6. Update `.env` with connection string

### 5.3 Database Management

**Using MongoDB Compass (GUI):**
1. Download [MongoDB Compass](https://www.mongodb.com/products/compass)
2. Connect using your connection string
3. Browse collections, run queries

**Using mongosh (CLI):**
```bash
# Connect to local
mongosh

# Connect to Atlas
mongosh "mongodb+srv://cluster.xxxxx.mongodb.net/vip-crm" --username your_user
```

### 5.4 Seed Database (Optional)
```bash
cd backend
node seeds/seed.js  # Create this file with sample data
```

---

## 6. Testing

### 6.1 Backend Tests

**Run all tests:**
```bash
cd backend
npm test
```

**Run tests in watch mode:**
```bash
npm test -- --watch
```

**Run specific test file:**
```bash
npm test -- auth.test.js
```

**Run with coverage:**
```bash
npm test -- --coverage
```

### 6.2 Test Structure
```
backend/
├── tests/
│   ├── auth.test.js
│   ├── users.test.js
│   ├── vipClients.test.js
│   ├── visits.test.js
│   └── setup.js
```

### 6.3 Writing Tests
```javascript
// Example test file: tests/auth.test.js
const request = require('supertest');
const app = require('../server');

describe('Auth Endpoints', () => {
  describe('POST /api/auth/login', () => {
    it('should login with valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
    });

    it('should reject invalid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'wrongpassword'
        });

      expect(res.statusCode).toBe(401);
    });
  });
});
```

### 6.4 API Testing with Postman/Thunder Client
1. Import collection from `docs/postman_collection.json`
2. Set environment variable `BASE_URL=http://localhost:5000`
3. Run requests to test endpoints

---

## 7. Git Workflow

### 7.1 Branch Strategy
| Branch | Purpose |
|--------|---------|
| `main` | Production-ready code |
| `develop` | Integration branch |
| `feature/*` | New features |
| `bugfix/*` | Bug fixes |
| `hotfix/*` | Production hotfixes |

### 7.2 Branch Naming
```
feature/add-vip-client-search
feature/user-authentication
bugfix/fix-login-validation
hotfix/security-patch
```

### 7.3 Workflow Steps

**Starting new feature:**
```bash
# Update develop branch
git checkout develop
git pull origin develop

# Create feature branch
git checkout -b feature/your-feature-name

# Work on feature...
git add .
git commit -m "feat: add VIP Client search functionality"

# Push branch
git push origin feature/your-feature-name

# Create Pull Request on GitHub
```

**Commit message format:**
```
type(scope): description

Types:
- feat: New feature
- fix: Bug fix
- docs: Documentation
- style: Formatting
- refactor: Code restructuring
- test: Adding tests
- chore: Maintenance

Examples:
feat(auth): add password reset functionality
fix(visits): correct date validation
docs(api): update endpoint documentation
```

### 7.4 Pull Request Process
1. Create PR from feature branch to `develop`
2. Fill out PR template
3. Request code review
4. Address feedback
5. Squash and merge when approved

### 7.5 Code Review Checklist
- [ ] Code follows style guide
- [ ] Tests pass
- [ ] No console.log statements
- [ ] Error handling implemented
- [ ] Documentation updated
- [ ] No security vulnerabilities

---

## 8. Code Standards

### 8.1 JavaScript/Node.js Style Guide

**General:**
- Use ES6+ features
- Use `const` by default, `let` when needed
- Never use `var`
- Use async/await over callbacks
- Use arrow functions for callbacks

**Naming:**
```javascript
// Variables and functions: camelCase
const userName = 'John';
const getUserById = async (id) => { };

// Classes and components: PascalCase
class UserService { }
const LoginForm = () => { };

// Constants: UPPER_SNAKE_CASE
const MAX_LOGIN_ATTEMPTS = 5;
const API_BASE_URL = '/api';

// Files:
// - Components: PascalCase.jsx
// - Utilities: camelCase.js
// - Models: PascalCase.js
```

**Formatting:**
```javascript
// Use 2 spaces for indentation
// Use single quotes for strings
// Use semicolons
// Max line length: 100 characters

// Good
const user = await User.findById(id);
if (user) {
  return res.json({ success: true, data: user });
}

// Bad
const user = await User.findById(id)
if(user){
return res.json({success:true,data:user})
}
```

### 8.2 React Style Guide

**Component structure:**
```jsx
// Imports
import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';

// Component
const MyComponent = ({ title, onSubmit }) => {
  // State
  const [loading, setLoading] = useState(false);

  // Effects
  useEffect(() => {
    // Effect logic
  }, []);

  // Handlers
  const handleClick = () => {
    // Handler logic
  };

  // Render
  return (
    <div className="my-component">
      <h1>{title}</h1>
      <button onClick={handleClick}>Submit</button>
    </div>
  );
};

// PropTypes
MyComponent.propTypes = {
  title: PropTypes.string.isRequired,
  onSubmit: PropTypes.func,
};

// Default props
MyComponent.defaultProps = {
  onSubmit: () => {},
};

export default MyComponent;
```

### 8.3 API Response Format
```javascript
// Success response
res.status(200).json({
  success: true,
  data: { /* response data */ },
  message: 'Optional success message'
});

// Error response
res.status(400).json({
  success: false,
  error: {
    code: 'VALIDATION_ERROR',
    message: 'Validation failed',
    details: [{ field: 'email', message: 'Invalid email' }]
  }
});
```

### 8.4 ESLint Configuration
ESLint is configured in both frontend and backend. Run linting:
```bash
# Frontend
cd frontend
npm run lint

# Backend (add script if needed)
cd backend
npx eslint .
```

---

## 9. Project Structure

### 9.1 Root Structure
```
vip-crm/
├── backend/           # Express.js API
├── frontend/          # React application
├── docs/              # Documentation
├── .gitignore         # Git ignore rules
└── README.md          # Project overview
```

### 9.2 Backend Structure
```
backend/
├── config/
│   ├── db.js              # MongoDB connection
│   └── s3.js              # AWS S3 configuration
├── controllers/
│   ├── authController.js  # Authentication logic
│   ├── userController.js  # User CRUD
│   ├── vipClientController.js
│   ├── visitController.js # Weekly visit enforcement
│   ├── productController.js
│   ├── productAssignmentController.js
│   └── regionController.js
├── middleware/
│   ├── auth.js            # JWT verification (protect, optionalAuth)
│   ├── roleCheck.js       # RBAC (adminOnly, medRepOnly, bdmOnly)
│   ├── errorHandler.js    # Global error handler + custom errors
│   ├── validation.js      # Express-validator rules
│   └── upload.js          # S3 file upload (multer + AWS SDK)
├── models/
│   ├── User.js            # Roles: admin, medrep, bdm
│   ├── VIPClient.js       # visitFrequency: 2 or 4
│   ├── Visit.js           # Weekly tracking (yearWeekKey)
│   ├── Product.js         # Product catalog
│   ├── ProductAssignment.js # VIPClient-product mapping
│   └── Region.js          # Hierarchical regions
├── routes/
│   ├── authRoutes.js
│   ├── userRoutes.js
│   ├── vipClientRoutes.js
│   ├── visitRoutes.js
│   ├── productRoutes.js
│   ├── productAssignmentRoutes.js
│   └── regionRoutes.js
├── utils/
│   ├── generateToken.js   # Access + refresh token generation
│   └── validateWeeklyVisit.js  # Weekly/monthly limit checks
├── tests/                 # Test files
├── .env                   # Environment variables (git-ignored)
├── .env.example           # Example env file
├── server.js              # Entry point
├── package.json
└── nodemon.json           # Nodemon configuration
```

### 9.3 Frontend Structure
```
frontend/
├── public/
│   └── vite.svg
├── src/
│   ├── assets/            # Images, fonts
│   ├── components/
│   │   ├── common/        # Shared components
│   │   ├── auth/          # Auth components
│   │   ├── employee/      # BDM features
│   │   ├── admin/         # Admin features
│   │   └── medrep/        # Med rep features
│   ├── pages/
│   │   ├── LoginPage.jsx
│   │   ├── employee/
│   │   ├── admin/
│   │   └── medrep/
│   ├── context/           # React context
│   ├── hooks/             # Custom hooks
│   ├── services/          # API services
│   ├── utils/             # Utility functions
│   ├── styles/            # CSS files
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── .env.local
├── .env.example
├── index.html
├── package.json
├── vite.config.js
└── eslint.config.js
```

---

## 10. Common Tasks

### 10.1 Adding a New API Endpoint

1. **Create/Update Model** (if needed):
```javascript
// backend/models/NewModel.js
const mongoose = require('mongoose');

const newSchema = new mongoose.Schema({
  // Define schema
});

module.exports = mongoose.model('NewModel', newSchema);
```

2. **Create Controller**:
```javascript
// backend/controllers/newController.js
exports.getAll = async (req, res) => {
  // Implementation
};
```

3. **Create Routes**:
```javascript
// backend/routes/newRoutes.js
const express = require('express');
const router = express.Router();
const { getAll } = require('../controllers/newController');
const { protect } = require('../middleware/auth');

router.get('/', protect, getAll);

module.exports = router;
```

4. **Register Routes in server.js**:
```javascript
app.use('/api/new', require('./routes/newRoutes'));
```

### 10.2 Adding a New React Component

1. **Create Component**:
```jsx
// frontend/src/components/common/NewComponent.jsx
const NewComponent = ({ prop1 }) => {
  return <div>{prop1}</div>;
};

export default NewComponent;
```

2. **Create Service** (if API call needed):
```javascript
// frontend/src/services/newService.js
import api from './api';

const newService = {
  getAll: async () => {
    const response = await api.get('/new');
    return response.data;
  },
};

export default newService;
```

3. **Use in Page**:
```jsx
import NewComponent from '../components/common/NewComponent';
import newService from '../services/newService';
```

### 10.3 Database Migrations
MongoDB doesn't require traditional migrations, but for data changes:

```javascript
// backend/scripts/migration-xxx.js
const mongoose = require('mongoose');
require('dotenv').config();

const migrate = async () => {
  await mongoose.connect(process.env.MONGO_URI);

  // Perform migration
  await User.updateMany({}, { $set: { newField: 'default' } });

  console.log('Migration complete');
  process.exit(0);
};

migrate();
```

Run: `node scripts/migration-xxx.js`

### 10.6 Authentication Flow (Security Update January 2026)

The authentication system uses **httpOnly cookies** instead of localStorage for security:

**How it works:**
1. Login request sends credentials to `/api/auth/login`
2. Server validates and sets httpOnly cookies (`accessToken`, `refreshToken`)
3. Browser automatically sends cookies with all requests (via `credentials: 'include'`)
4. Access token expires in 15 minutes, refresh token in 7 days

**Frontend API calls:**
```javascript
// api.js is configured with credentials: 'include'
// Cookies are sent automatically - no manual token handling needed
import api from './api';

const response = await api.get('/users');
```

**Account Lockout:**
- 5 failed login attempts = 15 minute account lockout
- Error code 423 (Locked) returned during lockout
- Failed attempts show remaining tries in error message

**Password Requirements:**
- Minimum 8 characters
- Must contain: uppercase, lowercase, number, special character (@$!%*?&)

**Testing Auth in Development:**
```javascript
// Test with curl or Postman
// Cookies will be set in response headers
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@vipcrm.com","password":"Admin123!@#"}' \
  -c cookies.txt  # Save cookies to file
```

---

## 11. Debugging

### 11.1 Backend Debugging

**Using console.log:**
```javascript
console.log('Debug:', variable);
console.log('User:', JSON.stringify(user, null, 2));
```

**Using VS Code Debugger:**
1. Create `.vscode/launch.json`:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Backend",
      "skipFiles": ["<node_internals>/**"],
      "program": "${workspaceFolder}/backend/server.js",
      "envFile": "${workspaceFolder}/backend/.env"
    }
  ]
}
```
2. Set breakpoints
3. Press F5 to start debugging

### 11.2 Frontend Debugging

**React DevTools:**
1. Install [React DevTools](https://react.dev/learn/react-developer-tools) browser extension
2. Open browser DevTools → React tab
3. Inspect component props and state

**Console debugging:**
```javascript
console.log('State:', state);
debugger; // Adds breakpoint
```

### 11.3 Network Debugging
1. Open browser DevTools → Network tab
2. Filter by XHR/Fetch
3. Inspect request/response details

### 11.4 MongoDB Debugging
```javascript
// Enable Mongoose debug mode
mongoose.set('debug', true);
```

---

## 12. IDE Setup

### 12.1 VS Code Extensions
| Extension | Purpose |
|-----------|---------|
| ESLint | JavaScript linting |
| Prettier | Code formatting |
| ES7+ React/Redux/React-Native snippets | React snippets |
| MongoDB for VS Code | Database management |
| Thunder Client | API testing |
| GitLens | Git integration |
| Auto Rename Tag | HTML/JSX tag renaming |
| Bracket Pair Colorizer | Bracket matching |

### 12.2 VS Code Settings
Create `.vscode/settings.json`:
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "emmet.includeLanguages": {
    "javascript": "javascriptreact"
  },
  "files.associations": {
    "*.js": "javascriptreact"
  }
}
```

### 12.3 Useful Snippets
Add to VS Code snippets:
```json
{
  "React Functional Component": {
    "prefix": "rfc",
    "body": [
      "const ${1:ComponentName} = () => {",
      "  return (",
      "    <div>",
      "      $0",
      "    </div>",
      "  );",
      "};",
      "",
      "export default ${1:ComponentName};"
    ]
  }
}
```

---

## Quick Reference

### Start Development
```bash
# Terminal 1 - Backend
cd backend && npm run dev

# Terminal 2 - Frontend
cd frontend && npm run dev
```

### Run Tests
```bash
cd backend && npm test
```

### Build for Production
```bash
cd frontend && npm run build
```

### Git Commit
```bash
git add .
git commit -m "feat(scope): description"
git push origin feature/branch-name
```
