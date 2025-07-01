const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config();

const { connectDB, getConnectionStatus } = require('./config/database');

const app = express();
const PORT = process.env.PORT || 5000;

// Simple CORS - allow everything
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

// Basic body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Simple request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Import routes
let resumeRoutes, adminRoutes;

try {
  resumeRoutes = require('./routes/resume');
  console.log('✅ Resume routes loaded');
} catch (error) {
  console.warn('⚠️ Resume routes not found:', error.message);
}

try {
  adminRoutes = require('./routes/admin');
  console.log('✅ Admin routes loaded');
} catch (error) {
  console.warn('⚠️ Admin routes not found:', error.message);
}

// Routes
if (resumeRoutes) {
  app.use('/api/resume', resumeRoutes);
}
if (adminRoutes) {
  app.use('/api/admin', adminRoutes);
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  const dbStatus = getConnectionStatus();
  res.json({
    success: true,
    status: 'OK',
    message: 'CV Slayer API is running',
    database: dbStatus.connected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: 'Server is working!',
    timestamp: new Date().toISOString()
  });
});

// Debug admin credentials endpoint
app.get('/api/admin/debug', (req, res) => {
  res.json({
    hasAdminEmail: !!process.env.ADMIN_EMAILS,
    hasAdminPassword: !!process.env.ADMIN_PASSWORD,
    adminEmails: process.env.ADMIN_EMAILS || 'Not set',
    jwtSecret: process.env.JWT_SECRET ? 'Set' : 'Not set',
    dbStatus: getConnectionStatus()
  });
});

// Simple error handling
app.use((error, req, res, next) => {
  console.error('🚨 Server error:', error.message);
  res.status(500).json({
    success: false,
    error: {
      message: error.message
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: { 
      message: 'Route not found', 
      path: req.originalUrl
    }
  });
});

// Start server
async function startServer() {
  try {
    // Connect to database
    await connectDB();
    console.log('✅ Database connected successfully');
    
    // Start server
    const server = app.listen(PORT, () => {
      console.log('\n🎉 CV Slayer API Server Started!');
      console.log('==========================================');
      console.log('🚀 Server running on port:', PORT);
      console.log('📱 Health check: http://localhost:' + PORT + '/api/health');
      console.log('🧪 Test endpoint: http://localhost:' + PORT + '/api/test');
      console.log('🔐 Admin login: http://localhost:' + PORT + '/api/admin/login');
      console.log('🔧 Admin debug: http://localhost:' + PORT + '/api/admin/debug');
      console.log('==========================================\n');
    });

    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use`);
        process.exit(1);
      } else {
        console.error('❌ Server error:', error.message);
        process.exit(1);
      }
    });

  } catch (error) {
    console.error('💥 Failed to start server:', error.message);
    process.exit(1);
  }
}

startServer();

module.exports = app;