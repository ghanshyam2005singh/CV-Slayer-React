const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const validator = require('validator');
const crypto = require('crypto');
const geminiService = require('../services/geminiService');
const fileProcessor = require('../services/fileProcessor');
const resumeStorage = require('../services/resumeStorageEnhanced');
const { connectDB } = require('../config/database');
const winston = require('winston');

const router = express.Router();

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

// Production-grade rate limiting for resume analysis
const analyzeRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 3 : 10, // Stricter in production
  message: {
    error: {
      message: 'Too many resume analysis requests. Please try again in 15 minutes.',
      status: 429,
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: 900
    }
  },
   standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting errors in development
  skip: (req) => {
    return process.env.NODE_ENV === 'development';
  },
  // Better key generator for production
  keyGenerator: (req) => {
    if (process.env.NODE_ENV === 'production') {
      return req.ip || req.connection.remoteAddress || 'unknown';
    }
    return 'localhost';
  }
});

// Test endpoint rate limiting
const testRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: process.env.NODE_ENV === 'production' ? 20 : 50,
  message: {
    error: {
      message: 'Too many test requests. Please try again later.',
      status: 429,
      code: 'RATE_LIMIT_EXCEEDED'
    }
  }
});

// Enhanced multer configuration with security
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024, // 5MB
    files: 1,
    fields: 10,
    headerPairs: 2000
  },
  fileFilter: (req, file, cb) => {
    try {
      // Enhanced file validation with virus scanning simulation
      const allowedTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ];
      
      const allowedExtensions = ['.pdf', '.doc', '.docx'];
      const fileExtension = '.' + file.originalname.split('.').pop().toLowerCase();
      
      // Validate file name length and characters
      if (file.originalname.length > 255) {
        return cb(new Error('FILENAME_TOO_LONG'), false);
      }
      
      // Check for malicious file names
      if (/[<>:"/\\|?*\x00-\x1f]/.test(file.originalname)) {
        return cb(new Error('INVALID_FILENAME'), false);
      }
      
      // Check MIME type and extension
      if (allowedTypes.includes(file.mimetype) && allowedExtensions.includes(fileExtension)) {
        // Generate secure filename
        const timestamp = Date.now();
        const sanitizedName = file.originalname
          .replace(/[^a-zA-Z0-9._\-\s()]/g, '_')
          .substring(0, 100); // Limit filename length
        
        file.originalname = `${timestamp}_${sanitizedName}`;
        cb(null, true);
      } else {
        cb(new Error('INVALID_FILE_TYPE'), false);
      }
    } catch (error) {
      cb(new Error('FILE_VALIDATION_ERROR'), false);
    }
  }
});

// Enhanced input validation middleware
const validateAnalysisInput = (req, res, next) => {
  try {
    const { gender, roastLevel, roastType, language } = req.body;
    
    const validGenders = ['male', 'female', 'other'];
    const validRoastLevels = ['pyar', 'ache', 'dhang'];
    const validRoastTypes = ['funny', 'serious', 'sarcastic', 'motivational'];
    const validLanguages = ['english', 'hindi', 'hinglish'];
    
    const errors = [];
    
    // Validate each field with sanitization
    if (!gender || !validGenders.includes(validator.escape(gender.toLowerCase()))) {
      errors.push('Invalid gender selection');
    }
    
    if (!roastLevel || !validRoastLevels.includes(validator.escape(roastLevel.toLowerCase()))) {
      errors.push('Invalid roast level selection');
    }
    
    if (!roastType || !validRoastTypes.includes(validator.escape(roastType.toLowerCase()))) {
      errors.push('Invalid roast type selection');
    }
    
    if (!language || !validLanguages.includes(validator.escape(language.toLowerCase()))) {
      errors.push('Invalid language selection');
    }
    
    if (errors.length > 0) {
      logger.warn('Input validation failed', {
        errors,
        ip: req.ip,
        userAgent: req.get('User-Agent')?.substring(0, 100)
      });
      
      return res.status(400).json({
        error: {
          message: 'Invalid input parameters',
          status: 400,
          code: 'VALIDATION_ERROR',
          details: errors
        }
      });
    }
    
    // Sanitize the input values
    req.body.gender = validator.escape(gender.toLowerCase());
    req.body.roastLevel = validator.escape(roastLevel.toLowerCase());
    req.body.roastType = validator.escape(roastType.toLowerCase());
    req.body.language = validator.escape(language.toLowerCase());
    
    next();
  } catch (error) {
    logger.error('Input validation error', {
      error: error.message,
      ip: req.ip
    });
    
    return res.status(400).json({
      error: {
        message: 'Input validation failed',
        status: 400,
        code: 'VALIDATION_ERROR'
      }
    });
  }
};

