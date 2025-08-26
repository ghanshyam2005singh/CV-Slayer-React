const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const { connectDB, getConnectionStatus } = require('./config/database');

const app = express();
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'production';

app.use('/api', require('./routes/health'));

// Trust proxy for deployment
app.set('trust proxy', 1);

// Basic security
app.use(helmet({
  contentSecurityPolicy: false, // Disable for simplicity
  hsts: false // Disable for simplicity
}));

// Simple rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Simple limit
  message: { success: false, error: 'Too many requests' }
});

app.use(limiter);

// Compression
app.use(compression());

// Simple CORS
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'https://cv-slayer-ppnn.onrender.com',
  'http://localhost:3000'
].filter(Boolean);

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));

// Body parsing
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Simple request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// Import and mount routes
try {
  const resumeRoutes = require('./routes/resume');
  app.use('/api/resume', resumeRoutes);
  console.log('✅ Resume routes loaded');
} catch (error) {
  console.error('❌ Failed to load resume routes:', error.message);
  process.exit(1);
}

try {
  const adminRoutes = require('./routes/admin');
  app.use('/api/admin', adminRoutes);
  console.log('✅ Admin routes loaded');
} catch (error) {
  console.error('⚠️ Admin routes not loaded:', error.message);
}

// Health check
app.get('/api/health', (req, res) => {
  const dbStatus = getConnectionStatus();
  res.json({
    success: true,
    status: 'OK',
    timestamp: new Date().toISOString(),
    database: { status: dbStatus.connected ? 'connected' : 'disconnected' }
  });
});

// Simple error handling
app.use((error, req, res, next) => {
  console.error('❌ Error:', error.message);
  
  res.status(error.status || 500).json({
    success: false,
    error: {
      message: NODE_ENV === 'production' ? 'Internal server error' : error.message,
      timestamp: new Date().toISOString()
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: { message: 'Endpoint not found' }
  });
});

// Start server
async function startServer() {
  try {
    await connectDB();
    console.log('✅ Database connected');
    
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 CV Slayer API Server running on port ${PORT}`);
      console.log(`📅 Started at: ${new Date().toISOString()}`);
      console.log(`🌍 Environment: ${NODE_ENV}`);
    });

    return server;

  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

startServer();

module.exports = app;