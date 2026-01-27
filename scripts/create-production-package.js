/**
 * Create Production Package Script
 * Creates a production-ready package.json in the dist directory
 */

const fs = require('fs');
const path = require('path');

console.log('📝 Creating production package.json...');

const distDir = path.join(__dirname, '..', 'dist');

// Production package.json
const productionPackage = {
    name: "whmcs-backend-production",
    version: "1.0.0",
    description: "WHMCS Backend - Production Build",
    main: "server.js",
    scripts: {
        start: "node server.js",
        "prisma:generate": "prisma generate",
        "prisma:migrate": "prisma migrate deploy",
        postinstall: "prisma generate"
    },
    engines: {
        node: ">=18.0.0",
        npm: ">=9.0.0"
    },
    dependencies: {
        "@prisma/client": "6.2.1",
        "@react-pdf/renderer": "^4.3.2",
        "@scalar/express-api-reference": "^0.8.30",
        "axios": "^1.13.2",
        "bcryptjs": "^3.0.3",
        "cors": "^2.8.5",
        "dotenv": "^17.2.3",
        "express": "^5.2.1",
        "express-rate-limit": "^8.2.1",
        "helmet": "^8.1.0",
        "jsonwebtoken": "^9.0.3",
        "node-cron": "^4.2.1",
        "nodemailer": "^7.0.12",
        "prisma": "6.2.1",
        "react": "^19.2.3",
        "react-dom": "^19.2.3",
        "winston": "^3.19.0",
        "zod": "^4.2.1"
    }
};

// Write production package.json
const packagePath = path.join(distDir, 'package.json');
fs.writeFileSync(packagePath, JSON.stringify(productionPackage, null, 2));
console.log('✅ Created production package.json');

// Create README.md
const readme = `# WHMCS Backend - Production Build

This is the production-ready build of the WHMCS backend application.

## Quick Start

### 1. Install Dependencies
\`\`\`bash
npm install --production
\`\`\`

### 2. Configure Environment
\`\`\`bash
cp .env.example .env
nano .env  # or use your preferred editor
\`\`\`

Required environment variables:
- \`DATABASE_URL\` - MySQL connection string
- \`JWT_SECRET\` - Secret key for JWT tokens (generate a strong random string)
- \`PORT\` - Server port (default: 5000)
- \`NODE_ENV\` - Set to "production"
- \`ALLOWED_ORIGINS\` - Frontend URLs (comma-separated)

### 3. Generate Prisma Client
\`\`\`bash
npx prisma generate
\`\`\`

### 4. Run Database Migrations (First time only)
\`\`\`bash
npx prisma migrate deploy
\`\`\`

### 5. Start the Server
\`\`\`bash
npm start
\`\`\`

Or with PM2 (recommended for production):
\`\`\`bash
npm install -g pm2
pm2 start server.js --name whmcs-backend
pm2 save
pm2 startup
\`\`\`

## Health Check

After starting the server, verify it's running:
\`\`\`bash
curl http://localhost:5000/health
\`\`\`

Expected response:
\`\`\`json
{
  "status": "ok",
  "timestamp": "2026-01-20T...",
  "version": "1.0.0"
}
\`\`\`

## Files Included

- \`server.js\` - Main application entry point
- \`package.json\` - Production dependencies
- \`.env.example\` - Environment variables template
- \`prisma/\` - Database schema
- All compiled JavaScript files from TypeScript source

## Deployment

See \`DEPLOYMENT.md\` for detailed cPanel deployment instructions.

## Troubleshooting

### Database Connection Error
- Verify \`DATABASE_URL\` is correct
- Ensure MySQL database exists
- Check MySQL user has proper permissions

### Port Already in Use
- Change \`PORT\` in .env file
- Or stop the conflicting process

### Prisma Client Not Found
Run: \`npx prisma generate\`

### Permission Denied
\`\`\`bash
chmod +x server.js
chmod -R 755 .
\`\`\`

## Monitoring

### Using PM2
\`\`\`bash
pm2 logs whmcs-backend
pm2 status
pm2 monit
pm2 restart whmcs-backend
\`\`\`

### Check Application Logs
\`\`\`bash
tail -f logs/combined.log
tail -f logs/error.log
\`\`\`

## Security

- ✅ Environment variables are properly configured
- ✅ JWT secret is strong and unique
- ✅ Database credentials are secure
- ✅ CORS is configured for allowed origins only
- ✅ Rate limiting is enabled
- ✅ Helmet security headers are active
- ✅ .env file is protected (not publicly accessible)

## Support

For issues or questions, check the logs directory or refer to the main documentation.

---

**Version:** 1.0.0  
**Node.js:** >=18.0.0  
**License:** Proprietary
`;

