const mongoose = require('mongoose');
const Resume = require('../models/Resume');
const { connectDB, getConnectionStatus } = require('../config/database');
const crypto = require('crypto');
const validator = require('validator');

class ResumeStorageEnhanced {
  constructor() {
    this.maxBatchSize = 100;
    this.connectionTimeout = 10000;
    
    this.stats = {
      totalSaves: 0,
      totalReads: 0,
      totalDeletes: 0,
      totalErrors: 0
    };
  }

  async ensureConnection() {
    try {
      // Use existing connection if available
      if (mongoose.connection.readyState === 1) {
        console.log('✅ Using existing database connection');
        return;
      }
      await connectDB();
    } catch (error) {
      console.log('❌ Database connection error:', error.message);
      throw new Error('Database connection failed');
    }
  }

  async saveResumeData(file, extractedText, analysisResult, preferences) {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    
    try {
      await this.ensureConnection();

      const resumeId = crypto.randomUUID();
      
      const sanitizedData = await this.sanitizeAllData(
        file, 
        extractedText, 
        analysisResult, 
        preferences
      );

      const resumeData = {
        resumeId,
        fileName: sanitizedData.fileName,
        originalFileName: sanitizedData.originalFileName,
        fileSize: sanitizedData.fileSize,
        mimeType: sanitizedData.mimeType,
        extractedInfo: sanitizedData.extractedInfo,
        analysis: sanitizedData.analysis,
        preferences: sanitizedData.preferences,
        statistics: sanitizedData.statistics,
        security: {
          clientIPHash: Resume.hashIP('127.0.0.1'), // Default for now
          countryCode: 'US'
        },
        dataRetention: {
          retentionDays: 90,
          autoDelete: true,
          gdprConsent: false
        },
        status: {
          current: 'analyzed'
        },
        timestamps: {
          uploadedAt: new Date(),
          processedAt: new Date()
        }
      };

      await this.validateResumeData(resumeData);

      const resume = new Resume(resumeData);
      await resume.save();

      this.updateStats('save', true);

      return {
        success: true,
        resumeId,
        requestId,
        message: 'Resume data saved successfully',
        data: {
          resumeId,
          name: sanitizedData.extractedInfo.personalInfo?.name,
          score: sanitizedData.analysis.overallScore,
          uploadedAt: resumeData.timestamps.uploadedAt
        }
      };

    } catch (error) {
      this.updateStats('save', false);
      
      return {
        success: false,
        error: 'Failed to save resume data',
        code: this.getErrorCode(error),
        requestId
      };
    }
  }

  async getAllResumes(options = {}) {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    
    try {
      await this.ensureConnection();

      const {
        page = 1,
        limit = 20,
        sortBy = 'timestamps.uploadedAt',
        sortOrder = 'desc',
        filters = {}
      } = options;

      const validatedPage = Math.max(1, parseInt(page));
      const validatedLimit = Math.min(Math.max(1, parseInt(limit)), this.maxBatchSize);
      
      const skip = (validatedPage - 1) * validatedLimit;
      const sortOptions = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
      
      const query = this.buildAdvancedQuery(filters);
      const projection = this.buildProjection();

      const [resumes, total] = await Promise.all([
        Resume.find(query)
          .select(projection)
          .sort(sortOptions)
          .skip(skip)
          .limit(validatedLimit)
          .lean(),
        Resume.countDocuments(query)
      ]);

      const formattedResumes = resumes.map(resume => this.formatResumeForList(resume));

      this.updateStats('read', true);

      return {
        success: true,
        requestId,
        data: {
          resumes: formattedResumes,
          pagination: {
            currentPage: validatedPage,
            totalPages: Math.ceil(total / validatedLimit),
            totalResumes: total,
            limit: validatedLimit,
            hasNext: validatedPage < Math.ceil(total / validatedLimit),
            hasPrev: validatedPage > 1
          },
          filters: filters,
          sorting: { sortBy, sortOrder }
        }
      };

    } catch (error) {
      this.updateStats('read', false);
      
      return {
        success: false,
        error: 'Failed to fetch resumes',
        code: this.getErrorCode(error),
        requestId
      };
    }
  }

