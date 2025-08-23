const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const morgan = require('morgan');
const winston = require('winston');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const { connectDB, getConnectionStatus } = require('./config/database');

const app = express();
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'production';

// Production logging setup
const logger = winston.createLogger({
  level: NODE_ENV === 'production' ? 'warn' : 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

// Only add console logging in development
if (NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: NODE_ENV === 'production' ? 100 : 1000, // Limit each IP
  message: {
    success: false,
    error: {
      message: 'Too many requests, please try again later',
      code: 'RATE_LIMIT_EXCEEDED'
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict rate limiting for resume processing
const resumeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: NODE_ENV === 'production' ? 10 : 50, // Very limited for AI processing
  message: {
    success: false,
    error: {
      message: 'Resume processing limit exceeded. Please try again in an hour.',
      code: 'RESUME_LIMIT_EXCEEDED'
    }
  }
});

app.use(limiter);
app.use('/api/resume', resumeLimiter);

// Response compression
app.use(compression());

// CORS configuration for production
const allowedOrigins = NODE_ENV === 'production' 
  ? [
      process.env.FRONTEND_URL,
      'https://cv-slayer.vercel.app',
      'https://cv-slayer-ppnn.onrender.com/'
    ].filter(Boolean)
  : ['http://localhost:3000', 'http://localhost:3001'];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With']
}));

// Body parsing with security limits
app.use(express.json({ 
  limit: '5mb',
  verify: (req, res, buf) => {
    try {
      JSON.parse(buf);
    } catch (e) {
      logger.error('Invalid JSON received', { ip: req.ip, userAgent: req.get('User-Agent') });
      throw new Error('Invalid JSON');
    }
  }
}));

app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Request logging (production-safe)
app.use(morgan('combined', {
  stream: {
    write: (message) => logger.info(message.trim())
  },
  skip: (req, res) => NODE_ENV === 'production' && res.statusCode < 400
}));

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Import routes with error handling
let resumeRoutes, adminRoutes;

try {
  resumeRoutes = require('./routes/resume');
  logger.info('Resume routes loaded successfully');
} catch (error) {
  logger.error('Failed to load resume routes', { error: error.message });
  // Exit if resume routes fail to load since they're critical
  process.exit(1);
}

try {
  adminRoutes = require('./routes/admin');
  logger.info('Admin routes loaded successfully');
} catch (error) {
  logger.error('Failed to load admin routes', { error: error.message });
  // Admin routes are less critical, so we can continue
}

// API Routes - Make sure these are properly mounted
if (resumeRoutes) {
  app.use('/api/resume', resumeRoutes);
  logger.info('Resume routes mounted at /api/resume');
} else {
  logger.error('Resume routes not available - server cannot function properly');
  process.exit(1);
}

if (adminRoutes) {
  app.use('/api/admin', adminRoutes);
  logger.info('Admin routes mounted at /api/admin');
}

// Health check endpoint (production-safe)
app.get('/api/health', (req, res) => {
  const dbStatus = getConnectionStatus();
  res.json({
    success: true,
    status: 'OK',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: NODE_ENV,
    database: {
      status: dbStatus.connected ? 'connected' : 'disconnected'
    }
  });
});

// Remove debug endpoints in production
if (NODE_ENV !== 'production') {
  app.get('/api/test', (req, res) => {
    res.json({
      success: true,
      message: 'Development server is working!',
      timestamp: new Date().toISOString()
    });
  });
}

// Production error handling
app.use((error, req, res, next) => {
  // Log error details securely
  logger.error('Application error', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  // Send safe error response
  const isDevelopment = NODE_ENV !== 'production';
  
  res.status(error.status || 500).json({
    success: false,
    error: {
      message: isDevelopment ? error.message : 'Internal server error',
      ...(isDevelopment && { stack: error.stack }),
      code: error.code || 'INTERNAL_ERROR',
      timestamp: new Date().toISOString()
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  logger.warn('Route not found', { url: req.originalUrl, ip: req.ip });
  
  res.status(404).json({
    success: false,
    error: { 
      message: 'Endpoint not found', 
      code: 'NOT_FOUND',
      timestamp: new Date().toISOString()
    }
  });
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Unhandled promise rejection handling
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason, promise });
  process.exit(1);
});

// Start server
async function startServer() {
  try {
    // Create logs directory if it doesn't exist
    const fs = require('fs');
    if (!fs.existsSync('logs')) {
      fs.mkdirSync('logs');
    }

    // Connect to database
    await connectDB();
    logger.info('Database connected successfully');
    
    // Start server
    const server = app.listen(PORT, '0.0.0.0', () => {
      logger.info(`CV Slayer API Server started on port ${PORT}`, {
        port: PORT,
        environment: NODE_ENV,
        timestamp: new Date().toISOString()
      });
    });

    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`Port ${PORT} is already in use`);
        process.exit(1);
      } else {
        logger.error('Server error', { error: error.message });
        process.exit(1);
      }
    });

    return server;

  } catch (error) {
    logger.error('Failed to start server', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

startServer();

module.exports = app;