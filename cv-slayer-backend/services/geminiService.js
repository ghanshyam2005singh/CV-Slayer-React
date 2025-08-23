const { GoogleGenerativeAI } = require('@google/generative-ai');
const crypto = require('crypto');
const validator = require('validator');
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
    new winston.transports.File({ filename: 'logs/gemini-service.log' }),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' })
  ]
});

// Only add console logging in development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

class GeminiService {
  constructor() {
    this.validateEnvironment();
    
    const apiKey = process.env.GEMINI_API_KEY;
    
    this.genAI = new GoogleGenerativeAI(apiKey);
    
    // Enhanced model configuration for better data extraction
    this.model = this.genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      generationConfig: {
        temperature: 0.6,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 4000,
      },
      safetySettings: [
        {
          category: "HARM_CATEGORY_HARASSMENT",
          threshold: "BLOCK_MEDIUM_AND_ABOVE",
        },
        {
          category: "HARM_CATEGORY_HATE_SPEECH",
          threshold: "BLOCK_MEDIUM_AND_ABOVE",
        },
        {
          category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
          threshold: "BLOCK_MEDIUM_AND_ABOVE",
        },
        {
          category: "HARM_CATEGORY_DANGEROUS_CONTENT",
          threshold: "BLOCK_MEDIUM_AND_ABOVE",
        }
      ]
    });

    // Enhanced retry configuration
    this.maxRetries = 3;
    this.retryDelay = 2000;
    this.requestTimeout = 45000;
    
    // Request tracking for rate limiting
    this.requestCount = 0;
    this.lastRequestTime = 0;
    this.minRequestInterval = 1000;
    this.dailyRequestLimit = parseInt(process.env.GEMINI_DAILY_LIMIT) || 1000;
    this.hourlyRequestLimit = parseInt(process.env.GEMINI_HOURLY_LIMIT) || 100;
    
    // Performance tracking
    this.successCount = 0;
    this.errorCount = 0;
    this.totalProcessingTime = 0;
    this.averageProcessingTime = 0;
    
    // Security tracking
    this.suspiciousRequests = 0;
    this.blockedRequests = 0;
    
    // Initialize cleanup and monitoring
    this.initializeCleanup();
    this.startHealthMonitoring();
    
    logger.info('GeminiService initialized successfully', {
      model: 'gemini-1.5-flash',
      maxRetries: this.maxRetries,
      requestTimeout: this.requestTimeout,
      dailyLimit: this.dailyRequestLimit,
      hourlyLimit: this.hourlyRequestLimit
    });
  }

  validateEnvironment() {
    if (!process.env.GEMINI_API_KEY) {
      logger.error('GEMINI_API_KEY environment variable is required');
      throw new Error('GEMINI_API_KEY environment variable is required');
    }
    
    if (process.env.GEMINI_API_KEY.length < 30) {
      logger.error('Invalid GEMINI_API_KEY format - key too short');
      throw new Error('Invalid GEMINI_API_KEY format');
    }
    
    // Validate API key format (basic check)
    if (!process.env.GEMINI_API_KEY.startsWith('AIza')) {
      logger.warn('GEMINI_API_KEY format may be invalid - expected to start with AIza');
    }
    
    logger.info('Environment validation completed successfully');
  }

  // Initialize cleanup routines
  initializeCleanup() {
    // Reset hourly counters
    setInterval(() => {
      this.requestCount = 0;
      logger.info('Hourly request count reset', {
        successCount: this.successCount,
        errorCount: this.errorCount,
        averageProcessingTime: this.averageProcessingTime
      });
    }, 60 * 60 * 1000);
    
    // Reset daily counters
    setInterval(() => {
      this.successCount = 0;
      this.errorCount = 0;
      this.totalProcessingTime = 0;
      this.averageProcessingTime = 0;
      this.suspiciousRequests = 0;
      this.blockedRequests = 0;
      logger.info('Daily counters reset');
    }, 24 * 60 * 60 * 1000);
  }

  startHealthMonitoring() {
    // Health check every 5 minutes
    setInterval(() => {
      const errorRate = this.errorCount / Math.max(1, this.successCount + this.errorCount) * 100;
      
      if (errorRate > 20) {
        logger.warn('High error rate detected', {
          errorRate: errorRate.toFixed(2),
          successCount: this.successCount,
          errorCount: this.errorCount
        });
      }
      
      if (this.suspiciousRequests > 10) {
        logger.warn('High suspicious request count', {
          suspiciousRequests: this.suspiciousRequests,
          blockedRequests: this.blockedRequests
        });
      }
    }, 5 * 60 * 1000);
  }

  // Enhanced prompt with comprehensive data extraction and cultural roasting
  generatePrompt(resumeText, preferences) {
    const sanitizedPreferences = this.sanitizePreferences(preferences);
    const truncatedText = this.truncateResumeText(resumeText);

    const roastConfigs = {
      pyar: {
        english: { 
          tone: 'gentle, encouraging, and supportive', 
          style: 'like a caring mentor who wants to help you succeed', 
          intensity: 'mild constructive criticism wrapped in positivity and encouragement',
          greeting: 'Hey there! Let me take a loving look at your resume...',
          cultural: 'supportive and nurturing approach'
        },
        hindi: { 
          tone: 'प्यार से, सहायक, और प्रेरणादायक', 
          style: 'एक देखभाल करने वाले गुरु की तरह जो आपकी सफलता चाहता है', 
          intensity: 'हल्की सलाह के साथ बहुत सारी प्रशंसा और प्रेरणा',
          greeting: 'अरे वाह! आपका resume देखते हैं प्यार से...',
          cultural: 'भारतीय पारिवारिक प्रेम के साथ'
        },
        hinglish: { 
          tone: 'pyaar se, helpful, aur motivating', 
          style: 'ek caring elder sibling ki tarah jo genuinely help karna chahta hai', 
          intensity: 'thoda sa honest feedback but mostly encouragement aur positivity',
          greeting: 'Arre yaar! Chaliye dekhtein hain aapka resume pyaar se...',
          cultural: 'desi bhai-behen ka pyaar with motivation'
        }
      },
      ache: {
        english: { 
          tone: 'balanced, honest, and constructively critical', 
          style: 'like a professional career counselor who gives fair assessments', 
          intensity: 'balanced mix of genuine praise and honest areas for improvement',
          greeting: 'Let me give you an honest, professional assessment of your resume...',
          cultural: 'professional but approachable tone'
        },
        hindi: { 
          tone: 'संतुलित, ईमानदार, और रचनात्मक आलोचना', 
          style: 'एक अनुभवी करियर सलाहकार की तरह जो सच्चाई बताता है', 
          intensity: 'प्रशंसा और सुधार के क्षेत्रों का अच्छा संतुलन',
          greeting: 'आइए आपके resume का ईमानदार और संतुलित विश्लेषण करते हैं...',
          cultural: 'व्यावसायिक लेकिन सम्मानजनक तरीके से'
        },
        hinglish: { 
          tone: 'balanced, seedha-saadha, aur constructive', 
          style: 'ek experienced career advisor ki tarah jo sach bolne mein believe karta hai', 
          intensity: 'achhi bhi baat bolenge, improvement areas bhi clearly batayenge',
          greeting: 'Chaliye aapke resume ka seedha-saadha analysis karte hain...',
          cultural: 'professional but desi approach with straight talk'
        }
      },
      dhang: {
        english: { 
          tone: 'brutally honest, savage, and unfiltered', 
          style: 'like a no-nonsense hiring manager who has seen thousands of resumes', 
          intensity: 'harsh but constructive roasting with sharp wit and brutal honesty',
          greeting: 'Alright, let me absolutely roast your resume... I mean, analyze it thoroughly.',
          cultural: 'direct and uncompromising feedback style'
        },
        hindi: { 
          tone: 'बेरहमी से ईमानदार, कठोर, और बिना फिल्टर', 
          style: 'एक सख्त HR मैनेजर की तरह जिसने हजारों resume देखे हैं', 
          intensity: 'कड़ी लेकिन उपयोगी आलोचना तेज़ बुद्धि और सच्चाई के साथ, thoda sa gaali-galoch bhi allowed hai authenticity ke liye',
          greeting: 'ठीक है भाई/बहन, अब सच्चाई बताते हैं आपके resume के बारे में...',
          cultural: 'typical desi uncle/aunty style brutal honesty with occasional mild expletives for emphasis'
        },
        hinglish: { 
          tone: 'bilkul seedha, savage, aur unfiltered', 
          style: 'ek typical desi HR uncle/aunty ki tarah jo sach bol dete hain bina kisi hesitation ke', 
          intensity: 'proper roasting with desi tadka, sharp comments aur brutal honesty, mild gaali bhi chalegi for authentic desi experience',
          greeting: 'Arre bhai/behen, ab batata hun ki aapke resume mein kya ghotala hai...',
          cultural: 'full desi roasting style with cultural references, mild expletives for authenticity, and no-holds-barred feedback'
        }
      }
    };

    const config = roastConfigs[sanitizedPreferences.roastLevel][sanitizedPreferences.language];

    const culturalContext = this.generateCulturalContext(sanitizedPreferences);

    const prompt = `You are an expert resume reviewer and comprehensive data extraction specialist with deep understanding of ${culturalContext}. Your task is to provide detailed feedback AND extract ALL information from this resume.

RESUME CONTENT:
${truncatedText}

ANALYSIS CONFIGURATION:
- Tone: ${config.tone}
- Style: ${config.style}
- Intensity: ${config.intensity}
- Language: ${sanitizedPreferences.language}
- Roast Type: ${sanitizedPreferences.roastType}
- Cultural Context: ${config.cultural}

COMPREHENSIVE REQUIREMENTS:

1. FEEDBACK ANALYSIS:
- Start with: "${config.greeting}"
- Write 4-5 detailed paragraphs of feedback
- Be ${config.tone} throughout
- Include specific examples from the resume
- Make it ${sanitizedPreferences.roastType} and engaging
- Use ${sanitizedPreferences.language} appropriately
- ${sanitizedPreferences.roastLevel === 'dhang' && sanitizedPreferences.language !== 'english' ? 'Feel free to use mild authentic expressions (like "yaar", "arre", "kya bakwas") for cultural authenticity, but keep it constructive' : 'Maintain professional language'}

2. DATA EXTRACTION:
- Extract EVERY piece of information found in the resume
- Look for ALL contact details, skills, experience, education, certifications, projects
- Don't invent information - only extract what's actually present
- Be thorough and comprehensive

3. SCORING:
- Provide a score from 1-100 based on resume quality
- Consider formatting, content, completeness, professionalism

RESPONSE FORMAT (VALID JSON ONLY - NO MARKDOWN):
{
  "roastFeedback": "Your detailed ${sanitizedPreferences.roastType} feedback in ${sanitizedPreferences.language} (4-5 paragraphs)",
  "score": 75,
  "strengths": ["Specific strength 1", "Specific strength 2", "Specific strength 3", "Specific strength 4"],
  "weaknesses": ["Specific weakness 1", "Specific weakness 2", "Specific weakness 3"],
  "improvements": [
    {
      "priority": "high",
      "title": "Improvement Title",
      "description": "Detailed description of what needs improvement",
      "example": "Specific example or suggestion"
    },
    {
      "priority": "medium", 
      "title": "Another Improvement",
      "description": "Description",
      "example": "Example"
    }
  ],
  "extractedInfo": {
    "personalInfo": {
      "name": "Full Name (or null if not found)",
      "email": "email@domain.com (or null)",
      "phone": "Phone number (or null)",
      "address": {
        "full": "Complete address (or null)",
        "city": "City (or null)",
        "state": "State (or null)", 
        "country": "Country (or null)",
        "zipCode": "ZIP code (or null)"
      },
      "socialProfiles": {
        "linkedin": "LinkedIn URL (or null)",
        "github": "GitHub URL (or null)",
        "portfolio": "Portfolio URL (or null)",
        "website": "Personal website (or null)",
        "twitter": "Twitter handle (or null)"
      }
    },
    "professionalSummary": "Summary/Objective text (or null)",
    "skills": {
      "technical": ["Technical skill 1", "Technical skill 2"],
      "soft": ["Soft skill 1", "Soft skill 2"],
      "languages": ["Language 1: Proficiency", "Language 2: Proficiency"],
      "tools": ["Tool 1", "Tool 2"],
      "frameworks": ["Framework 1", "Framework 2"]
    },
    "experience": [
      {
        "title": "Job Title",
        "company": "Company Name",
        "location": "City, State/Country",
        "startDate": "Start Date",
        "endDate": "End Date or 'Present'",
        "duration": "Duration (e.g., '2 years 3 months')",
        "description": "Job description and responsibilities",
        "achievements": ["Achievement 1", "Achievement 2"],
        "technologies": ["Tech used in this role"]
      }
    ],
    "education": [
      {
        "degree": "Degree Name",
        "field": "Field of Study",
        "institution": "University/College Name",
        "location": "City, State/Country",
        "graduationYear": "Year",
        "gpa": "GPA (or null)",
        "honors": ["Honor 1", "Honor 2"],
        "coursework": ["Relevant Course 1", "Course 2"]
      }
    ],
    "certifications": [
      {
        "name": "Certification Name",
        "issuer": "Issuing Organization",
        "dateObtained": "Date",
        "expirationDate": "Expiration Date (or null)",
        "credentialId": "ID (or null)",
        "url": "Verification URL (or null)"
      }
    ],
    "projects": [
      {
        "name": "Project Name",
        "description": "Project description",
        "role": "Your role in project",
        "duration": "Project duration",
        "technologies": ["Tech 1", "Tech 2"],
        "achievements": ["Achievement 1", "Achievement 2"],
        "url": "Project URL (or null)",
        "github": "GitHub URL (or null)"
      }
    ],
    "awards": [
      {
        "title": "Award Title",
        "issuer": "Issuing Organization",
        "date": "Date received",
        "description": "Award description"
      }
    ],
    "publications": [
      {
        "title": "Publication Title",
        "type": "Journal/Conference/Book",
        "date": "Publication Date",
        "description": "Description",
        "url": "URL (or null)"
      }
    ],
    "volunteerWork": [
      {
        "organization": "Organization Name",
        "role": "Volunteer Role",
        "duration": "Duration",
        "description": "Description of work"
      }
    ],
    "interests": ["Interest 1", "Interest 2"],
    "references": "Available upon request / Provided / Not mentioned"
  },
  "resumeAnalytics": {
    "wordCount": 500,
    "pageCount": 1,
    "sectionCount": 6,
    "bulletPointCount": 15,
    "quantifiableAchievements": 3,
    "actionVerbsUsed": 12,
    "industryKeywords": ["keyword1", "keyword2"],
    "readabilityScore": 75,
    "atsCompatibility": "High/Medium/Low",
    "missingElements": ["Missing element 1", "Missing element 2"],
    "strongElements": ["Strong element 1", "Strong element 2"]
  },
  "contactValidation": {
    "hasEmail": true,
    "hasPhone": true,
    "hasLinkedIn": false,
    "hasAddress": true,
    "emailValid": true,
    "phoneValid": true,
    "linkedInValid": false
  }
}

CRITICAL INSTRUCTIONS:
1. Extract ONLY information that actually exists in the resume
2. Use null for missing information, empty arrays for missing lists
3. Be extremely thorough in data extraction
4. Maintain the ${sanitizedPreferences.roastType} tone throughout feedback
5. Provide actionable, specific improvements
6. Score fairly based on actual resume quality
7. Return ONLY valid JSON - no markdown formatting
8. ${sanitizedPreferences.roastLevel === 'dhang' ? 'Feel free to be brutally honest and use authentic cultural expressions for genuine feedback' : 'Maintain appropriate professional tone'}`;

    return prompt;
  }

  generateCulturalContext(preferences) {
    const contexts = {
      english: 'international professional standards and global hiring practices',
      hindi: 'भारतीय कॉर्पोरेट संस्कृति और देसी नौकरी बाजार की समझ',
      hinglish: 'Indian corporate culture mixed with modern global practices, understanding desi job market dynamics'
    };

    let cultural = contexts[preferences.language] || contexts.english;

    if (preferences.roastLevel === 'dhang') {
      cultural += preferences.language === 'english' 
        ? ' with direct, no-nonsense feedback approach'
        : preferences.language === 'hindi'
        ? ' के साथ सीधी-सादी और बेबाक सच्चाई'
        : ' with typical desi uncle/aunty brutally honest style';
    }

    return cultural;
  }
  
  sanitizePreferences(preferences) {
    const validGenders = ['male', 'female', 'other'];
    const validRoastLevels = ['pyar', 'ache', 'dhang'];
    const validRoastTypes = ['funny', 'serious', 'sarcastic', 'motivational'];
    const validLanguages = ['english', 'hindi', 'hinglish'];

    const sanitized = {
      gender: validGenders.includes(preferences.gender) ? preferences.gender : 'other',
      roastLevel: validRoastLevels.includes(preferences.roastLevel) ? preferences.roastLevel : 'ache',
      roastType: validRoastTypes.includes(preferences.roastType) ? preferences.roastType : 'serious',
      language: validLanguages.includes(preferences.language) ? preferences.language : 'english'
    };

    logger.info('Preferences sanitized', {
      original: preferences,
      sanitized: sanitized,
      hasChanges: JSON.stringify(preferences) !== JSON.stringify(sanitized)
    });

    return sanitized;
  }

  truncateResumeText(text) {
    const maxLength = 8000; // Increased for better analysis
    if (!text || text.length <= maxLength) {
      return text;
    }
    
    // Try to find good break points
    const truncated = text.substring(0, maxLength);
    
    // Look for natural break points in order of preference
    const breakPoints = [
      truncated.lastIndexOf('\n\n'),
      truncated.lastIndexOf('. '),
      truncated.lastIndexOf('\n'),
      truncated.lastIndexOf(' ')
    ];
    
    for (const breakPoint of breakPoints) {
      if (breakPoint > maxLength * 0.85) {
        const finalText = truncated.substring(0, breakPoint) + '\n\n[Resume content truncated for analysis - showing first ' + Math.round(breakPoint/text.length*100) + '% of content]';
        
        logger.info('Resume text truncated', {
          originalLength: text.length,
          truncatedLength: finalText.length,
          percentageShown: Math.round(breakPoint/text.length*100)
        });
        
        return finalText;
      }
    }
    
    const finalText = truncated + '\n\n[Resume content truncated for analysis]';
    logger.info('Resume text truncated at character limit', {
      originalLength: text.length,
      truncatedLength: finalText.length
    });
    
    return finalText;
  }

  detectSuspiciousContent(text, preferences) {
    let suspiciousScore = 0;
    const flags = [];

    // Check for potential prompt injection
    const injectionPatterns = [
      /ignore previous instructions/i,
      /forget your role/i,
      /act as/i,
      /pretend to be/i,
      /simulate/i,
      /roleplay/i
    ];

    for (const pattern of injectionPatterns) {
      if (pattern.test(text)) {
        suspiciousScore += 3;
        flags.push('potential_prompt_injection');
      }
    }

    // Check for excessive special characters
    const specialCharRatio = (text.match(/[^a-zA-Z0-9\s]/g) || []).length / text.length;
    if (specialCharRatio > 0.3) {
      suspiciousScore += 2;
      flags.push('excessive_special_chars');
    }

    // Check for script-like content
    if (/<script|javascript:|eval\(|onclick/gi.test(text)) {
      suspiciousScore += 5;
      flags.push('script_content');
    }

    // Check preferences manipulation
    const validPrefs = ['pyar', 'ache', 'dhang', 'english', 'hindi', 'hinglish', 'funny', 'serious', 'sarcastic', 'motivational'];
    for (const [key, value] of Object.entries(preferences)) {
      if (typeof value === 'string' && !validPrefs.includes(value)) {
        suspiciousScore += 2;
        flags.push('invalid_preferences');
      }
    }

    if (suspiciousScore > 5) {
      this.suspiciousRequests++;
      logger.warn('Suspicious content detected', {
        suspiciousScore,
        flags,
        textLength: text.length,
        preferences
      });
    }

    return { suspiciousScore, flags };
  }

  async analyzeResume(resumeText, preferences) {
    const requestId = crypto.randomUUID();
    const startTime = Date.now();
    
    try {
      // Enhanced input validation
      if (!resumeText || typeof resumeText !== 'string') {
        logger.warn('Invalid resume text provided', { requestId });
        throw new Error('INVALID_RESUME_TEXT');
      }

      if (resumeText.trim().length < 50) {
        logger.warn('Resume text too short', { 
          requestId, 
          length: resumeText.trim().length 
        });
        throw new Error('RESUME_TOO_SHORT');
      }

      if (resumeText.length > 50000) {
        logger.warn('Resume text too long', { 
          requestId, 
          length: resumeText.length 
        });
        throw new Error('RESUME_TOO_LONG');
      }

      if (!preferences || typeof preferences !== 'object') {
        logger.warn('Invalid preferences provided', { requestId, preferences });
        throw new Error('INVALID_PREFERENCES');
      }

      // Security check for suspicious content
      const securityCheck = this.detectSuspiciousContent(resumeText, preferences);
      if (securityCheck.suspiciousScore > 8) {
        this.blockedRequests++;
        logger.warn('Request blocked due to suspicious content', {
          requestId,
          suspiciousScore: securityCheck.suspiciousScore,
          flags: securityCheck.flags
        });
        throw new Error('SUSPICIOUS_CONTENT_DETECTED');
      }

      // Rate limiting check
      await this.checkRateLimit();

      logger.info('Starting resume analysis', {
        requestId,
        textLength: resumeText.length,
        preferences: this.sanitizePreferences(preferences)
      });

      const prompt = this.generatePrompt(resumeText, preferences);
      const response = await this.makeRequestWithRetry(prompt, requestId);
      const processingTime = Date.now() - startTime;

      // Enhanced response validation
      this.validateComprehensiveResponse(response);

      // Update success metrics
      this.successCount++;
      this.totalProcessingTime += processingTime;
      this.averageProcessingTime = this.totalProcessingTime / this.successCount;

      logger.info('Resume analysis completed successfully', {
        requestId,
        processingTime,
        score: response.score,
        textLength: resumeText.length
      });

      return {
        success: true,
        data: {
          ...response,
          metadata: {
            requestId,
            processingTime,
            modelUsed: 'gemini-1.5-flash',
            analysisVersion: '3.0',
            timestamp: new Date().toISOString(),
            securityScore: securityCheck.suspiciousScore
          }
        }
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.errorCount++;
      
      logger.error('Resume analysis failed', {
        requestId,
        error: error.message,
        processingTime,
        textLength: resumeText?.length || 0,
        stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
      });
      
      return {
        success: false,
        error: this.getErrorMessage(error.message),
        code: this.getErrorCode(error.message),
        data: this.createErrorResponse(error.message),
        metadata: {
          requestId,
          processingTime,
          error: error.message,
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  // Enhanced rate limiting with multiple tiers
  async checkRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    // Check hourly limit
    if (this.requestCount >= this.hourlyRequestLimit) {
      logger.warn('Hourly rate limit exceeded', {
        requestCount: this.requestCount,
        hourlyLimit: this.hourlyRequestLimit
      });
      throw new Error('HOURLY_RATE_LIMIT_EXCEEDED');
    }
    
    // Minimum interval between requests
    if (timeSinceLastRequest < this.minRequestInterval) {
      const waitTime = this.minRequestInterval - timeSinceLastRequest;
      logger.info('Rate limiting - waiting before request', { waitTime });
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
    this.requestCount++;
    
    // Additional rate limiting for suspicious activity
    if (this.suspiciousRequests > 20) {
      logger.warn('High suspicious activity - applying additional rate limiting');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  async makeRequestWithRetry(prompt, requestId, retryCount = 0) {
    try {
      logger.info('Making Gemini API request', {
        requestId,
        retryCount,
        promptLength: prompt.length
      });

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('REQUEST_TIMEOUT')), this.requestTimeout)
      );

      const requestPromise = this.model.generateContent(prompt);
      
      const result = await Promise.race([requestPromise, timeoutPromise]);
      const response = await result.response;
      const text = response.text();

      if (!text || text.trim().length === 0) {
        logger.warn('Empty response from Gemini API', { requestId });
        throw new Error('EMPTY_RESPONSE');
      }

      if (text.length > 50000) {
        logger.warn('Response too large from Gemini API', { 
          requestId, 
          responseLength: text.length 
        });
        throw new Error('RESPONSE_TOO_LARGE');
      }

      logger.info('Gemini API request successful', {
        requestId,
        responseLength: text.length,
        retryCount
      });

      return this.parseAndValidateResponse(text, requestId);

    } catch (error) {
      logger.error('Gemini API request failed', {
        requestId,
        retryCount,
        error: error.message,
        stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
      });

      if (retryCount < this.maxRetries && this.isRetryableError(error)) {
        const delay = this.retryDelay * Math.pow(2, retryCount);
        logger.info('Retrying Gemini API request', {
          requestId,
          retryCount: retryCount + 1,
          delay
        });
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.makeRequestWithRetry(prompt, requestId, retryCount + 1);
      }
      
      // Map common API errors
      if (error.message.includes('429') || error.message.includes('quota')) {
        throw new Error('RATE_LIMIT_EXCEEDED');
      } else if (error.message.includes('503') || error.message.includes('502')) {
        throw new Error('SERVICE_UNAVAILABLE');
      } else if (error.message.includes('401') || error.message.includes('403')) {
        throw new Error('AUTHENTICATION_ERROR');
      } else if (error.message.includes('400')) {
        throw new Error('INVALID_REQUEST');
      }
      
      throw error;
    }
  }

  parseAndValidateResponse(text, requestId) {
    try {
      let cleanedText = text.trim();
      
      logger.info('Parsing Gemini response', {
        requestId,
        responseLength: cleanedText.length
      });
      
      // Remove various markdown formats more aggressively
      cleanedText = cleanedText.replace(/```json\s*|\s*```/g, '');
      cleanedText = cleanedText.replace(/```\s*|\s*```/g, '');
      cleanedText = cleanedText.replace(/^```.*?\n/gm, '');
      cleanedText = cleanedText.replace(/\n```$/gm, '');
      cleanedText = cleanedText.replace(/^json\s*/gm, '');
      
      // Find JSON boundaries more reliably
      const jsonStart = cleanedText.indexOf('{');
      let jsonEnd = -1;
      
      if (jsonStart !== -1) {
        let braceCount = 0;
        for (let i = jsonStart; i < cleanedText.length; i++) {
          if (cleanedText[i] === '{') braceCount++;
          if (cleanedText[i] === '}') braceCount--;
          if (braceCount === 0) {
            jsonEnd = i + 1;
            break;
          }
        }
      }
      
      if (jsonStart === -1 || jsonEnd === -1) {
        logger.error('No valid JSON found in response', {
          requestId,
          responsePreview: cleanedText.substring(0, 200)
        });
        throw new Error('NO_JSON_FOUND');
      }
      
      const jsonString = cleanedText.slice(jsonStart, jsonEnd);
      
      logger.info('Attempting to parse JSON response', {
        requestId,
        jsonLength: jsonString.length
      });
      
      const jsonResponse = JSON.parse(jsonString);
      
      // Comprehensive validation
      this.validateComprehensiveResponse(jsonResponse);
      
      logger.info('Response parsed and validated successfully', {
        requestId,
        score: jsonResponse.score,
        hasExtractedInfo: !!jsonResponse.extractedInfo
      });
      
      return this.sanitizeComprehensiveResponse(jsonResponse);
      
    } catch (parseError) {
      logger.error('Response parsing failed', {
        requestId,
        error: parseError.message,
        responsePreview: text.substring(0, 200)
      });
      
      if (parseError.name === 'SyntaxError') {
        throw new Error('MALFORMED_JSON');
      }
      
      throw new Error('INVALID_RESPONSE_FORMAT');
    }
  }

  // Enhanced validation for comprehensive response
  validateComprehensiveResponse(response) {
    const requiredFields = ['roastFeedback', 'score', 'strengths', 'weaknesses', 'improvements'];
    
    for (const field of requiredFields) {
      if (!(field in response)) {
        logger.error('Missing required field in response', { field });
        throw new Error(`MISSING_FIELD_${field.toUpperCase()}`);
      }
    }

    // Validate score
    if (typeof response.score !== 'number' || response.score < 0 || response.score > 100) {
      logger.error('Invalid score in response', { score: response.score });
      throw new Error('INVALID_SCORE');
    }

    // Validate arrays
    if (!Array.isArray(response.strengths) || response.strengths.length === 0) {
      logger.error('Invalid strengths array', { strengths: response.strengths });
      throw new Error('INVALID_STRENGTHS');
    }

    if (!Array.isArray(response.weaknesses) || response.weaknesses.length === 0) {
      logger.error('Invalid weaknesses array', { weaknesses: response.weaknesses });
      throw new Error('INVALID_WEAKNESSES');
    }

    if (!Array.isArray(response.improvements) || response.improvements.length === 0) {
      logger.error('Invalid improvements array', { improvements: response.improvements });
      throw new Error('INVALID_IMPROVEMENTS');
    }

    // Validate improvement structure
    for (const improvement of response.improvements) {
      if (!improvement.priority || !improvement.title || !improvement.description) {
        logger.error('Invalid improvement structure', { improvement });
        throw new Error('INVALID_IMPROVEMENT_STRUCTURE');
      }
      
      if (!['high', 'medium', 'low'].includes(improvement.priority)) {
        logger.error('Invalid improvement priority', { priority: improvement.priority });
        throw new Error('INVALID_IMPROVEMENT_PRIORITY');
      }
    }

    // Validate extracted info structure (if present)
    if (response.extractedInfo && typeof response.extractedInfo !== 'object') {
      logger.error('Invalid extracted info structure');
      throw new Error('INVALID_EXTRACTED_INFO_STRUCTURE');
    }

    // Validate resume analytics (if present)
    if (response.resumeAnalytics && typeof response.resumeAnalytics !== 'object') {
      logger.error('Invalid analytics structure');
      throw new Error('INVALID_ANALYTICS_STRUCTURE');
    }

    logger.info('Response validation successful');
  }

  // Enhanced sanitization for comprehensive response
 // Complete the sanitizeComprehensiveResponse method
sanitizeComprehensiveResponse(response) {
  logger.info('Sanitizing comprehensive response');
  
  const sanitized = {
    roastFeedback: validator.escape(response.roastFeedback || '').substring(0, 3000),
    score: Math.max(0, Math.min(100, Math.round(response.score || 0))),
    strengths: (response.strengths || [])
      .slice(0, 6)
      .map(s => validator.escape(String(s)).substring(0, 200))
      .filter(s => s.length > 0),
    weaknesses: (response.weaknesses || [])
      .slice(0, 5)
      .map(w => validator.escape(String(w)).substring(0, 200))
      .filter(w => w.length > 0),
    improvements: (response.improvements || [])
      .slice(0, 6)
      .map(imp => ({
        priority: ['high', 'medium', 'low'].includes(imp.priority) ? imp.priority : 'medium',
        title: validator.escape(String(imp.title || '')).substring(0, 100),
        description: validator.escape(String(imp.description || '')).substring(0, 400),
        example: validator.escape(String(imp.example || '')).substring(0, 250)
      }))
      .filter(imp => imp.title.length > 0 && imp.description.length > 0),
    
    // FIXED: Add proper extractedInfo sanitization
    extractedInfo: this.sanitizeExtractedInfo(response.extractedInfo || {}),
    
    // FIXED: Add proper analytics sanitization
    resumeAnalytics: this.sanitizeResumeAnalytics(response.resumeAnalytics || {}),
    
    // FIXED: Add contact validation sanitization
    contactValidation: this.sanitizeContactValidation(response.contactValidation || {})
  };

  logger.info('Response sanitization completed', {
    hasExtractedInfo: !!sanitized.extractedInfo,
    hasAnalytics: !!sanitized.resumeAnalytics,
    score: sanitized.score
  });

  return sanitized;
}

// FIXED: Add the missing sanitization methods
sanitizeExtractedInfo(extractedInfo) {
  if (!extractedInfo || typeof extractedInfo !== 'object') {
    return {};
  }

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
    
    experience: (extractedInfo.experience || []).slice(0, 15).map(exp => ({
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
      )
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

sanitizeResumeAnalytics(analytics) {
  if (!analytics || typeof analytics !== 'object') {
    return {};
  }

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
  if (!validation || typeof validation !== 'object') {
    return {};
  }

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

  isRetryableError(error) {
    const retryableErrors = [
      'REQUEST_TIMEOUT',
      'QUOTA_EXCEEDED',
      'RATE_LIMITED',
      'SERVICE_UNAVAILABLE',
      'INTERNAL_ERROR',
      'RESPONSE_TOO_LARGE',
      'EMPTY_RESPONSE'
    ];
    
    const isRetryable = retryableErrors.some(retryableError => 
      error.message.includes(retryableError) || 
      error.message.includes('503') || 
      error.message.includes('429') ||
      error.message.includes('502') ||
      error.message.includes('504')
    );

    logger.info('Checking if error is retryable', {
      errorMessage: error.message,
      isRetryable
    });

    return isRetryable;
  }

  getErrorCode(errorMessage) {
    const errorCodes = {
      'INVALID_RESUME_TEXT': 'INVALID_INPUT',
      'RESUME_TOO_SHORT': 'INSUFFICIENT_CONTENT',
      'RESUME_TOO_LONG': 'CONTENT_TOO_LARGE',
      'INVALID_PREFERENCES': 'INVALID_INPUT',
      'REQUEST_TIMEOUT': 'TIMEOUT',
      'EMPTY_RESPONSE': 'SERVICE_ERROR',
      'RESPONSE_TOO_LARGE': 'RESPONSE_ERROR',
      'NO_JSON_FOUND': 'PARSING_ERROR',
      'MALFORMED_JSON': 'PARSING_ERROR',
      'INVALID_RESPONSE_FORMAT': 'PARSING_ERROR',
      'RATE_LIMIT_EXCEEDED': 'RATE_LIMITED',
      'HOURLY_RATE_LIMIT_EXCEEDED': 'RATE_LIMITED',
      'QUOTA_EXCEEDED': 'QUOTA_ERROR',
      'SERVICE_UNAVAILABLE': 'SERVICE_ERROR',
      'AUTHENTICATION_ERROR': 'AUTH_ERROR',
      'INVALID_REQUEST': 'REQUEST_ERROR',
      'SUSPICIOUS_CONTENT_DETECTED': 'SECURITY_ERROR'
    };
    
    return errorCodes[errorMessage] || 'AI_ERROR';
  }

  getErrorMessage(errorMessage) {
    const errorMessages = {
      'INVALID_RESUME_TEXT': 'Invalid resume content provided',
      'RESUME_TOO_SHORT': 'Resume content is too short for comprehensive analysis (minimum 50 characters)',
      'RESUME_TOO_LONG': 'Resume content is too long for processing (maximum 50,000 characters)',
      'INVALID_PREFERENCES': 'Invalid analysis preferences provided',
      'REQUEST_TIMEOUT': 'Analysis request timed out. Please try again with a shorter resume.',
      'EMPTY_RESPONSE': 'Received empty response from AI service',
      'RESPONSE_TOO_LARGE': 'AI response was too large to process',
      'NO_JSON_FOUND': 'Could not parse AI response format',
      'MALFORMED_JSON': 'AI response contains malformed data',
      'INVALID_RESPONSE_FORMAT': 'AI response format is invalid',
      'RATE_LIMIT_EXCEEDED': 'Too many requests. Please wait a moment before trying again.',
      'HOURLY_RATE_LIMIT_EXCEEDED': 'Hourly request limit exceeded. Please try again in an hour.',
      'QUOTA_EXCEEDED': 'Analysis quota exceeded. Please try again later.',
      'SERVICE_UNAVAILABLE': 'AI analysis service is temporarily unavailable',
      'AUTHENTICATION_ERROR': 'AI service authentication failed',
      'INVALID_REQUEST': 'Invalid request format',
      'SUSPICIOUS_CONTENT_DETECTED': 'Content flagged for security review'
    };
    
    return errorMessages[errorMessage] || 'AI analysis service temporarily unavailable';
  }

  createErrorResponse(errorMessage) {
    const baseErrorResponse = {
      roastFeedback: 'We encountered an issue while analyzing your resume. Please try again.',
      score: 0,
      strengths: ['Unable to analyze at this time'],
      weaknesses: ['Analysis failed'],
      improvements: [{
        priority: 'high',
        title: 'Retry Analysis',
        description: 'Please try uploading your resume again.',
        example: 'Ensure your resume is in PDF or DOCX format with readable content'
      }],
      extractedInfo: {
        personalInfo: {
          name: null, email: null, phone: null,
          address: { full: null, city: null, state: null, country: null, zipCode: null },
          socialProfiles: { linkedin: null, github: null, portfolio: null, website: null, twitter: null }
        },
        professionalSummary: null,
        skills: { technical: [], soft: [], languages: [], tools: [], frameworks: [] },
        experience: [], education: [], certifications: [], projects: [],
        awards: [], publications: [], volunteerWork: [], interests: [], references: null
      },
      resumeAnalytics: {
        wordCount: 0, pageCount: 1, sectionCount: 0, bulletPointCount: 0,
        quantifiableAchievements: 0, actionVerbsUsed: 0, industryKeywords: [],
        readabilityScore: 0, atsCompatibility: 'Low',
        missingElements: ['Analysis failed'], strongElements: []
      },
      contactValidation: {
        hasEmail: false, hasPhone: false, hasLinkedIn: false, hasAddress: false,
        emailValid: false, phoneValid: false, linkedInValid: false
      }
    };

    // Customize based on error type
    switch (errorMessage) {
      case 'RESUME_TOO_SHORT':
        baseErrorResponse.roastFeedback = 'Your resume content appears to be too short for a comprehensive analysis. Please ensure you upload a complete resume with at least 50 characters of meaningful content.';
        baseErrorResponse.improvements[0].description = 'Upload a complete resume with more content including your experience, education, and skills.';
        break;
        
      case 'RESUME_TOO_LONG':
        baseErrorResponse.roastFeedback = 'Your resume content is too long for our system to process. Please try with a shorter version or split it into multiple pages.';
        baseErrorResponse.improvements[0].description = 'Reduce the resume length to under 50,000 characters or use a more concise format.';
        break;
        
      case 'RATE_LIMIT_EXCEEDED':
      case 'HOURLY_RATE_LIMIT_EXCEEDED':
        baseErrorResponse.roastFeedback = 'You\'ve made too many analysis requests. Please wait a moment before trying again.';
        baseErrorResponse.improvements[0].description = 'Wait a few minutes before submitting another resume for analysis.';
        break;

      case 'SUSPICIOUS_CONTENT_DETECTED':
        baseErrorResponse.roastFeedback = 'Your submission has been flagged for security review. Please ensure your resume contains only professional content.';
        baseErrorResponse.improvements[0].description = 'Upload a standard professional resume without unusual formatting or content.';
        break;
        
      default:
        baseErrorResponse.roastFeedback = 'We encountered a technical issue while analyzing your resume. Our AI service may be temporarily unavailable. Please try again in a few moments.';
    }

    return baseErrorResponse;
  }

  // Get comprehensive service health and statistics
  getServiceHealth() {
    const errorRate = this.errorCount / Math.max(1, this.successCount + this.errorCount) * 100;
    
    return {
      healthy: errorRate < 50, // Consider unhealthy if error rate > 50%
      timestamp: new Date().toISOString(),
      statistics: {
        requestCount: this.requestCount,
        successCount: this.successCount,
        errorCount: this.errorCount,
        errorRate: parseFloat(errorRate.toFixed(2)),
        averageProcessingTime: Math.round(this.averageProcessingTime),
        lastRequestTime: this.lastRequestTime,
        suspiciousRequests: this.suspiciousRequests,
        blockedRequests: this.blockedRequests
      },
      configuration: {
        model: 'gemini-1.5-flash',
        maxOutputTokens: 4000,
        temperature: 0.6,
        safetySettings: 'enabled',
        maxRetries: this.maxRetries,
        requestTimeout: this.requestTimeout,
        hourlyLimit: this.hourlyRequestLimit,
        dailyLimit: this.dailyRequestLimit
      },
      rateLimit: {
        requestsThisHour: this.requestCount,
        hourlyLimit: this.hourlyRequestLimit,
        minRequestInterval: this.minRequestInterval,
        isNearLimit: this.requestCount > this.hourlyRequestLimit * 0.8
      },
      security: {
        suspiciousRequests: this.suspiciousRequests,
        blockedRequests: this.blockedRequests,
        securityChecksEnabled: true
      }
    };
  }

  // Get detailed service metrics for monitoring
  getDetailedMetrics() {
    return {
      performance: {
        successCount: this.successCount,
        errorCount: this.errorCount,
        totalProcessingTime: this.totalProcessingTime,
        averageProcessingTime: this.averageProcessingTime,
        requestCount: this.requestCount
      },
      security: {
        suspiciousRequests: this.suspiciousRequests,
        blockedRequests: this.blockedRequests,
        securityScore: Math.max(0, 100 - (this.suspiciousRequests * 2) - (this.blockedRequests * 5))
      },
      rateLimit: {
        hourlyUsage: this.requestCount,
        hourlyLimit: this.hourlyRequestLimit,
        utilizationPercentage: (this.requestCount / this.hourlyRequestLimit * 100).toFixed(2)
      },
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = new GeminiService();