  async getResumeById(resumeId, options = {}) {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    
    try {
      await this.ensureConnection();

      if (!resumeId || typeof resumeId !== 'string') {
        return {
          success: false,
          error: 'Valid Resume ID is required',
          code: 'INVALID_ID',
          requestId
        };
      }

      if (!this.isValidUUID(resumeId)) {
        return {
          success: false,
          error: 'Invalid Resume ID format',
          code: 'INVALID_UUID_FORMAT',
          requestId
        };
      }

      const { includeFullAnalysis = true, includeStatistics = true } = options;

      let projection = '-__v -security -dataRetention';
      if (!includeFullAnalysis) {
        projection += ' -analysis.feedback.roastFeedback';
      }

      const resume = await Resume.findOne({ resumeId })
        .select(projection)
        .lean();
      
      if (!resume) {
        return {
          success: false,
          error: 'Resume not found',
          code: 'NOT_FOUND',
          requestId
        };
      }

      const formattedResume = this.formatResumeForDetail(resume, {
        includeStatistics,
        includeFullAnalysis
      });

      this.updateStats('read', true);

      return {
        success: true,
        requestId,
        data: formattedResume
      };

    } catch (error) {
      this.updateStats('read', false);
      
      return {
        success: false,
        error: 'Failed to fetch resume',
        code: this.getErrorCode(error),
        requestId
      };
    }
  }

  async deleteResume(resumeId, options = {}) {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    
    try {
      await this.ensureConnection();

      if (!resumeId || typeof resumeId !== 'string') {
        return {
          success: false,
          error: 'Valid Resume ID is required',
          code: 'INVALID_ID',
          requestId
        };
      }

      if (!this.isValidUUID(resumeId)) {
        return {
          success: false,
          error: 'Invalid Resume ID format',
          code: 'INVALID_UUID_FORMAT',
          requestId
        };
      }

      const result = await Resume.deleteOne({ resumeId });
      
      if (result.deletedCount === 0) {
        return {
          success: false,
          error: 'Resume not found',
          code: 'NOT_FOUND',
          requestId
        };
      }

      this.updateStats('delete', true);

      return {
        success: true,
        requestId,
        message: 'Resume deleted successfully'
      };

    } catch (error) {
      this.updateStats('delete', false);
      
      return {
        success: false,
        error: 'Failed to delete resume',
        code: this.getErrorCode(error),
        requestId
      };
    }
  }

  async sanitizeAllData(file, extractedText, analysisResult, preferences) {
    return {
      fileName: this.sanitizeFileName(file.originalname),
      originalFileName: this.sanitizeFileName(file.originalname),
      fileSize: Math.max(0, parseInt(file.size) || 0),
      mimeType: file.mimetype || 'application/pdf',
      extractedInfo: this.sanitizeExtractedInfo(analysisResult.extractedInfo || {}),
      analysis: this.sanitizeAnalysis(analysisResult),
      preferences: this.sanitizePreferences(preferences),
      statistics: this.sanitizeStatistics(analysisResult.resumeAnalytics || {}, extractedText)
    };
  }

