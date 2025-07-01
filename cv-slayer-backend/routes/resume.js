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
  max: process.env.NODE_ENV === 'production' ? 3 : 10,
  message: {
    error: {
      message: 'Too many resume analysis requests. Please try again in 15 minutes.',
      status: 429,
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: 900
    }
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Enhanced multer configuration
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024, // 5MB
    files: 1
  },
  fileFilter: (req, file, cb) => {
    try {
      const allowedTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ];
      
      const allowedExtensions = ['.pdf', '.doc', '.docx'];
      const fileExtension = '.' + file.originalname.split('.').pop().toLowerCase();
      
      if (allowedTypes.includes(file.mimetype) && allowedExtensions.includes(fileExtension)) {
        // Generate secure filename with timestamp
        const timestamp = Date.now();
        const sanitizedName = file.originalname
          .replace(/[^a-zA-Z0-9.-]/g, '_')
          .substring(0, 100);
        
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

// Input validation middleware
const validateAnalysisInput = (req, res, next) => {
  try {
    const { gender, roastLevel, roastType, language } = req.body;
    
    const validGenders = ['male', 'female', 'other'];
    const validRoastLevels = ['pyar', 'ache', 'dhang'];
    const validRoastTypes = ['funny', 'serious', 'sarcastic', 'motivational'];
    const validLanguages = ['english', 'hindi', 'hinglish'];
    
    if (!gender || !validGenders.includes(gender.toLowerCase())) {
      return res.status(400).json({ error: { message: 'Invalid gender selection', code: 'VALIDATION_ERROR' } });
    }
    
    if (!roastLevel || !validRoastLevels.includes(roastLevel.toLowerCase())) {
      return res.status(400).json({ error: { message: 'Invalid roast level selection', code: 'VALIDATION_ERROR' } });
    }
    
    if (!roastType || !validRoastTypes.includes(roastType.toLowerCase())) {
      return res.status(400).json({ error: { message: 'Invalid roast type selection', code: 'VALIDATION_ERROR' } });
    }
    
    if (!language || !validLanguages.includes(language.toLowerCase())) {
      return res.status(400).json({ error: { message: 'Invalid language selection', code: 'VALIDATION_ERROR' } });
    }
    
    req.body.gender = gender.toLowerCase();
    req.body.roastLevel = roastLevel.toLowerCase();
    req.body.roastType = roastType.toLowerCase();
    req.body.language = language.toLowerCase();
    
    next();
  } catch (error) {
    return res.status(400).json({ error: { message: 'Input validation failed', code: 'VALIDATION_ERROR' } });
  }
};

// FIXED: Dynamic information extraction function
function extractEnhancedInfo(text) {
  if (!text || text.length < 10) {
    return {
      personalInfo: { name: null, email: null, phone: null, linkedin: null, github: null },
      skills: { technical: [], soft: [], certifications: [] },
      experience: [],
      education: [],
      projects: []
    };
  }
  
  console.log('📋 Enhanced extraction from text length:', text.length);
  
  // Correct regex patterns
  const patterns = {
    email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi,
    phone: /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
    linkedin: /linkedin\.com\/in\/[a-zA-Z0-9-]+/gi,
    github: /github\.com\/[a-zA-Z0-9-]+/gi,
    // NEW: Patterns for dynamic extraction
    university: /(University|Institute|College)\s+of\s+[A-Za-z\s]+|[A-Za-z\s]+(University|Institute|College)/gi,
    degree: /(BTech|B\.Tech|Bachelor|Master|PhD|B\.S\.|B\.A\.|M\.S\.|M\.A\.|MBA)/gi,
    company: /([A-Z][a-zA-Z\s]+(Foundation|Inc|Corp|Ltd|Company|Technologies|Systems|Solutions))/g,
    duration: /(\d{4})\s*[-–]\s*(\d{4}|Present|Current)/gi
  };
  
  // Enhanced skill keywords (broader coverage)
  const skillKeywords = [
    // Programming Languages
    'JavaScript', 'Python', 'Java', 'C++', 'C#', 'TypeScript', 'Go', 'Rust', 'PHP', 'Ruby', 'Swift', 'Kotlin',
    'Solidity', 'Dart', 'Scala', 'R', 'MATLAB', 'SQL',
    
    // Frontend Technologies
    'React', 'Next.js', 'Vue.js', 'Angular', 'HTML', 'CSS', 'SCSS', 'Tailwind CSS', 'Bootstrap', 'jQuery',
    'React Native', 'Flutter', 'Ionic', 'Material-UI', 'Chakra UI',
    
    // Backend Technologies
    'Node.js', 'Express.js', 'Django', 'Flask', 'Spring Boot', 'Laravel', 'Ruby on Rails', 'ASP.NET',
    'REST API', 'GraphQL', 'WebSocket', 'Microservices',
    
    // Databases
    'MongoDB', 'PostgreSQL', 'MySQL', 'SQLite', 'Redis', 'Firebase', 'Firestore', 'Supabase',
    'DynamoDB', 'Cassandra', 'Neo4j', 'InfluxDB',
    
    // Cloud & DevOps
    'AWS', 'Azure', 'Google Cloud', 'Docker', 'Kubernetes', 'Jenkins', 'CI/CD', 'Terraform',
    'Vercel', 'Netlify', 'Heroku', 'Digital Ocean',
    
    // Tools & Others
    'Git', 'GitHub', 'GitLab', 'Bitbucket', 'Postman', 'Figma', 'Adobe XD', 'Photoshop',
    'VS Code', 'IntelliJ', 'Eclipse', 'Jira', 'Slack', 'Trello'
  ];
  
  // Extract basic contact info
  const emails = text.match(patterns.email) || [];
  const phones = text.match(patterns.phone) || [];
  const linkedins = text.match(patterns.linkedin) || [];
  const githubs = text.match(patterns.github) || [];
  
  // FIXED: Dynamic name extraction
  let name = null;
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  // Look for name in first few lines
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const line = lines[i];
    // Enhanced name pattern - should be 2-4 words, proper case, not contain special chars
    if (line.length > 3 && line.length < 60 && 
        /^[A-Z][a-z]+(\s+[A-Z][a-z]*)*$/.test(line) && 
        !line.includes('@') && !line.includes('||') && !line.includes('//') &&
        !line.toLowerCase().includes('resume') && !line.toLowerCase().includes('cv')) {
      const wordCount = line.split(' ').length;
      if (wordCount >= 2 && wordCount <= 4) {
        name = line;
        break;
      }
    }
  }
  
  // FIXED: Dynamic skills extraction
  const foundSkills = [];
  const textLower = text.toLowerCase();
  
  skillKeywords.forEach(skill => {
    if (textLower.includes(skill.toLowerCase()) && 
        !foundSkills.some(s => s.toLowerCase() === skill.toLowerCase())) {
      foundSkills.push(skill);
    }
  });
  
  // FIXED: Dynamic experience extraction
  const experienceEntries = [];
  const sections = text.split(/\n\s*\n/); // Split by double newlines
  
  for (const section of sections) {
    const sectionLower = section.toLowerCase();
    if (sectionLower.includes('experience') || sectionLower.includes('work') || sectionLower.includes('employment')) {
      // Extract companies from this section
      const companies = section.match(patterns.company) || [];
      const durations = section.match(patterns.duration) || [];
      
      companies.forEach((company, index) => {
        // Try to find job title in the same line or nearby
        const companyLine = section.split('\n').find(line => line.includes(company));
        let title = 'Software Developer'; // Default
        
        // Look for common job titles
        const titlePatterns = /(Developer|Engineer|Intern|Manager|Lead|Senior|Junior|Full Stack|Frontend|Backend|Software|Web|Mobile)/i;
        if (companyLine) {
          const titleMatch = companyLine.match(titlePatterns);
          if (titleMatch) {
            title = titleMatch[0];
          }
        }
        
        experienceEntries.push({
          company: company.trim(),
          title: title,
          duration: durations[index] || 'Not specified'
        });
      });
    }
  }
  
  // FIXED: Dynamic education extraction  
  const educationEntries = [];
  for (const section of sections) {
    const sectionLower = section.toLowerCase();
    if (sectionLower.includes('education') || sectionLower.includes('academic') || sectionLower.includes('qualification')) {
      const universities = section.match(patterns.university) || [];
      const degrees = section.match(patterns.degree) || [];
      const years = section.match(/20\d{2}/g) || [];
      
      universities.forEach((university, index) => {
        educationEntries.push({
          institution: university.trim(),
          degree: degrees[index] || 'Degree',
          year: years[index] ? parseInt(years[index]) : new Date().getFullYear()
        });
      });
      
      // If no universities found but degrees found, add generic entry
      if (universities.length === 0 && degrees.length > 0) {
        educationEntries.push({
          institution: 'Educational Institution',
          degree: degrees[0],
          year: years[0] ? parseInt(years[0]) : new Date().getFullYear()
        });
      }
    }
  }
  
  // FIXED: Dynamic projects extraction
  const projects = [];
  for (const section of sections) {
    const sectionLower = section.toLowerCase();
    if (sectionLower.includes('project') || sectionLower.includes('portfolio')) {
      const lines = section.split('\n');
      lines.forEach(line => {
        // Look for project names (usually in title case, not too long)
        if (line.trim().length > 3 && line.trim().length < 50 && 
            /^[A-Z]/.test(line.trim()) && 
            !line.includes('@') && !line.includes('http')) {
          const projectName = line.trim();
          if (!projects.includes(projectName) && projects.length < 10) {
            projects.push(projectName);
          }
        }
      });
    }
  }
  
  console.log('📋 Enhanced extraction results:', {
    name: name,
    emailsFound: emails.length,
    phonesFound: phones.length,
    skillsFound: foundSkills.length,
    experienceFound: experienceEntries.length,
    educationFound: educationEntries.length,
    projectsFound: projects.length
  });
  
  return {
    personalInfo: {
      name: name,
      email: emails[0] || null,
      phone: phones[0] || null,
      linkedin: linkedins[0] || null,
      github: githubs[0] || null
    },
    skills: {
      technical: foundSkills,
      soft: ['Communication', 'Leadership', 'Problem Solving', 'Team Work'], // Common soft skills
      certifications: []
    },
    experience: experienceEntries,
    education: educationEntries,
    projects: projects
  };
}

// Clean roast generation function
function generateCleanRoast(extractedInfo, preferences) {
  const { personalInfo, skills, experience, education } = extractedInfo;
  const { roastLevel = 'ache', language = 'english' } = preferences || {};
  
  const infoCount = {
    name: personalInfo?.name ? 1 : 0,
    contact: (personalInfo?.email ? 1 : 0) + (personalInfo?.phone ? 1 : 0),
    skills: skills?.technical?.length || 0,
    experience: experience?.length || 0,
    education: education?.length || 0
  };
  
  let feedback = '';
  
  if (language === 'hindi') {
    if (roastLevel === 'pyar') {
      feedback = `आपका resume बहुत अच्छा है! ${personalInfo?.name || 'आप'} जी, आपमें ${infoCount.skills} technical skills हैं।`;
    } else if (roastLevel === 'dhang') {
      feedback = `अरे भाई ${personalInfo?.name || 'साहब'}, resume में और detail add करो। ${infoCount.skills} skills तो ठीक हैं।`;
    } else {
      feedback = `आपका resume decent है ${personalInfo?.name || 'जी'}। ${infoCount.skills} skills दिख रही हैं।`;
    }
  } else if (language === 'hinglish') {
    if (roastLevel === 'pyar') {
      feedback = `Wow ${personalInfo?.name || 'bro'}, your resume is solid! ${infoCount.skills} technical skills mil gayi hain.`;
    } else if (roastLevel === 'dhang') {
      feedback = `Arre ${personalInfo?.name || 'dost'}, resume thoda basic hai. ${infoCount.skills} skills toh theek hain.`;
    } else {
      feedback = `Your resume is okay ${personalInfo?.name || 'buddy'}. ${infoCount.skills} skills show ho rahi hain.`;
    }
  } else {
    if (roastLevel === 'pyar') {
      feedback = `Excellent work ${personalInfo?.name || 'on your resume'}! I can see ${infoCount.skills} technical skills clearly listed.`;
    } else if (roastLevel === 'dhang') {
      feedback = `Listen ${personalInfo?.name || 'there'}, your resume needs serious work. Only ${infoCount.skills} skills are visible.`;
    } else {
      feedback = `Your resume is decent ${personalInfo?.name || ''}. Found ${infoCount.skills} technical skills and ${infoCount.experience} work experiences.`;
    }
  }
  
  return {
    roastFeedback: feedback,
    strengths: [
      infoCount.skills > 0 ? `Technical Skills: ${infoCount.skills} identified` : null,
      infoCount.experience > 0 ? `Experience: ${infoCount.experience} positions` : null,
      infoCount.education > 0 ? `Education: ${infoCount.education} entries` : null,
      infoCount.contact === 2 ? 'Complete contact information' : null
    ].filter(s => s !== null),
    improvements: [
      infoCount.contact < 2 ? 'Add complete contact information' : null,
      infoCount.skills < 5 ? 'List more technical skills' : null,
      infoCount.experience < 2 ? 'Add more work experience' : null,
      !personalInfo?.linkedin ? 'Add LinkedIn profile' : null
    ].filter(i => i !== null)
  };
}

// POST /api/resume/analyze - Main analysis endpoint
router.post('/analyze', 
  analyzeRateLimit,
  upload.single('resume'),
  validateAnalysisInput,
  async (req, res) => {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    
    try {
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

      const { gender, roastLevel, roastType, language } = req.body;
      
      // Extract text from file
      let resumeText;
      try {
        resumeText = await fileProcessor.extractText(req.file);
        console.log('📄 Extracted text preview:', resumeText.substring(0, 200) + '...');
      } catch (extractionError) {
        return res.status(400).json({
          error: {
            message: 'Failed to process the resume file. Please ensure it contains readable text.',
            status: 400,
            code: 'FILE_PROCESSING_ERROR',
            requestId
          }
        });
      }
      
      if (!resumeText || resumeText.trim().length < 100) {
        return res.status(400).json({
          error: {
            message: 'Resume content is too short. Please upload a complete resume.',
            status: 400,
            code: 'INSUFFICIENT_CONTENT',
            requestId
          }
        });
      }

      // Extract structured information using FIXED dynamic extraction
      const extractedInfo = extractEnhancedInfo(resumeText);
      
      // Generate roast feedback
      const preferences = { roastLevel, language };
      const roastFeedback = generateCleanRoast(extractedInfo, preferences);
      
      // Calculate dynamic score based on extracted info
      let score = 30; // Base score
      if (extractedInfo.personalInfo.name) score += 15;
      if (extractedInfo.personalInfo.email) score += 10;
      if (extractedInfo.personalInfo.phone) score += 10;
      if (extractedInfo.personalInfo.linkedin) score += 5;
      if (extractedInfo.skills.technical.length > 0) score += Math.min(extractedInfo.skills.technical.length * 2, 20);
      if (extractedInfo.experience.length > 0) score += extractedInfo.experience.length * 8;
      if (extractedInfo.education.length > 0) score += extractedInfo.education.length * 7;
      if (extractedInfo.projects.length > 0) score += extractedInfo.projects.length * 3;
      
      score = Math.min(100, score); // Cap at 100

      const processingTime = Date.now() - startTime;
      const uploadTimestamp = new Date();

      // Prepare response
      const responseData = {
        success: true,
        data: {
          // Analysis results
          score: score,
          roastFeedback: roastFeedback.roastFeedback,
          strengths: roastFeedback.strengths,
          improvements: roastFeedback.improvements,
          
          // Extracted information
          extractedInfo: extractedInfo,
          
          // File metadata
          fileName: req.file.originalname.replace(/^\d+_/, ''),
          fileSize: req.file.size,
          uploadedAt: uploadTimestamp.toISOString(),
          processedAt: new Date().toISOString(),
          processingTime: processingTime,
          
          // User preferences
          preferences: {
            gender,
            roastLevel,
            roastType,
            language
          },
          
          requestId: requestId
        }
      };

      console.log('🎯 Analysis complete:', {
        score: score,
        extractedName: extractedInfo.personalInfo.name,
        skillsCount: extractedInfo.skills.technical.length,
        experienceCount: extractedInfo.experience.length
      });

      // Save to database (non-blocking)
      setImmediate(async () => {
        try {
          console.log('💾 Starting database save...');
          
          await connectDB();
          
          const saveResult = await resumeStorage.saveResumeData(
            req.file,
            resumeText,
            {
              score: score,
              roastFeedback: roastFeedback.roastFeedback,
              extractedInfo: extractedInfo
            },
            preferences
          );
          
          if (saveResult.success) {
            console.log('🎉 Resume saved successfully:', saveResult.resumeId);
          } else {
            console.log('❌ Storage failed:', saveResult.error);
          }
          
        } catch (storageError) {
          console.log('⚠️ Storage error:', storageError.message);
        }
      });

      res.json(responseData);

    } catch (error) {
      console.error('Critical error in resume analysis:', error);
      
      res.status(500).json({
        error: {
          message: 'An unexpected error occurred while analyzing your resume. Please try again.',
          status: 500,
          code: 'INTERNAL_SERVER_ERROR',
          requestId: requestId
        }
      });
    }
  }
);

// Test endpoint
router.get('/test-response', (req, res) => {
  const mockResponse = {
    success: true,
    data: {
      resumeId: 'test-' + Date.now(),
      fileName: 'test-resume.pdf',
      fileSize: 125000,
      uploadedAt: new Date().toISOString(),
      processedAt: new Date().toISOString(),
      
      score: 88,
      roastFeedback: 'Great resume! Strong technical skills and good project experience.',
      strengths: [
        'Strong technical background',
        'Good project portfolio',
        'Clear education path'
      ],
      improvements: [
        'Add more work experience',
        'Include certifications',
        'Add LinkedIn profile'
      ],
      
      extractedInfo: {
        personalInfo: {
          name: 'Test User',
          email: 'test@example.com',
          phone: '1234567890',
          linkedin: null,
          github: null
        },
        skills: {
          technical: ['JavaScript', 'Python', 'React', 'Node.js', 'MongoDB', 'TypeScript'],
          soft: ['Leadership', 'Communication'],
          certifications: []
        },
        experience: [{
          company: 'Tech Company',
          title: 'Software Developer',
          duration: '2023-2024'
        }],
        education: [{
          institution: 'Tech University',
          degree: 'BTech CSE',
          year: 2024
        }],
        projects: ['Project 1', 'Project 2', 'Project 3']
      },
      
      preferences: {
        gender: 'male',
        roastLevel: 'ache',
        roastType: 'funny',
        language: 'english'
      },
      
      requestId: crypto.randomUUID()
    }
  };
  
  res.json(mockResponse);
});

// GET /api/resume/test
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'CV Slayer Resume API is operational',
    timestamp: new Date().toISOString(),
    status: 'healthy'
  });
});

module.exports = router;