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
  transports: process.env.NODE_ENV === 'production' 
    ? [new winston.transports.Console()] // Only console in production
    : [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
        new winston.transports.Console({ format: winston.format.simple() })
      ]
});

// Enhanced rate limiting for admin endpoints
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 5 : 10,
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
        email: email.replace(/(.{2}).*(@.*)/, '$1***$2'),
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

// FIXED Dashboard data endpoint
router.get('/dashboard',
  adminAuth.requireAuth,
  logAdminActivity('dashboard'),
  async (req, res) => {
    try {
      // Verify database connection first
      if (mongoose.connection.readyState !== 1) {
        logger.error('Database not connected for dashboard');
        throw new Error('Database connection not available');
      }
      
      const collection = mongoose.connection.db.collection('resumes');
      
      // FIXED: Get comprehensive data
      const [
        totalResumes,
        todayResumes,
        avgScoreResult,
        recentResumes
      ] = await Promise.all([
        // Total count
        collection.countDocuments({}),
        
        // Today's count
        collection.countDocuments({
          'timestamps.uploadedAt': { 
            $gte: new Date(new Date().setHours(0, 0, 0, 0)) 
          }
        }),
        
        // Average score
        collection.aggregate([
          { 
            $match: { 
              'analysis.overallScore': { $exists: true, $ne: null, $gte: 0, $lte: 100 }
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
        
        // FIXED: Recent resumes with proper projection
        collection.find({})
        .sort({ 'timestamps.uploadedAt': -1 })
        .limit(10)
        .toArray()
      ]);
      
      const averageScore = avgScoreResult.length > 0 && avgScoreResult[0] 
        ? Math.round(avgScoreResult[0].avgScore * 10) / 10 
        : 0;
      
      // FIXED: Transform recent resumes correctly
      const transformedRecentResumes = recentResumes.map(resume => {
        // Extract personal info from different possible paths
        const personalInfo = resume.extractedInfo?.personalInfo || 
                             resume.personalInfo || 
                             {};
        
        const fileInfo = resume.fileInfo || {};
        const analysis = resume.analysis || {};
        const preferences = resume.preferences || {};
        const contactValidation = resume.contactValidation || {};
        
        return {
          id: resume.resumeId || resume._id?.toString(),
          fileName: fileInfo.originalFileName || fileInfo.fileName || 'Unknown File',
          displayName: personalInfo.name || fileInfo.originalFileName?.replace(/\.[^/.]+$/, "") || 'Unknown',
          score: analysis.overallScore || 0,
          uploadedAt: resume.timestamps?.uploadedAt || resume.createdAt,
          
          // FIXED: Personal information extraction
          personalInfo: {
            name: personalInfo.name || 'Not extracted',
            email: personalInfo.email || personalInfo.contactInfo?.email || 'Not found',
            phone: personalInfo.phone || personalInfo.contactInfo?.phone || 'Not found',
            linkedin: personalInfo.socialProfiles?.linkedin || personalInfo.linkedin || 'Not found',
            address: personalInfo.address?.full || personalInfo.address || 'Not found'
          },
          
          // Other data
          roastLevel: preferences.roastLevel || 'unknown',
          language: preferences.language || 'unknown',
          roastType: preferences.roastType || 'unknown',
          gender: preferences.gender || 'unknown',
          
          hasEmail: contactValidation.hasEmail || false,
          hasPhone: contactValidation.hasPhone || false,
          hasLinkedIn: contactValidation.hasLinkedIn || false,
          
          wordCount: analysis.resumeAnalytics?.wordCount || 0,
          pageCount: analysis.resumeAnalytics?.pageCount || 1,
          
          fullData: resume
        };
      });
      
      const dashboardData = {
        totalResumes,
        todayResumes,
        averageScore,
        recentResumes: transformedRecentResumes,
        
        overview: {
          totalResumes,
          todayResumes,
          averageScore,
          completionRate: totalResumes > 0 ? Math.round((recentResumes.length / totalResumes) * 100) : 0
        },
        
        statistics: {
          statusDistribution: { completed: recentResumes.length },
          roastLevelStats: {},
          processedToday: todayResumes
        },
        
        recentActivity: transformedRecentResumes,
        
        systemInfo: {
          serverTime: new Date().toISOString(),
          dbConnection: 'healthy',
          version: process.env.npm_package_version || '1.0.0'
        }
      };
      
      logger.info('Dashboard data generated successfully', {
        admin: req.admin?.email,
        totalResumes,
        averageScore,
        recentCount: transformedRecentResumes.length
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
      
      res.json({
        success: true,
        data: {
          totalResumes: 0,
          todayResumes: 0,
          averageScore: 0,
          recentResumes: [],
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

// FIXED Get all resumes
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
      
      const filters = {};
      if (req.query.status) {
        filters['processingStatus.current'] = req.query.status;
      }
      if (req.query.roastLevel) {
        filters['preferences.roastLevel'] = req.query.roastLevel;
      }
      if (req.query.minScore) {
        filters['analysis.overallScore'] = { $gte: parseFloat(req.query.minScore) };
      }
      
      const collection = mongoose.connection.db.collection('resumes');
      
      const [totalCount, resumes] = await Promise.all([
        collection.countDocuments(filters),
        collection.find(filters)
        .sort({ 'timestamps.uploadedAt': -1 })
        .skip(skip)
        .limit(limit)
        .toArray()
      ]);
      
      // FIXED: Transform data properly
      const transformedResumes = resumes.map(resume => {
        const personalInfo = resume.extractedInfo?.personalInfo || resume.personalInfo || {};
        const fileInfo = resume.fileInfo || {};
        const analysis = resume.analysis || {};
        const preferences = resume.preferences || {};
        const contactValidation = resume.contactValidation || {};
        
        return {
          id: resume.resumeId || resume._id?.toString(),
          fileName: fileInfo.originalFileName || fileInfo.fileName || 'Unknown',
          fileSize: fileInfo.fileSize || 0,
          fileType: fileInfo.mimeType || 'unknown',
          uploadedAt: resume.timestamps?.uploadedAt || resume.createdAt,
          score: analysis.overallScore || 0,
          
          // FIXED: Personal information
          personalInfo: {
            name: personalInfo.name || 'Not extracted',
            email: personalInfo.email || personalInfo.contactInfo?.email || 'Not found',
            phone: personalInfo.phone || personalInfo.contactInfo?.phone || 'Not found',
            linkedin: personalInfo.socialProfiles?.linkedin || personalInfo.linkedin || 'Not found',
            address: personalInfo.address?.full || personalInfo.address || 'Not found'
          },
          
          roastLevel: preferences.roastLevel || 'unknown',
          language: preferences.language || 'unknown',
          roastType: preferences.roastType || 'unknown',
          gender: preferences.gender || 'unknown',
          
          hasEmail: contactValidation.hasEmail || false,
          hasPhone: contactValidation.hasPhone || false,
          hasLinkedIn: contactValidation.hasLinkedIn || false,
          contactValidation: contactValidation,
          
          wordCount: analysis.resumeAnalytics?.wordCount || 0,
          pageCount: analysis.resumeAnalytics?.pageCount || 1,
          analytics: analysis.resumeAnalytics || {},
          
          fullData: resume
        };
      });
      
      const totalPages = Math.ceil(totalCount / limit);
      
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

// FIXED Get single resume details
router.get('/resume/:id',
  adminAuth.requireAuth,
  validateResumeId,
  handleValidationErrors,
  logAdminActivity('resume_details'),
  async (req, res) => {
    try {
      const { id } = req.params;
      
      const collection = mongoose.connection.db.collection('resumes');
      
      let resume = await collection.findOne({ resumeId: id });
      
      if (!resume && mongoose.Types.ObjectId.isValid(id)) {
        resume = await collection.findOne({ _id: new mongoose.Types.ObjectId(id) });
      }
      
      if (!resume) {
        return res.status(404).json({
          success: false,
          error: {
            message: 'Resume not found',
            code: 'RESUME_NOT_FOUND'
          }
        });
      }
      
      // FIXED: Include full data with proper personal info
      const fullResumeData = {
        ...resume,
        personalInfo: resume.extractedInfo?.personalInfo || resume.personalInfo || {},
        securityInfo: {
          countryCode: resume.securityInfo?.countryCode,
          sessionId: resume.securityInfo?.sessionId?.substring(0, 8) + '...',
          clientIPHash: resume.securityInfo?.clientIPHash ? '[HASHED]' : null,
          userAgentHash: resume.securityInfo?.userAgentHash ? '[HASHED]' : null
        }
      };
      
      res.json({
        success: true,
        data: fullResumeData
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

module.exports = router;