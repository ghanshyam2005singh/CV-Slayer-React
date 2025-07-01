const express = require('express');
const mongoose = require('mongoose');
const adminAuth = require('../services/adminAuth');

const router = express.Router();

// Admin login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('🔐 Admin login attempt for:', email);
    const result = await adminAuth.login(email, password);
    res.status(result.success ? 200 : 401).json(result);
  } catch (error) {
    console.error('❌ Login error:', error.message);
    res.status(500).json({
      success: false,
      error: { message: 'Login failed', details: error.message }
    });
  }
});

// Dashboard data
router.get('/dashboard', adminAuth.requireAuth, async (req, res) => {
  try {
    console.log('📊 Dashboard endpoint called');
    console.log('🔗 Database connection state:', mongoose.connection.readyState);
    
    // Use direct collection query to avoid model issues
    const collection = mongoose.connection.db.collection('resumes');
    
    // Get resume statistics
    const totalResumes = await collection.countDocuments();
    console.log('📄 Total resumes found:', totalResumes);
    
    // Get today's resumes
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayResumes = await collection.countDocuments({
      uploadedAt: { $gte: today }
    });
    
    // Get average score
    const avgResult = await collection.aggregate([
      { $match: { 'analysis.overallScore': { $exists: true, $ne: null } } },
      { $group: { _id: null, avgScore: { $avg: '$analysis.overallScore' } } }
    ]).toArray();
    const averageScore = avgResult.length > 0 ? avgResult[0].avgScore : 0;
    
    // Get recent resumes
    const recentResumes = await collection.find()
      .sort({ uploadedAt: -1 })
      .limit(5)
      .toArray();
    
    console.log('📋 Recent resumes:', recentResumes.length);
    if (recentResumes.length > 0) {
      console.log('📋 First resume fields:', Object.keys(recentResumes[0]));
    }
    
    const dashboardData = {
      totalResumes,
      todayResumes,
      averageScore: Math.round(averageScore * 10) / 10,
      recentResumes: recentResumes.map(resume => ({
        id: resume.resumeId || resume._id,
        fileName: resume.originalFileName || 'Unknown',
        score: resume.analysis?.overallScore || 0,
        uploadedAt: resume.uploadedAt
      })),
      serverTime: new Date().toISOString()
    };
    
    console.log('📊 Dashboard data prepared:', dashboardData);
    
    res.json({
      success: true,
      data: dashboardData
    });
    
  } catch (error) {
    console.error('❌ Dashboard error:', error.message);
    console.error('❌ Error stack:', error.stack);
    res.json({
      success: true,
      data: {
        totalResumes: 0,
        todayResumes: 0,
        averageScore: 0,
        recentResumes: [],
        serverTime: new Date().toISOString(),
        note: `Error loading data: ${error.message}`
      }
    });
  }
});

// Get all resumes
router.get('/resumes', adminAuth.requireAuth, async (req, res) => {
  try {
    console.log('📄 Resumes endpoint called');
    console.log('🔗 Database connection state:', mongoose.connection.readyState);
    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;
    
    // Use direct collection query
    const collection = mongoose.connection.db.collection('resumes');
    
    // Get total count
    const totalCount = await collection.countDocuments();
    console.log('📊 Total resume count:', totalCount);
    
    // Get resumes with pagination
    const resumes = await collection.find()
      .sort({ uploadedAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();
    
    console.log('📋 Fetched resumes:', resumes.length);
    if (resumes.length > 0) {
      console.log('📋 First resume sample:', {
        id: resumes[0]._id,
        fileName: resumes[0].originalFileName,
        score: resumes[0].analysis?.overallScore
      });
    }
    
    // Transform data for frontend
    const transformedResumes = resumes.map(resume => ({
      id: resume.resumeId || resume._id.toString(),
      resumeId: resume.resumeId,
      originalFileName: resume.originalFileName || 'Unknown',
      fileSize: resume.fileSize || 0,
      uploadedAt: resume.uploadedAt || new Date(),
      fileType: resume.fileType || 'unknown',
      score: resume.analysis?.overallScore || 0,
      language: resume.preferences?.language || 'N/A',
      roastType: resume.preferences?.roastType || 'N/A',
      status: resume.status || 'completed'
    }));
    
    const totalPages = Math.ceil(totalCount / limit);
    
    const responseData = {
      success: true,
      data: {
        resumes: transformedResumes,
        totalCount,
        currentPage: page,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    };
    
    console.log('📊 Resumes response prepared:', {
      totalCount,
      returnedCount: transformedResumes.length
    });
    
    res.json(responseData);
    
  } catch (error) {
    console.error('❌ Resumes endpoint error:', error.message);
    console.error('❌ Error stack:', error.stack);
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
      note: `Failed to load resumes: ${error.message}`
    });
  }
});

// Get single resume details
router.get('/resume/:id', adminAuth.requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    console.log('📄 Resume details requested for:', id);
    
    const collection = mongoose.connection.db.collection('resumes');
    
    let resume;
    if (mongoose.Types.ObjectId.isValid(id)) {
      resume = await collection.findOne({ _id: new mongoose.Types.ObjectId(id) });
    }
    
    if (!resume) {
      resume = await collection.findOne({ resumeId: id });
    }
    
    if (!resume) {
      return res.status(404).json({
        success: false,
        error: { message: 'Resume not found' }
      });
    }
    
    res.json({
      success: true,
      data: resume
    });
    
  } catch (error) {
    console.error('❌ Resume details error:', error.message);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch resume details' }
    });
  }
});

// Health check
router.get('/health', async (req, res) => {
  try {
    console.log('🏥 Admin health check called');
    
    const authHealth = await adminAuth.checkHealth();
    
    // Test database connection
    const dbConnected = mongoose.connection.readyState === 1;
    let resumeCount = 0;
    
    if (dbConnected) {
      const collection = mongoose.connection.db.collection('resumes');
      resumeCount = await collection.countDocuments();
    }
    
    console.log('🏥 Health check results:', { dbConnected, resumeCount });
    
    res.json({
      success: true,
      data: {
        auth: authHealth,
        database: {
          connected: dbConnected,
          resumeCount
        },
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('❌ Health check error:', error.message);
    res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
});

module.exports = router;