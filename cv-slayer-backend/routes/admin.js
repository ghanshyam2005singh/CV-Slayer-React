const express = require('express');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const { body, validationResult, param, query } = require('express-validator');
const winston = require('winston');
const adminAuth = require('../services/adminAuth');
const Resume = require('../models/Resume');

const router = express.Router();

// Production logger setup
const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
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
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

// Enhanced rate limiting for admin endpoints
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 5 : 10, // Very strict for login
  message: {
    success: false,
    error: {
      message: 'Too many login attempts. Please try again later.',
      code: 'ADMIN_LOGIN_RATE_LIMIT'
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true
});

const adminDataLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: process.env.NODE_ENV === 'production' ? 30 : 100,
  message: {
    success: false,
    error: {
      message: 'Too many requests to admin endpoints.',
      code: 'ADMIN_DATA_RATE_LIMIT'
    }
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Input validation middleware
const validateLoginInput = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 8, max: 100 })
    .withMessage('Password must be between 8-100 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain uppercase, lowercase, and number'),
];

const validatePaginationInput = [
  query('page')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('Page must be between 1-1000'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1-100'),
];

const validateResumeId = [
  param('id')
    .isLength({ min: 1, max: 100 })
    .matches(/^[a-fA-F0-9\-]{8,}$/)
    .withMessage('Invalid resume ID format'),
];

// Error handling middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.warn('Admin validation error', {
      errors: errors.array(),
      ip: req.ip,
      endpoint: req.path
    });
    
    return res.status(400).json({
      success: false,
      error: {
        message: 'Invalid input data',
        code: 'VALIDATION_ERROR',
        details: process.env.NODE_ENV === 'production' ? undefined : errors.array()
      }
    });
  }
  next();
};

// Secure request logging middleware
const logAdminActivity = (action) => {
  return (req, res, next) => {
    const startTime = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      
      logger.info('Admin activity', {
        action,
        status: res.statusCode,
        duration,
        ip: req.ip,
        userAgent: req.get('User-Agent')?.substring(0, 100),
        admin: req.admin?.email || 'unknown',
        timestamp: new Date().toISOString()
      });
    });
    
    next();
  };
};

// Apply rate limiting to all admin routes
router.use('/login', adminLoginLimiter);
router.use(adminDataLimiter);

// Admin login endpoint
router.post('/login', 
  validateLoginInput,
  handleValidationErrors,
  logAdminActivity('login'),
  async (req, res) => {
    try {
      const { email, password } = req.body;
      
      logger.info('Admin login attempt', {
        email: email.replace(/(.{2}).*(@.*)/, '$1***$2'), // Partially hide email
        ip: req.ip,
        userAgent: req.get('User-Agent')?.substring(0, 100)
      });
      
      const result = await adminAuth.login(email, password);
      
      if (result.success) {
        logger.info('Admin login successful', {
          email: email.replace(/(.{2}).*(@.*)/, '$1***$2'),
          ip: req.ip
        });
      } else {
        logger.warn('Admin login failed', {
          email: email.replace(/(.{2}).*(@.*)/, '$1***$2'),
          ip: req.ip,
          reason: result.error?.message
        });
      }
      
      res.status(result.success ? 200 : 401).json(result);
      
    } catch (error) {
      logger.error('Admin login error', {
        error: error.message,
        ip: req.ip,
        stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
      });
      
      res.status(500).json({
        success: false,
        error: {
          message: 'Authentication system error',
          code: 'AUTH_SYSTEM_ERROR'
        }
      });
    }
  }
);