  sanitizeExtractedInfo(extractedInfo) {
    return {
      personalInfo: {
        name: extractedInfo.personalInfo?.name ? 
          validator.escape(String(extractedInfo.personalInfo.name)).substring(0, 100) : null,
        hasEmail: Boolean(extractedInfo.personalInfo?.email),
        hasPhone: Boolean(extractedInfo.personalInfo?.phone),
        hasAddress: Boolean(extractedInfo.personalInfo?.address)
      },
      
      professional: {
        currentJobTitle: extractedInfo.currentJobTitle ? 
          validator.escape(String(extractedInfo.currentJobTitle)).substring(0, 200) : null,
        summary: extractedInfo.professionalSummary ? 
          validator.escape(String(extractedInfo.professionalSummary)).substring(0, 2000) : null,
        experienceLevel: 'unknown',
        totalExperienceYears: 0
      },
      
      skills: {
        technical: (extractedInfo.skills?.technical || []).slice(0, 20).map(skill => ({
          name: validator.escape(String(skill)).substring(0, 100),
          proficiency: 'intermediate'
        })),
        count: (extractedInfo.skills?.technical || []).length
      },
      
      experience: (extractedInfo.experience || []).slice(0, 10).map(exp => ({
        title: exp.title ? validator.escape(String(exp.title)).substring(0, 200) : null,
        company: exp.company ? validator.escape(String(exp.company)).substring(0, 200) : null,
        duration: exp.duration ? validator.escape(String(exp.duration)).substring(0, 100) : null,
        isCurrentRole: Boolean(exp.current)
      })),
      
      education: (extractedInfo.education || []).slice(0, 5).map(edu => ({
        degree: edu.degree ? validator.escape(String(edu.degree)).substring(0, 200) : null,
        institution: edu.institution ? validator.escape(String(edu.institution)).substring(0, 200) : null,
        graduationYear: edu.graduationYear ? parseInt(edu.graduationYear) : null
      }))
    };
  }

  sanitizeAnalysis(analysis) {
    return {
      overallScore: Math.max(0, Math.min(100, Math.round(analysis.score || 0))),
      
      scoringBreakdown: {
        contactInfo: Math.max(0, Math.min(100, Math.round(analysis.contactInfo || 0))),
        workExperience: Math.max(0, Math.min(100, Math.round(analysis.workExperience || 0))),
        education: Math.max(0, Math.min(100, Math.round(analysis.education || 0))),
        skills: Math.max(0, Math.min(100, Math.round(analysis.skills || 0))),
        formatting: Math.max(0, Math.min(100, Math.round(analysis.formatting || 0))),
        atsCompatibility: Math.max(0, Math.min(100, Math.round(analysis.atsCompatibility || 0)))
      },
      
      feedback: {
        roastFeedback: validator.escape(String(analysis.roastFeedback || '')).substring(0, 5000),
        strengths: (analysis.strengths || []).slice(0, 6).map(s => 
          validator.escape(String(s)).substring(0, 300)
        ),
        improvements: (analysis.improvements || []).slice(0, 6).map(imp => 
          validator.escape(String(imp)).substring(0, 300)
        )
      }
    };
  }

  sanitizePreferences(preferences) {
    return {
      roastSettings: {
        level: ['pyar', 'ache', 'dhang'].includes(preferences.roastLevel) ? preferences.roastLevel : 'ache',
        language: ['english', 'hindi', 'hinglish'].includes(preferences.language) ? preferences.language : 'english'
      }
    };
  }

  sanitizeStatistics(analytics, extractedText) {
    return {
      wordCount: Math.max(0, parseInt(analytics.wordCount) || 0),
      pageCount: Math.max(1, parseInt(analytics.pageCount) || 1),
      hasEmail: Boolean(analytics.hasEmail),
      hasPhone: Boolean(analytics.hasPhone),
      hasLinkedIn: Boolean(analytics.hasLinkedIn),
      hasGithub: Boolean(analytics.hasGithub),
      skillsCount: Math.max(0, parseInt(analytics.skillsCount) || 0),
      experienceCount: Math.max(0, parseInt(analytics.experienceCount) || 0),
      educationCount: Math.max(0, parseInt(analytics.educationCount) || 0)
    };
  }

