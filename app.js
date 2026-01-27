/**
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
console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║          🚀 WHMCS Backend Server Starting...              ║
║                                                            ║
║  Environment: ${process.env.NODE_ENV || 'production'}                                    ║
║  Port: ${process.env.PORT || '5000'}                                              ║
║  Subdomain: whmch.facreativefirm.com                      ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
`);
