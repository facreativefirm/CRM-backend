@echo off
REM Production Build Script for cPanel Deployment (Windows)
REM This script prepares the backend for production deployment

echo ========================================
echo 🚀 Starting Production Build Process...
echo ========================================
echo.

REM Step 1: Clean previous builds
echo 📦 Cleaning previous builds...
if exist dist rmdir /s /q dist
if exist node_modules\.cache rmdir /s /q node_modules\.cache

REM Step 2: Install production dependencies
echo 📥 Installing dependencies...
call npm ci --production=false

REM Step 3: Generate Prisma Client
echo 🔧 Generating Prisma Client...
call npx prisma generate

REM Step 4: Build TypeScript
echo 🏗️  Compiling TypeScript...
call npm run build

REM Step 5: Copy necessary files to dist
echo 📋 Copying necessary files...

REM Copy .env.example as reference
copy .env.example dist\.env.example

REM Copy Prisma schema
if not exist dist\prisma mkdir dist\prisma
copy prisma\schema.prisma dist\prisma\

REM Copy any static assets if they exist
if exist src\assets xcopy /E /I /Y src\assets dist\assets

REM Step 6: Create production package.json in dist
echo 📝 Creating production package.json...
(
echo {
echo   "name": "whmcs-backend-production",
echo   "version": "1.0.0",
echo   "main": "server.js",
echo   "scripts": {
echo     "start": "node server.js",
echo     "prisma:generate": "prisma generate"
echo   },
echo   "dependencies": {
echo     "@prisma/client": "6.2.1",
echo     "@react-pdf/renderer": "^4.3.2",
echo     "@scalar/express-api-reference": "^0.8.30",
echo     "axios": "^1.13.2",
echo     "bcryptjs": "^3.0.3",
echo     "cors": "^2.8.5",
echo     "dotenv": "^17.2.3",
echo     "express": "^5.2.1",
echo     "express-rate-limit": "^8.2.1",
echo     "helmet": "^8.1.0",
echo     "jsonwebtoken": "^9.0.3",
echo     "node-cron": "^4.2.1",
echo     "nodemailer": "^7.0.12",
echo     "prisma": "6.2.1",
echo     "react": "^19.2.3",
echo     "react-dom": "^19.2.3",
echo     "winston": "^3.19.0",
echo     "zod": "^4.2.1"
echo   }
echo }
) > dist\package.json

REM Step 7: Create deployment instructions
echo 📄 Creating deployment documentation...
(
echo # cPanel Deployment Instructions
echo.
echo ## Prerequisites
echo - Node.js 18+ installed on cPanel
echo - MySQL database created
echo - SSH access to cPanel
echo.
echo ## Deployment Steps
echo.
echo ### 1. Upload Files
echo Upload the entire `dist` folder contents to your cPanel directory
echo.
echo ### 2. Install Dependencies
echo ```bash
echo cd /home/username/backend
echo npm install --production
echo ```
echo.
echo ### 3. Configure Environment
echo ```bash
echo cp .env.example .env
echo nano .env
echo ```
echo.
echo Update these variables:
echo - DATABASE_URL
echo - JWT_SECRET
echo - ALLOWED_ORIGINS
echo - PORT
echo.
echo ### 4. Generate Prisma Client
echo ```bash
echo npx prisma generate
echo ```
echo.
echo ### 5. Run Database Migrations
echo ```bash
echo npx prisma migrate deploy
echo ```
echo.
echo ### 6. Start Application
echo ```bash
echo node server.js
echo ```
echo.
echo Or use PM2:
echo ```bash
echo npm install -g pm2
echo pm2 start server.js --name whmcs-backend
echo pm2 save
echo ```
echo.
echo ### 7. Verify
echo Visit: https://your-domain.com/health
echo.
echo ## Troubleshooting
echo.
echo - Database connection: Verify DATABASE_URL
echo - Port issues: Change PORT in .env
echo - Prisma errors: Run `npx prisma generate`
echo - Permissions: `chmod -R 755 /home/username/backend`
echo.
echo ## Support
echo Check logs directory for errors.
) > dist\DEPLOYMENT.md

REM Step 8: Create .htaccess
(
echo # Protect .env file
echo ^<Files ".env"^>
echo     Order allow,deny
echo     Deny from all
echo ^</Files^>
echo.
echo # Protect sensitive files
echo ^<FilesMatch "^\."^>
echo     Order allow,deny
echo     Deny from all
echo ^</FilesMatch^>
) > dist\.htaccess

REM Step 9: Create README
(
echo # WHMCS Backend - Production Build
echo.
echo ## Quick Start
echo.
echo 1. Install: `npm install --production`
echo 2. Configure: `cp .env.example .env` and edit
echo 3. Generate Prisma: `npx prisma generate`
echo 4. Start: `npm start`
echo.
echo ## Environment Variables
echo.
echo - DATABASE_URL
echo - JWT_SECRET
echo - PORT
echo - NODE_ENV=production
echo - ALLOWED_ORIGINS
echo.
echo ## Health Check
echo.
echo ```
echo curl https://your-domain.com/health
echo ```
echo.
echo See DEPLOYMENT.md for full instructions.
) > dist\README.md

REM Step 10: Create production zip file
echo.
echo 📦 Creating production zip file...

REM Check if PowerShell is available for compression
where powershell >nul 2>&1
if %errorlevel% equ 0 (
    echo Using PowerShell to create zip...
    powershell -Command "Compress-Archive -Path 'dist\*', 'app.js', '.htaccess', 'DEPLOYMENT.md' -DestinationPath 'whmcs-backend-production.zip' -Force"
    echo ✅ Created: whmcs-backend-production.zip
) else (
    echo ⚠️  PowerShell not found. Please manually zip the dist folder, app.js, .htaccess, and DEPLOYMENT.md
)

echo.
echo ========================================
echo ✅ Build Complete!
echo ========================================
echo 📦 Production files are in: .\dist
echo 📦 Production package: .\whmcs-backend-production.zip
echo.
echo Next Steps:
echo 1. Upload whmcs-backend-production.zip to cPanel
echo 2. Extract in your subdomain directory
echo 3. Follow DEPLOYMENT.md instructions
echo.
echo 🎉 Ready for production deployment!
echo.
pause
