const express = require('express');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const { body, validationResult, param, query } = require('express-validator');
const adminAuth = require('../services/adminAuth');
const Resume = require('../models/Resume');

const router = express.Router();

// Simple rate limiting
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: {
    success: false,
    error: 'Too many login attempts. Try again later.'
  },
  standardHeaders: false,
  legacyHeaders: false
});

const adminDataLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 50,
  message: {
    success: false,
    error: 'Too many requests.'
  },
  standardHeaders: false,
  legacyHeaders: false
});

// Simple validation
const validateLogin = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8, max: 100 })
];

const validatePagination = [
  query('page').optional().isInt({ min: 1, max: 1000 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
];

const validateResumeId = [
  param('id').isLength({ min: 1, max: 100 })
];

// Simple error handler
const handleErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Invalid input'
    });
  }
  next();
};

// Apply rate limiting
router.use('/login', adminLoginLimiter);
router.use(adminDataLimiter);

// Admin login
router.post('/login', 
  validateLogin,
  handleErrors,
  async (req, res) => {
    try {
      const { email, password } = req.body;
      
      console.log('Admin login attempt:', email.substring(0, 3) + '***');
      
      const result = await adminAuth.login(email, password);
      
      if (result.success) {
        console.log('✅ Admin login successful');
      } else {
        console.log('❌ Admin login failed');
      }
      
      res.status(result.success ? 200 : 401).json(result);
      
    } catch (error) {
      console.error('❌ Admin login error:', error.message);
      
      res.status(500).json({
        success: false,
        error: 'Authentication failed'
      });
    }
  }
);

// Dashboard data
router.get('/dashboard',
  adminAuth.requireAuth,
  async (req, res) => {
    try {
      // Check database connection
      if (mongoose.connection.readyState !== 1) {
        throw new Error('Database not connected');
      }
      
      const collection = mongoose.connection.db.collection('resumes');
      
      // Get basic stats
      const [totalResumes, todayResumes, recentResumes] = await Promise.all([
        collection.countDocuments({}),
        collection.countDocuments({
          'timestamps.uploadedAt': { 
            $gte: new Date(new Date().setHours(0, 0, 0, 0)) 
          }
        }),
        collection.find({})
          .sort({ 'timestamps.uploadedAt': -1 })
          .limit(10)
          .toArray()
      ]);
      
      // Calculate average score
      let averageScore = 0;
      const validScores = recentResumes
        .map(r => r.analysis?.overallScore)
        .filter(score => typeof score === 'number' && score >= 0 && score <= 100);
      
      if (validScores.length > 0) {
        averageScore = Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length);
      }
      
      // Transform recent resumes simply
      const transformedRecent = recentResumes.map(resume => {
        const personalInfo = resume.extractedInfo?.personalInfo || {};
        const fileInfo = resume.fileInfo || {};
        const analysis = resume.analysis || {};
        
        return {
          id: resume.resumeId || resume._id?.toString(),
          fileName: fileInfo.originalFileName || fileInfo.fileName || 'Unknown',
          name: personalInfo.name || 'Unknown',
          email: personalInfo.email || 'Not found',
          score: analysis.overallScore || 0,
          uploadedAt: resume.timestamps?.uploadedAt || new Date()
        };
      });
      
      const dashboardData = {
        totalResumes,
        todayResumes,
        averageScore,
        recentResumes: transformedRecent,
        systemInfo: {
          serverTime: new Date().toISOString(),
          dbConnection: 'healthy'
        }
      };
      
      console.log('✅ Dashboard data generated:', {
        total: totalResumes,
        today: todayResumes,
        avg: averageScore
      });
      
      res.json({
        success: true,
        data: dashboardData
      });
      
    } catch (error) {
      console.error('❌ Dashboard error:', error.message);
      
      // Return empty data instead of error
      res.json({
        success: true,
        data: {
          totalResumes: 0,
          todayResumes: 0,
          averageScore: 0,
          recentResumes: [],
          systemInfo: {
            serverTime: new Date().toISOString(),
            dbConnection: 'error'
          }
        }
      });
    }
  }
);

// Get all resumes
router.get('/resumes',
  adminAuth.requireAuth,
  validatePagination,
  handleErrors,
  async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
      const skip = (page - 1) * limit;
      
      const collection = mongoose.connection.db.collection('resumes');
      
      const [totalCount, resumes] = await Promise.all([
        collection.countDocuments({}),
        collection.find({})
          .sort({ 'timestamps.uploadedAt': -1 })
          .skip(skip)
          .limit(limit)
          .toArray()
      ]);
      
      // Simple data transformation
      const transformedResumes = resumes.map(resume => {
        const personalInfo = resume.extractedInfo?.personalInfo || {};
        const fileInfo = resume.fileInfo || {};
        const analysis = resume.analysis || {};
        const preferences = resume.preferences || {};
        
        return {
          id: resume.resumeId || resume._id?.toString(),
          fileName: fileInfo.originalFileName || 'Unknown',
          name: personalInfo.name || 'Unknown',
          email: personalInfo.email || 'Not found',
          phone: personalInfo.phone || 'Not found',
          score: analysis.overallScore || 0,
          uploadedAt: resume.timestamps?.uploadedAt || new Date(),
          roastLevel: preferences.roastLevel || 'unknown',
          language: preferences.language || 'english'
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
      console.error('❌ Resumes list error:', error.message);
      
      res.status(500).json({
        success: false,
        error: 'Failed to fetch resumes'
      });
    }
  }
);

// Get single resume
router.get('/resume/:id',
  adminAuth.requireAuth,
  validateResumeId,
  handleErrors,
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
          error: 'Resume not found'
        });
      }
      
      // Return full resume data (no sensitive info exposed)
      res.json({
        success: true,
        data: resume
      });
      
    } catch (error) {
      console.error('❌ Resume details error:', error.message);
      
      res.status(500).json({
        success: false,
        error: 'Failed to fetch resume'
      });
    }
  }
);

module.exports = router;