// Dashboard data endpoint
router.get('/dashboard',
  adminAuth.requireAuth,
  logAdminActivity('dashboard'),
  async (req, res) => {
    try {
      // Verify database connection
      if (mongoose.connection.readyState !== 1) {
        throw new Error('Database not connected');
      }
      
      const collection = mongoose.connection.db.collection('resumes');
      
      // Get comprehensive dashboard statistics
      const [
        totalResumes,
        todayResumes,
        avgScoreResult,
        recentResumes,
        statusDistribution,
        roastLevelStats
      ] = await Promise.all([
        // Total resumes count
        collection.countDocuments(),
        
        // Today's resumes count
        collection.countDocuments({
          'timestamps.uploadedAt': { 
            $gte: new Date(new Date().setHours(0, 0, 0, 0)) 
          }
        }),
        
        // Average score calculation
        collection.aggregate([
          { 
            $match: { 
              'analysis.overallScore': { $exists: true, $ne: null, $gte: 0 }
            }
          },
          { 
            $group: { 
              _id: null, 
              avgScore: { $avg: '$analysis.overallScore' },
              count: { $sum: 1 }
            }
          }
        ]).toArray(),
        
        // Recent resumes (anonymized)
        collection.find(
          {},
          {
            resumeId: 1,
            'fileInfo.originalFileName': 1,
            'analysis.overallScore': 1,
            'timestamps.uploadedAt': 1,
            'processingStatus.current': 1,
            'preferences.roastSettings.level': 1
          }
        )
        .sort({ 'timestamps.uploadedAt': -1 })
        .limit(10)
        .toArray(),
        
        // Processing status distribution
        collection.aggregate([
          {
            $group: {
              _id: '$processingStatus.current',
              count: { $sum: 1 }
            }
          }
        ]).toArray(),
        
        // Roast level statistics
        collection.aggregate([
          {
            $group: {
              _id: '$preferences.roastSettings.level',
              count: { $sum: 1 },
              avgScore: { $avg: '$analysis.overallScore' }
            }
          }
        ]).toArray()
      ]);
      
      // Calculate average score
      const averageScore = avgScoreResult.length > 0 
        ? Math.round(avgScoreResult[0].avgScore * 10) / 10 
        : 0;
      
      // Transform recent resumes (keep anonymized)
      const transformedRecentResumes = recentResumes.map(resume => ({
        id: resume.resumeId,
        fileName: resume.fileInfo?.originalFileName || 'Unknown',
        score: resume.analysis?.overallScore || 0,
        uploadedAt: resume.timestamps?.uploadedAt,
        status: resume.processingStatus?.current || 'unknown',
        roastLevel: resume.preferences?.roastSettings?.level || 'unknown'
      }));
      
      // Transform status distribution
      const statusStats = statusDistribution.reduce((acc, item) => {
        acc[item._id || 'unknown'] = item.count;
        return acc;
      }, {});
      
      // Transform roast level stats
      const roastStats = roastLevelStats.reduce((acc, item) => {
        acc[item._id || 'unknown'] = {
          count: item.count,
          avgScore: Math.round((item.avgScore || 0) * 10) / 10
        };
        return acc;
      }, {});
      
      const dashboardData = {
        overview: {
          totalResumes,
          todayResumes,
          averageScore,
          completionRate: statusStats.completed 
            ? Math.round((statusStats.completed / totalResumes) * 100) 
            : 0
        },
        statistics: {
          statusDistribution: statusStats,
          roastLevelStats: roastStats,
          processedToday: todayResumes
        },
        recentActivity: transformedRecentResumes,
        systemInfo: {
          serverTime: new Date().toISOString(),
          dbConnection: 'healthy',
          version: process.env.npm_package_version || '1.0.0'
        }
      };
      
      logger.info('Dashboard data generated', {
        admin: req.admin?.email,
        totalResumes,
        averageScore
      });
      
      res.json({
        success: true,
        data: dashboardData
      });
      
    } catch (error) {
      logger.error('Dashboard data error', {
        error: error.message,
        admin: req.admin?.email,
        stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
      });
      
      // Return safe fallback data
      res.json({
        success: true,
        data: {
          overview: {
            totalResumes: 0,
            todayResumes: 0,
            averageScore: 0,
            completionRate: 0
          },
          statistics: {
            statusDistribution: {},
            roastLevelStats: {},
            processedToday: 0
          },
          recentActivity: [],
          systemInfo: {
            serverTime: new Date().toISOString(),
            dbConnection: 'error',
            version: process.env.npm_package_version || '1.0.0',
            error: 'Failed to load dashboard data'
          }
        }
      });
    }
  }
);

// Get all resumes with pagination and filtering
router.get('/resumes',
  adminAuth.requireAuth,
  validatePaginationInput,
  handleValidationErrors,
  logAdminActivity('resumes_list'),
  async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
      const skip = (page - 1) * limit;
      
      // Optional filters
      const filters = {};
      if (req.query.status) {
        filters['processingStatus.current'] = req.query.status;
      }
      if (req.query.roastLevel) {
        filters['preferences.roastSettings.level'] = req.query.roastLevel;
      }
      if (req.query.minScore) {
        filters['analysis.overallScore'] = { $gte: parseFloat(req.query.minScore) };
      }
      
      const collection = mongoose.connection.db.collection('resumes');
      
      const [totalCount, resumes] = await Promise.all([
        collection.countDocuments(filters),
        collection.find(
          filters,
          {
            resumeId: 1,
            'fileInfo.originalFileName': 1,
            'fileInfo.fileSize': 1,
            'fileInfo.mimeType': 1,
            'timestamps.uploadedAt': 1,
            'analysis.overallScore': 1,
            'preferences.roastSettings.level': 1,
            'preferences.roastSettings.language': 1,
            'processingStatus.current': 1,
            'documentStats.wordCount': 1,
            'documentStats.pageCount': 1
          }
        )
        .sort({ 'timestamps.uploadedAt': -1 })
        .skip(skip)
        .limit(limit)
        .toArray()
      ]);
      
      // Transform data for frontend (anonymized)
      const transformedResumes = resumes.map(resume => ({
        id: resume.resumeId,
        fileName: resume.fileInfo?.originalFileName || 'Unknown',
        fileSize: resume.fileInfo?.fileSize || 0,
        fileType: resume.fileInfo?.mimeType || 'unknown',
        uploadedAt: resume.timestamps?.uploadedAt,
        score: resume.analysis?.overallScore || 0,
        roastLevel: resume.preferences?.roastSettings?.level || 'unknown',
        language: resume.preferences?.roastSettings?.language || 'unknown',
        status: resume.processingStatus?.current || 'unknown',
        wordCount: resume.documentStats?.wordCount || 0,
        pageCount: resume.documentStats?.pageCount || 1
      }));
      
      const totalPages = Math.ceil(totalCount / limit);
      
      logger.info('Resumes list generated', {
        admin: req.admin?.email,
        totalCount,
        page,
        limit,
        filters: Object.keys(filters)
      });
      
      res.json({
        success: true,
        data: {
          resumes: transformedResumes,
          pagination: {
            totalCount,
            currentPage: page,
            totalPages,
            pageSize: limit,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1
          },
          filters: {
            applied: Object.keys(filters),
            available: ['status', 'roastLevel', 'minScore']
          }
        }
      });
      
    } catch (error) {
      logger.error('Resumes list error', {
        error: error.message,
        admin: req.admin?.email,
        stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
      });
      
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to fetch resumes',
          code: 'RESUMES_FETCH_ERROR'
        }
      });
    }
  }
);

