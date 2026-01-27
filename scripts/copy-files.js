/**
 * Copy Files Script
 * Copies necessary files to the dist directory for production deployment
 */

const fs = require('fs');
const path = require('path');

console.log('📋 Copying necessary files to dist...');

// Create dist directory if it doesn't exist
const distDir = path.join(__dirname, '..', 'dist');
if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
}

// Files and directories to copy
const filesToCopy = [
    {
        src: '.env.example',
        dest: 'dist/.env.example',
        optional: false
    },
    {
        src: 'app.js',
        dest: 'app.js',
        optional: true  // Created by create-production-package script
    }
];

const dirsToCopy = [
    {
        src: 'prisma',
        dest: 'dist/prisma',
        optional: false,
        filter: (file) => file.endsWith('.prisma') || file.endsWith('.sql')
    },
    {
        src: 'src/assets',
        dest: 'dist/assets',
        optional: true
    }
];

// Helper function to copy file
function copyFile(src, dest, optional = false) {
    const srcPath = path.join(__dirname, '..', src);
    const destPath = path.join(__dirname, '..', dest);

    if (!fs.existsSync(srcPath)) {
        if (!optional) {
            console.log(`⚠️  Source file not found: ${src}`);
        }
        return false;
    }

    // Create destination directory if needed
    const destDir = path.dirname(destPath);
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }

    fs.copyFileSync(srcPath, destPath);
    console.log(`✅ Copied: ${src} → ${dest}`);
    return true;
}

// Helper function to copy directory recursively
function copyDirectory(src, dest, optional = false, filter = null) {
    const srcPath = path.join(__dirname, '..', src);
    const destPath = path.join(__dirname, '..', dest);

    if (!fs.existsSync(srcPath)) {
        if (!optional) {
            console.log(`⚠️  Source directory not found: ${src}`);
        }
        return false;
    }

    // Create destination directory
    if (!fs.existsSync(destPath)) {
        fs.mkdirSync(destPath, { recursive: true });
    }

    // Read directory contents
    const items = fs.readdirSync(srcPath);

    items.forEach(item => {
        const srcItem = path.join(srcPath, item);
        const destItem = path.join(destPath, item);
        const stat = fs.statSync(srcItem);

        if (stat.isDirectory()) {
            // Skip node_modules and other unnecessary directories
            if (item === 'node_modules' || item === '.git' || item === 'migrations') {
                return;
            }
            copyDirectory(path.join(src, item), path.join(dest, item), optional, filter);
        } else {
            // Apply filter if provided
            if (filter && !filter(item)) {
                return;
            }
            fs.copyFileSync(srcItem, destItem);
        }
    });

    console.log(`✅ Copied directory: ${src} → ${dest}`);
    return true;
}

// Copy individual files
console.log('\n📄 Copying individual files...');
filesToCopy.forEach(({ src, dest, optional }) => {
    const success = copyFile(src, dest, optional);
    if (!success && !optional) {
        console.error(`❌ Failed to copy required file: ${src}`);
        process.exit(1);
    }
});

// Copy directories
console.log('\n📁 Copying directories...');
dirsToCopy.forEach(({ src, dest, optional, filter }) => {
    const success = copyDirectory(src, dest, optional, filter);
    if (!success && !optional) {
        console.error(`❌ Failed to copy required directory: ${src}`);
        process.exit(1);
    }
});

// Create logs directory in dist
const logsDir = path.join(distDir, 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
    console.log('✅ Created logs directory');
}

// Create .gitkeep in logs directory
fs.writeFileSync(path.join(logsDir, '.gitkeep'), '');

console.log('\n✅ All files copied successfully!\n');
