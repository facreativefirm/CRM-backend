/**
 * Generate Encryption Key
 * 
 * This script generates a secure 256-bit encryption key for AES-256-GCM
 * Run this ONCE during initial setup
 * 
 * Usage: npm run generate-key
 */

import crypto from 'crypto';

console.log('\n🔑 Encryption Key Generator\n');
console.log('='.repeat(60));

// Generate a secure 256-bit (32 bytes) key
const key = crypto.randomBytes(32).toString('hex');

console.log('\n✅ Generated new encryption key:\n');
console.log(`   ${key}\n`);
console.log('='.repeat(60));
console.log('\n📝 Instructions:\n');
console.log('1. Copy the key above');
console.log('2. Add it to your .env file as:');
console.log(`   ENCRYPTION_KEY=${key}`);
console.log('\n3. IMPORTANT: Keep this key secure!');
console.log('   - Never commit it to version control');
console.log('   - Store it in a secure password manager');
console.log('   - Backup it securely (you\'ll need it to decrypt data)');
console.log('\n4. After adding to .env, run:');
console.log('   npm run encrypt-credentials');
console.log('\n⚠️  WARNING: If you lose this key, you cannot decrypt your credentials!\n');