// Get single resume details
router.get('/resume/:id',
  adminAuth.requireAuth,
  validateResumeId,
  handleValidationErrors,
  logAdminActivity('resume_details'),
  async (req, res) => {
    try {
      const { id } = req.params;
      
      const collection = mongoose.connection.db.collection('resumes');
      
      // Try to find by resumeId first, then by _id
      let resume = await collection.findOne({ resumeId: id });
      
      if (!resume && mongoose.Types.ObjectId.isValid(id)) {
        resume = await collection.findOne({ _id: new mongoose.Types.ObjectId(id) });
      }
      
      if (!resume) {
        logger.warn('Resume not found', {
          requestedId: id,
          admin: req.admin?.email
        });
        
        return res.status(404).json({
          success: false,
          error: {
            message: 'Resume not found',
            code: 'RESUME_NOT_FOUND'
          }
        });
      }
      
      // Remove sensitive data before sending
      const sanitizedResume = {
        ...resume,
        securityInfo: {
          // Only show non-sensitive security info
          countryCode: resume.securityInfo?.countryCode,
          sessionId: resume.securityInfo?.sessionId?.substring(0, 8) + '...'
        }
      };
      delete sanitizedResume.securityInfo.clientIPHash;
      delete sanitizedResume.securityInfo.userAgentHash;
      
      logger.info('Resume details accessed', {
        resumeId: resume.resumeId,
        admin: req.admin?.email
      });
      
      res.json({
        success: true,
        data: sanitizedResume
      });
      
    } catch (error) {
      logger.error('Resume details error', {
        error: error.message,
        requestedId: req.params.id,
        admin: req.admin?.email,
        stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
      });
      
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to fetch resume details',
          code: 'RESUME_DETAILS_ERROR'
        }
      });
    }
  }
);

// Admin analytics endpoint
router.get('/analytics',
  adminAuth.requireAuth,
  logAdminActivity('analytics'),
  async (req, res) => {
    try {
      const days = Math.min(365, Math.max(1, parseInt(req.query.days) || 30));
      
      const analytics = await Resume.getAnalytics(days);
      
      logger.info('Analytics generated', {
        admin: req.admin?.email,
        days,
        totalAnalyses: analytics.totalAnalyses
      });
      
      res.json({
        success: true,
        data: {
          ...analytics,
          period: `${days} days`,
          generatedAt: new Date().toISOString()
        }
      });
      
    } catch (error) {
      logger.error('Analytics error', {
        error: error.message,
        admin: req.admin?.email,
        stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
      });
      
      res.status(500).json({
        success: false,
        error: {
          message: 'Failed to generate analytics',
          code: 'ANALYTICS_ERROR'
        }
      });
    }
  }
);

// System health check
router.get('/health',
  logAdminActivity('health_check'),
  async (req, res) => {
    try {
      const [authHealth, dbConnected, resumeCount] = await Promise.all([
        adminAuth.checkHealth(),
        mongoose.connection.readyState === 1,
        mongoose.connection.readyState === 1 
          ? mongoose.connection.db.collection('resumes').countDocuments()
          : 0
      ]);
      
      const healthData = {
        system: {
          status: 'healthy',
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          version: process.env.npm_package_version || '1.0.0'
        },
        services: {
          authentication: authHealth,
          database: {
            connected: dbConnected,
            status: dbConnected ? 'healthy' : 'disconnected',
            resumeCount
          }
        },
        timestamp: new Date().toISOString()
      };
      
      const overallHealthy = authHealth.healthy && dbConnected;
      
      res.status(overallHealthy ? 200 : 503).json({
        success: true,
        data: healthData
      });
      
    } catch (error) {
      logger.error('Health check error', {
        error: error.message,
        stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
      });
      
      res.status(503).json({
        success: false,
        error: {
          message: 'Health check failed',
          code: 'HEALTH_CHECK_ERROR'
        }
      });
    }
  }
);

module.exports = router;