# Deployment Guide
## VIP CRM - AWS Lightsail Edition

**Version:** 4.0
**Last Updated:** March 2026 (Email Notifications + SES Update)

This guide covers deploying the VIP CRM to AWS Lightsail with S3 for image storage and Resend for email notifications.

> **Note:** The email service was migrated from AWS SES to **Resend API**. Some section titles still reference SES for historical context, but the code uses Resend (`backend/config/ses.js`).

---

## Table of Contents
1. [Prerequisites](#1-prerequisites)
2. [AWS Account Setup](#2-aws-account-setup)
3. [AWS S3 Bucket Setup](#3-aws-s3-bucket-setup)
4. [AWS SES Email Setup](#4-aws-ses-email-setup)
5. [AWS Lightsail Instance Setup](#5-aws-lightsail-instance-setup)
6. [MongoDB Atlas Setup](#6-mongodb-atlas-setup)
7. [Server Configuration](#7-server-configuration)
8. [Application Deployment](#8-application-deployment)
9. [Nginx & SSL Configuration](#9-nginx--ssl-configuration)
10. [PM2 Process Management](#10-pm2-process-management)
11. [Environment Variables](#11-environment-variables)
12. [Domain & DNS Setup](#12-domain--dns-setup)
13. [Monitoring & Maintenance](#13-monitoring--maintenance)
14. [Troubleshooting](#14-troubleshooting)

---

## Quick Start: Production Deployment Path

**Current Status:** DEPLOYED AND LIVE at `viosintegrated.net` ✅

**Production Domain:** `https://viosintegrated.net`

### Step-by-Step Deployment Order

All steps completed. This section is kept for reference if re-deploying or setting up a new environment.

#### ✅ All Steps Complete

1. ✅ **AWS Account** - Active
2. ✅ **IAM User with S3 access** - Created with access keys
3. ✅ **S3 Bucket** - `vip-pharmacy-crm-devs` configured with CORS
4. ✅ **Email Service** - Using Resend API (replaced AWS SES)
5. ✅ **MongoDB Atlas** - Cluster connected and working (`cluster0.wv27nfk.mongodb.net`)
6. ✅ **AWS Lightsail Instance** - Provisioned with static IP
7. ✅ **MongoDB Network Access** - Lightsail IP whitelisted
8. ✅ **DNS Configured** - `viosintegrated.net` pointing to Lightsail
9. ✅ **Server Software Installed** - Node.js 20, Nginx, PM2, Git, Certbot
10. ✅ **Application Deployed** - Code cloned, dependencies installed, frontend built
11. ✅ **Environment Variables** - Production `.env` configured
12. ✅ **Nginx Configured** - Reverse proxy with gzip, static file caching
13. ✅ **SSL Certificate** - Let's Encrypt via Certbot (auto-renewal)
14. ✅ **PM2 Running** - separate API + worker processes, auto-restart on boot

#### Reference: Install Server Software
- SSH into Lightsail: *See [Section 5.4](#54-connect-via-ssh)*
- Run these commands in order:
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install Nginx, PM2, Git, Certbot
sudo apt install nginx git -y
sudo npm install -g pm2
sudo apt install certbot python3-certbot-nginx -y

# Verify installations
node --version  # Should show v20.x.x
nginx -v
pm2 --version
```

**6. Deploy Application Code** (20 minutes)
```bash
# Clone repository
sudo mkdir -p /var/www
cd /var/www
sudo git clone https://github.com/YOUR_USERNAME/vip-crm.git
cd vip-crm
sudo chown -R ubuntu:ubuntu /var/www/vip-crm

# Install backend dependencies
cd backend
npm install --production

# Build frontend (IMPORTANT: Use your production domain)
cd ../frontend
npm install
VITE_API_URL=https://yourdomain.com/api npm run build
```

**7. Configure Environment Variables** (10 minutes)
```bash
cd /var/www/vip-crm/backend
nano .env
```
- Copy from [Section 11.1](#111-production-env-file)
- **Update these values:**
  - `MONGO_URI` - Your MongoDB connection string
  - `JWT_SECRET` - Generate with: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
  - `JWT_REFRESH_SECRET` - Generate another one
  - `AWS_ACCESS_KEY_ID` - Your IAM user access key
  - `AWS_SECRET_ACCESS_KEY` - Your IAM secret key
  - `AWS_REGION` - Same region as your S3 bucket (e.g., `ap-southeast-1`)
  - `S3_BUCKET_NAME` - Your bucket name
  - `SES_FROM_EMAIL` - Your verified sender email (e.g., `sales@vippharmacy.online`)
  - `SES_SANDBOX_MODE` - Set to `false` (after SES production approval)
  - `FRONTEND_URL` - Your production domain (e.g., `https://yourdomain.com`)
  - `CORS_ORIGINS` - Your domains (e.g., `https://yourdomain.com,https://www.yourdomain.com`)
- Save and secure: `chmod 600 .env`

**8. Configure Nginx** (15 minutes)
```bash
# Create Nginx config
sudo nano /etc/nginx/sites-available/vip-crm
```
- Copy config from [Section 9.1](#91-create-nginx-configuration)
- **Replace `yourdomain.com` with your actual domain** (3 places)
- Save and enable:
```bash
sudo ln -s /etc/nginx/sites-available/vip-crm /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

**9. Obtain SSL Certificate** (5 minutes)
```bash
# Get SSL certificate (replace with your domain)
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
# Follow prompts, choose to redirect HTTP → HTTPS
```

**10. Start Application with PM2** (10 minutes)
```bash
cd /var/www/vip-crm

# Create PM2 config
nano ecosystem.config.js
```
- Copy from [Section 10.1](#101-create-pm2-ecosystem-file)
- Save and start:
```bash
mkdir -p logs
pm2 start ecosystem.config.js
pm2 save
pm2 startup
# Copy and run the command it outputs
```

**11. Verify Deployment** (10 minutes)
```bash
# Check PM2 status
pm2 status
pm2 logs --lines 50

# Test health endpoint
curl https://yourdomain.com/api/health
# Should return: {"success":true,"dependencies":{"mongodb":"connected","s3":"configured","ses":"configured"}}

# Check Nginx
sudo systemctl status nginx

# Check SSL
curl -I https://yourdomain.com
```

**12. Test the Application** (15 minutes)
- Visit: `https://yourdomain.com`
- Login with your admin credentials (seed credentials are development-only; rotate/remove them before production-like launch)
- Test:
  - Dashboard loads
  - VIP Client list loads
  - Upload a test visit photo (checks S3)
  - Try password reset (checks SES - will only work after production access)

#### 🎉 Post-Deployment (Complete)

**Ongoing Maintenance:**
- Update code: `git pull && npm install && pm2 reload all`
- Monitor: `pm2 monit` or Lightsail console metrics
- View logs: `pm2 logs`
- System updates: `sudo apt update && sudo apt upgrade -y` (monthly)

---

## 1. Prerequisites

### 1.1 Required Accounts
- [x] AWS Account
- [x] Domain name registered (`viosintegrated.net`)
- [x] MongoDB Atlas account
- [x] GitHub account for code repository

### 1.2 Recommended Lightsail Instance
| Resource | Development | Production |
|----------|-------------|------------|
| Plan | $5/month (1GB RAM) | $10/month (2GB RAM) |
| vCPU | 1 | 1 |
| RAM | 1 GB | 2 GB |
| Storage | 40 GB SSD | 60 GB SSD |
| Transfer | 2 TB | 3 TB |
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |

### 1.3 AWS Region Selection
Choose a region closest to your users. Recommended:
- **Asia Pacific**: `ap-southeast-1` (Singapore)
- **US East**: `us-east-1` (N. Virginia)
- **Europe**: `eu-west-1` (Ireland)

---

## 2. AWS Account Setup

### 2.1 Create AWS Account
1. Go to [AWS Console](https://aws.amazon.com/console/)
2. Click "Create an AWS Account"
3. Follow the signup process
4. Verify email and add payment method

### 2.2 Create IAM User for Application

**Important:** Never use root credentials in your application.

1. Go to **IAM** in AWS Console
2. Click **Users** → **Create user**
3. User name: `vip-crm-app`
4. Click **Next**
5. Select **Attach policies directly**
6. Search and attach: `AmazonS3FullAccess` and `AmazonSESFullAccess` (or create custom policies below)
7. Click **Create user**

### 2.3 Create Access Keys
1. Click on the created user
2. Go to **Security credentials** tab
3. Click **Create access key**
4. Select **Application running outside AWS**
5. Click **Create access key**
6. **SAVE** the Access Key ID and Secret Access Key (you won't see them again)

### 2.4 Custom IAM Policy (Recommended for Production)
Create a custom policy with minimal permissions for both S3 and SES:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "S3Access",
            "Effect": "Allow",
            "Action": [
                "s3:PutObject",
                "s3:GetObject",
                "s3:DeleteObject",
                "s3:ListBucket"
            ],
            "Resource": [
                "arn:aws:s3:::vip-crm-bucket",
                "arn:aws:s3:::vip-crm-bucket/*"
            ]
        },
        {
            "Sid": "SESAccess",
            "Effect": "Allow",
            "Action": [
                "ses:SendEmail",
                "ses:SendRawEmail"
            ],
            "Resource": "*"
        }
    ]
}
```

---

## 3. AWS S3 Bucket Setup

### 3.1 Create S3 Bucket
1. Go to **S3** in AWS Console
2. Click **Create bucket**
3. Configure:
   - **Bucket name**: `vip-crm-bucket` (must be globally unique)
   - **AWS Region**: Same as Lightsail (e.g., `ap-southeast-1`)
   - **Object Ownership**: ACLs disabled
   - **Block Public Access**: Keep ALL blocked (recommended)
   - **Bucket Versioning**: Disabled (or Enable for extra protection)
4. Click **Create bucket**

### 3.2 Configure CORS
1. Click on your bucket
2. Go to **Permissions** tab
3. Scroll to **Cross-origin resource sharing (CORS)**
4. Click **Edit** and paste:

```json
[
    {
        "AllowedHeaders": ["*"],
        "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
        "AllowedOrigins": ["https://yourdomain.com", "http://localhost:5173"],
        "ExposeHeaders": ["ETag"]
    }
]
```

5. Click **Save changes**

### 3.3 Folder Structure
Create folders for organization (optional, S3 creates them automatically):
- `visits/` - Visit proof photos
- `products/` - Product images
- `avatars/` - User profile pictures

### 3.4 Lifecycle Rules (Optional - Cost Optimization)
1. Go to **Management** tab
2. Click **Create lifecycle rule**
3. Configure:
   - Rule name: `delete-old-cancelled-visits`
   - Apply to: Specific prefix → `visits/`
   - Transition to Standard-IA after 30 days
   - Expire after 365 days (if needed)

---

## 4. AWS SES Email Setup

The CRM uses AWS SES for sending transactional emails: password reset, weekly compliance reports, and behind-schedule alerts.

### 4.1 Verify Sender Email
1. Go to **SES** in AWS Console (make sure you're in the same region as `AWS_REGION`)
2. Click **Verified identities** → **Create identity**
3. Select **Email address**
4. Enter your sender email (e.g., `sales@vippharmacy.online`)
5. Click **Create identity**
6. Check your inbox and click the verification link

### 4.2 Verify Sending Domain
1. Click **Create identity** → Select **Domain**
2. Enter your domain (e.g., `viosintegrated.net`)
3. AWS will provide **3 CNAME records** (DKIM) and **1 TXT record** (DMARC)
4. Add these DNS records at your domain registrar:

| Type | Host | Value |
|------|------|-------|
| CNAME | `xxxxx._domainkey` | `xxxxx.dkim.amazonses.com` |
| CNAME | `xxxxx._domainkey` | `xxxxx.dkim.amazonses.com` |
| CNAME | `xxxxx._domainkey` | `xxxxx.dkim.amazonses.com` |
| TXT | `_dmarc` | `v=DMARC1; p=none;` |

5. Wait 15-30 minutes for DNS propagation
6. Status should change to **Verified** in SES console

### 4.3 Request Production Access
New SES accounts are in sandbox mode (can only send to verified emails). To send to any email:

1. Go to **SES** → **Account dashboard**
2. Click **Request production access**
3. Fill in:
   - **Mail type**: Transactional
   - **Website URL**: Your domain
   - **Use case**: "Password reset emails, weekly compliance reports, and schedule alerts for our internal CRM system. Low volume (~100 emails/week). All recipients are registered users."
4. Check the acknowledgement box
5. Submit — AWS usually approves within 24 hours

### 4.4 Environment Variables for SES
```bash
SES_FROM_EMAIL=sales@vippharmacy.online    # Must be verified in SES
SES_SANDBOX_MODE=false                      # false for production
FRONTEND_URL=https://yourdomain.com         # Used in password reset email links
```

### 4.5 Email Features
The CRM sends these automated emails:
- **Password reset** — When a user clicks "Forgot Password"
- **Weekly compliance summary** — Every Monday 7 AM (Manila time) to admins and BDMs
- **Behind-schedule alerts** — Weekdays 8 AM to BDMs who are behind on visits
- Users can configure their email preferences at **Settings → Notification Preferences**

---

## 5. AWS Lightsail Instance Setup

### 5.1 Create Lightsail Instance
1. Go to [AWS Lightsail](https://lightsail.aws.amazon.com/)
2. Click **Create instance**
3. Configure:
   - **Region**: Select your preferred region
   - **Platform**: Linux/Unix
   - **Blueprint**: OS Only → Ubuntu 22.04 LTS
   - **Instance plan**: $10/month (2GB RAM) for production
   - **Instance name**: `vip-crm`
4. Click **Create instance**

### 5.2 Create Static IP
1. Go to **Networking** tab
2. Click **Create static IP**
3. Attach to your instance
4. Name it: `vip-crm-static-ip`
5. **Save the IP address** for DNS configuration

### 5.3 Configure Firewall
1. Click on your instance
2. Go to **Networking** tab
3. Under **IPv4 Firewall**, add rules:

| Application | Protocol | Port Range |
|-------------|----------|------------|
| SSH | TCP | 22 |
| HTTP | TCP | 80 |
| HTTPS | TCP | 443 |

> Security note: Keep port `5000` private (no public firewall rule). Nginx should be the only public entrypoint.

### 5.4 Connect via SSH
**Option 1: Browser-based SSH**
- Click **Connect using SSH** button in Lightsail console

**Option 2: Local Terminal**
1. Download SSH key from Lightsail → Account → SSH Keys
2. Connect:
```bash
chmod 400 LightsailDefaultKey-ap-southeast-1.pem
ssh -i LightsailDefaultKey-ap-southeast-1.pem ubuntu@YOUR_STATIC_IP
```

---

## 6. MongoDB Atlas Setup

### 6.1 Create Cluster
1. Go to [MongoDB Atlas](https://www.mongodb.com/atlas)
2. Sign up or log in
3. Create new project: "VIP-CRM"
4. Click **Build a Database**
5. Select **FREE** tier (M0 Sandbox)
6. Choose provider: AWS
7. Region: Same as Lightsail (e.g., Singapore)
8. Cluster name: `vip-crm-cluster`
9. Click **Create**

### 6.2 Create Database User
1. Go to **Database Access** in sidebar
2. Click **Add New Database User**
3. Authentication: Password
4. Username: `vip_crm_admin`
5. Password: Click **Autogenerate Secure Password** → **Copy and SAVE it**
6. Database User Privileges: **Read and write to any database**
7. Click **Add User**

### 6.3 Configure Network Access
1. Go to **Network Access** in sidebar
2. Click **Add IP Address**
3. Add your Lightsail static IP: `YOUR_STATIC_IP/32`
4. Comment: "Lightsail Production"
5. Click **Confirm**

For development, you can temporarily add `0.0.0.0/0` (Allow from anywhere).

### 6.4 Get Connection String
1. Go to **Database** → Click **Connect**
2. Choose **Drivers** (Node.js)
3. Copy connection string:
```
mongodb+srv://vip_crm_admin:<password>@vip-crm-cluster.xxxxx.mongodb.net/?retryWrites=true&w=majority
```
4. Replace `<password>` with your saved password
5. Add database name after `.net/`:
```
mongodb+srv://...mongodb.net/vip-crm?retryWrites=true&w=majority
```

---

## 7. Server Configuration

### 7.1 Update System
```bash
sudo apt update && sudo apt upgrade -y
```

### 7.2 Install Node.js 20 LTS
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify
node --version  # v20.x.x
npm --version   # 10.x.x
```

### 7.3 Install Nginx
```bash
sudo apt install nginx -y
sudo systemctl start nginx
sudo systemctl enable nginx
```

### 7.4 Install PM2
```bash
sudo npm install -g pm2
```

### 7.5 Install Git
```bash
sudo apt install git -y
```

### 7.6 Install Certbot for SSL
```bash
sudo apt install certbot python3-certbot-nginx -y
```

### 7.7 Create Application User (Optional but Recommended)
```bash
sudo adduser --system --group --home /var/www/vip-crm nodeapp
```

---

## 8. Application Deployment

### 8.1 Clone Repository
```bash
sudo mkdir -p /var/www
cd /var/www

# Clone your repository
sudo git clone https://github.com/YOUR_USERNAME/vip-crm.git
cd vip-crm

# Set ownership
sudo chown -R ubuntu:ubuntu /var/www/vip-crm
```

### 8.2 Install Backend Dependencies
```bash
cd /var/www/vip-crm/backend
npm install --production
```

### 8.3 Build Frontend
```bash
cd /var/www/vip-crm/frontend
npm install

# IMPORTANT: Set the production API URL when building
VITE_API_URL=https://yourdomain.com/api npm run build
```

### 8.4 Create Environment File
```bash
cd /var/www/vip-crm/backend
nano .env
```

Add your environment variables (see Section 11).

### 8.5 Test Application
```bash
cd /var/www/vip-crm/backend
node server.js

# Should see: "Server running on port 5000"
# Press Ctrl+C to stop
```

---

## 9. Nginx & SSL Configuration

### 9.1 Create Nginx Configuration
```bash
sudo nano /etc/nginx/sites-available/vip-crm
```

Paste this configuration:

```nginx
# Redirect HTTP to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name yourdomain.com www.yourdomain.com;

    location / {
        return 301 https://$server_name$request_uri;
    }
}

# HTTPS Server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    # SSL certificates (will be added by Certbot)
    # ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # Root for frontend static files
    root /var/www/vip-crm/frontend/dist;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied expired no-cache no-store private auth;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/json;

    # API proxy to backend
    location /api {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 90;

        # File upload size limit
        client_max_body_size 10M;
    }

    # Frontend SPA routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Static file caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Deny access to hidden files
    location ~ /\. {
        deny all;
    }
}
```

### 9.2 Enable Site
```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/vip-crm /etc/nginx/sites-enabled/

# Remove default site
sudo rm -f /etc/nginx/sites-enabled/default

# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

### 9.3 Obtain SSL Certificate
```bash
# Get SSL certificate (replace with your domain)
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Follow prompts:
# - Enter email address
# - Agree to terms
# - Choose to redirect HTTP to HTTPS (recommended)
```

### 9.4 Verify SSL Auto-Renewal
```bash
# Test renewal
sudo certbot renew --dry-run

# Check timer
sudo systemctl status certbot.timer
```

---

## 10. PM2 Process Management

### 10.1 Create PM2 Ecosystem File
```bash
cd /var/www/vip-crm
nano ecosystem.config.js
```

Content:
```javascript
module.exports = {
  apps: [
    {
      name: 'vip-crm-api',
      script: './backend/server.js',
      cwd: '/var/www/vip-crm',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
        ENABLE_SCHEDULER: 'false'
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_file: './logs/combined.log',
      time: true,
      max_memory_restart: '500M',
      exp_backoff_restart_delay: 100,
      watch: false
    },
    {
      name: 'vip-crm-worker',
      script: './backend/worker.js',
      cwd: '/var/www/vip-crm',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        ENABLE_SCHEDULER: 'true'
      },
      error_file: './logs/worker-err.log',
      out_file: './logs/worker-out.log',
      log_file: './logs/worker-combined.log',
      time: true,
      max_memory_restart: '300M',
      exp_backoff_restart_delay: 100,
      watch: false
    }
  ]
};
```

### 10.2 Create Logs Directory
```bash
mkdir -p /var/www/vip-crm/logs
```

### 10.3 Start Application
```bash
cd /var/www/vip-crm

# Start with PM2
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Run the command it outputs (copy and execute)
```

### 10.4 PM2 Commands Reference
```bash
pm2 status           # View all processes
pm2 logs             # View logs
pm2 logs --err       # View error logs only
pm2 restart all      # Restart all processes
pm2 reload all       # Zero-downtime reload
pm2 stop all         # Stop all processes
pm2 monit            # Monitor resources
```

---

## 11. Environment Variables

### 11.1 Production .env File
Create `/var/www/vip-crm/backend/.env`:

```bash
# ===========================================
# PRODUCTION ENVIRONMENT - VIP CRM
# ===========================================

# Server Configuration
NODE_ENV=production
PORT=5000
ENABLE_SCHEDULER=false
HEALTH_EXPOSE_DETAILS=false

# MongoDB Atlas
MONGO_URI=mongodb+srv://vip_crm_admin:YOUR_PASSWORD@vip-crm-cluster.xxxxx.mongodb.net/vip-crm?retryWrites=true&w=majority

# JWT Configuration (SECURITY: Secrets must be at least 64 characters!)
# Server will refuse to start if secrets are too short.
JWT_SECRET=your_production_jwt_secret_minimum_64_characters_long_generate_with_crypto
JWT_EXPIRE=15m
JWT_REFRESH_SECRET=your_production_refresh_secret_minimum_64_characters_long_generate_with_crypto
JWT_REFRESH_EXPIRE=7d

# AWS Configuration (shared by S3 and SES)
AWS_ACCESS_KEY_ID=AKIA...your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_access_key
AWS_REGION=ap-southeast-1

# AWS S3 (Image Storage)
S3_BUCKET_NAME=vip-pharmacy-crm-devs

# AWS SES (Email Notifications)
SES_FROM_EMAIL=sales@vippharmacy.online
SES_SANDBOX_MODE=false

# Frontend URL (for password reset links and CORS)
FRONTEND_URL=https://yourdomain.com

# CORS Origins (REQUIRED in production - server will not start without it!)
CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_GENERAL_MAX=500
RATE_LIMIT_AUTH_MAX=50
RATE_LIMIT_USER_MAX=300

# Login Rate Limiting (Account Lockout)
LOGIN_MAX_ATTEMPTS=5
LOGIN_LOCKOUT_DURATION=15

# Admin Excel import hardening
IMPORT_MAX_FILE_SIZE_MB=5
IMPORT_MAX_WORKBOOK_SHEETS=30
IMPORT_MAX_WORKSHEET_ROWS=2000

# Optional alert webhook for scheduler failures
# ALERT_WEBHOOK_URL=https://hooks.example.com/alerts
```

### 11.2 Generate Secure JWT Secrets
```bash
# Generate random secrets
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 11.3 Secure .env File
```bash
chmod 600 /var/www/vip-crm/backend/.env
```

---

## 12. Domain & DNS Setup

### 12.1 Using Squarespace Domain

If your domain is registered with Squarespace, follow these steps:

1. **Get Static IP** from Lightsail (Section 5.2) - Save this IP address

2. **Log in to Squarespace**:
   - Go to [squarespace.com](https://www.squarespace.com)
   - Log in to your account

3. **Navigate to DNS Settings**:
   - Click **Settings** → **Domains**
   - Click on your domain name
   - Click **DNS Settings** (or **Advanced Settings**)

4. **Add A Records**:
   - Scroll to **Custom Records** section
   - Click **Add Record**

   **First A Record (root domain):**
   - Type: `A`
   - Host: `@` (or leave blank)
   - Data: `YOUR_LIGHTSAIL_STATIC_IP`
   - TTL: `3600` (default)
   - Click **Add**

   **Second A Record (www subdomain):**
   - Click **Add Record** again
   - Type: `A`
   - Host: `www`
   - Data: `YOUR_LIGHTSAIL_STATIC_IP`
   - TTL: `3600`
   - Click **Add**

5. **Remove Conflicting Records** (if present):
   - If there are existing A records for `@` or `www` pointing to Squarespace IPs, **delete them**
   - Squarespace may show a warning that the domain won't point to your site anymore - this is expected

6. **Wait for DNS Propagation** (5 minutes - 2 hours):
   - Squarespace DNS is usually fast (5-30 minutes)

7. **Verify DNS** from your local computer:
   ```bash
   # Check root domain
   nslookup yourdomain.com
   # Should show your Lightsail IP

   # Check www subdomain
   nslookup www.yourdomain.com
   # Should also show your Lightsail IP
   ```

**Important Notes for Squarespace:**
- ⚠️ **Do NOT use Squarespace website builder** while pointing DNS to Lightsail - your Squarespace site will not be accessible
- If you want to keep your Squarespace site AND run the CRM, use a **subdomain** instead:
  - Keep `@` and `www` pointing to Squarespace
  - Create a new A record: `crm` → `YOUR_LIGHTSAIL_IP`
  - Access CRM at: `crm.yourdomain.com`
  - Update Nginx config to use `crm.yourdomain.com` instead of `yourdomain.com`

### 12.2 Using Other Domain Registrars

If your domain is with a different registrar (Namecheap, GoDaddy, etc.):

1. **Get Static IP** from Lightsail (Section 5.2)

2. **Configure DNS** at your registrar:
   ```
   A Record: @ → YOUR_STATIC_IP
   A Record: www → YOUR_STATIC_IP
   ```

3. **Wait for propagation** (up to 48 hours, usually faster)

4. **Verify DNS**:
   ```bash
   dig yourdomain.com +short
   # Should return your static IP
   ```

### 12.3 Using Lightsail Domain (Alternative)
1. Go to Lightsail → Domains & DNS
2. Create DNS zone
3. Add A record pointing to your instance
4. Use Lightsail's domain management

---

## 13. Monitoring & Maintenance

### 13.1 Log Locations
| Log | Location |
|-----|----------|
| Application | `/var/www/vip-crm/logs/` |
| PM2 | `pm2 logs` |
| Nginx Access | `/var/log/nginx/access.log` |
| Nginx Error | `/var/log/nginx/error.log` |

### 13.2 Lightsail Monitoring
1. Go to Lightsail Console → Your Instance
2. Click **Metrics** tab
3. Monitor: CPU, Network, Status checks

### 13.3 Daily Health Check
```bash
# Check PM2 status
pm2 status

# Check disk space
df -h

# Check memory
free -m
```

### 13.4 Update Application
```bash
cd /var/www/vip-crm

# Pull latest code
git pull origin main

# Install any new dependencies
cd backend && npm install --production
cd ../frontend && npm install && VITE_API_URL=https://yourdomain.com/api npm run build

# Restart application
pm2 reload all
```

### 13.5 System Updates (Monthly)
```bash
sudo apt update && sudo apt upgrade -y
sudo reboot  # If kernel updated
```

### 13.6 Backup Strategy

**Application Backup:**
```bash
# Create backup script
cat > /home/ubuntu/backup.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/home/ubuntu/backups"
mkdir -p $BACKUP_DIR

# Backup app (excluding node_modules)
tar --exclude='node_modules' -czf $BACKUP_DIR/app_$DATE.tar.gz /var/www/vip-crm

# Remove backups older than 7 days
find $BACKUP_DIR -type f -mtime +7 -delete

echo "Backup completed: $DATE"
EOF

chmod +x /home/ubuntu/backup.sh
```

**Database Backup:**
- MongoDB Atlas handles automatic backups
- Enable Point-in-time recovery for production (paid tier)

**S3 Backup:**
- Enable S3 versioning for file recovery
- Consider cross-region replication for critical data

---

## 14. Troubleshooting

### 14.1 Application Won't Start
```bash
# Check PM2 logs
pm2 logs --lines 50

# Test manually
cd /var/www/vip-crm/backend
node server.js

# Check environment variables
cat .env
```

### 14.2 502 Bad Gateway
```bash
# Check if backend is running
pm2 status

# Check Nginx config
sudo nginx -t

# Check Nginx error logs
sudo tail -f /var/log/nginx/error.log

# Restart services
pm2 restart all
sudo systemctl restart nginx
```

### 14.3 S3 Upload Errors
```bash
# Test AWS credentials
aws configure list

# Test S3 access
aws s3 ls s3://vip-crm-bucket/

# Check bucket CORS
aws s3api get-bucket-cors --bucket vip-crm-bucket
```

### 14.4 Database Connection Issues
```bash
# Test MongoDB connection
cd /var/www/vip-crm/backend
node -e "
require('dotenv').config();
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGO_URI)
  .then(() => { console.log('Connected!'); process.exit(0); })
  .catch(err => { console.error('Error:', err.message); process.exit(1); });
"
```

### 14.5 SES Email Issues
```bash
# Test SES connection
cd /var/www/vip-crm/backend
node -e "
require('dotenv').config();
const { sendEmail } = require('./config/ses');
sendEmail({
  to: 'sales@vippharmacy.online',
  subject: 'Test',
  html: '<p>Test email</p>',
  text: 'Test email'
}).then(r => { console.log('Sent:', r.messageId); process.exit(0); })
.catch(err => { console.error('Error:', err.message); process.exit(1); });
"

# Check email logs in MongoDB
node -e "
require('dotenv').config();
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGO_URI).then(async () => {
  const logs = await mongoose.connection.db.collection('emaillogs').find().sort({sentAt:-1}).limit(5).toArray();
  console.log(JSON.stringify(logs, null, 2));
  process.exit(0);
});
"
```

### 14.6 SSL Issues
```bash
# Check certificate
sudo certbot certificates

# Force renewal
sudo certbot renew --force-renewal

# Check Nginx SSL config
sudo nginx -t
```

### 14.7 Permission Issues
```bash
# Fix ownership
sudo chown -R ubuntu:ubuntu /var/www/vip-crm

# Fix permissions
chmod -R 755 /var/www/vip-crm
chmod 600 /var/www/vip-crm/backend/.env
```

---

## Security Hardening Checklist (March 2026)

Before deploying to production, verify these security requirements:

### Authentication Security
- [x] JWT secrets are at least 64 characters (server validates at startup)
- [x] Access token expiry is 15 minutes or less
- [x] Refresh token expiry is 7 days or less
- [x] CORS_ORIGINS environment variable is set (required in production)
- [x] httpOnly cookies are being used (not localStorage)

### Account Security
- [x] Account lockout is enabled (5 attempts = 15 min lockout)
- [x] Password complexity is enforced (upper, lower, number, special char)
- [x] Audit logging is enabled (check AuditLog collection)

### API Security
- [x] Rate limiting is configured (default: 500 req/15min general, 50 req/15min auth, 300 req/15min per user)
- [x] HSTS headers are enabled via helmet
- [x] S3 signed URL expiry is 1 hour (not 24 hours)

### Email Security
- [x] Email service configured (Resend API)
- [x] SES_SANDBOX_MODE is set to `false` for production
- [x] FRONTEND_URL points to production domain (`https://viosintegrated.net`)
- [x] EmailLog TTL index active (90-day auto-cleanup)

### Monitoring
- [x] Audit logs are being written to MongoDB
- [x] Email logs are being written to MongoDB
- [x] TTL index on AuditLog and EmailLog collections (90 day expiry)
- [x] Failed login attempts are logged with IP address
- [x] Email cron jobs running (check PM2 logs for `[EmailScheduler]` entries)

For detailed security documentation, see `docs/SECURITY_CHECKLIST.md`.

---

## Deployment Checklist

### AWS Setup
- [x] AWS account created
- [x] IAM user with S3 access created
- [x] Access keys saved securely

### S3 Setup
- [x] S3 bucket created (`vip-pharmacy-crm-devs`)
- [x] CORS configured for production domain
- [x] Folder structure created (visits/, products/, avatars/)

### Email Setup (Resend)
- [x] Resend API key configured
- [x] Sender email verified
- [x] Email logging active (EmailLog model with 90-day TTL)
- [x] Cron jobs running (weekly compliance, behind-schedule alerts)

### Lightsail Setup
- [x] Instance created (Ubuntu 22.04)
- [x] Static IP attached
- [x] Firewall rules configured (22, 80, 443)

### Database Setup
- [x] MongoDB Atlas cluster created (`cluster0.wv27nfk.mongodb.net`)
- [x] Database user created
- [x] Network access configured (Lightsail IP)
- [x] Connection string saved

### Server Setup
- [x] Node.js 20 LTS installed
- [x] Nginx installed
- [x] PM2 installed (API + worker process topology)
- [x] Git installed
- [x] Certbot installed

### Application Setup
- [x] Repository cloned
- [x] Backend dependencies installed
- [x] Frontend built
- [x] Environment variables configured
- [x] PM2 ecosystem file created
- [x] Application started with PM2

### Nginx & SSL
- [x] Nginx site configured (reverse proxy + static files)
- [x] SSL certificate obtained (Let's Encrypt)
- [x] Auto-renewal verified

### Final Verification
- [x] Application accessible via HTTPS (`https://viosintegrated.net`)
- [x] API endpoints working
- [x] Image uploads working (S3)
- [x] Authentication working (httpOnly cookies)
- [x] PM2 starts on boot
- [x] Email cron jobs initialized

---

## Cost Estimation (Monthly)

| Service | Tier | Cost |
|---------|------|------|
| Lightsail | 2GB Instance | $10 |
| MongoDB Atlas | M0 (Free) | $0 |
| S3 | ~5GB storage | ~$0.12 |
| SES | ~400 emails/month | ~$0.04 |
| SES VDM | Virtual Deliverability Manager | ~$1.50 |
| Data Transfer | Included in Lightsail | $0 |
| **Total** | | **~$12/month** |

For higher usage, consider:
- Lightsail $20 plan (4GB RAM)
- MongoDB Atlas M2 ($9/month)
- S3 with CloudFront CDN
