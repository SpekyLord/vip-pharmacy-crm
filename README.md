# VIP Pharmacy CRM

A pharmaceutical field sales management system designed for medical representatives to track doctor visits, manage product assignments, and ensure compliance with visit schedules.

## Features

### Employee (Field Sales Rep)
- View doctors in assigned regions only
- Log visits with GPS location and photo proof
- Track weekly/monthly visit compliance
- View products assigned to each doctor
- View personal visit history with filters

### Medical Representative (MedRep)
- Assign products to doctors with priority levels
- Manage product-doctor mappings (create, update, deactivate)
- View assignment reports across all regions

### Administrator
- Manage users (create, edit, assign regions, deactivate)
- Manage doctors across all regions
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
vip-pharmacy-crm/
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

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@vippharmacy.com | Admin123!@# |
| MedRep | medrep@vippharmacy.com | Medrep123!@# |
| Employee | juan@vippharmacy.com | Employee123!@# |

## Documentation

- [Development Guide](docs/DEVELOPMENT_GUIDE.md) - Setup and development instructions
- [Phase Tasks](docs/PHASE-TASKS.md) - Project roadmap and task breakdown
- [CLAUDE.md](CLAUDE.md) - AI assistant context and business rules

## Business Rules

- **Weekly Limit**: Maximum ONE visit per doctor per week (Mon-Fri only)
- **Monthly Quota**: 2x or 4x visits per doctor based on visitFrequency
- **Visit Proof**: Every visit requires GPS coordinates and at least one photo
- **Region Access**: Employees only see doctors in their assigned regions

## License

This project is proprietary software.
