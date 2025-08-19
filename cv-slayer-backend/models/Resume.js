const mongoose = require('mongoose');
const validator = require('validator');
const crypto = require('crypto');
const winston = require('winston');

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

// Production-optimized Resume Schema
const resumeSchema = new mongoose.Schema({
  // Unique identifier with enhanced security
  resumeId: { 
    type: String, 
    required: [true, 'Resume ID is required'], 
    unique: true,
    index: true,
    validate: {
      validator: function(v) {
        return /^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[1-5][a-fA-F0-9]{3}-[89abAB][a-fA-F0-9]{3}-[a-fA-F0-9]{12}$/.test(v);
      },
      message: 'Invalid UUID format'
    }
  },
  
  // Secure file information
  fileInfo: {
    fileName: { 
      type: String, 
      required: true,
      maxlength: [255, 'File name too long'],
      trim: true,
      validate: {
        validator: function(v) {
          // Enhanced security validation for filenames
          return /^[a-zA-Z0-9._\-\s()]+\.(pdf|doc|docx)$/i.test(v) && 
                 !v.includes('..') && 
                 !v.includes('/') && 
                 !v.includes('\\') &&
                 !v.includes('<') &&
                 !v.includes('>') &&
                 !v.includes('|') &&
                 !v.includes('*') &&
                 !v.includes('?');
        },
        message: 'Invalid or potentially unsafe filename'
      }
    },
    originalFileName: {
      type: String,
      required: true,
      maxlength: [255, 'Original file name too long'],
      trim: true
    },
    fileSize: { 
      type: Number, 
      required: true,
      min: [1, 'File size must be positive'],
      max: [10485760, 'File too large'] // 10MB max for production
    },
    mimeType: { 
      type: String, 
      required: true,
      enum: [
        'application/pdf', 
        'application/msword', 
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ]
    },
    fileHash: {
      type: String,
      required: true,
      validate: {
        validator: function(v) {
          return /^[a-fA-F0-9]{64}$/.test(v); // SHA-256 hash
        },
        message: 'Invalid file hash'
      }
    }
  },
  
  // Anonymized extracted information (NO PII stored)
  extractedInfo: {
    // Basic info (completely anonymized)
    personalInfo: {
      hasName: { type: Boolean, default: false },
      hasEmail: { type: Boolean, default: false },
      hasPhone: { type: Boolean, default: false },
      hasAddress: { type: Boolean, default: false },
      hasLinkedIn: { type: Boolean, default: false },
      hasGithub: { type: Boolean, default: false },
      hasPortfolio: { type: Boolean, default: false }
    },
    
    // Professional info (sanitized)
    professional: {
      hasJobTitle: { type: Boolean, default: false },
      hasSummary: { type: Boolean, default: false },
      experienceLevel: {
        type: String,
        enum: ['entry', 'junior', 'mid', 'senior', 'lead', 'executive', 'unknown'],
        default: 'unknown'
      },
      totalExperienceYears: { 
        type: Number, 
        default: 0, 
        min: 0, 
        max: 50
      },
      industryType: {
        type: String,
        enum: ['tech', 'finance', 'healthcare', 'education', 'retail', 'manufacturing', 'other'],
        default: 'other'
      }
    },
    
    // Skills analysis (anonymized)
    skills: {
      technicalSkillsCount: { type: Number, default: 0, min: 0, max: 100 },
      softSkillsCount: { type: Number, default: 0, min: 0, max: 50 },
      programmingLanguages: { type: Number, default: 0, min: 0 },
      frameworks: { type: Number, default: 0, min: 0 },
      databases: { type: Number, default: 0, min: 0 },
      cloudPlatforms: { type: Number, default: 0, min: 0 },
      certifications: { type: Number, default: 0, min: 0 }
    },
    
    // Experience analysis (anonymized)
    experience: {
      jobCount: { type: Number, default: 0, min: 0, max: 20 },
      hasCurrentRole: { type: Boolean, default: false },
      averageJobDuration: { type: Number, default: 0, min: 0 }, // in months
      hasInternships: { type: Boolean, default: false },
      hasFreelance: { type: Boolean, default: false },
      hasLeadershipRoles: { type: Boolean, default: false }
    },
    
    // Education analysis (anonymized)
    education: {
      degreeCount: { type: Number, default: 0, min: 0, max: 5 },
      highestDegree: {
        type: String,
        enum: ['high_school', 'diploma', 'bachelor', 'master', 'phd', 'other', 'unknown'],
        default: 'unknown'
      },
      hasRelevantDegree: { type: Boolean, default: false },
      hasOnlineCourses: { type: Boolean, default: false },
      hasCertifications: { type: Boolean, default: false }
    }
  },
  
  // Comprehensive analysis results
  analysis: {
    overallScore: { 
      type: Number, 
      required: true, 
      min: 0, 
      max: 100,
      index: true
    },
    
    // Detailed scoring breakdown
    scoringBreakdown: {
      contactInfo: { type: Number, default: 0, min: 0, max: 100 },
      workExperience: { type: Number, default: 0, min: 0, max: 100 },
      education: { type: Number, default: 0, min: 0, max: 100 },
      skills: { type: Number, default: 0, min: 0, max: 100 },
      formatting: { type: Number, default: 0, min: 0, max: 100 },
      atsCompatibility: { type: Number, default: 0, min: 0, max: 100 },
      professionalSummary: { type: Number, default: 0, min: 0, max: 100 },
      achievements: { type: Number, default: 0, min: 0, max: 100 }
    },
    
    // AI-generated feedback (different roasting levels)
    feedback: {
      roastFeedback: { 
        type: String, 
        required: true,
        maxlength: [8000, 'Feedback too long'],
        trim: true
      },
      strengths: [{ 
        type: String, 
        maxlength: [500, 'Strength description too long'],
        trim: true 
      }],
      improvements: [{ 
        type: String, 
        maxlength: [500, 'Improvement suggestion too long'],
        trim: true 
      }],
      roastLevel: {
        type: String,
        enum: ['pyar', 'ache', 'dhang'], // Different roasting intensities
        required: true
      },
      language: {
        type: String,
        enum: ['english', 'hindi', 'hinglish'],
        required: true,
        default: 'english'
      }
    },
    
    // ATS compatibility analysis
    atsAnalysis: {
      keywordDensity: { type: Number, default: 0, min: 0, max: 100 },
      formattingScore: { type: Number, default: 0, min: 0, max: 100 },
      readabilityScore: { type: Number, default: 0, min: 0, max: 100 },
      sectionStructure: { type: Number, default: 0, min: 0, max: 100 },
      fileFormatCompatibility: { type: Boolean, default: true }
    }
  },
  
  // User preferences for roasting
  preferences: {
    roastSettings: {
      level: { 
        type: String, 
        enum: ['pyar', 'ache', 'dhang'], // pyar=mild, ache=medium, dhang=brutal
        required: true,
        default: 'ache'
      },
      language: { 
        type: String, 
        enum: ['english', 'hindi', 'hinglish'],
        required: true,
        default: 'english'
      },
      includeGaali: { type: Boolean, default: false }, // For 'dhang' level
      targetIndustry: {
        type: String,
        enum: ['tech', 'finance', 'healthcare', 'education', 'retail', 'manufacturing', 'general'],
        default: 'general'
      }
    }
  },
  
  // Document statistics for analysis
  documentStats: {
    wordCount: { type: Number, default: 0, min: 0 },
    pageCount: { type: Number, default: 1, min: 1, max: 10 },
    paragraphCount: { type: Number, default: 0, min: 0 },
    bulletPointCount: { type: Number, default: 0, min: 0 },
    linkCount: { type: Number, default: 0, min: 0 },
    imageCount: { type: Number, default: 0, min: 0 },
    tableCount: { type: Number, default: 0, min: 0 }
  },
  
  // Anonymized security tracking (GDPR compliant)
  securityInfo: {
    clientIPHash: { 
      type: String, 
      required: true,
      validate: {
        validator: function(v) {
          return /^[a-fA-F0-9]{64}$/.test(v); // SHA-256 hash
        },
        message: 'Invalid IP hash format'
      }
    },
    userAgentHash: { 
      type: String, 
      default: null,
      validate: {
        validator: function(v) {
          return !v || /^[a-fA-F0-9]{64}$/.test(v);
        },
        message: 'Invalid user agent hash format'
      }
    },
    countryCode: { 
      type: String, 
      default: null, 
      maxlength: 2,
      uppercase: true,
      validate: {
        validator: function(v) {
          return !v || /^[A-Z]{2}$/.test(v);
        },
        message: 'Invalid country code'
      }
    },
    sessionId: {
      type: String,
      required: true,
      validate: {
        validator: function(v) {
          return /^[a-fA-F0-9]{32}$/.test(v); // MD5 hash for session
        },
        message: 'Invalid session ID format'
      }
    }
  },
  
  // Data retention and compliance
  dataGovernance: {
    retentionDays: { 
      type: Number, 
      default: 90, // Auto-delete after 90 days
      min: 1,
      max: 365
    },
    autoDelete: { type: Boolean, default: true },
    gdprConsent: { type: Boolean, default: false },
    dataProcessingPurpose: {
      type: String,
      enum: ['resume_analysis', 'feedback_generation', 'ats_scoring'],
      default: 'resume_analysis'
    },
    anonymized: { type: Boolean, default: true }
  },
  
  // Processing status
  processingStatus: {
    current: {
      type: String,
      enum: ['uploaded', 'extracting', 'analyzing', 'generating_feedback', 'completed', 'error', 'expired'],
      default: 'uploaded',
      index: true
    },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    errorDetails: {
      code: { type: String, default: null },
      message: { type: String, default: null, maxlength: 500 }
    },
    aiModel: {
      type: String,
      enum: ['gemini-pro', 'gemini-1.5-flash', 'gemini-1.5-pro'],
      default: 'gemini-1.5-flash'
    },
    processingTime: { type: Number, default: 0 } // in milliseconds
  },
  
  // Essential timestamps
  timestamps: {
    uploadedAt: { 
      type: Date, 
      default: Date.now,
      required: true,
      index: true
    },
    processingStartedAt: { 
      type: Date, 
      default: null
    },
    processingCompletedAt: { 
      type: Date, 
      default: null
    },
    lastAccessedAt: {
      type: Date,
      default: Date.now
    },
    expiresAt: {
      type: Date,
      default: function() {
        return new Date(Date.now() + (this.dataGovernance?.retentionDays || 90) * 24 * 60 * 60 * 1000);
      }
    }
  }
}, {
  timestamps: true,
  versionKey: false,
  strict: true,
  validateBeforeSave: true,
  collection: 'resumes'
});