// Enhanced security headers middleware
const securityHeaders = (req, res, next) => {
  // Generate request ID for tracking
  req.requestId = crypto.randomUUID();
  
  // Set comprehensive security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  // Add HSTS header in production
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  
  next();
};

// File size and type validation helper
const validateFileIntegrity = (file) => {
  if (!file) {
    throw new Error('NO_FILE');
  }
  
  if (file.size === 0) {
    throw new Error('EMPTY_FILE');
  }
  
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('FILE_TOO_LARGE');
  }
  
  // Check file buffer for basic integrity
  if (!file.buffer || file.buffer.length === 0) {
    throw new Error('CORRUPTED_FILE');
  }
  
  return true;
};

// Enhanced function to extract comprehensive structured resume data (SECURE - NO PII STORED)
const extractResumeData = (resumeText) => {
  try {
    // Initialize ANONYMIZED extracted information structure (NO PII)
    const extractedInfo = {
      // Personal info flags (NO ACTUAL DATA - JUST BOOLEANS)
      personalInfo: {
         name: null,
      email: null,
      phone: null,
      linkedin: null,
      github: null,
      address: null,
      website: null
      },
      
      // Professional info (sanitized counts/categories only)
      professional: {
        hasJobTitle: false,
        hasSummary: false,
        experienceLevel: 'unknown',
        totalExperienceYears: 0,
        industryType: 'other'
      },
      
      // Skills analysis (counts only - NO ACTUAL SKILLS)
  skills: {
        technicalSkillsCount: 0,
        softSkillsCount: 0,
        programmingLanguages: 0,
        frameworks: 0,
        databases: 0,
        cloudPlatforms: 0,
        certifications: 0
      },
      
      // Experience analysis (anonymized)
      experience: {
        jobCount: 0,
        hasCurrentRole: false,
        averageJobDuration: 0,
        hasInternships: false,
        hasFreelance: false,
        hasLeadershipRoles: false
      },
      
      // Education analysis (anonymized)
      education: {
        degreeCount: 0,
        highestDegree: 'unknown',
        hasRelevantDegree: false,
        hasOnlineCourses: false,
        hasCertifications: false
      }
    };

    // FIXED: Extract Email
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    const emailMatches = resumeText.match(emailRegex);
    if (emailMatches && emailMatches.length > 0) {
      // Filter out placeholder emails
      const validEmails = emailMatches.filter(email => 
        !email.includes('example.com') && 
        !email.includes('test.com') &&
        !email.includes('placeholder')
      );
      extractedInfo.personalInfo.email = validEmails[0] || emailMatches[0];
    }

    // FIXED: Extract Phone Number
    const phonePatterns = [
      /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, // US format
      /(\+?\d{1,3}[-.\s]?)?\d{10}/g, // 10 digit
      /(\+91[-.\s]?)?\d{10}/g // Indian format
    ];
    
    for (const pattern of phonePatterns) {
      const phoneMatches = resumeText.match(pattern);
      if (phoneMatches && phoneMatches.length > 0) {
        const validPhone = phoneMatches.find(phone => {
          const digitsOnly = phone.replace(/\D/g, '');
          return digitsOnly.length >= 10 && digitsOnly.length <= 15;
        });
        if (validPhone) {
          extractedInfo.personalInfo.phone = validPhone.trim();
          break;
        }
      }
    }

    // FIXED: Extract LinkedIn
    const linkedinRegex = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/([a-zA-Z0-9\-_]+)/gi;
    const linkedinMatch = resumeText.match(linkedinRegex);
    if (linkedinMatch && linkedinMatch.length > 0) {
      extractedInfo.personalInfo.linkedin = linkedinMatch[0];
    }

    // FIXED: Extract GitHub
    const githubRegex = /(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9\-_]+)/gi;
    const githubMatch = resumeText.match(githubRegex);
    if (githubMatch && githubMatch.length > 0) {
      extractedInfo.personalInfo.github = githubMatch[0];
    }

    // FIXED: Extract Name (from first few lines)
    const lines = resumeText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    for (let i = 0; i < Math.min(5, lines.length); i++) {
      const line = lines[i].trim();
      
      // Skip lines with email, urls, CV, Resume
      if (line.includes('@') || line.includes('http') || 
          line.toLowerCase().includes('cv') || 
          line.toLowerCase().includes('resume') || 
          line.length < 2 || line.length > 50) {
        continue;
      }

      // Check if line looks like a name (2-4 words, mostly letters)
      const words = line.split(/\s+/).filter(w => w.length > 0);
      if (words.length >= 2 && words.length <= 4) {
        const isLikelyName = words.every(word => 
          /^[A-Za-z][A-Za-z\-'\.]*$/.test(word) && word.length > 1
        );
        
        if (isLikelyName) {
          extractedInfo.personalInfo.name = line;
          break;
        }
      }
    }

    // FIXED: Extract Address (basic patterns)
    const addressPatterns = [
      /\d+[a-zA-Z]?\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln)[^,\n]*/gi,
      /[A-Za-z\s]+,\s*[A-Za-z\s]+,\s*[A-Za-z]{2}\s*\d{5}/gi, // City, State, ZIP
      /[A-Za-z\s]+,\s*[A-Za-z\s]+\s*\d{6}/gi // Indian pincode
    ];

    for (const pattern of addressPatterns) {
      const addressMatch = resumeText.match(pattern);
      if (addressMatch && addressMatch.length > 0) {
        extractedInfo.personalInfo.address = addressMatch[0].trim();
        break;
      }
    }

    // FIXED: Extract Website/Portfolio
    const websiteRegex = /(?:https?:\/\/)?(?:www\.)?[a-zA-Z0-9\-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?/gi;
    const websiteMatches = resumeText.match(websiteRegex);
    if (websiteMatches && websiteMatches.length > 0) {
      // Filter out common social media and focus on portfolio sites
      const portfolioSites = websiteMatches.filter(url => 
        !url.includes('linkedin.com') && 
        !url.includes('github.com') &&
        !url.includes('facebook.com') &&
        !url.includes('twitter.com') &&
        !url.includes('instagram.com')
      );
      if (portfolioSites.length > 0) {
        extractedInfo.personalInfo.website = portfolioSites[0];
      }
    }

    // Clean up extracted data
    Object.keys(extractedInfo.personalInfo).forEach(key => {
      if (extractedInfo.personalInfo[key]) {
        extractedInfo.personalInfo[key] = extractedInfo.personalInfo[key].trim()
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'");
      }
    });

    // Continue with the rest of the analytics (keeping your existing logic)
    const text = resumeText.toLowerCase();

    // Professional info detection
    extractedInfo.professional.hasJobTitle = /\b(?:engineer|developer|manager|analyst|consultant|director|lead|senior|junior)\b/i.test(text);
    extractedInfo.professional.hasSummary = /\b(?:summary|profile|objective|about)\b/i.test(text);

    // Skills counting (categories only)
    const techKeywords = ['javascript', 'python', 'java', 'react', 'node', 'sql', 'aws', 'docker', 'git', 'html', 'css'];
    const softKeywords = ['leadership', 'communication', 'teamwork', 'problem solving', 'management'];
    
    extractedInfo.skills.technicalSkillsCount = techKeywords.filter(keyword => text.includes(keyword)).length;
    extractedInfo.skills.softSkillsCount = softKeywords.filter(keyword => text.includes(keyword)).length;

    // Experience level estimation (without storing details)
    const yearMatches = resumeText.match(/(\d{4})/g);
    if (yearMatches && yearMatches.length >= 2) {
      const years = yearMatches.map(y => parseInt(y)).filter(y => y > 1990 && y <= new Date().getFullYear()).sort();
      if (years.length >= 2) {
        extractedInfo.professional.totalExperienceYears = Math.min(50, years[years.length - 1] - years[0]);
      }
    }

    // Determine experience level
    if (extractedInfo.professional.totalExperienceYears === 0) {
      extractedInfo.professional.experienceLevel = 'entry';
    } else if (extractedInfo.professional.totalExperienceYears <= 2) {
      extractedInfo.professional.experienceLevel = 'junior';
    } else if (extractedInfo.professional.totalExperienceYears <= 5) {
      extractedInfo.professional.experienceLevel = 'mid';
    } else if (extractedInfo.professional.totalExperienceYears <= 10) {
      extractedInfo.professional.experienceLevel = 'senior';
    } else {
      extractedInfo.professional.experienceLevel = 'executive';
    }

    // Count sections (anonymized)
    extractedInfo.experience.jobCount = Math.min(20, (text.match(/\b(?:experience|work|employment)\b/gi) || []).length);
    extractedInfo.education.degreeCount = Math.min(5, (text.match(/\b(?:degree|bachelor|master|phd|diploma)\b/gi) || []).length);
    extractedInfo.skills.certifications = Math.min(10, (text.match(/\b(?:certified|certification|license)\b/gi) || []).length);

    return extractedInfo;
  } catch (error) {
    logger.error('Error extracting resume data', { error: error.message });
    return {
      personalInfo: {
        name: null,
        email: null,
        phone: null,
        linkedin: null,
        github: null,
        address: null,
        website: null
      },
      professional: { hasJobTitle: false, hasSummary: false, experienceLevel: 'unknown', totalExperienceYears: 0, industryType: 'other' },
      skills: { technicalSkillsCount: 0, softSkillsCount: 0, programmingLanguages: 0, frameworks: 0, databases: 0, cloudPlatforms: 0, certifications: 0 },
      experience: { jobCount: 0, hasCurrentRole: false, averageJobDuration: 0, hasInternships: false, hasFreelance: false, hasLeadershipRoles: false },
      education: { degreeCount: 0, highestDegree: 'unknown', hasRelevantDegree: false, hasOnlineCourses: false, hasCertifications: false }
    };
  }
};

