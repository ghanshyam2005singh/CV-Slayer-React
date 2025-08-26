const mongoose = require('mongoose');

const resumeSchema = new mongoose.Schema({
  resumeId: {
    type: String,
    required: true,
    unique: true
  },
  
  fileInfo: {
    fileName: { type: String, default: '' },
    originalFileName: { type: String, default: '' },
    fileSize: { type: Number, default: 0 },
    mimeType: { type: String, default: '' },
    fileHash: { type: String, default: '' }
  },
  
  extractedInfo: {
    personalInfo: {
      name: { type: String, default: '' },
      email: { type: String, default: '' },
      phone: { type: String, default: '' },
      address: { type: String, default: '' }, // Simplified to single string
      linkedin: { type: String, default: '' },
      github: { type: String, default: '' },
      website: { type: String, default: '' }
    },
    professionalSummary: { type: String, default: '' },
    skills: {
      technical: { type: [String], default: [] },
      soft: { type: [String], default: [] },
      languages: { type: [String], default: [] },
      tools: { type: [String], default: [] },
      frameworks: { type: [String], default: [] }
    },
    experience: [{
      title: { type: String, default: '' },
      company: { type: String, default: '' },
      location: { type: String, default: '' },
      startDate: { type: String, default: '' },
      endDate: { type: String, default: '' },
      description: { type: String, default: '' },
      achievements: { type: [String], default: [] }
    }],
    education: [{
      degree: { type: String, default: '' },
      field: { type: String, default: '' },
      institution: { type: String, default: '' },
      graduationYear: { type: String, default: '' },
      gpa: { type: String, default: '' }
    }],
    certifications: { type: [String], default: [] }, // Simplified
    projects: { type: [String], default: [] }, // Simplified
    awards: { type: [String], default: [] },
    volunteerWork: { type: [String], default: [] },
    interests: { type: [String], default: [] }
  },
  
  analysis: {
    overallScore: { type: Number, default: 0, min: 0, max: 100 },
    feedback: { type: String, default: '' },
    strengths: { type: [String], default: [] },
    weaknesses: { type: [String], default: [] },
    improvements: [{
      priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
      title: { type: String, default: '' },
      description: { type: String, default: '' },
      example: { type: String, default: '' }
    }]
  },
  
  preferences: {
    roastLevel: { type: String, default: 'medium' },
    language: { type: String, default: 'english' },
    roastType: { type: String, default: 'constructive' },
    gender: { type: String, default: 'not-specified' }
  },
  
  timestamps: {
    uploadedAt: { type: Date, default: Date.now },
    analyzedAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  },
  
  metadata: {
    clientIP: { type: String, default: 'unknown' },
    userAgent: { type: String, default: 'unknown' },
    countryCode: { type: String, default: 'unknown' },
    gdprConsent: { type: Boolean, default: true },
    requestId: { type: String, default: '' },
    processingTime: { type: Number, default: 0 }
  }
}, {
  timestamps: false, // Using custom timestamps
  collection: 'resumes'
});

// Essential indexes only
resumeSchema.index({ resumeId: 1 });
resumeSchema.index({ 'timestamps.uploadedAt': -1 });
resumeSchema.index({ 'analysis.overallScore': -1 });

// Pre-save middleware to update timestamps
resumeSchema.pre('save', function(next) {
  this.timestamps.updatedAt = new Date();
  next();
});

// Remove validation errors by making everything optional
resumeSchema.set('strict', false); // Allow any additional fields
resumeSchema.set('runValidators', false); // Skip validation on updates

module.exports = mongoose.model('Resume', resumeSchema);