const express = require('express');
const adminAuth = require('../services/adminAuth');
const resumeStorage = require('../services/resumeStorageEnhanced');
const { connectDB, getConnectionStatus } = require('../config/database');

const router = express.Router();

// Simple admin login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Email and password are required'
        }
      });
    }

    const result = await adminAuth.login(email, password);

    if (result.success) {
      res.json({
        success: true,
        token: result.token,
        expiresIn: result.expiresIn,
        message: 'Login successful',
        loginTime: new Date().toISOString()
      });
    } else {
      res.status(401).json({
        success: false,
        error: {
          message: 'Invalid credentials'
        }
      });
    }

  } catch (error) {
    console.error('Admin login error:', error.message);
    
    res.status(500).json({
      success: false,
      error: {
        message: 'Login failed'
      }
    });
  }
});

// Simple logout
router.post('/logout', adminAuth.requireAuth, (req, res) => {
  try {
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: 'Logout failed'
      }
    });
  }
});

// Simple dashboard
router.get('/dashboard', adminAuth.requireAuth, async (req, res) => {
  try {
    // Try to connect to database if not connected
    try {
      await connectDB();
    } catch (dbError) {
      console.warn('Dashboard: Database connection failed:', dbError.message);
    }
    
    // Check if we have database functionality
    const dbStatus = getConnectionStatus();
    
    if (!dbStatus.connected) {
      // Return mock data if database is not available
      return res.json({
        success: true,
        data: {
          totalResumes: 0,
          todayResumes: 0,
          averageScore: 0,
          recentResumes: [],
          serverTime: new Date().toISOString(),
          note: 'Database not connected - showing mock data'
        }
      });
    }
    
    const stats = await resumeStorage.getComprehensiveDashboardStats('30d');
    
    if (stats.success) {
      res.json({
        success: true,
        data: {
          totalResumes: parseInt(stats.data.overview?.totalResumes, 10) || 0,
          todayResumes: parseInt(stats.data.overview?.todayResumes, 10) || 0,
          averageScore: parseFloat(stats.data.overview?.averageScore) || 0,
          recentResumes: (stats.data.recent || []).slice(0, 10).map(resume => ({
            id: resume.resumeId,
            fileName: resume.fileName || 'Unknown',
            score: parseInt(resume.analysis?.overallScore, 10) || 0,
            uploadedAt: resume.timestamps?.uploadedAt
          })),
          serverTime: new Date().toISOString()
        }
      });
    } else {
      // Fallback data
      res.json({
        success: true,
        data: {
          totalResumes: 0,
          todayResumes: 0,
          averageScore: 0,
          recentResumes: [],
          serverTime: new Date().toISOString(),
          note: 'Stats unavailable - showing fallback data'
        }
      });
    }

  } catch (error) {
    console.error('Dashboard error:', error.message);
    
    // Return fallback data instead of error
    res.json({
      success: true,
      data: {
        totalResumes: 0,
        todayResumes: 0,
        averageScore: 0,
        recentResumes: [],
        serverTime: new Date().toISOString(),
        note: 'Error loading data - showing fallback'
      }
    });
  }
});

// Simple resumes endpoint
router.get('/resumes', adminAuth.requireAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    
    // Try to connect to database
    try {
      await connectDB();
    } catch (dbError) {
      console.warn('Resumes: Database connection failed:', dbError.message);
    }
    
    const dbStatus = getConnectionStatus();
    
    if (!dbStatus.connected) {
      return res.json({
        success: true,
        data: {
          resumes: [],
          totalCount: 0,
          currentPage: page,
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: false
        },
        note: 'Database not connected'
      });
    }
    
    const options = {
      page,
      limit,
      sortBy: 'uploadedAt',
      sortOrder: 'desc'
    };
    
    const resumes = await resumeStorage.getAllResumes(options);
    
    if (resumes.success) {
      const simplifiedResumes = (resumes.data.resumes || []).map(resume => ({
        id: resume.resumeId,
        originalFileName: resume.originalFileName || 'Unknown',
        fileSize: parseInt(resume.fileSize, 10) || 0,
        uploadedAt: resume.timestamps?.uploadedAt,
        analysis: {
          score: parseInt(resume.analysis?.overallScore, 10) || 0
        },
        preferences: {
          language: resume.preferences?.roastSettings?.language || 'unknown',
          roastType: resume.preferences?.roastSettings?.level || 'unknown'
        },
        statistics: {
          hasEmail: Boolean(resume.statistics?.hasEmail),
          hasPhone: Boolean(resume.statistics?.hasPhone),
          hasLinkedIn: Boolean(resume.statistics?.hasLinkedIn)
        }
      }));

      res.json({
        success: true,
        data: {
          resumes: simplifiedResumes,
          totalCount: parseInt(resumes.data.totalCount, 10) || 0,
          currentPage: page,
          totalPages: Math.ceil((resumes.data.totalCount || 0) / limit),
          hasNextPage: resumes.data.hasNextPage || false,
          hasPrevPage: resumes.data.hasPrevPage || false
        }
      });
    } else {
      res.json({
        success: true,
        data: {
          resumes: [],
          totalCount: 0,
          currentPage: page,
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: false
        },
        note: 'Failed to load resumes'
      });
    }

  } catch (error) {
    console.error('Resumes error:', error.message);
    
    res.json({
      success: true,
      data: {
        resumes: [],
        totalCount: 0,
        currentPage: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false
      },
      note: 'Error loading resumes'
    });
  }
});

