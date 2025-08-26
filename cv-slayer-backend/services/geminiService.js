const { GoogleGenerativeAI } = require('@google/generative-ai');
const crypto = require('crypto');

class GeminiService {
  constructor() {
    this.validateEnvironment();
    
    const apiKey = process.env.GEMINI_API_KEY;
    this.genAI = new GoogleGenerativeAI(apiKey);
    
    this.model = this.genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      generationConfig: {
        temperature: 0.6,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 4000,
      }
    });

    this.maxRetries = 2;
    this.retryDelay = 1000;
    this.requestTimeout = 30000;
    
    console.log('✅ GeminiService initialized');
  }

  validateEnvironment() {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }
    
    if (process.env.GEMINI_API_KEY.length < 30) {
      throw new Error('Invalid GEMINI_API_KEY format');
    }
  }

  generatePrompt(resumeText, preferences) {
    const sanitizedPreferences = this.sanitizePreferences(preferences);
    const truncatedText = this.truncateResumeText(resumeText);

    const roastConfigs = {
      pyar: {
        english: { tone: 'gentle and encouraging', greeting: 'Let me take a loving look at your resume...' },
        hindi: { tone: 'प्यार से और प्रेरणादायक', greeting: 'आपका resume देखते हैं प्यार से...' },
        hinglish: { tone: 'pyaar se aur motivating', greeting: 'Chaliye dekhtein hain aapka resume pyaar se...' }
      },
      ache: {
        english: { tone: 'balanced and constructive', greeting: 'Let me give you an honest assessment...' },
        hindi: { tone: 'संतुलित और रचनात्मक', greeting: 'आइए आपके resume का संतुलित विश्लेषण करते हैं...' },
        hinglish: { tone: 'balanced aur constructive', greeting: 'Chaliye aapke resume ka seedha analysis karte hain...' }
      },
      dhang: {
        english: { tone: 'brutally honest and direct', greeting: 'Alright, let me roast your resume...' },
        hindi: { tone: 'बेरहमी से ईमानदार', greeting: 'ठीक है, अब सच्चाई बताते हैं...' },
        hinglish: { tone: 'bilkul seedha aur savage', greeting: 'Arre bhai/behen, ab batata hun ki kya ghotala hai...' }
      }
    };

    const config = roastConfigs[sanitizedPreferences.roastLevel][sanitizedPreferences.language];

    const prompt = `You are an expert resume reviewer. Analyze this resume and provide feedback.

RESUME CONTENT:
${truncatedText}

ANALYSIS REQUIREMENTS:
- Tone: ${config.tone}
- Language: ${sanitizedPreferences.language}
- Roast Type: ${sanitizedPreferences.roastType}
- Start with: "${config.greeting}"

Provide detailed feedback, extract basic information, and score the resume.

RESPONSE FORMAT (VALID JSON ONLY):
{
  "roastFeedback": "Your detailed feedback (3-4 paragraphs)",
  "score": 75,
  "strengths": ["Strength 1", "Strength 2", "Strength 3"],
  "weaknesses": ["Weakness 1", "Weakness 2", "Weakness 3"],
  "improvements": [
    {
      "priority": "high",
      "title": "Improvement Title",
      "description": "Description",
      "example": "Example"
    }
  ],
  "extractedInfo": {
    "personalInfo": {
      "name": "Name or null",
      "email": "Email or null",
      "phone": "Phone or null",
      "address": "Address or null",
      "linkedin": "LinkedIn or null",
      "github": "GitHub or null",
      "website": "Website or null"
    },
    "skills": {
      "technical": ["Skill 1", "Skill 2"],
      "soft": ["Soft skill 1", "Soft skill 2"]
    },
    "experience": [
      {
        "title": "Job Title",
        "company": "Company",
        "duration": "Duration",
        "description": "Description"
      }
    ],
    "education": [
      {
        "degree": "Degree",
        "institution": "Institution",
        "year": "Year"
      }
    ]
  }
}`;

    return prompt;
  }

  sanitizePreferences(preferences) {
    const validGenders = ['male', 'female', 'other'];
    const validRoastLevels = ['pyar', 'ache', 'dhang'];
    const validRoastTypes = ['funny', 'serious', 'sarcastic', 'motivational'];
    const validLanguages = ['english', 'hindi', 'hinglish'];

    return {
      gender: validGenders.includes(preferences.gender) ? preferences.gender : 'other',
      roastLevel: validRoastLevels.includes(preferences.roastLevel) ? preferences.roastLevel : 'ache',
      roastType: validRoastTypes.includes(preferences.roastType) ? preferences.roastType : 'serious',
      language: validLanguages.includes(preferences.language) ? preferences.language : 'english'
    };
  }

  truncateResumeText(text) {
    const maxLength = 6000;
    if (!text || text.length <= maxLength) {
      return text;
    }
    
    const truncated = text.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    
    if (lastSpace > maxLength * 0.8) {
      return truncated.substring(0, lastSpace) + '\n\n[Content truncated for analysis]';
    }
    
    return truncated + '\n\n[Content truncated for analysis]';
  }

  async analyzeResume(resumeText, preferences) {
    const requestId = crypto.randomUUID();
    const startTime = Date.now();
    
    try {
      // Basic validation
      if (!resumeText || typeof resumeText !== 'string') {
        throw new Error('INVALID_RESUME_TEXT');
      }

      if (resumeText.trim().length < 50) {
        throw new Error('RESUME_TOO_SHORT');
      }

      if (resumeText.length > 50000) {
        throw new Error('RESUME_TOO_LONG');
      }

      if (!preferences || typeof preferences !== 'object') {
        throw new Error('INVALID_PREFERENCES');
      }

      console.log('🚀 Starting resume analysis:', requestId);

      const prompt = this.generatePrompt(resumeText, preferences);
      const response = await this.makeRequestWithRetry(prompt, requestId);
      const processingTime = Date.now() - startTime;

      console.log('✅ Analysis completed:', {
        requestId,
        score: response.score,
        time: processingTime + 'ms'
      });

      return {
        success: true,
        data: {
          ...response,
          metadata: {
            requestId,
            processingTime,
            modelUsed: 'gemini-1.5-flash',
            timestamp: new Date().toISOString()
          }
        }
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      console.error('❌ Analysis failed:', {
        requestId,
        error: error.message,
        time: processingTime + 'ms'
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

  async makeRequestWithRetry(prompt, requestId, retryCount = 0) {
    try {
      console.log('📡 Making Gemini API request:', { requestId, retryCount });

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('REQUEST_TIMEOUT')), this.requestTimeout)
      );

      const requestPromise = this.model.generateContent(prompt);
      
      const result = await Promise.race([requestPromise, timeoutPromise]);
      const response = await result.response;
      const text = response.text();

      if (!text || text.trim().length === 0) {
        throw new Error('EMPTY_RESPONSE');
      }

      return this.parseAndValidateResponse(text, requestId);

    } catch (error) {
      console.error('❌ API request failed:', {
        requestId,
        retryCount,
        error: error.message
      });

      if (retryCount < this.maxRetries && this.isRetryableError(error)) {
        const delay = this.retryDelay * Math.pow(2, retryCount);
        console.log('🔄 Retrying in', delay + 'ms');
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.makeRequestWithRetry(prompt, requestId, retryCount + 1);
      }
      
      throw error;
    }
  }

  parseAndValidateResponse(text, requestId) {
    try {
      let cleanedText = text.trim();
      
      // Remove markdown formatting
      cleanedText = cleanedText.replace(/```json\s*|\s*```/g, '');
      cleanedText = cleanedText.replace(/```\s*|\s*```/g, '');
      cleanedText = cleanedText.replace(/^```.*?\n/gm, '');
      
      // Find JSON boundaries
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
        throw new Error('NO_JSON_FOUND');
      }
      
      const jsonString = cleanedText.slice(jsonStart, jsonEnd);
      const jsonResponse = JSON.parse(jsonString);
      
      // Basic validation
      this.validateResponse(jsonResponse);
      
      return this.sanitizeResponse(jsonResponse);
      
    } catch (parseError) {
      console.error('❌ Response parsing failed:', {
        requestId,
        error: parseError.message
      });
      
      throw new Error('INVALID_RESPONSE_FORMAT');
    }
  }

  validateResponse(response) {
    const requiredFields = ['roastFeedback', 'score', 'strengths', 'weaknesses', 'improvements'];
    
    for (const field of requiredFields) {
      if (!(field in response)) {
        throw new Error(`MISSING_FIELD_${field.toUpperCase()}`);
      }
    }

    if (typeof response.score !== 'number' || response.score < 0 || response.score > 100) {
      throw new Error('INVALID_SCORE');
    }

    if (!Array.isArray(response.strengths) || response.strengths.length === 0) {
      throw new Error('INVALID_STRENGTHS');
    }

    if (!Array.isArray(response.weaknesses) || response.weaknesses.length === 0) {
      throw new Error('INVALID_WEAKNESSES');
    }

    if (!Array.isArray(response.improvements) || response.improvements.length === 0) {
      throw new Error('INVALID_IMPROVEMENTS');
    }
  }

  sanitizeResponse(response) {
    return {
      roastFeedback: String(response.roastFeedback || '').substring(0, 3000),
      score: Math.max(0, Math.min(100, Math.round(response.score || 0))),
      strengths: (response.strengths || [])
        .slice(0, 5)
        .map(s => String(s).substring(0, 200))
        .filter(s => s.length > 0),
      weaknesses: (response.weaknesses || [])
        .slice(0, 5)
        .map(w => String(w).substring(0, 200))
        .filter(w => w.length > 0),
      improvements: (response.improvements || [])
        .slice(0, 5)
        .map(imp => ({
          priority: ['high', 'medium', 'low'].includes(imp.priority) ? imp.priority : 'medium',
          title: String(imp.title || '').substring(0, 100),
          description: String(imp.description || '').substring(0, 400),
          example: String(imp.example || '').substring(0, 250)
        }))
        .filter(imp => imp.title.length > 0 && imp.description.length > 0),
      extractedInfo: response.extractedInfo || {}
    };
  }

  isRetryableError(error) {
    const retryableErrors = [
      'REQUEST_TIMEOUT',
      'QUOTA_EXCEEDED',
      'RATE_LIMITED',
      'SERVICE_UNAVAILABLE',
      'EMPTY_RESPONSE'
    ];
    
    return retryableErrors.some(retryableError => 
      error.message.includes(retryableError) || 
      error.message.includes('503') || 
      error.message.includes('429') ||
      error.message.includes('502')
    );
  }

  getErrorCode(errorMessage) {
    const errorCodes = {
      'INVALID_RESUME_TEXT': 'INVALID_INPUT',
      'RESUME_TOO_SHORT': 'INSUFFICIENT_CONTENT',
      'RESUME_TOO_LONG': 'CONTENT_TOO_LARGE',
      'INVALID_PREFERENCES': 'INVALID_INPUT',
      'REQUEST_TIMEOUT': 'TIMEOUT',
      'EMPTY_RESPONSE': 'SERVICE_ERROR',
      'NO_JSON_FOUND': 'PARSING_ERROR',
      'INVALID_RESPONSE_FORMAT': 'PARSING_ERROR'
    };
    
    return errorCodes[errorMessage] || 'AI_ERROR';
  }

  getErrorMessage(errorMessage) {
    const errorMessages = {
      'INVALID_RESUME_TEXT': 'Invalid resume content provided',
      'RESUME_TOO_SHORT': 'Resume content is too short for analysis',
      'RESUME_TOO_LONG': 'Resume content is too long for processing',
      'INVALID_PREFERENCES': 'Invalid analysis preferences provided',
      'REQUEST_TIMEOUT': 'Analysis request timed out',
      'EMPTY_RESPONSE': 'Received empty response from AI service',
      'NO_JSON_FOUND': 'Could not parse AI response',
      'INVALID_RESPONSE_FORMAT': 'AI response format is invalid'
    };
    
    return errorMessages[errorMessage] || 'AI analysis service temporarily unavailable';
  }

  createErrorResponse(errorMessage) {
    return {
      roastFeedback: 'We encountered an issue while analyzing your resume. Please try again.',
      score: 0,
      strengths: ['Unable to analyze at this time'],
      weaknesses: ['Analysis failed'],
      improvements: [{
        priority: 'high',
        title: 'Retry Analysis',
        description: 'Please try uploading your resume again.',
        example: 'Ensure your resume is in PDF or DOCX format'
      }],
      extractedInfo: {
        personalInfo: {
          name: null,
          email: null,
          phone: null,
          address: null,
          linkedin: null,
          github: null,
          website: null
        },
        skills: {
          technical: [],
          soft: []
        },
        experience: [],
        education: []
      }
    };
  }
}

module.exports = new GeminiService();