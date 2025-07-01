const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const validator = require('validator');
const crypto = require('crypto');
const helmet = require('helmet');
const geminiService = require('../services/geminiService');
const fileProcessor = require('../services/fileProcessor');
const logger = require('../utils/logger');
const resumeStorage = require('../services/resumeStorageEnhanced');
const { connectDB } = require('../config/database');

const router = express.Router();

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
  skip: (req) => {
    return process.env.NODE_ENV === 'development' && process.env.SKIP_RATE_LIMIT === 'true';
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
          .replace(/[^a-zA-Z0-9.-]/g, '_')
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

// Enhanced function to extract comprehensive structured resume data
const extractResumeData = (resumeText) => {
  try {
    // Initialize extracted information structure
    const extractedInfo = {
      name: null,
      email: null,
      phone: null,
      address: null,
      linkedin: null,
      github: null,
      website: null,
      portfolio: null,
      jobTitle: null,
      summary: null,
      objective: null,
      skills: [],
      technicalSkills: [],
      softSkills: [],
      languages: [],
      experience: [],
      education: [],
      certifications: [],
      projects: [],
      awards: [],
      publications: [],
      volunteerWork: [],
      hobbies: [],
      references: [],
      keywords: [],
      totalExperienceYears: 0,
      city: null,
      state: null,
      country: null,
      experienceLevel: 'unknown'
    };

    const text = resumeText.toLowerCase();
    const lines = resumeText.split('\n').map(line => line.trim()).filter(line => line.length > 0);

    // Extract email with better pattern
    const emailMatch = resumeText.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
    if (emailMatch) {
      extractedInfo.email = emailMatch[0].toLowerCase();
    }

    // Extract phone number with international support
    const phonePatterns = [
      /(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/,
      /(?:\+?91[-.\s]?)?[6-9]\d{9}/,
      /(?:\+?44[-.\s]?)?[1-9]\d{8,10}/
    ];
    
    for (const pattern of phonePatterns) {
      const phoneMatch = resumeText.match(pattern);
      if (phoneMatch) {
        extractedInfo.phone = phoneMatch[0];
        break;
      }
    }

    // Extract social profiles
    const linkedinMatch = resumeText.match(/(?:linkedin\.com\/in\/|linkedin\.com\/profile\/view\?id=)([a-zA-Z0-9-]+)/i);
    if (linkedinMatch) {
      extractedInfo.linkedin = `https://linkedin.com/in/${linkedinMatch[1]}`;
    }

    const githubMatch = resumeText.match(/(?:github\.com\/)([a-zA-Z0-9-]+)/i);
    if (githubMatch) {
      extractedInfo.github = `https://github.com/${githubMatch[1]}`;
    }

    // Extract website/portfolio
    const websiteMatch = resumeText.match(/(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+\.[a-zA-Z]{2,})/i);
    if (websiteMatch && !websiteMatch[0].includes('linkedin') && !websiteMatch[0].includes('github')) {
      extractedInfo.website = websiteMatch[0].startsWith('http') ? websiteMatch[0] : `https://${websiteMatch[0]}`;
    }

    // Extract name (improved logic)
    for (let i = 0; i < Math.min(5, lines.length); i++) {
      const line = lines[i];
      if (line.length > 3 && line.length < 50 && 
          /^[A-Za-z\s.']+$/.test(line) && 
          line.split(' ').length >= 2 && 
          line.split(' ').length <= 4 &&
          !line.toLowerCase().includes('resume') &&
          !line.toLowerCase().includes('cv')) {
        extractedInfo.name = line;
        break;
      }
    }

    // Extract job title/objective
    const titleKeywords = ['software engineer', 'developer', 'manager', 'analyst', 'consultant', 'director', 'lead'];
    for (const line of lines.slice(0, 10)) {
      if (titleKeywords.some(keyword => line.toLowerCase().includes(keyword))) {
        extractedInfo.jobTitle = line;
        break;
      }
    }

    // Extract summary/objective
    const summaryMatch = resumeText.match(/(?:summary|profile|objective|about)[:\s]*([^]*?)(?:\n\s*\n|experience|education|skills|$)/i);
    if (summaryMatch) {
      extractedInfo.summary = summaryMatch[1].trim().substring(0, 500);
    }

    // Enhanced skills extraction
    const skillsSection = resumeText.match(/(?:skills?|technical skills?|core competencies|technologies)[:\s]*([^]*?)(?:\n\s*\n|experience|education|projects|$)/i);
    if (skillsSection) {
      const skillsText = skillsSection[1];
      const skills = skillsText
        .split(/[,\n•·\-\*\|]/)
        .map(skill => skill.trim())
        .filter(skill => skill.length > 1 && skill.length < 30)
        .slice(0, 30);
      
      extractedInfo.skills = skills;
      
      // Categorize skills
      const techKeywords = ['javascript', 'python', 'java', 'react', 'node', 'sql', 'aws', 'docker', 'git'];
      const softKeywords = ['leadership', 'communication', 'teamwork', 'problem solving', 'management'];
      
      extractedInfo.technicalSkills = skills.filter(skill => 
        techKeywords.some(keyword => skill.toLowerCase().includes(keyword))
      );
      
      extractedInfo.softSkills = skills.filter(skill => 
        softKeywords.some(keyword => skill.toLowerCase().includes(keyword))
      );
    }

    // Enhanced experience extraction
    const experienceSection = resumeText.match(/(?:experience|work experience|employment history)[:\s]*([^]*?)(?:\n\s*\n|education|skills|projects|$)/i);
    if (experienceSection) {
      const expText = experienceSection[1];
      const experiences = expText.split(/\n\n/).filter(exp => exp.trim().length > 20);
      
      extractedInfo.experience = experiences.slice(0, 10).map(exp => {
        const lines = exp.split('\n').filter(line => line.trim());
        return {
          title: lines[0] ? lines[0].substring(0, 100) : 'N/A',
          company: lines[1] ? lines[1].substring(0, 100) : 'N/A',
          duration: 'N/A',
          description: exp.substring(0, 500)
        };
      });
      
      // Calculate total experience years
      const yearMatches = expText.match(/(\d{4})/g);
      if (yearMatches && yearMatches.length >= 2) {
        const years = yearMatches.map(y => parseInt(y)).sort();
        extractedInfo.totalExperienceYears = years[years.length - 1] - years[0];
      }
    }

    // Enhanced education extraction
    const educationSection = resumeText.match(/(?:education|academic background|qualifications)[:\s]*([^]*?)(?:\n\s*\n|experience|skills|projects|$)/i);
    if (educationSection) {
      const eduText = educationSection[1];
      const educations = eduText.split(/\n\n/).filter(edu => edu.trim().length > 10);
      
      extractedInfo.education = educations.slice(0, 5).map(edu => {
        const lines = edu.split('\n').filter(line => line.trim());
        return {
          degree: lines[0] ? lines[0].substring(0, 100) : 'N/A',
          institution: lines[1] ? lines[1].substring(0, 100) : 'N/A',
          year: 'N/A'
        };
      });
    }

    // Extract certifications
    const certSection = resumeText.match(/(?:certifications?|licenses?)[:\s]*([^]*?)(?:\n\s*\n|experience|education|skills|$)/i);
    if (certSection) {
      const certText = certSection[1];
      const certs = certText.split(/\n/).filter(cert => cert.trim().length > 5);
      
      extractedInfo.certifications = certs.slice(0, 10).map(cert => ({
        name: cert.substring(0, 100),
        issuer: 'N/A',
        date: 'N/A'
      }));
    }

    // Extract projects
    const projectSection = resumeText.match(/(?:projects?|portfolio)[:\s]*([^]*?)(?:\n\s*\n|experience|education|skills|$)/i);
    if (projectSection) {
      const projText = projectSection[1];
      const projects = projText.split(/\n\n/).filter(proj => proj.trim().length > 15);
      
      extractedInfo.projects = projects.slice(0, 10).map(proj => {
        const lines = proj.split('\n').filter(line => line.trim());
        return {
          name: lines[0] ? lines[0].substring(0, 100) : 'N/A',
          description: proj.substring(0, 300),
          technologies: []
        };
      });
    }

    // Determine experience level
    if (extractedInfo.totalExperienceYears === 0) {
      extractedInfo.experienceLevel = 'entry';
    } else if (extractedInfo.totalExperienceYears <= 2) {
      extractedInfo.experienceLevel = 'junior';
    } else if (extractedInfo.totalExperienceYears <= 5) {
      extractedInfo.experienceLevel = 'mid';
    } else if (extractedInfo.totalExperienceYears <= 10) {
      extractedInfo.experienceLevel = 'senior';
    } else {
      extractedInfo.experienceLevel = 'executive';
    }

    // Extract keywords for searchability
    const commonKeywords = [
      'JavaScript', 'Python', 'Java', 'React', 'Node.js', 'HTML', 'CSS', 'SQL',
      'MongoDB', 'MySQL', 'Git', 'Docker', 'AWS', 'Azure', 'Leadership',
      'Management', 'Communication', 'Problem Solving', 'Team Work', 'Agile',
      'Scrum', 'Machine Learning', 'AI', 'Data Science', 'Full Stack'
    ];
    
    extractedInfo.keywords = commonKeywords.filter(keyword => 
      text.includes(keyword.toLowerCase())
    );

    return extractedInfo;
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      logger.error('Error extracting resume data:', error);
    }
    return {
      name: null,
      email: null,
      phone: null,
      skills: [],
      experience: [],
      education: [],
      keywords: []
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

    // Count different sections
    const skillsCount = (resumeText.match(/skills?|technical|competencies/gi) || []).length;
    const experienceCount = (resumeText.match(/experience|work|employment/gi) || []).length;
    const educationCount = (resumeText.match(/education|academic|degree/gi) || []).length;
    const projectsCount = (resumeText.match(/projects?|portfolio/gi) || []).length;
    const certificationsCount = (resumeText.match(/certifications?|licenses?/gi) || []).length;

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
      skillsCount,
      experienceCount,
      educationCount,
      projectsCount,
      certificationsCount,
      processingTime: 0,
      extractionTime: 0,
      analysisTime: 0
    };
  } catch (error) {
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
      skillsCount: 0,
      experienceCount: 0,
      educationCount: 0,
      projectsCount: 0,
      certificationsCount: 0,
      processingTime: 0,
      extractionTime: 0,
      analysisTime: 0
    };
  }
};

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
        return res.status(400).json({
          error: {
            message: 'The resume content appears to be invalid after processing. Please ensure it contains standard text.',
            status: 400,
            code: 'INVALID_CONTENT',
            requestId
          }
        });
      }

      // Extract comprehensive structured resume data
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
          });
          
          if (analysis.success) break;
          
          retryCount++;
          if (retryCount <= maxRetries) {
            // Wait before retry with exponential backoff
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount)));
          }
        } catch (aiError) {
          retryCount++;
          if (retryCount > maxRetries) {
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
          
          // Comprehensive Extracted Information
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
            resumeText, // Save original extracted text for admin
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

          if (!saveResult.success && process.env.NODE_ENV !== 'production') {
            logger.warn('Failed to save resume data to database', { 
              requestId, 
              error: saveResult.error,
              resumeId: saveResult.resumeId
            });
          }
        } catch (saveError) {
          if (process.env.NODE_ENV !== 'production') {
            logger.error('Error saving resume data to database', { 
              requestId, 
              error: saveError.message,
              stack: saveError.stack
            });
          }
        }
      });

      // Success response (don't include extractedText for security)
      res.json(responseData);

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      // Log critical errors (development only)
      if (process.env.NODE_ENV !== 'production') {
        logger.error('Critical error in resume analysis', {
          requestId,
          error: error.message,
          stack: error.stack,
          processingTime,
          clientIP
        });
      }
      
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
        'Structured data extraction',
        'Personal information extraction',
        'Skills and experience parsing',
        'Education and certification tracking',
        'Project and achievement analysis',
        'Statistical analysis and metadata',
        'Admin panel data storage'
      ],
      limits: {
        maxFileSize: '5MB',
        supportedFormats: ['PDF', 'DOCX'],
        rateLimit: 'Max 3 analyses per 15 minutes'
      },
      dataExtracted: [
        'Personal Information (Name, Email, Phone, Address)',
        'Professional Profiles (LinkedIn, GitHub, Website)',
        'Skills (Technical, Soft Skills, Languages)',
        'Work Experience and Career History',
        'Education and Academic Background',
        'Certifications and Licenses',
        'Projects and Portfolio',
        'Awards and Achievements',
        'Document Statistics and Metadata'
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
    return res.status(400).json({
      error: {
        message: customErrors[error.message],
        status: 400,
        code: error.message,
        requestId
      }
    });
  }
  
  // Log unexpected errors (development only)
  if (process.env.NODE_ENV !== 'production') {
    logger.error('Unexpected route error', {
      requestId,
      error: error.message,
      stack: error.stack
    });
  }
  
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