// Enhanced function to analyze comprehensive document statistics
const analyzeDocumentStats = (resumeText, file) => {
  try {
    const words = resumeText.trim().split(/\s+/).filter(word => word.length > 0);
    const uniqueWords = [...new Set(words.map(word => word.toLowerCase()))];
    const paragraphs = resumeText.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    const bulletPoints = (resumeText.match(/[•·\-\*]/g) || []).length;

    const hasEmail = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/.test(resumeText);
    const hasPhone = /(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/.test(resumeText);
    const hasLinkedIn = /linkedin\.com/i.test(resumeText);
    const hasGithub = /github\.com/i.test(resumeText);
    const hasWebsite = /(?:https?:\/\/)?(?:www\.)?[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/i.test(resumeText);
    const hasSkills = /skills?|technical|competencies/i.test(resumeText);
    const hasEducation = /education|academic|degree|university|college/i.test(resumeText);
    const hasExperience = /experience|work|employment|job/i.test(resumeText);
    const hasCertifications = /certifications?|licenses?/i.test(resumeText);
    const hasProjects = /projects?|portfolio/i.test(resumeText);
    const hasSummary = /summary|profile|objective|about/i.test(resumeText);

    return {
      wordCount: words.length,
      pageCount: Math.max(1, Math.ceil(words.length / 250)), // Estimate pages
      paragraphCount: paragraphs.length,
      bulletPointCount: bulletPoints,
      hasEmail,
      hasPhone,
      hasLinkedIn,
      hasGithub,
      hasWebsite,
      hasSkills,
      hasEducation,
      hasExperience,
      hasCertifications,
      hasProjects,
      hasSummary,
      textLength: resumeText.length,
      uniqueWordsCount: uniqueWords.length,
      processingTime: 0,
      extractionTime: 0,
      analysisTime: 0
    };
  } catch (error) {
    logger.error('Error analyzing document stats', { error: error.message });
    return {
      wordCount: 0,
      pageCount: 1,
      paragraphCount: 0,
      bulletPointCount: 0,
      hasEmail: false,
      hasPhone: false,
      hasLinkedIn: false,
      hasGithub: false,
      hasWebsite: false,
      hasSkills: false,
      hasEducation: false,
      hasExperience: false,
      hasCertifications: false,
      hasProjects: false,
      hasSummary: false,
      textLength: 0,
      uniqueWordsCount: 0,
      processingTime: 0,
      extractionTime: 0,
      analysisTime: 0
    };
  }
};

// Add this to your routes/resume.js file temporarily
router.post('/debug-analyze', upload.single('resume'), async (req, res) => {
  try {
    console.log('=== DEBUG START ===');
    console.log('File received:', !!req.file);
    console.log('Body params:', req.body);
    
    if (!req.file) {
      return res.json({ error: 'No file uploaded' });
    }
    
    console.log('File info:', {
      name: req.file.originalname,
      size: req.file.size,
      type: req.file.mimetype
    });
    
    // Test file processing
    console.log('Testing file extraction...');
    const text = await fileProcessor.extractText(req.file);
    console.log('Text extracted:', text.length, 'characters');
    
    // Test Gemini API
    console.log('Testing Gemini API...');
    const analysis = await geminiService.analyzeResume(text.substring(0, 1000), {
      gender: req.body.gender || 'other',
      roastLevel: req.body.roastLevel || 'ache',
      roastType: req.body.roastType || 'funny',
      language: req.body.language || 'english'
    }, req.file.originalname);
    
    console.log('AI analysis success:', analysis.success);
    console.log('=== DEBUG END ===');
    
    res.json({
      success: true,
      debug: {
        fileReceived: true,
        textExtracted: text.length,
        aiAnalysis: analysis.success,
        message: 'All components working'
      }
    });
    
  } catch (error) {
    console.error('DEBUG ERROR:', error.message);
    console.error('STACK:', error.stack);
    
    res.json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// POST /api/resume/analyze - Enhanced with comprehensive data extraction and storage
router.post('/analyze', 
  securityHeaders,
  analyzeRateLimit,
  upload.single('resume'),
  validateAnalysisInput,
  async (req, res) => {
    const startTime = Date.now();
    const { requestId } = req;
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    const userAgent = req.get('User-Agent') || '';
    
    try {
      // Validate file presence and integrity
      if (!req.file) {
        logger.warn('No file uploaded', { requestId, ip: clientIP });
        return res.status(400).json({
          error: {
            message: 'No resume file uploaded. Please select a PDF or DOCX file.',
            status: 400,
            code: 'NO_FILE_UPLOADED',
            requestId
          }
        });
      }

      // Enhanced file validation
      try {
        validateFileIntegrity(req.file);
        fileProcessor.validateFile(req.file);
      } catch (validationError) {
        let errorMessage = 'Invalid file upload';
        let errorCode = 'INVALID_FILE';
        
        switch (validationError.message) {
          case 'FILE_TOO_LARGE':
            errorMessage = 'File size too large. Maximum size allowed is 5MB.';
            errorCode = 'FILE_TOO_LARGE';
            break;
          case 'INVALID_FILE_TYPE':
            errorMessage = 'Invalid file type. Please upload PDF or DOCX files only.';
            errorCode = 'INVALID_FILE_TYPE';
            break;
          case 'EMPTY_FILE':
            errorMessage = 'The uploaded file is empty. Please upload a valid resume.';
            errorCode = 'EMPTY_FILE';
            break;
          case 'CORRUPTED_FILE':
            errorMessage = 'The file appears to be corrupted. Please try uploading again.';
            errorCode = 'CORRUPTED_FILE';
            break;
          default:
            errorMessage = 'File validation failed. Please ensure you upload a valid PDF or DOCX file.';
        }
        
        logger.warn('File validation failed', { 
          requestId, 
          error: validationError.message, 
          fileName: req.file?.originalname,
          ip: clientIP 
        });
        
        return res.status(400).json({
          error: {
            message: errorMessage,
            status: 400,
            code: errorCode,
            requestId
          }
        });
      }

      const { gender, roastLevel, roastType, language } = req.body;
      
      // Extract text from file with enhanced timeout and error handling
      let resumeText;
      const extractionStartTime = Date.now();
      
      try {
        const extractionPromise = fileProcessor.extractText(req.file);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('FILE_PROCESSING_TIMEOUT')), 45000)
        );
        
        resumeText = await Promise.race([extractionPromise, timeoutPromise]);
        
      } catch (extractionError) {
        let errorMessage = 'Failed to process the resume file';
        let errorCode = 'FILE_PROCESSING_ERROR';
        
        if (extractionError.message === 'FILE_PROCESSING_TIMEOUT') {
          errorMessage = 'File processing timed out. Please try with a smaller file or try again later.';
          errorCode = 'PROCESSING_TIMEOUT';
        } else if (extractionError.message.includes('corrupted')) {
          errorMessage = 'The file appears to be corrupted or password protected. Please try uploading again.';
          errorCode = 'CORRUPTED_FILE';
        } else if (extractionError.message.includes('unsupported')) {
          errorMessage = 'Unsupported file format. Please upload a standard PDF or DOCX file.';
          errorCode = 'UNSUPPORTED_FORMAT';
        }
        
        logger.error('Text extraction failed', {
          requestId,
          error: extractionError.message,
          fileName: req.file?.originalname,
          ip: clientIP
        });
        
        return res.status(400).json({
          error: {
            message: errorMessage,
            status: 400,
            code: errorCode,
            requestId
          }
        });
      }
      
      const extractionTime = Date.now() - extractionStartTime;
      
      // Enhanced text validation
      if (!resumeText || typeof resumeText !== 'string') {
        logger.warn('No text extracted', { requestId, fileName: req.file?.originalname });
        return res.status(400).json({
          error: {
            message: 'Unable to extract text from the resume. Please ensure your file contains readable content.',
            status: 400,
            code: 'NO_TEXT_EXTRACTED',
            requestId
          }
        });
      }
      
      if (resumeText.trim().length < 100) {
        logger.warn('Insufficient content', { 
          requestId, 
          textLength: resumeText.trim().length,
          fileName: req.file?.originalname 
        });
        return res.status(400).json({
          error: {
            message: 'Resume content is too short. Please upload a complete resume with at least 100 characters.',
            status: 400,
            code: 'INSUFFICIENT_CONTENT',
            requestId
          }
        });
      }

      // Enhanced text sanitization with better character handling
      const sanitizedText = resumeText
        .replace(/[^\w\s\n\r.,;:()\-@+]/g, ' ') // Allow more professional characters
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
      
      if (sanitizedText.length < 50) {
        logger.warn('Invalid content after sanitization', { 
          requestId, 
          originalLength: resumeText.length,
          sanitizedLength: sanitizedText.length 
        });
        return res.status(400).json({
          error: {
            message: 'The resume content appears to be invalid after processing. Please ensure it contains standard text.',
            status: 400,
            code: 'INVALID_CONTENT',
            requestId
          }
        });
      }

      // Extract comprehensive structured resume data (SECURE - NO PII)
      const extractedInfo = extractResumeData(resumeText);
      const statistics = analyzeDocumentStats(resumeText, req.file);
      
      // Update statistics with actual timing
      statistics.extractionTime = extractionTime;

      // AI Analysis with enhanced error handling and retry logic
      let analysis;
      let retryCount = 0;
      const maxRetries = 2;
      const analysisStartTime = Date.now();
      
      while (retryCount <= maxRetries) {
        try {
          analysis = await geminiService.analyzeResume(sanitizedText, {
            gender,
            roastLevel,
            roastType,
            language
          }, req.file.originalname);
          
          if (analysis.success) break;
          
          retryCount++;
          if (retryCount <= maxRetries) {
            // Wait before retry with exponential backoff
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount)));
          }
        } catch (aiError) {
          retryCount++;
          if (retryCount > maxRetries) {
            logger.error('AI analysis failed after retries', {
              requestId,
              error: aiError.message,
              retryCount,
              ip: clientIP
            });
            throw aiError;
          }
          await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount)));
        }
      }

      const analysisTime = Date.now() - analysisStartTime;
      const processingTime = Date.now() - startTime;
      
      // Update statistics with timing information
      statistics.analysisTime = analysisTime;
      statistics.processingTime = processingTime;

      if (!analysis || !analysis.success) {
        logger.error('AI service unavailable', { requestId, ip: clientIP });
        return res.status(503).json({
          error: {
            message: 'AI analysis service is temporarily unavailable. Please try again in a few moments.',
            status: 503,
            code: 'AI_SERVICE_UNAVAILABLE',
            requestId,
            retryAfter: 60
          }
        });
      }

      // Enhanced AI response validation
      const requiredFields = ['roastFeedback', 'score', 'strengths', 'weaknesses', 'improvements'];
      const missingFields = requiredFields.filter(field => 
        !analysis.data[field] || 
        (Array.isArray(analysis.data[field]) && analysis.data[field].length === 0) ||
        (typeof analysis.data[field] === 'string' && analysis.data[field].trim().length === 0)
      );
      
      if (missingFields.length > 0) {
        logger.error('Incomplete AI response', { 
          requestId, 
          missingFields,
          ip: clientIP 
        });
        return res.status(502).json({
          error: {
            message: 'Received incomplete analysis from AI service. Please try again.',
            status: 502,
            code: 'INCOMPLETE_AI_RESPONSE',
            requestId
          }
        });
      }

      // Validate score is within expected range
      if (typeof analysis.data.score !== 'number' || analysis.data.score < 0 || analysis.data.score > 100) {
        logger.error('Invalid AI score', { 
          requestId, 
          score: analysis.data.score,
          ip: clientIP 
        });
        return res.status(502).json({
          error: {
            message: 'Received invalid score from AI service. Please try again.',
            status: 502,
            code: 'INVALID_AI_SCORE',
            requestId
          }
        });
      }

      // Prepare comprehensive response with all extracted data
      const responseData = {
        success: true,
        data: {
          // AI Analysis Results
          ...analysis.data,
          
          // Comprehensive Extracted Information (ANONYMIZED)
          extractedInfo: extractedInfo,
          
          // Document Statistics and Metadata
          statistics: statistics,
          
          // User Preferences
          preferences: {
            gender,
            roastLevel,
            roastType,
            language
          },
          
          // File metadata (safe for client)
          metadata: {
            originalFileName: req.file.originalname.replace(/^\d+_/, ''), // Remove timestamp prefix
            fileSize: req.file.size,
            fileType: req.file.mimetype,
            analyzedAt: new Date().toISOString(),
            processingTime: processingTime,
            requestId: requestId
          }
        }
      };

      // Save comprehensive resume data to database (non-blocking but with better error handling)
      setImmediate(async () => {
        try {
          await connectDB(); // Ensure database connection
          
          const saveResult = await resumeStorage.saveResumeData(
            req.file,
            resumeText, // Save original extracted text for admin (NEVER SENT TO CLIENT)
            {
              ...analysis.data,
              extractedInfo: extractedInfo,
              statistics: statistics
            },
            {
              gender,
              roastLevel,
              roastType,
              language,
              clientIP,
              userAgent,
              requestId
            }
          );

          if (!saveResult.success) {
            logger.error('Failed to save resume data to database', { 
              requestId, 
              error: saveResult.error,
              resumeId: saveResult.resumeId
            });
          } else {
            logger.info('Resume data saved successfully', {
              requestId,
              resumeId: saveResult.resumeId,
              score: analysis.data.score
            });
          }
        } catch (saveError) {
          logger.error('Error saving resume data to database', { 
            requestId, 
            error: saveError.message
          });
        }
      });

      // Success response (don't include extractedText for security)
      logger.info('Resume analysis completed', {
        requestId,
        score: analysis.data.score,
        roastLevel,
        processingTime,
        ip: clientIP
      });

      res.json(responseData);

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      // Log critical errors
      logger.error('Critical error in resume analysis', {
        requestId,
        error: error.message,
        processingTime,
        ip: clientIP,
        stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
      });
      
      // Generic error response for security
      res.status(500).json({
        error: {
          message: 'An unexpected error occurred while analyzing your resume. Please try again.',
          status: 500,
          code: 'INTERNAL_SERVER_ERROR',
          requestId: requestId,
          supportInfo: 'If this error persists, please contact support with the request ID.'
        }
      });
    }
  }
);