// Production-optimized indexes
resumeSchema.index({ 'timestamps.uploadedAt': -1, 'analysis.overallScore': -1 });
resumeSchema.index({ 'securityInfo.clientIPHash': 1, 'timestamps.uploadedAt': -1 });
resumeSchema.index({ 'processingStatus.current': 1, 'timestamps.uploadedAt': -1 });
resumeSchema.index({ 'timestamps.expiresAt': 1 }, { expireAfterSeconds: 0 }); // TTL index
resumeSchema.index({ 'fileInfo.fileHash': 1 }, { unique: true }); // Prevent duplicate uploads
resumeSchema.index({ 'analysis.overallScore': -1, 'preferences.roastSettings.level': 1 });

// Virtual properties for computed values
resumeSchema.virtual('displayScore').get(function() {
  const score = this.analysis?.overallScore || 0;
  return Math.round(score * 10) / 10; // Round to 1 decimal place
});

resumeSchema.virtual('scoreGrade').get(function() {
  const score = this.analysis?.overallScore || 0;
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  if (score >= 50) return 'D';
  return 'F';
});

resumeSchema.virtual('processingDuration').get(function() {
  if (!this.timestamps.processingStartedAt || !this.timestamps.processingCompletedAt) {
    return null;
  }
  return this.timestamps.processingCompletedAt - this.timestamps.processingStartedAt;
});

