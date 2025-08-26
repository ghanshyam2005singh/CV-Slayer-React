const mongoose = require('mongoose');
const crypto = require('crypto');
const winston = require('winston');
const Resume = require('../models/Resume');

// Production logger setup
const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: process.env.NODE_ENV === 'production' 
    ? [new winston.transports.Console()] // Only console in production
    : [
        new winston.transports.File({ filename: 'logs/gemini-service.log' }),
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.Console({ format: winston.format.simple() })
      ]
});

// Remove this duplicate console setup since it's now handled above
// if (process.env.NODE_ENV !== 'production') {
//   logger.add(new winston.transports.Console({
//     format: winston.format.simple()
//   }));
// }

/**
 * Enhanced Resume Storage Service
 * Handles secure storage of resume data with comprehensive error handling
 */
class ResumeStorageEnhanced {
  constructor() {
    this.initialized = false;
    this.init();
  }

  async init() {
    try {
      // Ensure MongoDB connection
      if (mongoose.connection.readyState !== 1) {
        logger.info('Initializing MongoDB connection for storage service');
      }
      this.initialized = true;
      logger.info('Resume storage service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize resume storage service', { error: error.message });
      throw error;
    }
  }

  /**
   * Save comprehensive resume data to database
   */
  async saveResumeData(file, extractedText, analysisResult, preferences, metadata = {}) {
    const startTime = Date.now();
    const requestId = metadata.requestId || crypto.randomUUID();
    
    try {
      logger.info('Starting resume data save operation', {
        requestId,
        fileName: file?.originalname,
        fileSize: file?.size,
        hasAnalysis: !!analysisResult,
        hasPreferences: !!preferences
      });

      // Validate inputs
      const validationResult = this.validateInputs(file, extractedText, analysisResult, preferences);
      if (!validationResult.valid) {
        logger.warn('Input validation failed', {
          requestId,
          errors: validationResult.errors
        });
        return {
          success: false,
          error: 'Invalid input data',
          code: 'VALIDATION_ERROR',
          details: validationResult.errors,
          requestId
        };
      }

      // Generate unique resume ID
      const resumeId = this.generateResumeId();

      // Prepare document structure
      const resumeDocument = this.prepareDocumentStructure(
        resumeId,
        file,
        extractedText,
        analysisResult,
        preferences,
        metadata,
        requestId
      );

      // Save to database
      const savedResume = await this.saveToDatabase(resumeDocument);
      
      const processingTime = Date.now() - startTime;
      
      logger.info('Resume data saved successfully', {
        requestId,
        resumeId,
        processingTime,
        score: analysisResult.score || analysisResult.data?.score
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
      
      logger.error('Failed to save resume data', {
        requestId,
        error: error.message,
        stack: error.stack,
        processingTime,
        fileName: file?.originalname
      });

      return {
        success: false,
        error: 'Failed to save resume data',
        code: 'STORAGE_ERROR',
        details: process.env.NODE_ENV !== 'production' ? error.message : undefined,
        requestId
      };
    }
  }

  /**
   * Validate input parameters
   */
  validateInputs(file, extractedText, analysisResult, preferences) {
    const errors = [];

    // Validate file
    if (!file || typeof file !== 'object') {
      errors.push('Invalid file object');
    } else {
      if (!file.originalname || typeof file.originalname !== 'string') {
        errors.push('Missing or invalid file name');
      }
      if (!file.size || typeof file.size !== 'number' || file.size <= 0) {
        errors.push('Missing or invalid file size');
      }
      if (!file.mimetype || typeof file.mimetype !== 'string') {
        errors.push('Missing or invalid file mime type');
      }
    }

    // Validate extracted text
    if (!extractedText || typeof extractedText !== 'string' || extractedText.trim().length < 10) {
      errors.push('Invalid or insufficient extracted text');
    }

    // Validate analysis result
    if (!analysisResult || typeof analysisResult !== 'object') {
      errors.push('Missing analysis result');
    } else {
      // Check for required analysis fields
      const requiredAnalysisFields = ['score', 'roastFeedback'];
      for (const field of requiredAnalysisFields) {
        if (analysisResult[field] === undefined && (!analysisResult.data || analysisResult.data[field] === undefined)) {
          errors.push(`Missing analysis field: ${field}`);
        }
      }
    }

    // Validate preferences
    if (!preferences || typeof preferences !== 'object') {
      errors.push('Missing preferences');
    } else {
      if (!preferences.roastLevel) {
        errors.push('Missing roast level preference');
      }
      if (!preferences.language) {
        errors.push('Missing language preference');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
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
   * Prepare document structure for database storage
   */
  prepareDocumentStructure(resumeId, file, extractedText, analysisResult, preferences, metadata, requestId) {
    const now = new Date();
    
    // Handle both direct analysis results and wrapped results
    const analysis = analysisResult.data || analysisResult;
    
    return {
      resumeId,
      
      fileInfo: {
        fileName: this.removeTimestampPrefix(file.originalname),
        originalFileName: this.removeTimestampPrefix(file.originalname),
        fileSize: file.size,
        mimeType: file.mimetype,
        fileHash: crypto.createHash('md5').update(file.buffer || extractedText).digest('hex')
      },
      
      extractedInfo: {
  personalInfo: analysis.extractedInfo?.personalInfo || 
                this.extractBasicPersonalInfo(extractedText),
                
  professionalSummary: analysis.extractedInfo?.professionalSummary || null,
                      
  skills: analysis.extractedInfo?.skills || 
          { technical: [], soft: [], languages: [], tools: [], frameworks: [] },
          
  experience: analysis.extractedInfo?.experience || [],
             
  education: analysis.extractedInfo?.education || [],
            
  certifications: analysis.extractedInfo?.certifications || [],
                 
  projects: analysis.extractedInfo?.projects || [],
           
  awards: analysis.extractedInfo?.awards || [],
         
  volunteerWork: analysis.extractedInfo?.volunteerWork || [],
                
  interests: analysis.extractedInfo?.interests || [],
            
  references: analysis.extractedInfo?.references || null
},
      
      analysis: {
        overallScore: analysis.score || 0,
        feedback: analysis.roastFeedback || 'No feedback available',
        strengths: analysis.strengths || [],
        weaknesses: analysis.weaknesses || [],
        improvements: analysis.improvements || [],
        resumeAnalytics: analysis.resumeAnalytics || this.generateBasicAnalytics(extractedText),
        contactValidation: analysis.contactValidation || this.validateContactInfo(extractedText)
      },
      
      preferences: {
        roastLevel: preferences.roastLevel,
        language: preferences.language,
        roastType: preferences.roastType || 'constructive',
        gender: preferences.gender || 'not-specified'
      },
      
      timestamps: {
        uploadedAt: now,
        analyzedAt: now,
        updatedAt: now
      },
      
      metadata: {
        clientIP: metadata.clientIP || preferences.clientIP || 'unknown',
        userAgent: (metadata.userAgent || preferences.userAgent || 'unknown').substring(0, 200),
        countryCode: metadata.countryCode || 'unknown',
        gdprConsent: metadata.gdprConsent !== false,
        requestId,
        processingTime: 0
      }
    };
  }

  /**
   * Remove timestamp prefix from filename
   */
  removeTimestampPrefix(filename) {
    return filename.replace(/^\d+_/, '');
  }

  /**
   * Extract basic personal info if not provided by AI
   */
extractBasicPersonalInfo(text) {
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
  const phoneRegex = /(?:\+?1[-\.\s]?)?\(?([0-9]{3})\)?[-\.\s]?([0-9]{3})[-\.\s]?([0-9]{4})/;
  const linkedinRegex = /linkedin\.com\/in\/([a-zA-Z0-9-]+)/i;
  const githubRegex = /github\.com\/([a-zA-Z0-9-]+)/i;
  
  const emailMatch = text.match(emailRegex);
  const phoneMatch = text.match(phoneRegex);
  const linkedinMatch = text.match(linkedinRegex);
  const githubMatch = text.match(githubRegex);
  
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  const possibleName = lines.length > 0 && lines[0].length < 50 && !lines[0].includes('@') ? lines[0] : null;
  
  // Extract basic address information from text
  const addressInfo = this.extractAddressInfo(text);
  
  return {
    name: possibleName || '',
    email: emailMatch ? emailMatch[0] : '',
    phone: phoneMatch ? phoneMatch[0] : '',
    linkedin: linkedinMatch ? `linkedin.com/in/${linkedinMatch[1]}` : '',
    github: githubMatch ? `github.com/${githubMatch[1]}` : '',
    address: addressInfo, // Use extracted address info instead of null
    website: '',
    socialProfiles: {
      linkedin: linkedinMatch ? linkedinMatch[0] : '',
      github: githubMatch ? githubMatch[0] : '',
      portfolio: '',
      website: '',
      twitter: ''
    }
  };
}

// Add new method to extract address information (add after extractBasicPersonalInfo)
extractAddressInfo(text) {
  // Common address patterns
  const cityStateRegex = /([A-Za-z\s]+),\s*([A-Z]{2})\s*(\d{5})/;
  const cityCountryRegex = /([A-Za-z\s]+),\s*([A-Za-z\s]+)$/m;
  const streetRegex = /\d+\s+[A-Za-z\s]+(Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd)/i;
  
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  let street = '';
  let city = '';
  let state = '';
  let zipCode = '';
  let country = '';
  
  // Look for address patterns in text
  for (const line of lines) {
    const streetMatch = line.match(streetRegex);
    const cityStateMatch = line.match(cityStateRegex);
    
    if (streetMatch && !street) {
      street = streetMatch[0];
    }
    
    if (cityStateMatch) {
      city = cityStateMatch[1].trim();
      state = cityStateMatch[2].trim();
      zipCode = cityStateMatch[3] || '';
    }
  }
  
  // Return structured address object
  return {
    street: street || '',
    city: city || '',
    state: state || '',
    zipCode: zipCode || '',
    country: country || '',
    fullAddress: [street, city, state, zipCode, country].filter(Boolean).join(', ') || ''
  };
}

  /**
   * Generate basic analytics if not provided
   */
  generateBasicAnalytics(text) {
    const words = text.trim().split(/\s+/);
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    const bulletPoints = (text.match(/[•·\-\*]/g) || []).length;
    
    return {
      wordCount: words.length,
      pageCount: Math.max(1, Math.ceil(words.length / 250)),
      sectionCount: paragraphs.length,
      bulletPointCount: bulletPoints,
      quantifiableAchievements: (text.match(/\d+%|\d+\+|\d+ [a-z]/gi) || []).length,
      actionVerbsUsed: (text.match(/\b(led|managed|developed|created|implemented|improved|increased|decreased|achieved|delivered)\b/gi) || []).length,
      industryKeywords: ['javascript', 'python', 'react', 'node'].filter(keyword => text.toLowerCase().includes(keyword)),
      readabilityScore: Math.min(100, Math.max(30, 100 - Math.floor(words.length / 10))),
      atsCompatibility: words.length > 300 ? 'High' : words.length > 150 ? 'Medium' : 'Low',
      missingElements: [],
      strongElements: []
    };
  }

  /**
   * Validate contact information
   */
  validateContactInfo(text) {
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
    const phoneRegex = /(?:\+?1[-\.\s]?)?\(?([0-9]{3})\)?[-\.\s]?([0-9]{3})[-\.\s]?([0-9]{4})/;
    const linkedinRegex = /linkedin\.com\/in\//i;
    const addressRegex = /\b(?:street|st|avenue|ave|road|rd|drive|dr|city|state|zip)\b/i;
    
    const hasEmail = emailRegex.test(text);
    const hasPhone = phoneRegex.test(text);
    const hasLinkedIn = linkedinRegex.test(text);
    const hasAddress = addressRegex.test(text);
    
    return {
      hasEmail,
      hasPhone,
      hasLinkedIn,
      hasAddress,
      emailValid: hasEmail,
      phoneValid: hasPhone,
      linkedInValid: hasLinkedIn
    };
  }

  /**
   * Save document to database with retry logic
   */
  async saveToDatabase(documentData) {
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount <= maxRetries) {
      try {
        const resume = new Resume(documentData);
        
        // Validate before saving
        const validationError = resume.validateSync();
        if (validationError) {
          throw new Error(`Validation failed: ${Object.keys(validationError.errors).join(', ')}`);
        }
        
        // Save to database
        const savedResume = await resume.save();
        
        logger.info('Document saved to database', {
          resumeId: savedResume.resumeId,
          mongoId: savedResume._id
        });
        
        return savedResume;
        
      } catch (error) {
        retryCount++;
        
        if (retryCount > maxRetries) {
          logger.error('Failed to save after retries', {
            error: error.message,
            retryCount,
            resumeId: documentData.resumeId
          });
          throw error;
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
        logger.warn('Retrying database save', { retryCount, resumeId: documentData.resumeId });
      }
    }
  }

  /**
   * Get storage statistics
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
      logger.error('Failed to get storage stats', { error: error.message });
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
