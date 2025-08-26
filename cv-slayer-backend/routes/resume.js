const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const geminiService = require('../services/geminiService');
const fileProcessor = require('../services/fileProcessor');
const resumeStorage = require('../services/resumeStorageEnhanced');

const router = express.Router();

// Simple rate limiting
const analyzeRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: {
    error: 'Too many requests. Try again in 15 minutes.'
  },
  standardHeaders: false,
  legacyHeaders: false
});

// Simple file upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'), false);
    }
  }
});

// Simple validation
const validateInput = (req, res, next) => {
  const { gender, roastLevel, roastType, language } = req.body;
  
  const validGenders = ['male', 'female', 'other'];
  const validRoastLevels = ['pyar', 'ache', 'dhang'];
  const validRoastTypes = ['funny', 'serious', 'sarcastic', 'motivational'];
  const validLanguages = ['english', 'hindi', 'hinglish'];
  
  if (!validGenders.includes(gender) || 
      !validRoastLevels.includes(roastLevel) ||
      !validRoastTypes.includes(roastType) ||
      !validLanguages.includes(language)) {
    return res.status(400).json({
      error: 'Invalid input parameters'
    });
  }
  
  next();
};

// Extract basic personal info only
const extractBasicInfo = (text) => {
  try {
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
    const phoneRegex = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;
    const linkedinRegex = /linkedin\.com\/in\/([a-zA-Z0-9\-_]+)/i;
    const githubRegex = /github\.com\/([a-zA-Z0-9\-_]+)/i;
    
    const emailMatch = text.match(emailRegex);
    const phoneMatch = text.match(phoneRegex);
    const linkedinMatch = text.match(linkedinRegex);
    const githubMatch = text.match(githubRegex);
    
    // Extract name from first line
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
  } catch (error) {
    return {
      name: '',
      email: '',
      phone: '',
      linkedin: '',
      github: '',
      address: '',
      website: ''
    };
  }
};

// Main analyze endpoint
router.post('/analyze', 
  analyzeRateLimit,
  upload.single('resume'),
  validateInput,
  async (req, res) => {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    
    try {
      // Basic file validation
      if (!req.file) {
        return res.status(400).json({
          error: 'No file uploaded'
        });
      }
      
      if (req.file.size === 0) {
        return res.status(400).json({
          error: 'Empty file'
        });
      }
      
      const { gender, roastLevel, roastType, language } = req.body;
      
      // Extract text
      let resumeText;
      try {
        resumeText = await fileProcessor.extractText(req.file);
      } catch (error) {
        console.error('Text extraction failed:', error.message);
        return res.status(400).json({
          error: 'Failed to process file'
        });
      }
      
      // Basic text validation
      if (!resumeText || resumeText.trim().length < 50) {
        return res.status(400).json({
          error: 'Insufficient content in resume'
        });
      }
      
      // Clean text
      const cleanText = resumeText
        .replace(/[^\w\s\n\r.,;:()\-@+]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      // Extract basic info
      const extractedInfo = extractBasicInfo(resumeText);
      
      // AI Analysis
      let analysis;
      try {
        analysis = await geminiService.analyzeResume(cleanText, {
          gender,
          roastLevel,
          roastType,
          language
        }, req.file.originalname);
        
        if (!analysis || !analysis.success) {
          throw new Error('AI analysis failed');
        }
      } catch (error) {
        console.error('AI analysis failed:', error.message);
        return res.status(503).json({
          error: 'AI service temporarily unavailable'
        });
      }
      
      const processingTime = Date.now() - startTime;
      
      // Prepare response
      const responseData = {
        success: true,
        data: {
          ...analysis.data,
          extractedInfo: {
            personalInfo: extractedInfo
          },
          preferences: {
            gender,
            roastLevel,
            roastType,
            language
          },
          metadata: {
            originalFileName: req.file.originalname,
            fileSize: req.file.size,
            processingTime,
            requestId
          }
        }
      };
      
      // Save to database (non-blocking)
      setImmediate(async () => {
        try {
          await resumeStorage.saveResumeData(
            req.file,
            resumeText,
            analysis,
            { gender, roastLevel, roastType, language },
            { requestId, clientIP: req.ip }
          );
          console.log('✅ Resume saved:', requestId);
        } catch (error) {
          console.error('❌ Save failed:', error.message);
        }
      });
      
      console.log('✅ Analysis completed:', {
        requestId,
        score: analysis.data.score,
        time: processingTime + 'ms'
      });
      
      res.json(responseData);
      
    } catch (error) {
      console.error('❌ Analysis error:', error.message);
      res.status(500).json({
        error: 'Analysis failed'
      });
    }
  }
);

// Test endpoint
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'CV Slayer API is running',
    timestamp: new Date().toISOString()
  });
});

// Info endpoint
router.get('/info', (req, res) => {
  res.json({
    success: true,
    data: {
      name: 'CV Slayer Resume Analysis API',
      version: '1.0.0',
      roastLevels: {
        pyar: 'Mild & Encouraging',
        ache: 'Balanced & Constructive', 
        dhang: 'Brutal & Raw'
      },
      limits: {
        maxFileSize: '5MB',
        supportedFormats: ['PDF', 'DOCX'],
        rateLimit: 'Max 5 requests per 15 minutes'
      }
    }
  });
});

// Simple error handler
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large (max 5MB)' });
    }
    return res.status(400).json({ error: 'File upload error' });
  }
  
  if (error.message === 'Invalid file type') {
    return res.status(400).json({ error: 'Only PDF and DOCX files allowed' });
  }
  
  console.error('Route error:', error.message);
  res.status(500).json({ error: 'Internal error' });
});

module.exports = router;