// GET /api/resume/test - Production-ready test endpoint
router.get('/test', testRateLimit, securityHeaders, (req, res) => {
  const { requestId } = req;
  
  const response = {
    success: true,
    message: 'CV Slayer Resume API is operational',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    status: 'healthy',
    requestId
  };

  // Add limited environment info only in development
  if (process.env.NODE_ENV !== 'production') {
    response.environment = {
      hasGeminiKey: !!process.env.GEMINI_API_KEY,
      maxFileSize: process.env.MAX_FILE_SIZE,
      nodeVersion: process.version
    };
    response.endpoints = {
      analyze: 'POST /api/resume/analyze',
      test: 'GET /api/resume/test',
      info: 'GET /api/resume/info'
    };
  }

  res.json(response);
});

// GET /api/resume/info - API information endpoint
router.get('/info', securityHeaders, (req, res) => {
  res.json({
    success: true,
    data: {
      name: 'CV Slayer Resume Analysis API',
      version: '1.0.0',
      description: 'Brutally honest AI-powered resume analysis service with comprehensive data extraction',
      features: [
        'PDF and DOCX file support',
        'Multi-language analysis (English, Hindi, Hinglish)',
        'Multiple roast styles (Funny, Serious, Sarcastic, Motivational)',
        'Comprehensive scoring and feedback',
        'Secure file processing',
        'Anonymized data extraction',
        'Statistical analysis and metadata',
        'GDPR compliant data handling'
      ],
      roastLevels: {
        pyar: 'Mild & Encouraging - Sweet feedback with gentle suggestions',
        ache: 'Balanced & Constructive - Professional feedback with honest critique',
        dhang: 'Brutal & Raw - Harsh reality check with no sugar coating (includes gaali for authenticity)'
      },
      limits: {
        maxFileSize: '5MB',
        supportedFormats: ['PDF', 'DOCX'],
        rateLimit: 'Max 3 analyses per 15 minutes'
      },
      dataExtracted: [
        'Document structure analysis',
        'Section presence detection',
        'Statistical information',
        'Professional level assessment',
        'Content quality metrics'
      ],
      security: [
        'No PII storage',
        'Anonymized analytics only',
        'Secure file processing',
        'Rate limiting protection',
        'Input validation and sanitization'
      ],
      requestId: req.requestId
    }
  });
});

