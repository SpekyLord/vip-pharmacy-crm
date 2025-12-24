# Deployment Guide
## VIP Pharmacy CRM - AWS Lightsail Edition

**Version:** 2.0
**Last Updated:** December 2024

This guide covers deploying the VIP Pharmacy CRM to AWS Lightsail with S3 for image storage.

---

## Table of Contents
1. [Prerequisites](#1-prerequisites)
2. [AWS Account Setup](#2-aws-account-setup)
3. [AWS S3 Bucket Setup](#3-aws-s3-bucket-setup)
4. [AWS Lightsail Instance Setup](#4-aws-lightsail-instance-setup)
5. [MongoDB Atlas Setup](#5-mongodb-atlas-setup)
6. [Server Configuration](#6-server-configuration)
7. [Application Deployment](#7-application-deployment)
8. [Nginx & SSL Configuration](#8-nginx--ssl-configuration)
9. [PM2 Process Management](#9-pm2-process-management)
10. [Environment Variables](#10-environment-variables)
11. [Domain & DNS Setup](#11-domain--dns-setup)
12. [Monitoring & Maintenance](#12-monitoring--maintenance)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. Prerequisites

### 1.1 Required Accounts
- [ ] AWS Account (free tier available)
- [ ] Domain name registered (or use Lightsail static IP)
- [ ] MongoDB Atlas account (free tier available)
- [ ] GitHub/GitLab account for code repository

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
3. User name: `vip-pharmacy-app`
4. Click **Next**
5. Select **Attach policies directly**
6. Search and attach: `AmazonS3FullAccess` (or create custom policy below)
7. Click **Create user**

### 2.3 Create Access Keys
1. Click on the created user
2. Go to **Security credentials** tab
3. Click **Create access key**
4. Select **Application running outside AWS**
5. Click **Create access key**
6. **SAVE** the Access Key ID and Secret Access Key (you won't see them again)

### 2.4 Custom S3 Policy (Recommended for Production)
Create a custom policy with minimal permissions:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "s3:PutObject",
                "s3:GetObject",
                "s3:DeleteObject",
                "s3:ListBucket"
            ],
            "Resource": [
                "arn:aws:s3:::vip-pharmacy-crm-bucket",
                "arn:aws:s3:::vip-pharmacy-crm-bucket/*"
            ]
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
   - **Bucket name**: `vip-pharmacy-crm-bucket` (must be globally unique)
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

## 4. AWS Lightsail Instance Setup

### 4.1 Create Lightsail Instance
1. Go to [AWS Lightsail](https://lightsail.aws.amazon.com/)
2. Click **Create instance**
3. Configure:
   - **Region**: Select your preferred region
   - **Platform**: Linux/Unix
   - **Blueprint**: OS Only → Ubuntu 22.04 LTS
   - **Instance plan**: $10/month (2GB RAM) for production
   - **Instance name**: `vip-pharmacy-crm`
4. Click **Create instance**

### 4.2 Create Static IP
1. Go to **Networking** tab
2. Click **Create static IP**
3. Attach to your instance
4. Name it: `vip-pharmacy-static-ip`
5. **Save the IP address** for DNS configuration

### 4.3 Configure Firewall
1. Click on your instance
2. Go to **Networking** tab
3. Under **IPv4 Firewall**, add rules:

| Application | Protocol | Port Range |
|-------------|----------|------------|
| SSH | TCP | 22 |
| HTTP | TCP | 80 |
| HTTPS | TCP | 443 |
| Custom | TCP | 5000 (remove after nginx setup) |

### 4.4 Connect via SSH
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

## 5. MongoDB Atlas Setup

### 5.1 Create Cluster
1. Go to [MongoDB Atlas](https://www.mongodb.com/atlas)
2. Sign up or log in
3. Create new project: "VIP-Pharmacy-CRM"
4. Click **Build a Database**
5. Select **FREE** tier (M0 Sandbox)
6. Choose provider: AWS
7. Region: Same as Lightsail (e.g., Singapore)
8. Cluster name: `vip-pharmacy-cluster`
9. Click **Create**

### 5.2 Create Database User
1. Go to **Database Access** in sidebar
2. Click **Add New Database User**
3. Authentication: Password
4. Username: `vip_pharmacy_admin`
5. Password: Click **Autogenerate Secure Password** → **Copy and SAVE it**
6. Database User Privileges: **Read and write to any database**
7. Click **Add User**

### 5.3 Configure Network Access
1. Go to **Network Access** in sidebar
2. Click **Add IP Address**
3. Add your Lightsail static IP: `YOUR_STATIC_IP/32`
4. Comment: "Lightsail Production"
5. Click **Confirm**

For development, you can temporarily add `0.0.0.0/0` (Allow from anywhere).

### 5.4 Get Connection String
1. Go to **Database** → Click **Connect**
2. Choose **Drivers** (Node.js)
3. Copy connection string:
```
mongodb+srv://vip_pharmacy_admin:<password>@vip-pharmacy-cluster.xxxxx.mongodb.net/?retryWrites=true&w=majority
```
4. Replace `<password>` with your saved password
5. Add database name after `.net/`:
```
mongodb+srv://...mongodb.net/vip-pharmacy-crm?retryWrites=true&w=majority
```

---

## 6. Server Configuration

### 6.1 Update System
```bash
sudo apt update && sudo apt upgrade -y
```

### 6.2 Install Node.js 18 LTS
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verify
node --version  # v18.x.x
npm --version   # 9.x.x or 10.x.x
```

### 6.3 Install Nginx
```bash
sudo apt install nginx -y
sudo systemctl start nginx
sudo systemctl enable nginx
```

### 6.4 Install PM2
```bash
sudo npm install -g pm2
```

### 6.5 Install Git
```bash
sudo apt install git -y
```

### 6.6 Install Certbot for SSL
```bash
sudo apt install certbot python3-certbot-nginx -y
```

### 6.7 Create Application User (Optional but Recommended)
```bash
sudo adduser --system --group --home /var/www/vip-pharmacy nodeapp
```

---

## 7. Application Deployment

### 7.1 Clone Repository
```bash
sudo mkdir -p /var/www
cd /var/www

# Clone your repository
sudo git clone https://github.com/YOUR_USERNAME/vip-pharmacy-crm.git
cd vip-pharmacy-crm

# Set ownership
sudo chown -R ubuntu:ubuntu /var/www/vip-pharmacy-crm
```

### 7.2 Install Backend Dependencies
```bash
cd /var/www/vip-pharmacy-crm/backend
npm install --production
```

### 7.3 Build Frontend
```bash
cd /var/www/vip-pharmacy-crm/frontend
npm install
npm run build
```

### 7.4 Create Environment File
```bash
cd /var/www/vip-pharmacy-crm/backend
nano .env
```

Add your environment variables (see Section 10).

### 7.5 Test Application
```bash
cd /var/www/vip-pharmacy-crm/backend
node server.js

# Should see: "Server running on port 5000"
# Press Ctrl+C to stop
```

---

## 8. Nginx & SSL Configuration

### 8.1 Create Nginx Configuration
```bash
sudo nano /etc/nginx/sites-available/vip-pharmacy-crm
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
    root /var/www/vip-pharmacy-crm/frontend/dist;
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

### 8.2 Enable Site
```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/vip-pharmacy-crm /etc/nginx/sites-enabled/

# Remove default site
sudo rm -f /etc/nginx/sites-enabled/default

# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

### 8.3 Obtain SSL Certificate
```bash
# Get SSL certificate (replace with your domain)
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Follow prompts:
# - Enter email address
# - Agree to terms
# - Choose to redirect HTTP to HTTPS (recommended)
```

### 8.4 Verify SSL Auto-Renewal
```bash
# Test renewal
sudo certbot renew --dry-run

# Check timer
sudo systemctl status certbot.timer
```

---

## 9. PM2 Process Management

### 9.1 Create PM2 Ecosystem File
```bash
cd /var/www/vip-pharmacy-crm
nano ecosystem.config.js
```

Content:
```javascript
module.exports = {
  apps: [
    {
      name: 'vip-pharmacy-api',
      script: './backend/server.js',
      cwd: '/var/www/vip-pharmacy-crm',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 5000
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_file: './logs/combined.log',
      time: true,
      max_memory_restart: '500M',
      exp_backoff_restart_delay: 100,
      watch: false
    }
  ]
};
```

### 9.2 Create Logs Directory
```bash
mkdir -p /var/www/vip-pharmacy-crm/logs
```

### 9.3 Start Application
```bash
cd /var/www/vip-pharmacy-crm

# Start with PM2
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Run the command it outputs (copy and execute)
```

### 9.4 PM2 Commands Reference
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

## 10. Environment Variables

### 10.1 Production .env File
Create `/var/www/vip-pharmacy-crm/backend/.env`:

```bash
# ===========================================
# PRODUCTION ENVIRONMENT - VIP Pharmacy CRM
# ===========================================

# Server Configuration
NODE_ENV=production
PORT=5000

# MongoDB Atlas
MONGODB_URI=mongodb+srv://vip_pharmacy_admin:YOUR_PASSWORD@vip-pharmacy-cluster.xxxxx.mongodb.net/vip-pharmacy-crm?retryWrites=true&w=majority

# JWT Configuration (generate new secrets!)
JWT_SECRET=your_production_jwt_secret_minimum_32_characters_long
JWT_EXPIRE=15m
JWT_REFRESH_SECRET=your_production_refresh_secret_minimum_32_characters
JWT_REFRESH_EXPIRE=7d

# AWS S3 Configuration
AWS_ACCESS_KEY_ID=AKIA...your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_access_key
AWS_REGION=ap-southeast-1
S3_BUCKET_NAME=vip-pharmacy-crm-bucket

# Frontend URL (for CORS)
FRONTEND_URL=https://yourdomain.com

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

### 10.2 Generate Secure JWT Secrets
```bash
# Generate random secrets
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 10.3 Secure .env File
```bash
chmod 600 /var/www/vip-pharmacy-crm/backend/.env
```

---

## 11. Domain & DNS Setup

### 11.1 Using Custom Domain

1. **Get Static IP** from Lightsail (Section 4.2)

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

### 11.2 Using Lightsail Domain (Alternative)
1. Go to Lightsail → Domains & DNS
2. Create DNS zone
3. Add A record pointing to your instance
4. Use Lightsail's domain management

---

## 12. Monitoring & Maintenance

### 12.1 Log Locations
| Log | Location |
|-----|----------|
| Application | `/var/www/vip-pharmacy-crm/logs/` |
| PM2 | `pm2 logs` |
| Nginx Access | `/var/log/nginx/access.log` |
| Nginx Error | `/var/log/nginx/error.log` |

### 12.2 Lightsail Monitoring
1. Go to Lightsail Console → Your Instance
2. Click **Metrics** tab
3. Monitor: CPU, Network, Status checks

### 12.3 Daily Health Check
```bash
# Check PM2 status
pm2 status

# Check disk space
df -h

# Check memory
free -m
```

### 12.4 Update Application
```bash
cd /var/www/vip-pharmacy-crm

# Pull latest code
git pull origin main

# Install any new dependencies
cd backend && npm install --production
cd ../frontend && npm install && npm run build

# Restart application
pm2 reload all
```

### 12.5 System Updates (Monthly)
```bash
sudo apt update && sudo apt upgrade -y
sudo reboot  # If kernel updated
```

### 12.6 Backup Strategy

**Application Backup:**
```bash
# Create backup script
cat > /home/ubuntu/backup.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/home/ubuntu/backups"
mkdir -p $BACKUP_DIR

# Backup app (excluding node_modules)
tar --exclude='node_modules' -czf $BACKUP_DIR/app_$DATE.tar.gz /var/www/vip-pharmacy-crm

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

## 13. Troubleshooting

### 13.1 Application Won't Start
```bash
# Check PM2 logs
pm2 logs --lines 50

# Test manually
cd /var/www/vip-pharmacy-crm/backend
node server.js

# Check environment variables
cat .env
```

### 13.2 502 Bad Gateway
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

### 13.3 S3 Upload Errors
```bash
# Test AWS credentials
aws configure list

# Test S3 access
aws s3 ls s3://vip-pharmacy-crm-bucket/

# Check bucket CORS
aws s3api get-bucket-cors --bucket vip-pharmacy-crm-bucket
```

### 13.4 Database Connection Issues
```bash
# Test MongoDB connection
cd /var/www/vip-pharmacy-crm/backend
node -e "
require('dotenv').config();
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI)
  .then(() => { console.log('Connected!'); process.exit(0); })
  .catch(err => { console.error('Error:', err.message); process.exit(1); });
"
```

### 13.5 SSL Issues
```bash
# Check certificate
sudo certbot certificates

# Force renewal
sudo certbot renew --force-renewal

# Check Nginx SSL config
sudo nginx -t
```

### 13.6 Permission Issues
```bash
# Fix ownership
sudo chown -R ubuntu:ubuntu /var/www/vip-pharmacy-crm

# Fix permissions
chmod -R 755 /var/www/vip-pharmacy-crm
chmod 600 /var/www/vip-pharmacy-crm/backend/.env
```

---

## Deployment Checklist

### AWS Setup
- [ ] AWS account created
- [ ] IAM user with S3 access created
- [ ] Access keys saved securely

### S3 Setup
- [ ] S3 bucket created
- [ ] CORS configured
- [ ] Folder structure created (optional)

### Lightsail Setup
- [ ] Instance created (Ubuntu 22.04)
- [ ] Static IP attached
- [ ] Firewall rules configured (22, 80, 443)

### Database Setup
- [ ] MongoDB Atlas cluster created
- [ ] Database user created
- [ ] Network access configured (Lightsail IP)
- [ ] Connection string saved

### Server Setup
- [ ] Node.js 18 installed
- [ ] Nginx installed
- [ ] PM2 installed
- [ ] Git installed
- [ ] Certbot installed

### Application Setup
- [ ] Repository cloned
- [ ] Backend dependencies installed
- [ ] Frontend built
- [ ] Environment variables configured
- [ ] PM2 ecosystem file created
- [ ] Application started with PM2

### Nginx & SSL
- [ ] Nginx site configured
- [ ] SSL certificate obtained
- [ ] Auto-renewal verified

### Final Verification
- [ ] Application accessible via HTTPS
- [ ] API endpoints working
- [ ] Image uploads working
- [ ] Authentication working
- [ ] PM2 starts on boot

---

## Cost Estimation (Monthly)

| Service | Tier | Cost |
|---------|------|------|
| Lightsail | 2GB Instance | $10 |
| MongoDB Atlas | M0 (Free) | $0 |
| S3 | ~5GB storage | ~$0.12 |
| Data Transfer | Included in Lightsail | $0 |
| **Total** | | **~$10/month** |

For higher usage, consider:
- Lightsail $20 plan (4GB RAM)
- MongoDB Atlas M2 ($9/month)
- S3 with CloudFront CDN
