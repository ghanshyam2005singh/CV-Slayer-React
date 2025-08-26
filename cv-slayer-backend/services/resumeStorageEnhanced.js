const mongoose = require('mongoose');
const crypto = require('crypto');
const Resume = require('../models/Resume');

/**
 * Simplified Resume Storage Service
 * Fast and reliable storage with minimal overhead
 */
class ResumeStorageEnhanced {
  constructor() {
    this.initialized = true;
    console.log('✅ Resume storage service initialized');
  }

  /**
   * Save resume data to database - simplified version
   */
  async saveResumeData(file, extractedText, analysisResult, preferences, metadata = {}) {
    const startTime = Date.now();
    const requestId = metadata.requestId || crypto.randomUUID();
    
    try {
      console.log('💾 Saving resume data:', requestId);

      // Generate unique resume ID
      const resumeId = this.generateResumeId();

      // Prepare simplified document
      const resumeDocument = this.prepareDocumentStructure(
        resumeId,
        file,
        extractedText,
        analysisResult,
        preferences,
        metadata,
        requestId
      );

      // Save to database (simple, no retry)
      const savedResume = await this.saveToDatabase(resumeDocument);
      
      const processingTime = Date.now() - startTime;
      
      console.log('✅ Resume saved:', {
        requestId,
        resumeId,
        time: processingTime + 'ms'
      });

      return {
        success: true,
        resumeId: savedResume.resumeId,
        message: 'Resume data saved successfully',
        processingTime,
        requestId
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      console.error('❌ Save failed:', {
        requestId,
        error: error.message,
        time: processingTime + 'ms'
      });

      return {
        success: false,
        error: 'Failed to save resume data',
        code: 'STORAGE_ERROR',
        requestId
      };
    }
  }

  /**
   * Generate unique resume ID
   */
  generateResumeId() {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(8).toString('hex');
    return `resume-${timestamp}-${random}`;
  }

  /**
   * Prepare simplified document structure
   */
  prepareDocumentStructure(resumeId, file, extractedText, analysisResult, preferences, metadata, requestId) {
    const now = new Date();
    
    // Handle both direct analysis results and wrapped results
    const analysis = analysisResult.data || analysisResult;
    
    return {
      resumeId,
      
      fileInfo: {
        fileName: file.originalname || 'unknown',
        originalFileName: file.originalname || 'unknown',
        fileSize: file.size || 0,
        mimeType: file.mimetype || 'unknown',
        fileHash: crypto.createHash('md5').update(extractedText || '').digest('hex')
      },
      
      extractedInfo: {
        personalInfo: this.extractBasicPersonalInfo(extractedText),
        professionalSummary: '',
        skills: {
          technical: [],
          soft: [],
          languages: [],
          tools: [],
          frameworks: []
        },
        experience: [],
        education: [],
        certifications: [],
        projects: [],
        awards: [],
        volunteerWork: [],
        interests: []
      },
      
      analysis: {
        overallScore: analysis.score || 0,
        feedback: analysis.roastFeedback || 'No feedback available',
        strengths: analysis.strengths || [],
        weaknesses: analysis.weaknesses || [],
        improvements: analysis.improvements || []
      },
      
      preferences: {
        roastLevel: preferences.roastLevel || 'ache',
        language: preferences.language || 'english',
        roastType: preferences.roastType || 'constructive',
        gender: preferences.gender || 'not-specified'
      },
      
      timestamps: {
        uploadedAt: now,
        analyzedAt: now,
        updatedAt: now
      },
      
      metadata: {
        clientIP: metadata.clientIP || 'unknown',
        userAgent: 'unknown',
        countryCode: 'unknown',
        gdprConsent: true,
        requestId,
        processingTime: 0
      }
    };
  }

  /**
   * Extract basic personal info - simplified
   */
  extractBasicPersonalInfo(text) {
    if (!text) return { name: '', email: '', phone: '', linkedin: '', github: '', address: '', website: '' };
    
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
    const phoneRegex = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;
    const linkedinRegex = /linkedin\.com\/in\/([a-zA-Z0-9-]+)/i;
    const githubRegex = /github\.com\/([a-zA-Z0-9-]+)/i;
    
    const emailMatch = text.match(emailRegex);
    const phoneMatch = text.match(phoneRegex);
    const linkedinMatch = text.match(linkedinRegex);
    const githubMatch = text.match(githubRegex);
    
    // Simple name extraction
    const lines = text.split('\n').filter(line => line.trim().length > 0);
    let name = '';
    for (let i = 0; i < Math.min(3, lines.length); i++) {
      const line = lines[i].trim();
      if (!line.includes('@') && !line.includes('http') && line.length < 50) {
        name = line;
        break;
      }
    }
    
    return {
      name: name || '',
      email: emailMatch ? emailMatch[0] : '',
      phone: phoneMatch ? phoneMatch[0] : '',
      linkedin: linkedinMatch ? linkedinMatch[0] : '',
      github: githubMatch ? githubMatch[0] : '',
      address: '',
      website: ''
    };
  }

  /**
   * Save to database - simple version
   */
  async saveToDatabase(documentData) {
    try {
      const resume = new Resume(documentData);
      const savedResume = await resume.save();
      return savedResume;
    } catch (error) {
      console.error('Database save error:', error.message);
      throw error;
    }
  }

  /**
   * Get basic storage statistics
   */
  async getStorageStats() {
    try {
      const totalResumes = await Resume.countDocuments();
      const recentResumes = await Resume.countDocuments({
        'timestamps.uploadedAt': { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      });
      
      return {
        totalResumes,
        recentResumes,
        status: 'healthy'
      };
    } catch (error) {
      console.error('Stats error:', error.message);
      return {
        status: 'error',
        error: error.message
      };
    }
  }
}

// Create and export singleton instance
const resumeStorageEnhanced = new ResumeStorageEnhanced();

module.exports = {
  saveResumeData: (file, extractedText, analysisResult, preferences, metadata) => 
    resumeStorageEnhanced.saveResumeData(file, extractedText, analysisResult, preferences, metadata),
  getStorageStats: () => resumeStorageEnhanced.getStorageStats()
};