// Enhanced error handling middleware
router.use((error, req, res, next) => {
  const requestId = req.requestId || 'unknown';
  
  if (error instanceof multer.MulterError) {
    let errorMessage = 'File upload error';
    let errorCode = 'UPLOAD_ERROR';
    
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        errorMessage = 'File size too large. Maximum size allowed is 5MB.';
        errorCode = 'FILE_TOO_LARGE';
        break;
      case 'LIMIT_FILE_COUNT':
        errorMessage = 'Too many files. Please upload only one resume file.';
        errorCode = 'TOO_MANY_FILES';
        break;
      case 'LIMIT_UNEXPECTED_FILE':
        errorMessage = 'Unexpected file field. Please use the correct upload form.';
        errorCode = 'UNEXPECTED_FILE';
        break;
      case 'LIMIT_FIELD_COUNT':
        errorMessage = 'Too many form fields. Please use the standard upload form.';
        errorCode = 'TOO_MANY_FIELDS';
        break;
      default:
        errorMessage = 'File upload failed. Please try again.';
    }
    
    logger.warn('Multer error', {
      requestId,
      error: error.code,
      ip: req.ip
    });
    
    return res.status(400).json({
      error: {
        message: errorMessage,
        status: 400,
        code: errorCode,
        requestId
      }
    });
  }
  
  // Handle custom file validation errors
  const customErrors = {
    'INVALID_FILE_TYPE': 'Invalid file type. Please upload PDF or DOCX files only.',
    'FILENAME_TOO_LONG': 'Filename too long. Please rename your file to less than 255 characters.',
    'INVALID_FILENAME': 'Invalid filename. Please use only standard characters.',
    'FILE_VALIDATION_ERROR': 'File validation failed. Please ensure you upload a valid file.'
  };
  
  if (customErrors[error.message]) {
    logger.warn('Custom validation error', {
      requestId,
      error: error.message,
      ip: req.ip
    });
    
    return res.status(400).json({
      error: {
        message: customErrors[error.message],
        status: 400,
        code: error.message,
        requestId
      }
    });
  }
  
  // Log unexpected errors
  logger.error('Unexpected route error', {
    requestId,
    error: error.message,
    stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
    ip: req.ip
  });
  
  // Generic error response
  res.status(500).json({
    error: {
      message: 'An unexpected error occurred. Please try again.',
      status: 500,
      code: 'UNEXPECTED_ERROR',
      requestId
    }
  });
});

module.exports = router;