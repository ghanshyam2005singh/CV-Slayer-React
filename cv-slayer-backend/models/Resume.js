const mongoose = require('mongoose');

const resumeSchema = new mongoose.Schema({
  resumeId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  fileInfo: {
    fileName: { type: String, required: true },
    originalFileName: { type: String, required: true },
    fileSize: { type: Number, required: true },
    mimeType: { type: String, required: true },
    fileHash: { type: String, default: 'unknown' }
  },
  
  extractedInfo: {
    personalInfo: {
      name: String,
      email: String,
      phone: String,
      address: {
        full: String,
        city: String,
        state: String,
        country: String,
        zipCode: String
      },
      socialProfiles: {
        linkedin: String,
        github: String,
        portfolio: String,
        website: String,
        twitter: String
      }
    },
    professionalSummary: String,
    skills: {
      technical: [String],
      soft: [String],
      languages: [String],
      tools: [String],
      frameworks: [String]
    },
    experience: [{
      title: String,
      company: String,
      location: String,
      startDate: String,
      endDate: String,
      duration: String,
      description: String,
      achievements: [String],
      technologies: [String]
    }],
    education: [{
      degree: String,
      field: String,
      institution: String,
      location: String,
      graduationYear: String,
      gpa: String,
      honors: [String],
      coursework: [String]
    }],
    certifications: [{
      name: String,
      issuer: String,
      dateObtained: String,
      expirationDate: String,
      credentialId: String,
      url: String
    }],
    projects: [{
      name: String,
      description: String,
      role: String,
      duration: String,
      technologies: [String],
      achievements: [String],
      url: String,
      github: String
    }],
    awards: [String],
    volunteerWork: [String],
    interests: [String],
    references: String
  },
  
  analysis: {
    overallScore: { type: Number, required: true, min: 0, max: 100 },
    feedback: { type: String, required: true },
    strengths: [String],
    weaknesses: [String],
    improvements: [{
      priority: { type: String, enum: ['low', 'medium', 'high'] },
      title: String,
      description: String,
      example: String
    }],
    resumeAnalytics: {
      wordCount: Number,
      pageCount: Number,
      sectionCount: Number,
      bulletPointCount: Number,
      quantifiableAchievements: Number,
      actionVerbsUsed: Number,
      industryKeywords: [String],
      readabilityScore: Number,
      atsCompatibility: String,
      missingElements: [String],
      strongElements: [String]
    },
    contactValidation: {
      hasEmail: Boolean,
      hasPhone: Boolean,
      hasLinkedIn: Boolean,
      hasAddress: Boolean,
      emailValid: Boolean,
      phoneValid: Boolean,
      linkedInValid: Boolean
    }
  },
  
  preferences: {
    roastLevel: { type: String, required: true },
    language: { type: String, required: true },
    roastType: String,
    gender: String
  },
  
  timestamps: {
    uploadedAt: { type: Date, default: Date.now, required: true },
    analyzedAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  },
  
  documentStats: {
    fileInfo: {
      originalFileName: String,
      fileSize: Number
    },
    extractedInfo: {
      personalInfo: mongoose.Schema.Types.Mixed,
      skills: mongoose.Schema.Types.Mixed,
      experience: mongoose.Schema.Types.Mixed
    },
    analysis: {
      overallScore: Number,
      feedback: Boolean
    },
    timestamps: {
      uploadedAt: Date
    }
  },
  
  metadata: {
    clientIP: String,
    userAgent: String,
    countryCode: String,
    gdprConsent: Boolean,
    requestId: String,
    processingTime: Number
  }
}, {
  timestamps: { createdAt: 'createdAt', updatedAt: 'modifiedAt' }
});

// Add indexes for performance
resumeSchema.index({ 'timestamps.uploadedAt': -1 });
resumeSchema.index({ 'analysis.overallScore': -1 });
resumeSchema.index({ 'preferences.roastLevel': 1 });
resumeSchema.index({ 'metadata.clientIP': 1 });

// Pre-save middleware to update timestamps
resumeSchema.pre('save', function(next) {
  this.timestamps.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Resume', resumeSchema);