// Simple individual resume endpoint
router.get('/resume/:id', adminAuth.requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Resume ID is required'
        }
      });
    }

    try {
      await connectDB();
    } catch (dbError) {
      console.warn('Resume details: Database connection failed:', dbError.message);
    }
    
    const dbStatus = getConnectionStatus();
    
    if (!dbStatus.connected) {
      return res.status(503).json({
        success: false,
        error: {
          message: 'Database not available'
        }
      });
    }
    
    const options = {
      includeFullAnalysis: true,
      includeStatistics: true
    };
    
    const resume = await resumeStorage.getResumeById(id, options);
    
    if (resume.success) {
      const simplifiedResume = {
        basicInfo: {
          originalFileName: resume.data.originalFileName || 'Unknown',
          fileSize: parseInt(resume.data.fileSize, 10) || 0,
          uploadedAt: resume.data.timestamps?.uploadedAt,
          id: resume.data.resumeId
        },
        analysis: {
          score: parseInt(resume.data.analysis?.overallScore, 10) || 0,
          atsScore: parseInt(resume.data.analysis?.scoringBreakdown?.atsCompatibility, 10) || 0,
          contentScore: parseInt(resume.data.analysis?.scoringBreakdown?.workExperience, 10) || 0,
          formatScore: parseInt(resume.data.analysis?.scoringBreakdown?.formatting, 10) || 0,
          roastFeedback: resume.data.analysis?.feedback?.roastFeedback || '',
          strengths: resume.data.analysis?.feedback?.strengths || [],
          weaknesses: resume.data.analysis?.feedback?.improvements || []
        },
        preferences: {
          language: resume.data.preferences?.roastSettings?.language || 'unknown',
          roastType: resume.data.preferences?.roastSettings?.level || 'unknown',
          roastLevel: resume.data.preferences?.roastSettings?.level || 'unknown',
          gender: resume.data.preferences?.roastSettings?.gender || 'unknown'
        },
        statistics: {
          hasEmail: Boolean(resume.data.statistics?.hasEmail),
          hasPhone: Boolean(resume.data.statistics?.hasPhone),
          hasLinkedIn: Boolean(resume.data.statistics?.hasLinkedIn),
          hasGitHub: Boolean(resume.data.statistics?.hasGithub),
          wordCount: parseInt(resume.data.statistics?.wordCount, 10) || 0,
          pageCount: parseInt(resume.data.statistics?.pageCount, 10) || 1
        },
        extractedInfo: resume.data.extractedData || {}
      };

      res.json({
        success: true,
        data: simplifiedResume
      });
    } else {
      const statusCode = resume.code === 'NOT_FOUND' ? 404 : 500;
      res.status(statusCode).json({
        success: false,
        error: {
          message: resume.code === 'NOT_FOUND' ? 'Resume not found' : 'Failed to load resume'
        }
      });
    }

  } catch (error) {
    console.error('Resume details error:', error.message);
    
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});

// Test endpoint
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Admin routes are working',
    timestamp: new Date().toISOString()
  });
});

// Simple error handling
router.use((error, req, res, next) => {
  console.error('Admin route error:', error.message);
  
  res.status(500).json({
    success: false,
    error: {
      message: 'Internal server error'
    }
  });
});

module.exports = router;