resumeSchema.virtual('roastIntensity').get(function() {
  const level = this.preferences?.roastSettings?.level;
  const intensityMap = {
    'pyar': 'Mild & Encouraging',
    'ache': 'Balanced & Constructive', 
    'dhang': 'Brutal & Raw'
  };
  return intensityMap[level] || 'Unknown';
});

// Instance methods
resumeSchema.methods.toSafeObject = function() {
  const obj = this.toObject();
  
  // Remove all sensitive/internal data
  delete obj.securityInfo;
  delete obj.dataGovernance;
  delete obj.fileInfo.fileHash;
  delete obj.timestamps.expiresAt;
  delete obj.processingStatus.errorDetails;
  
  // Add virtual properties
  obj.displayScore = this.displayScore;
  obj.scoreGrade = this.scoreGrade;
  obj.roastIntensity = this.roastIntensity;
  
  return obj;
};

resumeSchema.methods.updateProcessingStatus = function(status, progress = null, errorDetails = null) {
  this.processingStatus.current = status;
  
  if (progress !== null) {
    this.processingStatus.progress = Math.max(0, Math.min(100, progress));
  }
  
  if (errorDetails) {
    this.processingStatus.errorDetails = errorDetails;
  }
  
  // Update timestamps based on status
  switch (status) {
    case 'extracting':
    case 'analyzing':
    case 'generating_feedback':
      if (!this.timestamps.processingStartedAt) {
        this.timestamps.processingStartedAt = new Date();
      }
      break;
    case 'completed':
      this.timestamps.processingCompletedAt = new Date();
      this.processingStatus.progress = 100;
      break;
    case 'error':
      this.timestamps.processingCompletedAt = new Date();
      break;
  }
  
  this.timestamps.lastAccessedAt = new Date();
};

