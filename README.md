# VIP CRM

A pharmaceutical field sales management system designed for Business Development Managers (BDM) to track VIP Client visits, manage product assignments, and ensure compliance with visit schedules.

## Features

### Business Development Manager (BDM)
- View VIP Clients in assigned regions only
- Log visits with GPS location and photo proof
- Track weekly/monthly visit compliance
- View products assigned to each VIP Client
- View personal visit history with filters

### Medical Representative (MedRep)
- Assign products to VIP Clients with priority levels
- Manage product-VIP Client mappings (create, update, deactivate)
- View assignment reports across all regions

### Administrator
- Manage users (create, edit, assign regions, deactivate)
- Manage VIP Clients across all regions
- Manage products with image uploads
- Manage regions (hierarchical structure)
- View all visits and compliance alerts
- Monitor compliance statistics

## Tech Stack

| Component | Technology |
|-----------|------------|
| Backend | Express.js + Node.js |
| Frontend | React + Vite |
| Database | MongoDB Atlas |
| Image Storage | AWS S3 |
| Authentication | JWT (Access + Refresh tokens) |

## Project Structure

```
vip-crm/
├── backend/          # Express.js API server
│   ├── config/       # Database and S3 configuration
│   ├── controllers/  # Route handlers
│   ├── middleware/   # Auth, validation, uploads
│   ├── models/       # Mongoose schemas
│   ├── routes/       # Express routes
│   └── utils/        # Helper functions
├── frontend/         # React application
│   └── src/
│       ├── components/  # React components
│       ├── contexts/    # Auth context
│       ├── pages/       # Page components
│       ├── services/    # API calls
│       └── hooks/       # Custom hooks
├── docs/             # Project documentation
└── README.md
```

## Getting Started

### Prerequisites
- Node.js (v18 or higher)
- MongoDB Atlas account
- AWS S3 bucket

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   cd backend && npm install
   cd ../frontend && npm install
   ```

3. Set up environment variables:
   - Copy `backend/.env.example` to `backend/.env`
   - Copy `frontend/.env.example` to `frontend/.env`
   - Update with your configuration

4. Seed the database:
   ```bash
   cd backend && npm run seed
   ```

### Running the Application

```bash
# Backend (port 5000)
cd backend && npm run dev

# Frontend (port 5173)
cd frontend && npm run dev
```

## Test Credentials

**Development only:** Never use these credentials in production-like or production environments. Rotate all seeded accounts immediately after deployment.

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@vipcrm.com | Admin123!@# |
| MedRep | medrep@vipcrm.com | Medrep123!@# |
| BDM | juan@vipcrm.com | BDM123!@# |

## Documentation

- [Development Guide](docs/DEVELOPMENT_GUIDE.md) - Setup and development instructions
- [Production-Like Runbook](docs/PRODUCTION_LIKE_RUNBOOK.md) - Lightsail + Atlas ops, rollout, rollback
- [Security Risk Register](docs/SECURITY_RISK_REGISTER.md) - Accepted risks and mitigation owners
- [Phase Tasks](docs/PHASE-TASKS.md) - Project roadmap and task breakdown
- [CLAUDE.md](CLAUDE.md) - AI assistant context and business rules

## Business Rules

- **Weekly Limit**: Maximum ONE visit per VIP Client per week (Mon-Fri only)
- **Monthly Quota**: 2x or 4x visits per VIP Client based on visitFrequency
- **Visit Proof**: Every visit requires GPS coordinates and at least one photo
- **Region Access**: BDMs only see VIP Clients in their assigned regions

## License

This project is proprietary software.
