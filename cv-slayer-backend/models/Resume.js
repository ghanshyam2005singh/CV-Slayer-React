const mongoose = require('mongoose');
const validator = require('validator');
const crypto = require('crypto');

// Simplified and secure schema
const resumeSchema = new mongoose.Schema({
  // Unique identifier
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
  
  // Simplified file info
  fileName: { 
    type: String, 
    required: true,
    maxlength: [255, 'File name too long'],
    trim: true,
    validate: {
      validator: function(v) {
        return /^[a-zA-Z0-9._\-\s()]+\.(pdf|doc|docx)$/i.test(v) && 
               !v.includes('..') && 
               !v.includes('/') && 
               !v.includes('\\');
      },
      message: 'Invalid filename'
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
    max: [10485760, 'File too large'] // 10MB
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
  
  // Encrypted PII storage
  extractedInfo: {
    // Basic info (sanitized)
    personalInfo: {
      name: { 
        type: String, 
        default: null,
        maxlength: [100, 'Name too long'],
        trim: true
      },
      hasEmail: { type: Boolean, default: false },
      hasPhone: { type: Boolean, default: false },
      hasAddress: { type: Boolean, default: false }
    },
    
    // Professional info
    professional: {
      currentJobTitle: { 
        type: String, 
        default: null,
        maxlength: [200, 'Job title too long'],
        trim: true
      },
      summary: { 
        type: String, 
        default: null,
        maxlength: [2000, 'Summary too long'],
        trim: true
      },
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
      }
    },
    
    // Simplified skills
    skills: {
      technical: [{
        name: { type: String, required: true, maxlength: 100, trim: true },
        proficiency: {
          type: String,
          enum: ['beginner', 'intermediate', 'advanced', 'expert'],
          default: 'intermediate'
        }
      }],
      count: { type: Number, default: 0, min: 0 }
    },
    
    // Simplified experience
    experience: [{
      title: { type: String, maxlength: 200, trim: true },
      company: { type: String, maxlength: 200, trim: true },
      duration: { type: String, maxlength: 100, trim: true },
      isCurrentRole: { type: Boolean, default: false }
    }],
    
    // Simplified education  
    education: [{
      degree: { type: String, maxlength: 200, trim: true },
      institution: { type: String, maxlength: 200, trim: true },
      graduationYear: { 
        type: Number,
        min: 1950,
        max: new Date().getFullYear() + 10
      }
    }]
  },
  
  // Simplified analysis
  analysis: {
    overallScore: { 
      type: Number, 
      required: true, 
      min: 0, 
      max: 100,
      index: true
    },
    
    scoringBreakdown: {
      contactInfo: { type: Number, default: 0, min: 0, max: 100 },
      workExperience: { type: Number, default: 0, min: 0, max: 100 },
      education: { type: Number, default: 0, min: 0, max: 100 },
      skills: { type: Number, default: 0, min: 0, max: 100 },
      formatting: { type: Number, default: 0, min: 0, max: 100 },
      atsCompatibility: { type: Number, default: 0, min: 0, max: 100 }
    },
    
    feedback: {
      roastFeedback: { 
        type: String, 
        required: true,
        maxlength: [5000, 'Feedback too long'],
        trim: true
      },
      strengths: [{ type: String, maxlength: 300, trim: true }],
      improvements: [{ type: String, maxlength: 300, trim: true }]
    }
  },
  
  // Simplified preferences
  preferences: {
    roastSettings: {
      level: { 
        type: String, 
        enum: ['pyar', 'ache', 'dhang'],
        required: true,
        default: 'ache'
      },
      language: { 
        type: String, 
        enum: ['english', 'hindi', 'hinglish'],
        required: true,
        default: 'english'
      }
    }
  },
  
  // Essential statistics only
  statistics: {
    wordCount: { type: Number, default: 0, min: 0 },
    pageCount: { type: Number, default: 1, min: 1, max: 10 },
    hasEmail: { type: Boolean, default: false },
    hasPhone: { type: Boolean, default: false },
    hasLinkedIn: { type: Boolean, default: false },
    hasGithub: { type: Boolean, default: false },
    skillsCount: { type: Number, default: 0, min: 0 },
    experienceCount: { type: Number, default: 0, min: 0 },
    educationCount: { type: Number, default: 0, min: 0 }
  },
  
  // Anonymized security tracking
  security: {
    clientIPHash: { 
      type: String, 
      required: true,
      validate: {
        validator: function(v) {
          return /^[a-fA-F0-9]{64}$/.test(v); // SHA-256 hash
        },
        message: 'Invalid IP hash'
      }
    },
    userAgentHash: { 
      type: String, 
      default: null,
      validate: {
        validator: function(v) {
          return !v || /^[a-fA-F0-9]{64}$/.test(v);
        },
        message: 'Invalid user agent hash'
      }
    },
    countryCode: { 
      type: String, 
      default: null, 
      maxlength: 2,
      uppercase: true
    }
  },
  
  // Auto-cleanup data retention
  dataRetention: {
    retentionDays: { 
      type: Number, 
      default: 90,
      min: 1,
      max: 365
    },
    autoDelete: { type: Boolean, default: true },
    gdprConsent: { type: Boolean, default: false }
  },
  
  // Simplified status
  status: {
    current: {
      type: String,
      enum: ['uploaded', 'processing', 'analyzed', 'error', 'expired'],
      default: 'uploaded',
      index: true
    }
  },
  
  // Essential timestamps only
  timestamps: {
    uploadedAt: { 
      type: Date, 
      default: Date.now,
      required: true,
      index: true
    },
    processedAt: { 
      type: Date, 
      default: null
    },
    expiresAt: {
      type: Date,
      default: function() {
        return new Date(Date.now() + this.dataRetention.retentionDays * 24 * 60 * 60 * 1000);
      }
      // No index defined here to avoid duplication
    }
  }
}, {
  timestamps: true,
  versionKey: false,
  strict: true,
  validateBeforeSave: true
});

// Essential indexes only - define TTL index separately to avoid duplication warning
resumeSchema.index({ 'timestamps.uploadedAt': -1, 'analysis.overallScore': -1 });
resumeSchema.index({ 'security.clientIPHash': 1, 'timestamps.uploadedAt': -1 });
resumeSchema.index({ 'status.current': 1, 'timestamps.uploadedAt': -1 });
resumeSchema.index({ 'timestamps.expiresAt': 1 }, { expireAfterSeconds: 0 });

// Simplified virtual properties
resumeSchema.virtual('displayName').get(function() {
  return this.extractedInfo?.personalInfo?.name || 
         this.fileName?.replace(/\.[^/.]+$/, "") || 
         'Anonymous User';
});

resumeSchema.virtual('scoreGrade').get(function() {
  const score = this.analysis?.overallScore || 0;
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  return 'D';
});

// Safe data export method
resumeSchema.methods.toSafeObject = function() {
  const obj = this.toObject();
  
  // Remove all sensitive data
  delete obj.security;
  delete obj.dataRetention;
  delete obj.timestamps.expiresAt;
  
  return obj;
};

// Essential static methods only
resumeSchema.statics.getBasicStats = async function(days = 30) {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  const stats = await this.aggregate([
    { $match: { 'timestamps.uploadedAt': { $gte: startDate } } },
    {
      $group: {
        _id: null,
        totalCount: { $sum: 1 },
        averageScore: { $avg: '$analysis.overallScore' },
        todayCount: {
          $sum: {
            $cond: [
              { 
                $gte: [
                  '$timestamps.uploadedAt', 
                  new Date(new Date().setHours(0, 0, 0, 0))
                ]
              },
              1, 
              0
            ]
          }
        }
      }
    }
  ]);
  
  return stats[0] || { totalCount: 0, averageScore: 0, todayCount: 0 };
};

// IP anonymization helper
resumeSchema.statics.hashIP = function(ip) {
  return crypto.createHash('sha256').update(ip + process.env.IP_SALT || 'default-salt').digest('hex');
};

// Simplified pre-save middleware
resumeSchema.pre('save', function(next) {
  try {
    // Update statistics
    if (this.extractedInfo) {
      const stats = this.statistics;
      const info = this.extractedInfo;
      
      stats.hasEmail = info.personalInfo?.hasEmail || false;
      stats.hasPhone = info.personalInfo?.hasPhone || false;
      stats.skillsCount = info.skills?.technical?.length || 0;
      stats.experienceCount = info.experience?.length || 0;
      stats.educationCount = info.education?.length || 0;
    }
    
    // Limit arrays for performance
    if (this.extractedInfo?.skills?.technical) {
      this.extractedInfo.skills.technical = this.extractedInfo.skills.technical.slice(0, 20);
    }
    if (this.extractedInfo?.experience) {
      this.extractedInfo.experience = this.extractedInfo.experience.slice(0, 10);
    }
    if (this.extractedInfo?.education) {
      this.extractedInfo.education = this.extractedInfo.education.slice(0, 5);
    }
    
    next();
  } catch (error) {
    next(error);
  }
});

module.exports = mongoose.model('Resume', resumeSchema);