const readmePath = path.join(distDir, 'README.md');
fs.writeFileSync(readmePath, readme);
console.log('✅ Created README.md');

// Create DEPLOYMENT.md
const deployment = `# cPanel Deployment Guide

Complete guide for deploying the WHMCS backend to cPanel.

## Prerequisites

- ✅ cPanel account with SSH access
- ✅ Node.js 18+ installed on cPanel
- ✅ MySQL database created
- ✅ Domain or subdomain configured

## Step-by-Step Deployment

### Step 1: Prepare cPanel

1. **Create MySQL Database**
   - Go to cPanel → MySQL Databases
   - Create a new database (e.g., \`username_whmcs\`)
   - Create a database user
   - Grant ALL PRIVILEGES to the user
   - Note down: database name, username, password

2. **Note Server Details**
   - Database host (usually \`localhost\`)
   - Your cPanel username
   - SSH port (usually 22)

### Step 2: Upload Files

#### Option A: Using File Manager
1. Go to cPanel → File Manager
2. Navigate to your desired directory (e.g., \`/home/username/backend\`)
3. Upload the entire \`dist\` folder contents
4. Extract if uploaded as ZIP

#### Option B: Using FTP
1. Connect via FTP client (FileZilla, etc.)
2. Upload all files from \`dist\` folder
3. Ensure all files are transferred

#### Option C: Using SSH (Recommended)
\`\`\`bash
# On your local machine, create a zip
cd dist
zip -r whmcs-backend.zip .

# Upload via SCP
scp whmcs-backend.zip username@your-domain.com:/home/username/

# SSH into server
ssh username@your-domain.com

# Extract
cd /home/username
mkdir backend
cd backend
unzip ../whmcs-backend.zip
rm ../whmcs-backend.zip
\`\`\`

### Step 3: Install Dependencies

SSH into your cPanel server:

\`\`\`bash
cd /home/username/backend
npm install --production
\`\`\`

If you encounter memory issues:
\`\`\`bash
npm install --production --max-old-space-size=512
\`\`\`

### Step 4: Configure Environment

\`\`\`bash
cp .env.example .env
nano .env
\`\`\`

Update these variables:

\`\`\`env
# Server Configuration
PORT=5000
NODE_ENV=production

# Database (Update with your details)
DATABASE_URL="mysql://username_dbuser:password@localhost:3306/username_whmcs"

# Security (Generate a strong random string)
JWT_SECRET="your-super-secret-jwt-key-here-make-it-long-and-random"
JWT_EXPIRES_IN="7d"

# CORS (Your frontend URL)
ALLOWED_ORIGINS="https://your-frontend-domain.com,https://www.your-frontend-domain.com"

# Email Configuration
SMTP_HOST="mail.your-domain.com"
SMTP_PORT=587
SMTP_USER="noreply@your-domain.com"
SMTP_PASS="your-email-password"
SMTP_FROM="noreply@your-domain.com"
\`\`\`

**Generate JWT Secret:**
\`\`\`bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
\`\`\`

### Step 5: Generate Prisma Client

\`\`\`bash
npx prisma generate
\`\`\`

### Step 6: Run Database Migrations

**First time deployment:**
\`\`\`bash
npx prisma migrate deploy
\`\`\`

**Or if you have a database dump:**
\`\`\`bash
mysql -u username_dbuser -p username_whmcs < database-dump.sql
\`\`\`

### Step 7: Test the Application

\`\`\`bash
node server.js
\`\`\`

If it starts successfully, press \`Ctrl+C\` to stop it.

### Step 8: Setup Process Manager

#### Option A: Using PM2 (Recommended)

\`\`\`bash
# Install PM2 globally
npm install -g pm2

# Start the application
pm2 start server.js --name whmcs-backend

# Save PM2 configuration
pm2 save

# Setup PM2 to start on system boot
pm2 startup

# Check status
pm2 status
pm2 logs whmcs-backend
\`\`\`

#### Option B: Using cPanel Node.js App Manager

1. Go to cPanel → Setup Node.js App
2. Click "Create Application"
3. Configure:
   - **Node.js version:** 18.x or higher
   - **Application mode:** Production
   - **Application root:** /home/username/backend
   - **Application URL:** your-domain.com or api.your-domain.com
   - **Application startup file:** server.js
   - **Environment variables:** Add your .env variables
4. Click "Create"
5. Click "Start App"

#### Option C: Using systemd (Advanced)

Create a service file:
\`\`\`bash
sudo nano /etc/systemd/system/whmcs-backend.service
\`\`\`

Add:
\`\`\`ini
[Unit]
Description=WHMCS Backend
After=network.target

[Service]
Type=simple
User=username
WorkingDirectory=/home/username/backend
ExecStart=/usr/bin/node server.js
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
\`\`\`

Enable and start:
\`\`\`bash
sudo systemctl enable whmcs-backend
sudo systemctl start whmcs-backend
sudo systemctl status whmcs-backend
\`\`\`

### Step 9: Configure Reverse Proxy (Optional)

If using Apache (most cPanel setups):

Create \`.htaccess\` in your public_html or subdomain root:

\`\`\`apache
<IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteRule ^(.*)$ http://localhost:5000/$1 [P,L]
</IfModule>

<IfModule mod_headers.c>
    Header set Access-Control-Allow-Origin "*"
</IfModule>
\`\`\`

Or use cPanel's "Proxy" feature if available.

### Step 10: Verify Deployment

\`\`\`bash
curl http://localhost:5000/health
\`\`\`

Or from your browser:
\`\`\`
https://your-domain.com/health
\`\`\`

Expected response:
\`\`\`json
{
  "status": "ok",
  "timestamp": "2026-01-20T...",
  "version": "1.0.0"
}
\`\`\`

## Post-Deployment

### Security Checklist

- [ ] .env file is not publicly accessible
- [ ] JWT_SECRET is strong and unique
- [ ] Database credentials are secure
- [ ] CORS is configured for your frontend only
- [ ] SSL certificate is installed (HTTPS)
- [ ] Firewall rules are configured
- [ ] Rate limiting is enabled
- [ ] File permissions are correct (\`chmod 755\` for directories, \`644\` for files)

### Monitoring

**PM2 Monitoring:**
\`\`\`bash
pm2 monit
pm2 logs whmcs-backend --lines 100
\`\`\`

**Check Logs:**
\`\`\`bash
tail -f logs/combined.log
tail -f logs/error.log
\`\`\`

**Resource Usage:**
\`\`\`bash
pm2 status
top
\`\`\`

### Backup Strategy

1. **Database Backups:**
   \`\`\`bash
   # Daily backup
   mysqldump -u username_dbuser -p username_whmcs > backup-$(date +%Y%m%d).sql
   \`\`\`

2. **Application Backups:**
   \`\`\`bash
   tar -czf backend-backup-$(date +%Y%m%d).tar.gz /home/username/backend
   \`\`\`

3. **Automated Backups:**
   - Use cPanel's backup feature
   - Or setup a cron job for automated backups

## Updating the Application

1. **Backup Current Version:**
   \`\`\`bash
   cp -r /home/username/backend /home/username/backend-backup-$(date +%Y%m%d)
   \`\`\`

2. **Upload New Files:**
   - Upload new dist files
   - Don't overwrite .env file

3. **Install Dependencies:**
   \`\`\`bash
   npm install --production
   \`\`\`

4. **Run Migrations (if schema changed):**
   \`\`\`bash
   npx prisma generate
   npx prisma migrate deploy
   \`\`\`

5. **Restart Application:**
   \`\`\`bash
   pm2 restart whmcs-backend
   \`\`\`

## Troubleshooting

### Application Won't Start

**Check logs:**
\`\`\`bash
pm2 logs whmcs-backend --err
cat logs/error.log
\`\`\`

**Common issues:**
- Database connection: Verify DATABASE_URL
- Port in use: Change PORT in .env
- Missing dependencies: Run \`npm install --production\`
- Prisma client: Run \`npx prisma generate\`

### Database Connection Errors

\`\`\`bash
# Test database connection
mysql -u username_dbuser -p -h localhost username_whmcs

# Check DATABASE_URL format
# mysql://USER:PASSWORD@HOST:PORT/DATABASE
\`\`\`

### Permission Errors

\`\`\`bash
# Fix permissions
chmod -R 755 /home/username/backend
chmod 644 /home/username/backend/.env
chown -R username:username /home/username/backend
\`\`\`

### High Memory Usage

\`\`\`bash
# Restart PM2
pm2 restart whmcs-backend

# Or increase memory limit
pm2 start server.js --name whmcs-backend --max-memory-restart 500M
\`\`\`

### SSL/HTTPS Issues

- Ensure SSL certificate is installed in cPanel
- Update ALLOWED_ORIGINS to use https://
- Check reverse proxy configuration

## Performance Optimization

### Enable Gzip Compression

Add to .htaccess:
\`\`\`apache
<IfModule mod_deflate.c>
    AddOutputFilterByType DEFLATE text/plain
    AddOutputFilterByType DEFLATE text/html
    AddOutputFilterByType DEFLATE application/json
</IfModule>
\`\`\`

### Enable Caching

Add to .htaccess:
\`\`\`apache
<IfModule mod_expires.c>
    ExpiresActive On
    ExpiresByType application/json "access plus 1 hour"
</IfModule>
\`\`\`

### Database Optimization

\`\`\`bash
# Run in MySQL
OPTIMIZE TABLE table_name;
ANALYZE TABLE table_name;
\`\`\`

## Support

For issues or questions:
1. Check logs: \`logs/error.log\`
2. Review cPanel error logs
3. Check PM2 logs: \`pm2 logs\`
4. Verify environment variables
5. Test database connection

---

**Deployment Date:** ${new Date().toISOString().split('T')[0]}  
**Version:** 1.0.0
`;