  sanitizeFileName(filename) {
    if (!filename) return 'unknown.pdf';
    
    const sanitized = filename
      .replace(/[<>:"|?*\x00-\x1f]/g, '_')
      .replace(/\.\./g, '_')
      .substring(0, 255);
    
    return validator.escape(sanitized);
  }

  buildAdvancedQuery(filters) {
    const query = { 'status.current': { $ne: 'expired' } };
    
    if (filters.dateFrom || filters.dateTo) {
      query['timestamps.uploadedAt'] = {};
      if (filters.dateFrom) {
        query['timestamps.uploadedAt'].$gte = new Date(filters.dateFrom);
      }
      if (filters.dateTo) {
        const dateTo = new Date(filters.dateTo);
        dateTo.setHours(23, 59, 59, 999);
        query['timestamps.uploadedAt'].$lte = dateTo;
      }
    }
    
    if (filters.minScore !== undefined) {
      query['analysis.overallScore'] = { $gte: parseInt(filters.minScore) };
    }
    if (filters.maxScore !== undefined) {
      query['analysis.overallScore'] = { 
        ...query['analysis.overallScore'], 
        $lte: parseInt(filters.maxScore) 
      };
    }
    
    if (filters.search) {
      const searchRegex = { $regex: filters.search, $options: 'i' };
      query.$or = [
        { 'extractedInfo.personalInfo.name': searchRegex },
        { 'extractedInfo.skills.technical.name': searchRegex },
        { fileName: searchRegex }
      ];
    }
    
    return query;
  }

  buildProjection() {
    return {
      resumeId: 1,
      fileName: 1,
      fileSize: 1,
      mimeType: 1,
      'extractedInfo.personalInfo.name': 1,
      'extractedInfo.skills.technical': 1,
      'analysis.overallScore': 1,
      'analysis.feedback.strengths': 1,
      'analysis.feedback.improvements': 1,
      'preferences': 1,
      'statistics.wordCount': 1,
      'statistics.pageCount': 1,
      'timestamps.uploadedAt': 1
    };
  }

  formatResumeForList(resume) {
    return {
      resumeId: resume.resumeId,
      fileName: resume.fileName,
      fileSize: resume.fileSize,
      formattedFileSize: this.formatFileSize(resume.fileSize),
      mimeType: resume.mimeType,
      displayName: resume.extractedInfo?.personalInfo?.name || 
                  resume.fileName.replace(/\.[^/.]+$/, "") || 'Unknown',
      score: resume.analysis?.overallScore || 0,
      topSkills: (resume.extractedInfo?.skills?.technical || []).slice(0, 5).map(s => s.name),
      strengthsCount: resume.analysis?.feedback?.strengths?.length || 0,
      improvementsCount: resume.analysis?.feedback?.improvements?.length || 0,
      wordCount: resume.statistics?.wordCount || 0,
      pageCount: resume.statistics?.pageCount || 1,
      uploadedAt: resume.timestamps?.uploadedAt,
      formattedUploadDate: new Date(resume.timestamps?.uploadedAt).toLocaleDateString(),
      preferences: resume.preferences
    };
  }

  formatResumeForDetail(resume, options = {}) {
    const formatted = {
      ...resume,
      displayName: resume.extractedInfo?.personalInfo?.name || 
                  resume.fileName.replace(/\.[^/.]+$/, "") || 'Unknown',
      formattedFileSize: this.formatFileSize(resume.fileSize),
      formattedUploadDate: new Date(resume.timestamps?.uploadedAt).toLocaleDateString(),
      formattedUploadDateTime: new Date(resume.timestamps?.uploadedAt).toLocaleString()
    };

    if (!options.includeStatistics) {
      delete formatted.statistics;
    }

    return formatted;
  }

  validateResumeData(resumeData) {
    const requiredFields = ['resumeId', 'fileName', 'extractedInfo', 'analysis'];
    
    for (const field of requiredFields) {
      if (!resumeData[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    if (resumeData.fileSize < 0 || resumeData.fileSize > 10 * 1024 * 1024) {
      throw new Error('Invalid file size');
    }

    if (!this.isValidUUID(resumeData.resumeId)) {
      throw new Error('Invalid resume ID format');
    }
  }

  isValidUUID(uuid) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  updateStats(operation, success) {
    if (success) {
      this.stats[`total${operation.charAt(0).toUpperCase() + operation.slice(1)}s`]++;
    } else {
      this.stats.totalErrors++;
    }
  }

  getErrorCode(error) {
    if (error.name === 'ValidationError') return 'VALIDATION_ERROR';
    if (error.name === 'MongoError') return 'DATABASE_ERROR';
    if (error.message.includes('connection')) return 'CONNECTION_ERROR';
    if (error.message.includes('timeout')) return 'TIMEOUT_ERROR';
    return 'STORAGE_ERROR';
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

module.exports = new ResumeStorageEnhanced();