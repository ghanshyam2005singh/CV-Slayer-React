const Resume = require('../models/Resume');
const { connectDB, getConnectionStatus } = require('../config/database');
const crypto = require('crypto');
const validator = require('validator');
const winston = require('winston');

// Logger setup
const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/storage-service.log' }),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' })
  ]
});

// Only add console logging in development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

class ResumeStorageEnhanced {
  constructor() {
    this.maxBatchSize = 100;
    this.connectionTimeout = 10000;
    this.maxRetries = 3;
    this.retryDelay = 1000;
    
    this.stats = {
      totalSaves: 0,
      totalReads: 0,
      totalDeletes: 0,
      totalErrors: 0,
      totalDataSize: 0,
      averageProcessingTime: 0
    };

    // Initialize cleanup job
    this.initializeCleanup();
    
    logger.info('ResumeStorageEnhanced initialized successfully');
  }

  async ensureConnection() {
    try {
      await connectDB();
      logger.info('Database connection established');
    } catch (error) {
      logger.error('Database connection failed', { error: error.message });
      throw new Error('Database connection failed');
    }
  }

  async saveResumeData(file, extractedText, analysisResult, preferences, metadata = {}) {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    
    try {
      logger.info('Starting resume data save', {
        requestId,
        fileName: file?.originalname,
        fileSize: file?.size,
        hasAnalysis: !!analysisResult
      });

      await this.ensureConnection();

      const resumeId = crypto.randomUUID();
      
      // Enhanced data sanitization with comprehensive structure
      const sanitizedData = await this.sanitizeAllData(
        file, 
        extractedText, 
        analysisResult, 
        preferences,
        metadata
      );

      const resumeData = {
        resumeId,
        fileName: sanitizedData.fileName,
        originalFileName: sanitizedData.originalFileName,
        fileSize: sanitizedData.fileSize,
        mimeType: sanitizedData.mimeType,
        
        // Comprehensive extracted information
        extractedInfo: sanitizedData.extractedInfo,
        
        // Enhanced analysis data
        analysis: sanitizedData.analysis,
        
        // User preferences
        preferences: sanitizedData.preferences,
        
        // Comprehensive statistics
        statistics: sanitizedData.statistics,
        
        // Resume analytics from AI
        resumeAnalytics: sanitizedData.resumeAnalytics,
        
        // Contact validation results
        contactValidation: sanitizedData.contactValidation,
        
        // Security and compliance
        security: {
          clientIPHash: Resume.hashIP(metadata.clientIP || '127.0.0.1'),
          countryCode: metadata.countryCode || 'US',
          userAgent: metadata.userAgent ? validator.escape(metadata.userAgent.substring(0, 500)) : null,
          securityScore: sanitizedData.securityScore || 0,
          suspiciousFlags: sanitizedData.suspiciousFlags || []
        },
        
        // Data retention and compliance
        dataRetention: {
          retentionDays: parseInt(process.env.DATA_RETENTION_DAYS) || 90,
          autoDelete: true,
          gdprConsent: Boolean(metadata.gdprConsent),
          dataProcessingPurpose: 'resume_analysis',
          canBeAnonymized: true
        },
        
        // Status tracking
        status: {
          current: 'analyzed',
          processingSteps: ['uploaded', 'extracted', 'analyzed', 'stored'],
          lastStatusChange: new Date()
        },
        
        // Enhanced timestamps
        timestamps: {
          uploadedAt: new Date(),
          processedAt: new Date(),
          lastAccessedAt: new Date(),
          scheduledDeletionAt: new Date(Date.now() + (parseInt(process.env.DATA_RETENTION_DAYS) || 90) * 24 * 60 * 60 * 1000)
        },
        
        // Processing metadata
        processing: {
          extractionTime: metadata.extractionTime || 0,
          analysisTime: metadata.analysisTime || 0,
          totalProcessingTime: Date.now() - startTime,
          aiModel: metadata.aiModel || 'gemini-1.5-flash',
          analysisVersion: metadata.analysisVersion || '3.0'
        }
      };

      // Validate comprehensive data structure
      await this.validateResumeData(resumeData);

      const resume = new Resume(resumeData);
      await resume.save();

      const processingTime = Date.now() - startTime;
      this.updateStats('save', true, processingTime, JSON.stringify(resumeData).length);

      logger.info('Resume data saved successfully', {
        requestId,
        resumeId,
        processingTime,
        dataSize: JSON.stringify(resumeData).length
      });

      return {
        success: true,
        resumeId,
        requestId,
        message: 'Resume data saved successfully',
        data: {
          resumeId,
          name: sanitizedData.extractedInfo.personalInfo?.name,
          score: sanitizedData.analysis.overallScore,
          uploadedAt: resumeData.timestamps.uploadedAt,
          processingTime,
          extractedDataPoints: this.countExtractedDataPoints(sanitizedData.extractedInfo)
        }
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.updateStats('save', false, processingTime);
      
      logger.error('Failed to save resume data', {
        requestId,
        error: error.message,
        processingTime,
        stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
      });
      
      return {
        success: false,
        error: 'Failed to save resume data',
        code: this.getErrorCode(error),
        requestId,
        details: process.env.NODE_ENV !== 'production' ? error.message : undefined
      };
    }
  }

  async getAllResumes(options = {}) {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    
    try {
      logger.info('Fetching all resumes', { requestId, options });
      
      await this.ensureConnection();

      const {
        page = 1,
        limit = 20,
        sortBy = 'timestamps.uploadedAt',
        sortOrder = 'desc',
        filters = {},
        includeAnalytics = false
      } = options;

      const validatedPage = Math.max(1, parseInt(page));
      const validatedLimit = Math.min(Math.max(1, parseInt(limit)), this.maxBatchSize);
      
      const skip = (validatedPage - 1) * validatedLimit;
      const sortOptions = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
      
      const query = this.buildAdvancedQuery(filters);
      const projection = this.buildProjection(includeAnalytics);

      const [resumes, total] = await Promise.all([
        Resume.find(query)
          .select(projection)
          .sort(sortOptions)
          .skip(skip)
          .limit(validatedLimit)
          .lean(),
        Resume.countDocuments(query)
      ]);

      const formattedResumes = resumes.map(resume => this.formatResumeForList(resume, includeAnalytics));

      const processingTime = Date.now() - startTime;
      this.updateStats('read', true, processingTime);

      logger.info('Resumes fetched successfully', {
        requestId,
        count: resumes.length,
        total,
        processingTime
      });

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
          sorting: { sortBy, sortOrder },
          summary: this.generateResumesSummary(formattedResumes)
        },
        metadata: {
          processingTime,
          timestamp: new Date().toISOString()
        }
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.updateStats('read', false, processingTime);
      
      logger.error('Failed to fetch resumes', {
        requestId,
        error: error.message,
        processingTime
      });
      
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
      logger.info('Fetching resume by ID', { requestId, resumeId });
      
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

      const { 
        includeFullAnalysis = true, 
        includeStatistics = true,
        includeExtractedInfo = true,
        updateLastAccessed = true
      } = options;

      // Build projection based on options
      let projection = '-__v';
      if (!includeFullAnalysis) {
        projection += ' -analysis.feedback.roastFeedback';
      }
      if (!includeStatistics) {
        projection += ' -statistics -resumeAnalytics';
      }
      if (!includeExtractedInfo) {
        projection += ' -extractedInfo';
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

      // Update last accessed timestamp if requested
      if (updateLastAccessed) {
        await Resume.updateOne(
          { resumeId },
          { 'timestamps.lastAccessedAt': new Date() }
        );
      }

      const formattedResume = this.formatResumeForDetail(resume, {
        includeStatistics,
        includeFullAnalysis,
        includeExtractedInfo
      });

      const processingTime = Date.now() - startTime;
      this.updateStats('read', true, processingTime);

      logger.info('Resume fetched successfully', {
        requestId,
        resumeId,
        processingTime
      });

      return {
        success: true,
        requestId,
        data: formattedResume,
        metadata: {
          processingTime,
          timestamp: new Date().toISOString(),
          lastAccessed: updateLastAccessed
        }
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.updateStats('read', false, processingTime);
      
      logger.error('Failed to fetch resume', {
        requestId,
        resumeId,
        error: error.message,
        processingTime
      });
      
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
      logger.info('Deleting resume', { requestId, resumeId });
      
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

      const { hardDelete = false, reason = 'user_request' } = options;

      let result;
      if (hardDelete) {
        result = await Resume.deleteOne({ resumeId });
      } else {
        // Soft delete - mark as expired
        result = await Resume.updateOne(
          { resumeId },
          { 
            'status.current': 'expired',
            'status.lastStatusChange': new Date(),
            'dataRetention.deletionReason': reason,
            'timestamps.deletedAt': new Date()
          }
        );
      }
      
      if (result.deletedCount === 0 && result.modifiedCount === 0) {
        return {
          success: false,
          error: 'Resume not found',
          code: 'NOT_FOUND',
          requestId
        };
      }

      const processingTime = Date.now() - startTime;
      this.updateStats('delete', true, processingTime);

      logger.info('Resume deleted successfully', {
        requestId,
        resumeId,
        hardDelete,
        reason,
        processingTime
      });

      return {
        success: true,
        requestId,
        message: `Resume ${hardDelete ? 'permanently deleted' : 'marked for deletion'} successfully`,
        metadata: {
          processingTime,
          deletionType: hardDelete ? 'hard' : 'soft',
          reason
        }
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.updateStats('delete', false, processingTime);
      
      logger.error('Failed to delete resume', {
        requestId,
        resumeId,
        error: error.message,
        processingTime
      });
      
      return {
        success: false,
        error: 'Failed to delete resume',
        code: this.getErrorCode(error),
        requestId
      };
    }
  }

  // Enhanced data sanitization for comprehensive AI response
  async sanitizeAllData(file, extractedText, analysisResult, preferences, metadata = {}) {
    logger.info('Sanitizing comprehensive data');
    
    return {
      fileName: this.sanitizeFileName(file.originalname),
      originalFileName: this.sanitizeFileName(file.originalname),
      fileSize: Math.max(0, parseInt(file.size) || 0),
      mimeType: validator.escape(file.mimetype || 'application/pdf'),
      
      // Comprehensive extracted information
      extractedInfo: this.sanitizeExtractedInfo(analysisResult.extractedInfo || {}),
      
      // Enhanced analysis data
      analysis: this.sanitizeAnalysis(analysisResult),
      
      // User preferences
      preferences: this.sanitizePreferences(preferences),
      
      // Enhanced statistics
      statistics: this.sanitizeStatistics(analysisResult.resumeAnalytics || {}, extractedText),
      
      // Resume analytics from AI
      resumeAnalytics: this.sanitizeResumeAnalytics(analysisResult.resumeAnalytics || {}),
      
      // Contact validation
      contactValidation: this.sanitizeContactValidation(analysisResult.contactValidation || {}),
      
      // Security data
      securityScore: metadata.securityScore || 0,
      suspiciousFlags: metadata.suspiciousFlags || []
    };
  }

  // Comprehensive extracted info sanitization matching AI response structure
  sanitizeExtractedInfo(extractedInfo) {
    return {
      personalInfo: {
        name: extractedInfo.personalInfo?.name ? 
          validator.escape(String(extractedInfo.personalInfo.name)).substring(0, 100) : null,
        email: extractedInfo.personalInfo?.email ? 
          validator.normalizeEmail(String(extractedInfo.personalInfo.email)) || null : null,
        phone: extractedInfo.personalInfo?.phone ? 
          validator.escape(String(extractedInfo.personalInfo.phone)).substring(0, 25) : null,
        address: {
          full: extractedInfo.personalInfo?.address?.full ? 
            validator.escape(String(extractedInfo.personalInfo.address.full)).substring(0, 300) : null,
          city: extractedInfo.personalInfo?.address?.city ? 
            validator.escape(String(extractedInfo.personalInfo.address.city)).substring(0, 100) : null,
          state: extractedInfo.personalInfo?.address?.state ? 
            validator.escape(String(extractedInfo.personalInfo.address.state)).substring(0, 100) : null,
          country: extractedInfo.personalInfo?.address?.country ? 
            validator.escape(String(extractedInfo.personalInfo.address.country)).substring(0, 100) : null,
          zipCode: extractedInfo.personalInfo?.address?.zipCode ? 
            validator.escape(String(extractedInfo.personalInfo.address.zipCode)).substring(0, 20) : null
        },
        socialProfiles: {
          linkedin: extractedInfo.personalInfo?.socialProfiles?.linkedin ? 
            validator.escape(String(extractedInfo.personalInfo.socialProfiles.linkedin)).substring(0, 200) : null,
          github: extractedInfo.personalInfo?.socialProfiles?.github ? 
            validator.escape(String(extractedInfo.personalInfo.socialProfiles.github)).substring(0, 200) : null,
          portfolio: extractedInfo.personalInfo?.socialProfiles?.portfolio ? 
            validator.escape(String(extractedInfo.personalInfo.socialProfiles.portfolio)).substring(0, 200) : null,
          website: extractedInfo.personalInfo?.socialProfiles?.website ? 
            validator.escape(String(extractedInfo.personalInfo.socialProfiles.website)).substring(0, 200) : null,
          twitter: extractedInfo.personalInfo?.socialProfiles?.twitter ? 
            validator.escape(String(extractedInfo.personalInfo.socialProfiles.twitter)).substring(0, 200) : null
        }
      },
      
      professionalSummary: extractedInfo.professionalSummary ? 
        validator.escape(String(extractedInfo.professionalSummary)).substring(0, 1000) : null,
      
      skills: {
        technical: (extractedInfo.skills?.technical || []).slice(0, 50).map(skill => 
          validator.escape(String(skill)).substring(0, 50)
        ),
        soft: (extractedInfo.skills?.soft || []).slice(0, 20).map(skill => 
          validator.escape(String(skill)).substring(0, 50)
        ),
        languages: (extractedInfo.skills?.languages || []).slice(0, 10).map(lang => 
          validator.escape(String(lang)).substring(0, 100)
        ),
        tools: (extractedInfo.skills?.tools || []).slice(0, 30).map(tool => 
          validator.escape(String(tool)).substring(0, 50)
        ),
        frameworks: (extractedInfo.skills?.frameworks || []).slice(0, 30).map(framework => 
          validator.escape(String(framework)).substring(0, 50)
        )
      },
      
      experience: Array.isArray(extractedInfo.experience || []).slice(0, 15).map(exp => ({
        title: exp.title ? validator.escape(String(exp.title)).substring(0, 150) : null,
        company: exp.company ? validator.escape(String(exp.company)).substring(0, 150) : null,
        location: exp.location ? validator.escape(String(exp.location)).substring(0, 100) : null,
        startDate: exp.startDate ? validator.escape(String(exp.startDate)).substring(0, 50) : null,
        endDate: exp.endDate ? validator.escape(String(exp.endDate)).substring(0, 50) : null,
        duration: exp.duration ? validator.escape(String(exp.duration)).substring(0, 50) : null,
        description: exp.description ? validator.escape(String(exp.description)).substring(0, 1000) : null,
        achievements: (exp.achievements || []).slice(0, 10).map(achievement => 
          validator.escape(String(achievement)).substring(0, 300)
        ),
        technologies: (exp.technologies || []).slice(0, 20).map(tech => 
          validator.escape(String(tech)).substring(0, 50)
        ),
        isCurrentRole: Boolean(exp.endDate === 'Present' || exp.endDate === 'present' || exp.endDate === 'Current')
      })),
      
      education: (extractedInfo.education || []).slice(0, 10).map(edu => ({
        degree: edu.degree ? validator.escape(String(edu.degree)).substring(0, 150) : null,
        field: edu.field ? validator.escape(String(edu.field)).substring(0, 150) : null,
        institution: edu.institution ? validator.escape(String(edu.institution)).substring(0, 200) : null,
        location: edu.location ? validator.escape(String(edu.location)).substring(0, 100) : null,
        graduationYear: edu.graduationYear ? validator.escape(String(edu.graduationYear)).substring(0, 10) : null,
        gpa: edu.gpa ? validator.escape(String(edu.gpa)).substring(0, 10) : null,
        honors: (edu.honors || []).slice(0, 5).map(honor => 
          validator.escape(String(honor)).substring(0, 200)
        ),
        coursework: (edu.coursework || []).slice(0, 10).map(course => 
          validator.escape(String(course)).substring(0, 150)
        )
      })),
      
      certifications: (extractedInfo.certifications || []).slice(0, 20).map(cert => ({
        name: cert.name ? validator.escape(String(cert.name)).substring(0, 200) : null,
        issuer: cert.issuer ? validator.escape(String(cert.issuer)).substring(0, 150) : null,
        dateObtained: cert.dateObtained ? validator.escape(String(cert.dateObtained)).substring(0, 50) : null,
        expirationDate: cert.expirationDate ? validator.escape(String(cert.expirationDate)).substring(0, 50) : null,
        credentialId: cert.credentialId ? validator.escape(String(cert.credentialId)).substring(0, 100) : null,
        url: cert.url ? validator.escape(String(cert.url)).substring(0, 300) : null
      })),
      
      projects: (extractedInfo.projects || []).slice(0, 15).map(proj => ({
        name: proj.name ? validator.escape(String(proj.name)).substring(0, 150) : null,
        description: proj.description ? validator.escape(String(proj.description)).substring(0, 800) : null,
        role: proj.role ? validator.escape(String(proj.role)).substring(0, 150) : null,
        duration: proj.duration ? validator.escape(String(proj.duration)).substring(0, 50) : null,
        technologies: (proj.technologies || []).slice(0, 20).map(tech => 
          validator.escape(String(tech)).substring(0, 50)
        ),
        achievements: (proj.achievements || []).slice(0, 5).map(achievement => 
          validator.escape(String(achievement)).substring(0, 300)
        ),
        url: proj.url ? validator.escape(String(proj.url)).substring(0, 300) : null,
        github: proj.github ? validator.escape(String(proj.github)).substring(0, 300) : null
      })),
      
      awards: (extractedInfo.awards || []).slice(0, 10).map(award => ({
        title: award.title ? validator.escape(String(award.title)).substring(0, 200) : null,
        issuer: award.issuer ? validator.escape(String(award.issuer)).substring(0, 150) : null,
        date: award.date ? validator.escape(String(award.date)).substring(0, 50) : null,
        description: award.description ? validator.escape(String(award.description)).substring(0, 500) : null
      })),
      
      publications: (extractedInfo.publications || []).slice(0, 10).map(pub => ({
        title: pub.title ? validator.escape(String(pub.title)).substring(0, 300) : null,
        type: pub.type ? validator.escape(String(pub.type)).substring(0, 100) : null,
        date: pub.date ? validator.escape(String(pub.date)).substring(0, 50) : null,
        description: pub.description ? validator.escape(String(pub.description)).substring(0, 500) : null,
        url: pub.url ? validator.escape(String(pub.url)).substring(0, 300) : null
      })),
      
      volunteerWork: (extractedInfo.volunteerWork || []).slice(0, 10).map(vol => ({
        organization: vol.organization ? validator.escape(String(vol.organization)).substring(0, 200) : null,
        role: vol.role ? validator.escape(String(vol.role)).substring(0, 150) : null,
        duration: vol.duration ? validator.escape(String(vol.duration)).substring(0, 50) : null,
        description: vol.description ? validator.escape(String(vol.description)).substring(0, 500) : null
      })),
      
      interests: (extractedInfo.interests || []).slice(0, 20).map(interest => 
        validator.escape(String(interest)).substring(0, 100)
      ),
      
      references: extractedInfo.references ? 
        validator.escape(String(extractedInfo.references)).substring(0, 200) : null
    };
  }

  // Enhanced analysis sanitization
  sanitizeAnalysis(analysis) {
    return {
      overallScore: Math.max(0, Math.min(100, Math.round(analysis.score || 0))),
      
      scoringBreakdown: {
        contactInfo: this.calculateContactScore(analysis.extractedInfo),
        workExperience: this.calculateExperienceScore(analysis.extractedInfo),
        education: this.calculateEducationScore(analysis.extractedInfo),
        skills: this.calculateSkillsScore(analysis.extractedInfo),
        formatting: Math.max(0, Math.min(100, Math.round(analysis.formatting || 70))),
        atsCompatibility: analysis.resumeAnalytics?.atsCompatibility === 'High' ? 85 : 
                         analysis.resumeAnalytics?.atsCompatibility === 'Medium' ? 65 : 45
      },
      
      feedback: {
        roastFeedback: validator.escape(String(analysis.roastFeedback || '')).substring(0, 5000),
        strengths: (analysis.strengths || []).slice(0, 6).map(s => 
          validator.escape(String(s)).substring(0, 300)
        ),
        weaknesses: (analysis.weaknesses || []).slice(0, 5).map(w => 
          validator.escape(String(w)).substring(0, 300)
        ),
        improvements: (analysis.improvements || []).slice(0, 6).map(imp => ({
          priority: ['high', 'medium', 'low'].includes(imp.priority) ? imp.priority : 'medium',
          title: validator.escape(String(imp.title || '')).substring(0, 100),
          description: validator.escape(String(imp.description || '')).substring(0, 400),
          example: validator.escape(String(imp.example || '')).substring(0, 250)
        }))
      }
    };
  }

  sanitizePreferences(preferences) {
    return {
      roastSettings: {
        level: ['pyar', 'ache', 'dhang'].includes(preferences.roastLevel) ? preferences.roastLevel : 'ache',
        type: ['funny', 'serious', 'sarcastic', 'motivational'].includes(preferences.roastType) ? preferences.roastType : 'serious',
        language: ['english', 'hindi', 'hinglish'].includes(preferences.language) ? preferences.language : 'english',
        gender: ['male', 'female', 'other'].includes(preferences.gender) ? preferences.gender : 'other'
      }
    };
  }

  sanitizeStatistics(analytics, extractedText) {
    return {
      wordCount: Math.max(0, parseInt(analytics.wordCount) || extractedText?.split(' ').length || 0),
      pageCount: Math.max(1, parseInt(analytics.pageCount) || 1),
      sectionCount: Math.max(0, parseInt(analytics.sectionCount) || 0),
      bulletPointCount: Math.max(0, parseInt(analytics.bulletPointCount) || 0),
      quantifiableAchievements: Math.max(0, parseInt(analytics.quantifiableAchievements) || 0),
      actionVerbsUsed: Math.max(0, parseInt(analytics.actionVerbsUsed) || 0),
      industryKeywords: (analytics.industryKeywords || []).slice(0, 50),
      readabilityScore: Math.max(0, Math.min(100, parseInt(analytics.readabilityScore) || 0)),
      atsCompatibility: ['High', 'Medium', 'Low'].includes(analytics.atsCompatibility) ? 
        analytics.atsCompatibility : 'Medium',
      missingElements: (analytics.missingElements || []).slice(0, 10),
      strongElements: (analytics.strongElements || []).slice(0, 10)
    };
  }

  sanitizeResumeAnalytics(analytics) {
    return {
      wordCount: Math.max(0, parseInt(analytics.wordCount) || 0),
      pageCount: Math.max(1, parseInt(analytics.pageCount) || 1),
      sectionCount: Math.max(0, parseInt(analytics.sectionCount) || 0),
      bulletPointCount: Math.max(0, parseInt(analytics.bulletPointCount) || 0),
      quantifiableAchievements: Math.max(0, parseInt(analytics.quantifiableAchievements) || 0),
      actionVerbsUsed: Math.max(0, parseInt(analytics.actionVerbsUsed) || 0),
      industryKeywords: (analytics.industryKeywords || []).slice(0, 50).map(keyword => 
        validator.escape(String(keyword)).substring(0, 50)
      ),
      readabilityScore: Math.max(0, Math.min(100, parseInt(analytics.readabilityScore) || 0)),
      atsCompatibility: ['High', 'Medium', 'Low'].includes(analytics.atsCompatibility) ? 
        analytics.atsCompatibility : 'Medium',
      missingElements: (analytics.missingElements || []).slice(0, 10).map(element => 
        validator.escape(String(element)).substring(0, 100)
      ),
      strongElements: (analytics.strongElements || []).slice(0, 10).map(element => 
        validator.escape(String(element)).substring(0, 100)
      )
    };
  }

  sanitizeContactValidation(validation) {
    return {
      hasEmail: Boolean(validation.hasEmail),
      hasPhone: Boolean(validation.hasPhone),
      hasLinkedIn: Boolean(validation.hasLinkedIn),
      hasAddress: Boolean(validation.hasAddress),
      emailValid: Boolean(validation.emailValid),
      phoneValid: Boolean(validation.phoneValid),
      linkedInValid: Boolean(validation.linkedInValid)
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

  // Helper methods for scoring
  calculateContactScore(extractedInfo) {
    let score = 0;
    if (extractedInfo?.personalInfo?.name) score += 25;
    if (extractedInfo?.personalInfo?.email) score += 25;
    if (extractedInfo?.personalInfo?.phone) score += 25;
    if (extractedInfo?.personalInfo?.socialProfiles?.linkedin) score += 25;
    return Math.min(100, score);
  }

  calculateExperienceScore(extractedInfo) {
    const experiences = extractedInfo?.experience || [];
    if (experiences.length === 0) return 20;
    if (experiences.length === 1) return 40;
    if (experiences.length === 2) return 60;
    if (experiences.length >= 3) return 80;
    return Math.min(100, experiences.length * 20);
  }

  calculateEducationScore(extractedInfo) {
    const education = extractedInfo?.education || [];
    return education.length > 0 ? Math.min(100, 60 + (education.length * 20)) : 30;
  }

  calculateSkillsScore(extractedInfo) {
    const technicalSkills = extractedInfo?.skills?.technical || [];
    const softSkills = extractedInfo?.skills?.soft || [];
    const totalSkills = technicalSkills.length + softSkills.length;
    return Math.min(100, Math.max(20, totalSkills * 5));
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

    if (filters.roastLevel) {
      query['preferences.roastSettings.level'] = filters.roastLevel;
    }

    if (filters.language) {
      query['preferences.roastSettings.language'] = filters.language;
    }

    if (filters.hasEmail !== undefined) {
      query['extractedInfo.personalInfo.email'] = filters.hasEmail ? { $ne: null } : null;
    }

    if (filters.hasPhone !== undefined) {
      query['extractedInfo.personalInfo.phone'] = filters.hasPhone ? { $ne: null } : null;
    }

    if (filters.experienceLevel) {
      const expCount = parseInt(filters.experienceLevel);
      query['extractedInfo.experience'] = { $size: { $gte: expCount } };
    }
    
    if (filters.search) {
      const searchRegex = { $regex: filters.search, $options: 'i' };
      query.$or = [
        { 'extractedInfo.personalInfo.name': searchRegex },
        { 'extractedInfo.skills.technical': searchRegex },
        { 'extractedInfo.experience.title': searchRegex },
        { 'extractedInfo.experience.company': searchRegex },
        { fileName: searchRegex }
      ];
    }
    
    return query;
  }

  buildProjection(includeAnalytics = false) {
    let projection = {
      resumeId: 1,
      fileName: 1,
      fileSize: 1,
      mimeType: 1,
      'extractedInfo.personalInfo.name': 1,
      'extractedInfo.personalInfo.email': 1,
      'extractedInfo.personalInfo.phone': 1,
      'extractedInfo.skills.technical': 1,
      'extractedInfo.skills.soft': 1,
      'extractedInfo.experience': 1,
      'extractedInfo.education': 1,
      'analysis.overallScore': 1,
      'analysis.scoringBreakdown': 1,
      'analysis.feedback.strengths': 1,
      'analysis.feedback.improvements': 1,
      'preferences': 1,
      'statistics.wordCount': 1,
      'statistics.pageCount': 1,
      'timestamps.uploadedAt': 1,
      'processing.totalProcessingTime': 1
    };

    if (includeAnalytics) {
      projection.resumeAnalytics = 1;
      projection.contactValidation = 1;
    }

    return projection;
  }

  formatResumeForList(resume, includeAnalytics = false) {
    const formatted = {
      resumeId: resume.resumeId,
      fileName: resume.fileName,
      fileSize: resume.fileSize,
      formattedFileSize: this.formatFileSize(resume.fileSize),
      mimeType: resume.mimeType,
      displayName: resume.extractedInfo?.personalInfo?.name || 
                  resume.fileName.replace(/\.[^/.]+$/, "") || 'Unknown',
      score: resume.analysis?.overallScore || 0,
      scoringBreakdown: resume.analysis?.scoringBreakdown || {},
      
      // Enhanced personal info
      hasEmail: Boolean(resume.extractedInfo?.personalInfo?.email),
      hasPhone: Boolean(resume.extractedInfo?.personalInfo?.phone),
      hasLinkedIn: Boolean(resume.extractedInfo?.personalInfo?.socialProfiles?.linkedin),
      
      // Skills summary
      topTechnicalSkills: (resume.extractedInfo?.skills?.technical || []).slice(0, 5),
      topSoftSkills: (resume.extractedInfo?.skills?.soft || []).slice(0, 3),
      totalSkillsCount: (resume.extractedInfo?.skills?.technical?.length || 0) + 
                       (resume.extractedInfo?.skills?.soft?.length || 0),
      
      // Experience summary
      currentJobTitle: resume.extractedInfo?.experience?.[0]?.title || null,
      totalExperience: resume.extractedInfo?.experience?.length || 0,
      
      // Education summary
      highestEducation: resume.extractedInfo?.education?.[0]?.degree || null,
      educationCount: resume.extractedInfo?.education?.length || 0,
      
      // Feedback summary
      strengthsCount: resume.analysis?.feedback?.strengths?.length || 0,
      improvementsCount: resume.analysis?.feedback?.improvements?.length || 0,
      
      // Statistics
      wordCount: resume.statistics?.wordCount || 0,
      pageCount: resume.statistics?.pageCount || 1,
      
      // Timestamps
      uploadedAt: resume.timestamps?.uploadedAt,
      formattedUploadDate: new Date(resume.timestamps?.uploadedAt).toLocaleDateString(),
      
      // Preferences
      preferences: resume.preferences,
      
      // Processing info
      processingTime: resume.processing?.totalProcessingTime || 0
    };

    if (includeAnalytics) {
      formatted.analytics = resume.resumeAnalytics;
      formatted.contactValidation = resume.contactValidation;
    }

    return formatted;
  }

  formatResumeForDetail(resume, options = {}) {
    const formatted = {
      ...resume,
      displayName: resume.extractedInfo?.personalInfo?.name || 
                  resume.fileName.replace(/\.[^/.]+$/, "") || 'Unknown',
      formattedFileSize: this.formatFileSize(resume.fileSize),
      formattedUploadDate: new Date(resume.timestamps?.uploadedAt).toLocaleDateString(),
      formattedUploadDateTime: new Date(resume.timestamps?.uploadedAt).toLocaleString(),
      
      // Enhanced summaries
      dataCompleteness: this.calculateDataCompleteness(resume.extractedInfo),
      extractionSummary: this.generateExtractionSummary(resume.extractedInfo),
      recommendationSummary: this.generateRecommendationSummary(resume.analysis)
    };

    if (!options.includeStatistics) {
      delete formatted.statistics;
      delete formatted.resumeAnalytics;
    }

    if (!options.includeExtractedInfo) {
      delete formatted.extractedInfo;
    }

    return formatted;
  }

  generateResumesSummary(resumes) {
    if (!resumes.length) return {};

    const totalScore = resumes.reduce((sum, r) => sum + r.score, 0);
    const averageScore = Math.round(totalScore / resumes.length);
    
    const scoreDistribution = {
      excellent: resumes.filter(r => r.score >= 80).length,
      good: resumes.filter(r => r.score >= 60 && r.score < 80).length,
      average: resumes.filter(r => r.score >= 40 && r.score < 60).length,
      poor: resumes.filter(r => r.score < 40).length
    };

    const languages = {};
    const roastLevels = {};
    
    resumes.forEach(r => {
      const lang = r.preferences?.roastSettings?.language || 'english';
      const level = r.preferences?.roastSettings?.level || 'ache';
      languages[lang] = (languages[lang] || 0) + 1;
      roastLevels[level] = (roastLevels[level] || 0) + 1;
    });

    return {
      totalResumes: resumes.length,
      averageScore,
      scoreDistribution,
      languageDistribution: languages,
      roastLevelDistribution: roastLevels,
      averageWordCount: Math.round(resumes.reduce((sum, r) => sum + r.wordCount, 0) / resumes.length),
      completenessMetrics: {
        withEmail: resumes.filter(r => r.hasEmail).length,
        withPhone: resumes.filter(r => r.hasPhone).length,
        withLinkedIn: resumes.filter(r => r.hasLinkedIn).length
      }
    };
  }

  calculateDataCompleteness(extractedInfo) {
    let completeness = 0;
    let totalFields = 0;

    // Personal info completeness (30%)
    const personalFields = ['name', 'email', 'phone'];
    personalFields.forEach(field => {
      totalFields++;
      if (extractedInfo?.personalInfo?.[field]) completeness++;
    });

    // Social profiles (10%)
    const socialFields = ['linkedin', 'github', 'portfolio'];
    socialFields.forEach(field => {
      totalFields++;
      if (extractedInfo?.personalInfo?.socialProfiles?.[field]) completeness++;
    });

    // Professional info (30%)
    if (extractedInfo?.professionalSummary) completeness++;
    totalFields++;
    
    if (extractedInfo?.experience?.length > 0) completeness++;
    totalFields++;
    
    if (extractedInfo?.skills?.technical?.length > 0) completeness++;
    totalFields++;

    // Education (20%)
    if (extractedInfo?.education?.length > 0) completeness++;
    totalFields++;

    // Additional sections (10%)
    if (extractedInfo?.certifications?.length > 0) completeness++;
    totalFields++;
    
    if (extractedInfo?.projects?.length > 0) completeness++;
    totalFields++;

    return Math.round((completeness / totalFields) * 100);
  }

  generateExtractionSummary(extractedInfo) {
    return {
      personalInfoComplete: Boolean(extractedInfo?.personalInfo?.name && 
                                   extractedInfo?.personalInfo?.email),
      skillsExtracted: (extractedInfo?.skills?.technical?.length || 0) + 
                      (extractedInfo?.skills?.soft?.length || 0),
      experienceEntries: extractedInfo?.experience?.length || 0,
      educationEntries: extractedInfo?.education?.length || 0,
      certificationsFound: extractedInfo?.certifications?.length || 0,
      projectsFound: extractedInfo?.projects?.length || 0,
      socialProfilesFound: Object.values(extractedInfo?.personalInfo?.socialProfiles || {})
                          .filter(Boolean).length
    };
  }

  generateRecommendationSummary(analysis) {
    const improvements = analysis?.feedback?.improvements || [];
    const highPriority = improvements.filter(imp => imp.priority === 'high').length;
    const mediumPriority = improvements.filter(imp => imp.priority === 'medium').length;
    const lowPriority = improvements.filter(imp => imp.priority === 'low').length;

    return {
      totalRecommendations: improvements.length,
      highPriorityCount: highPriority,
      mediumPriorityCount: mediumPriority,
      lowPriorityCount: lowPriority,
      strengthsIdentified: analysis?.feedback?.strengths?.length || 0,
      overallRating: analysis?.overallScore >= 80 ? 'Excellent' :
                    analysis?.overallScore >= 60 ? 'Good' :
                    analysis?.overallScore >= 40 ? 'Average' : 'Needs Improvement'
    };
  }

  countExtractedDataPoints(extractedInfo) {
    let count = 0;
    
    // Count personal info fields
    if (extractedInfo?.personalInfo?.name) count++;
    if (extractedInfo?.personalInfo?.email) count++;
    if (extractedInfo?.personalInfo?.phone) count++;
    
    // Count social profiles
    count += Object.values(extractedInfo?.personalInfo?.socialProfiles || {}).filter(Boolean).length;
    
    // Count skills
    count += (extractedInfo?.skills?.technical?.length || 0);
    count += (extractedInfo?.skills?.soft?.length || 0);
    
    // Count experience entries
    count += (extractedInfo?.experience?.length || 0);
    
    // Count education entries
    count += (extractedInfo?.education?.length || 0);
    
    // Count other sections
    count += (extractedInfo?.certifications?.length || 0);
    count += (extractedInfo?.projects?.length || 0);
    count += (extractedInfo?.awards?.length || 0);
    count += (extractedInfo?.publications?.length || 0);
    count += (extractedInfo?.volunteerWork?.length || 0);

    return count;
  }

  // Enhanced validation for comprehensive data
  async validateResumeData(resumeData) {
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

    // Validate score range
    if (resumeData.analysis.overallScore < 0 || resumeData.analysis.overallScore > 100) {
      throw new Error('Invalid analysis score');
    }

    // Validate required analysis fields
    if (!resumeData.analysis.feedback || !resumeData.analysis.feedback.roastFeedback) {
      throw new Error('Missing analysis feedback');
    }

    logger.info('Resume data validation successful', {
      resumeId: resumeData.resumeId,
      score: resumeData.analysis.overallScore,
      dataPoints: this.countExtractedDataPoints(resumeData.extractedInfo)
    });
  }

  // Initialize cleanup for expired resumes
  initializeCleanup() {
    // Run cleanup every 24 hours
    setInterval(async () => {
      try {
        await this.cleanupExpiredResumes();
      } catch (error) {
        logger.error('Cleanup job failed', { error: error.message });
      }
    }, 24 * 60 * 60 * 1000);

    logger.info('Cleanup job initialized');
  }

  async cleanupExpiredResumes() {
    try {
      await this.ensureConnection();

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - (parseInt(process.env.DATA_RETENTION_DAYS) || 90));

      const result = await Resume.deleteMany({
        $or: [
          { 'timestamps.scheduledDeletionAt': { $lte: new Date() } },
          { 'timestamps.uploadedAt': { $lte: cutoffDate } },
          { 'status.current': 'expired' }
        ]
      });

      if (result.deletedCount > 0) {
        logger.info('Cleanup completed', {
          deletedCount: result.deletedCount,
          cutoffDate
        });
      }

      return result.deletedCount;
    } catch (error) {
      logger.error('Cleanup failed', { error: error.message });
      throw error;
    }
  }

  isValidUUID(uuid) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  updateStats(operation, success, processingTime = 0, dataSize = 0) {
    if (success) {
      this.stats[`total${operation.charAt(0).toUpperCase() + operation.slice(1)}s`]++;
      if (operation === 'save') {
        this.stats.totalDataSize += dataSize;
      }
    } else {
      this.stats.totalErrors++;
    }

    // Update average processing time
    const totalOps = this.stats.totalSaves + this.stats.totalReads + this.stats.totalDeletes;
    if (totalOps > 0) {
      this.stats.averageProcessingTime = 
        (this.stats.averageProcessingTime * (totalOps - 1) + processingTime) / totalOps;
    }
  }

  getErrorCode(error) {
    if (error.name === 'ValidationError') return 'VALIDATION_ERROR';
    if (error.name === 'MongoError') return 'DATABASE_ERROR';
    if (error.name === 'MongoServerError') return 'DATABASE_ERROR';
    if (error.message.includes('connection')) return 'CONNECTION_ERROR';
    if (error.message.includes('timeout')) return 'TIMEOUT_ERROR';
    if (error.code === 11000) return 'DUPLICATE_ERROR';
    return 'STORAGE_ERROR';
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // Get service health and statistics
  getServiceHealth() {
    const totalOps = this.stats.totalSaves + this.stats.totalReads + this.stats.totalDeletes;
    const errorRate = totalOps > 0 ? (this.stats.totalErrors / totalOps) * 100 : 0;

    return {
      healthy: errorRate < 10, // Consider healthy if error rate < 10%
      timestamp: new Date().toISOString(),
      statistics: {
        ...this.stats,
        errorRate: parseFloat(errorRate.toFixed(2)),
        totalOperations: totalOps
      },
      database: {
        connected: getConnectionStatus(),
        connectionTimeout: this.connectionTimeout
      },
      configuration: {
        maxBatchSize: this.maxBatchSize,
        maxRetries: this.maxRetries,
        retryDelay: this.retryDelay
      }
    };
  }
}

module.exports = new ResumeStorageEnhanced();