const deploymentPath = path.join(distDir, 'DEPLOYMENT.md');
fs.writeFileSync(deploymentPath, deployment);
console.log('✅ Created DEPLOYMENT.md');

// Create .htaccess for Apache/cPanel
const htaccess = `# Protect sensitive files
<Files ".env">
    Order allow,deny
    Deny from all
</Files>

<FilesMatch "^\\.">
    Order allow,deny
    Deny from all
</FilesMatch>

# Prevent directory listing
Options -Indexes

# Enable CORS (if needed)
<IfModule mod_headers.c>
    Header set Access-Control-Allow-Origin "*"
    Header set Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS"
    Header set Access-Control-Allow-Headers "Content-Type, Authorization"
</IfModule>

# Gzip compression
<IfModule mod_deflate.c>
    AddOutputFilterByType DEFLATE text/plain
    AddOutputFilterByType DEFLATE text/html
    AddOutputFilterByType DEFLATE application/json
    AddOutputFilterByType DEFLATE text/css
    AddOutputFilterByType DEFLATE application/javascript
</IfModule>
`;

const htaccessPath = path.join(distDir, '.htaccess');
fs.writeFileSync(htaccessPath, htaccess);
console.log('✅ Created .htaccess');

// Create app.js for cPanel/Passenger
const appJs = `/**
 * Production Startup File for cPanel/Passenger
 * 
 * This file is the entry point for cPanel's Phusion Passenger.
 * It loads the compiled server from dist/server.js
 */

// Load environment variables from .env file
require('dotenv').config();

// Ensure we're in production mode
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

// Import the compiled server
const app = require('./dist/server.js').default;

// Export the app for Passenger to use
module.exports = app;

// Log startup
console.log(\`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║          🚀 WHMCS Backend Server Starting...              ║
║                                                            ║
║  Environment: \${process.env.NODE_ENV || 'production'}                                    ║
║  Port: \${process.env.PORT || '5000'}                                              ║
║  Subdomain: whmch.facreativefirm.com                      ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
\`);
`;

const appJsPath = path.join(__dirname, '..', 'app.js');
fs.writeFileSync(appJsPath, appJs);
console.log('✅ Created app.js');

console.log('\n✅ Production package created successfully!\n');