resumeSchema.methods.isExpired = function() {
  return this.timestamps.expiresAt && new Date() > this.timestamps.expiresAt;
};

// Static methods for analytics (anonymized)
resumeSchema.statics.getAnalytics = async function(days = 30) {
  try {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    const analytics = await this.aggregate([
      { $match: { 'timestamps.uploadedAt': { $gte: startDate } } },
      {
        $group: {
          _id: null,
          totalAnalyses: { $sum: 1 },
          averageScore: { $avg: '$analysis.overallScore' },
          completedAnalyses: {
            $sum: { $cond: [{ $eq: ['$processingStatus.current', 'completed'] }, 1, 0] }
          },
          errorCount: {
            $sum: { $cond: [{ $eq: ['$processingStatus.current', 'error'] }, 1, 0] }
          },
          roastLevelDistribution: {
            $push: '$preferences.roastSettings.level'
          }
        }
      }
    ]);
    
    const result = analytics[0] || {
      totalAnalyses: 0,
      averageScore: 0,
      completedAnalyses: 0,
      errorCount: 0,
      roastLevelDistribution: []
    };
    
    // Calculate roast level distribution
    const roastCounts = result.roastLevelDistribution.reduce((acc, level) => {
      acc[level] = (acc[level] || 0) + 1;
      return acc;
    }, {});
    
    delete result.roastLevelDistribution;
    result.roastLevelDistribution = roastCounts;
    result.successRate = result.totalAnalyses > 0 
      ? Math.round((result.completedAnalyses / result.totalAnalyses) * 100) 
      : 0;
    
    return result;
    
  } catch (error) {
    logger.error('Error getting analytics', { error: error.message });
    throw new Error('Failed to retrieve analytics');
  }
};

// Static method for secure IP hashing
resumeSchema.statics.hashIP = function(ip) {
  const salt = process.env.IP_SALT || 'cv-slayer-default-salt-2024';
  return crypto.createHash('sha256').update(ip + salt).digest('hex');
};

// Static method for session ID generation
resumeSchema.statics.generateSessionId = function() {
  return crypto.randomBytes(16).toString('hex');
};

// Static method for file hash generation
resumeSchema.statics.generateFileHash = function(fileBuffer) {
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
};

// Pre-save middleware for data validation and optimization
resumeSchema.pre('save', function(next) {
  try {
    // Update document statistics if extractedInfo exists
    if (this.extractedInfo) {
      // Update counts for analytics
      this.documentStats.wordCount = Math.max(0, this.documentStats.wordCount || 0);
      this.documentStats.pageCount = Math.max(1, this.documentStats.pageCount || 1);
    }
    
    // Ensure arrays don't exceed limits for performance
    if (this.analysis?.feedback?.strengths) {
      this.analysis.feedback.strengths = this.analysis.feedback.strengths.slice(0, 10);
    }
    if (this.analysis?.feedback?.improvements) {
      this.analysis.feedback.improvements = this.analysis.feedback.improvements.slice(0, 15);
    }
    
    // Update last accessed timestamp
    this.timestamps.lastAccessedAt = new Date();
    
    next();
  } catch (error) {
    logger.error('Pre-save middleware error', { 
      error: error.message,
      resumeId: this.resumeId 
    });
    next(error);
  }
});

// Post-save middleware for logging (production-safe)
resumeSchema.post('save', function(doc) {
  if (process.env.NODE_ENV !== 'production') {
    logger.info('Resume document saved', {
      resumeId: doc.resumeId,
      status: doc.processingStatus.current,
      score: doc.analysis?.overallScore
    });
  }
});

// Error handling middleware
resumeSchema.post('save', function(error, doc, next) {
  if (error) {
    logger.error('Resume save error', {
      error: error.message,
      resumeId: doc?.resumeId,
      code: error.code
    });
    
    if (error.code === 11000) {
      next(new Error('Duplicate resume detected'));
    } else {
      next(new Error('Failed to save resume data'));
    }
  } else {
    next();
  }
});

module.exports = mongoose.model('Resume', resumeSchema);