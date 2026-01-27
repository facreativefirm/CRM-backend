#!/bin/bash

# Production Build Script for cPanel Deployment
# This script prepares the backend for production deployment

echo "🚀 Starting Production Build Process..."
echo "========================================"

# Step 1: Clean previous builds
echo "📦 Cleaning previous builds..."
rm -rf dist
rm -rf node_modules/.cache

# Step 2: Install production dependencies
echo "📥 Installing dependencies..."
npm ci --production=false

# Step 3: Generate Prisma Client
echo "🔧 Generating Prisma Client..."
npx prisma generate

# Step 4: Build TypeScript
echo "🏗️  Compiling TypeScript..."
npm run build

# Step 5: Copy necessary files to dist
echo "📋 Copying necessary files..."

# Copy package.json (production version)
cp package.json dist/

# Copy .env.example as reference
cp .env.example dist/

# Copy Prisma schema
mkdir -p dist/prisma
cp -r prisma/schema.prisma dist/prisma/

# Copy any static assets if they exist
if [ -d "src/assets" ]; then
    cp -r src/assets dist/
fi

# Step 6: Create production package.json in dist
echo "📝 Creating production package.json..."
cat > dist/package.json << 'EOF'
{
  "name": "whmcs-backend-production",
  "version": "1.0.0",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "prisma:generate": "prisma generate"
  },
  "dependencies": {
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
}
EOF

# Step 7: Create deployment instructions
cat > dist/DEPLOYMENT.md << 'EOF'
# cPanel Deployment Instructions

## Prerequisites
- Node.js 18+ installed on cPanel
- MySQL database created
- SSH access to cPanel

## Deployment Steps

### 1. Upload Files
Upload the entire `dist` folder contents to your cPanel directory (e.g., `/home/username/backend`)

### 2. Install Dependencies
```bash
cd /home/username/backend
npm install --production
```

### 3. Configure Environment
```bash
cp .env.example .env
nano .env
```

Update the following variables:
- `DATABASE_URL` - Your MySQL connection string
- `JWT_SECRET` - Generate a secure random string
- `ALLOWED_ORIGINS` - Your frontend URL
- `PORT` - Usually 5000 or as assigned by cPanel

### 4. Generate Prisma Client
```bash
npx prisma generate
```

### 5. Run Database Migrations (First time only)
```bash
npx prisma migrate deploy
```

### 6. Start the Application

#### Option A: Using Node.js directly
```bash
node server.js
```

#### Option B: Using PM2 (Recommended)
```bash
npm install -g pm2
pm2 start server.js --name whmcs-backend
pm2 save
pm2 startup
```

#### Option C: Using cPanel Node.js App Manager
1. Go to cPanel → Setup Node.js App
2. Select Node.js version (18+)
3. Set Application Root: /home/username/backend
4. Set Application URL: your-domain.com or subdomain
5. Set Application Startup File: server.js
6. Click "Create"

### 7. Verify Deployment
Visit: `https://your-domain.com/health`

You should see:
```json
{
  "status": "ok",
  "timestamp": "2026-01-20T...",
  "version": "1.0.0"
}
```

## Troubleshooting

### Database Connection Issues
- Verify DATABASE_URL is correct
- Check MySQL user has proper permissions
- Ensure database exists

### Port Already in Use
- Change PORT in .env file
- Or stop the conflicting process

### Prisma Client Not Found
Run: `npx prisma generate`

### Permission Denied
```bash
chmod +x server.js
chmod -R 755 /home/username/backend
```

## Updating the Application

1. Upload new dist files
2. Run: `npm install --production`
3. Run: `npx prisma generate`
4. Run: `npx prisma migrate deploy` (if schema changed)
5. Restart: `pm2 restart whmcs-backend` or restart via cPanel

## Monitoring

### Using PM2
```bash
pm2 logs whmcs-backend
pm2 status
pm2 monit
```

### Check Logs
```bash
tail -f logs/combined.log
tail -f logs/error.log
```

## Security Checklist
- ✅ .env file is not publicly accessible
- ✅ JWT_SECRET is strong and unique
- ✅ Database credentials are secure
- ✅ CORS is properly configured
- ✅ Rate limiting is enabled
- ✅ Helmet security headers are active

## Support
For issues, check the logs directory or contact support.
EOF

# Step 8: Create .htaccess for cPanel (if using Apache)
cat > dist/.htaccess << 'EOF'
# Protect .env file
<Files ".env">
    Order allow,deny
    Deny from all
</Files>

# Protect sensitive files
<FilesMatch "^\.">
    Order allow,deny
    Deny from all
</FilesMatch>

# Enable CORS (if needed)
<IfModule mod_headers.c>
    Header set Access-Control-Allow-Origin "*"
    Header set Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS"
    Header set Access-Control-Allow-Headers "Content-Type, Authorization"
</IfModule>
EOF

# Step 9: Create startup script for cPanel
cat > dist/start.sh << 'EOF'
#!/bin/bash
# Startup script for cPanel

# Load environment variables
export $(cat .env | xargs)

# Start the application
node server.js
EOF

chmod +x dist/start.sh

# Step 10: Create README for production
cat > dist/README.md << 'EOF'
# WHMCS Backend - Production Build

This is the production-ready build of the WHMCS backend.

## Quick Start

1. Install dependencies: `npm install --production`
2. Configure environment: `cp .env.example .env` and edit
3. Generate Prisma: `npx prisma generate`
4. Start server: `npm start` or `node server.js`

## Files Included

- `server.js` - Main application entry point
- `package.json` - Production dependencies
- `.env.example` - Environment variables template
- `prisma/` - Database schema
- All compiled JavaScript files

## Documentation

See `DEPLOYMENT.md` for detailed deployment instructions.

## Environment Variables Required

- `DATABASE_URL` - MySQL connection string
- `JWT_SECRET` - Secret for JWT tokens
- `PORT` - Server port (default: 5000)
- `NODE_ENV` - Set to "production"
- `ALLOWED_ORIGINS` - Frontend URLs (comma-separated)

## Health Check

After deployment, verify the server is running:
```
curl https://your-domain.com/health
```

## Support

For issues or questions, refer to the main documentation.
EOF

# Step 10: Create production zip file
echo ""
echo "📦 Creating production zip file..."
cd ..
if command -v zip &> /dev/null; then
    zip -r whmcs-backend-production.zip dist/* app.js .htaccess DEPLOYMENT.md
    echo "✅ Created: whmcs-backend-production.zip"
else
    echo "⚠️  zip command not found. Creating tar.gz instead..."
    tar -czf whmcs-backend-production.tar.gz dist/ app.js .htaccess DEPLOYMENT.md
    echo "✅ Created: whmcs-backend-production.tar.gz"
fi
cd backend

echo ""
echo "✅ Build Complete!"
echo "========================================"
echo "📦 Production files are in: ./dist"
echo "📦 Production package: ./whmcs-backend-production.zip (or .tar.gz)"
echo ""
echo "Next Steps:"
echo "1. Upload the production package to cPanel"
echo "2. Extract in your subdomain directory"
echo "3. Follow DEPLOYMENT.md instructions"
echo ""
echo "🎉 Ready for production deployment!"
