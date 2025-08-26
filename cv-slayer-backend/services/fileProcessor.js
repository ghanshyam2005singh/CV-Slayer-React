const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const crypto = require('crypto');
const winston = require('winston');

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
        new winston.transports.File({ filename: 'logs/file-processor.log' }),
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

class FileProcessor {
  constructor() {
    this.supportedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    this.maxFileSize = parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024; // 5MB
    this.minFileSize = 100; // Minimum 100 bytes
    this.maxTextLength = 500000; // Maximum 500KB of text
    this.extractionTimeout = parseInt(process.env.EXTRACTION_TIMEOUT) || 45000; // 45 seconds
    this.initialized = false;
    
    // Security patterns to detect potentially malicious files
    this.maliciousPatterns = [
      /javascript:/i,
      /<script/i,
      /eval\(/i,
      /onclick/i,
      /onload/i,
      /document\.write/i,
      /window\.open/i
    ];
    
    this.initializeProcessor();
  }

  async initializeProcessor() {
    try {
      // Test PDF parsing capability with minimal test
      const testPdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n');
      
      // Validate required dependencies
      if (!pdfParse || !mammoth) {
        throw new Error('Required dependencies not available');
      }
      
      this.initialized = true;
      logger.info('FileProcessor initialized successfully', {
        maxFileSize: this.maxFileSize,
        supportedTypes: this.supportedTypes.length,
        extractionTimeout: this.extractionTimeout
      });
    } catch (error) {
      logger.error('FileProcessor initialization failed', {
        error: error.message,
        stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
      });
      this.initialized = false;
      throw new Error('File processor initialization failed');
    }
  }

  validateFile(file) {
    const validationId = crypto.randomUUID().substring(0, 8);
    
    try {
      // Basic file presence check
      if (!file) {
        logger.warn('File validation failed - no file provided', { validationId });
        throw new Error('NO_FILE');
      }

      // Buffer validation
      if (!file.buffer || !(file.buffer instanceof Buffer) || file.buffer.length === 0) {
        logger.warn('File validation failed - invalid buffer', {
          validationId,
          hasBuffer: !!file.buffer,
          bufferLength: file.buffer?.length || 0
        });
        throw new Error('EMPTY_FILE');
      }

      // MIME type validation
      if (!this.supportedTypes.includes(file.mimetype)) {
        logger.warn('File validation failed - unsupported type', {
          validationId,
          mimetype: file.mimetype,
          fileName: file.originalname?.substring(0, 20) || 'unknown'
        });
        throw new Error('UNSUPPORTED_FILE_TYPE');
      }

      // File size validation
      if (file.size > this.maxFileSize) {
        logger.warn('File validation failed - too large', {
          validationId,
          fileSize: file.size,
          maxSize: this.maxFileSize,
          fileName: file.originalname?.substring(0, 20) || 'unknown'
        });
        throw new Error('FILE_TOO_LARGE');
      }

      if (file.size < this.minFileSize) {
        logger.warn('File validation failed - too small', {
          validationId,
          fileSize: file.size,
          minSize: this.minFileSize,
          fileName: file.originalname?.substring(0, 20) || 'unknown'
        });
        throw new Error('FILE_TOO_SMALL');
      }

      // Buffer integrity check
      if (file.buffer.length !== file.size) {
        logger.warn('File validation failed - size mismatch', {
          validationId,
          bufferLength: file.buffer.length,
          reportedSize: file.size,
          fileName: file.originalname?.substring(0, 20) || 'unknown'
        });
        throw new Error('FILE_SIZE_MISMATCH');
      }

      // Basic magic number validation for security
      const magicNumber = file.buffer.subarray(0, 8);
      if (!this.validateMagicNumber(magicNumber, file.mimetype)) {
        logger.warn('File validation failed - magic number mismatch', {
          validationId,
          mimetype: file.mimetype,
          magicBytes: magicNumber.toString('hex'),
          fileName: file.originalname?.substring(0, 20) || 'unknown'
        });
        throw new Error('FILE_TYPE_MISMATCH');
      }

      logger.info('File validation successful', {
        validationId,
        fileSize: file.size,
        mimetype: file.mimetype,
        fileName: file.originalname?.substring(0, 20) || 'unknown'
      });

      return true;
    } catch (error) {
      logger.error('File validation error', {
        validationId,
        error: error.message,
        fileName: file?.originalname?.substring(0, 20) || 'unknown'
      });
      throw error;
    }
  }

  validateMagicNumber(magicBytes, expectedMimetype) {
    try {
      const magicHex = magicBytes.toString('hex').toLowerCase();
      
      // PDF magic numbers
      if (expectedMimetype === 'application/pdf') {
        return magicHex.startsWith('255044462d') || // %PDF-
               magicBytes.toString('ascii', 0, 4) === '%PDF';
      }
      
      // ZIP-based formats (DOCX)
      if (expectedMimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        return magicHex.startsWith('504b0304') || // ZIP header
               magicHex.startsWith('504b0506') || // ZIP empty archive
               magicHex.startsWith('504b0708');   // ZIP spanned archive
      }
      
      // Old DOC format
      if (expectedMimetype === 'application/msword') {
        return magicHex.startsWith('d0cf11e0a1b11ae1') || // OLE2 Document
               magicHex.startsWith('504b0304');             // Sometimes ZIP-based
      }
      
      return true; // Default to true if we can't validate
    } catch (error) {
      logger.warn('Magic number validation error', { error: error.message });
      return true; // Default to true on validation error
    }
  }

  async extractText(file) {
    const extractionId = crypto.randomUUID().substring(0, 8);
    const startTime = Date.now();
    
    if (!this.initialized) {
      logger.error('File processor not initialized', { extractionId });
      throw new Error('PROCESSOR_NOT_INITIALIZED');
    }

    try {
      // Validate file first
      this.validateFile(file);

      logger.info('Starting text extraction', {
        extractionId,
        fileName: file.originalname?.substring(0, 30) || 'unknown',
        fileType: file.mimetype,
        fileSize: file.size
      });

      let extractedText;

      // Add timeout wrapper with enhanced error handling
      const extractionPromise = this.performExtraction(file, extractionId);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('EXTRACTION_TIMEOUT')), this.extractionTimeout)
      );

      extractedText = await Promise.race([extractionPromise, timeoutPromise]);

      // Validate extracted text
      if (!extractedText || typeof extractedText !== 'string') {
        logger.warn('No text extracted from file', {
          extractionId,
          fileName: file.originalname?.substring(0, 30) || 'unknown',
          hasText: !!extractedText,
          textType: typeof extractedText
        });
        throw new Error('NO_TEXT_CONTENT');
      }

      const cleanedText = this.cleanExtractedText(extractedText);
      
      if (cleanedText.length === 0) {
        logger.warn('Empty text extracted from file', {
          extractionId,
          fileName: file.originalname?.substring(0, 30) || 'unknown',
          originalLength: extractedText.length
        });
        throw new Error('EMPTY_TEXT_CONTENT');
      }

      if (cleanedText.length < 50) {
        logger.warn('Insufficient text content extracted', {
          extractionId,
          fileName: file.originalname?.substring(0, 30) || 'unknown',
          textLength: cleanedText.length
        });
        throw new Error('INSUFFICIENT_TEXT_CONTENT');
      }

      // Check for potentially malicious content
      if (this.containsMaliciousContent(cleanedText)) {
        logger.warn('Potentially malicious content detected', {
          extractionId,
          fileName: file.originalname?.substring(0, 30) || 'unknown',
          textLength: cleanedText.length
        });
        throw new Error('MALICIOUS_CONTENT_DETECTED');
      }

      // Limit text length for security
      const finalText = cleanedText.length > this.maxTextLength 
        ? cleanedText.substring(0, this.maxTextLength)
        : cleanedText;

      const processingTime = Date.now() - startTime;

      logger.info('Text extraction successful', {
        extractionId,
        fileName: file.originalname?.substring(0, 30) || 'unknown',
        extractedLength: finalText.length,
        processingTime,
        wasTruncated: finalText.length < cleanedText.length
      });

      return finalText;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('Text extraction failed', {
        extractionId,
        fileName: file?.originalname?.substring(0, 30) || 'unknown',
        error: error.message,
        processingTime
      });
      
      // Map errors to user-friendly messages
      const errorMap = {
        'EXTRACTION_TIMEOUT': 'File processing timed out. Please try with a smaller file.',
        'NO_TEXT_CONTENT': 'No readable text found in the document.',
        'EMPTY_TEXT_CONTENT': 'The document appears to be empty.',
        'INSUFFICIENT_TEXT_CONTENT': 'Document content is too short to analyze.',
        'PROCESSOR_NOT_INITIALIZED': 'File processor is not available.',
        'MALICIOUS_CONTENT_DETECTED': 'Document contains potentially harmful content.',
        'FILE_TYPE_MISMATCH': 'File type does not match the file extension.',
        'FILE_SIZE_MISMATCH': 'File appears to be corrupted.',
        'CORRUPTED_PDF': 'PDF file appears to be corrupted.',
        'CORRUPTED_DOCX': 'DOCX file appears to be corrupted.',
        'PASSWORD_PROTECTED': 'Password-protected files are not supported.'
      };

      const friendlyMessage = errorMap[error.message] || 'Failed to process the document.';
      throw new Error(friendlyMessage);
    }
  }

  async performExtraction(file, extractionId) {
    try {
      switch (file.mimetype) {
        case 'application/pdf':
          return await this.extractFromPDF(file, extractionId);
        case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
          return await this.extractFromDocx(file, extractionId);
        case 'application/msword':
          return await this.extractFromDoc(file, extractionId);
        default:
          throw new Error('UNSUPPORTED_FORMAT');
      }
    } catch (error) {
      logger.error('Extraction method error', {
        extractionId,
        error: error.message,
        mimetype: file.mimetype
      });
      throw error;
    }
  }

  async extractFromPDF(file, extractionId) {
    try {
      logger.info('Extracting text from PDF', {
        extractionId,
        fileSize: file.size
      });
      
      const options = {
        normalizeWhitespace: true,
        disableCombineTextItems: false,
        max: 0, // Process all pages
        version: 'v1.10.100' // Specify version for consistency
      };

      const data = await pdfParse(file.buffer, options);
      
      if (!data || typeof data.text !== 'string') {
        logger.warn('PDF parsing returned invalid data', {
          extractionId,
          hasData: !!data,
          hasText: !!(data && data.text),
          textType: data ? typeof data.text : 'undefined'
        });
        throw new Error('PDF_NO_TEXT_CONTENT');
      }

      const text = data.text.trim();
      
      if (text.length === 0) {
        logger.warn('PDF contains no text content', {
          extractionId,
          pages: data.numpages || 'unknown',
          info: data.info ? 'present' : 'missing'
        });
        throw new Error('PDF_EMPTY_CONTENT');
      }

      logger.info('PDF extraction successful', {
        extractionId,
        textLength: text.length,
        pages: data.numpages || 'unknown'
      });

      return text;
    } catch (error) {
      logger.error('PDF extraction error', {
        extractionId,
        error: error.message
      });
      
      if (error.message.includes('Invalid PDF') || error.message.includes('PDF header')) {
        throw new Error('CORRUPTED_PDF');
      }
      if (error.message.includes('password') || error.message.includes('encrypted')) {
        throw new Error('PASSWORD_PROTECTED');
      }
      if (error.message.includes('PDF_NO_TEXT_CONTENT') || error.message.includes('PDF_EMPTY_CONTENT')) {
        throw error;
      }
      
      throw new Error('PDF_PROCESSING_ERROR');
    }
  }

  async extractFromDocx(file, extractionId) {
    try {
      logger.info('Extracting text from DOCX', {
        extractionId,
        fileSize: file.size
      });
      
      const options = {
        buffer: file.buffer,
        convertImage: mammoth.images.ignoreAll, // Ignore images for security
        ignoreEmptyParagraphs: false
      };
      
      const result = await mammoth.extractRawText(options);
      
      if (!result || typeof result.value !== 'string') {
        logger.warn('DOCX parsing returned invalid data', {
          extractionId,
          hasResult: !!result,
          hasValue: !!(result && result.value),
          valueType: result ? typeof result.value : 'undefined'
        });
        throw new Error('DOCX_NO_TEXT_CONTENT');
      }

      const text = result.value.trim();
      
      if (text.length === 0) {
        logger.warn('DOCX contains no text content', {
          extractionId,
          hasMessages: !!(result.messages && result.messages.length > 0),
          messageCount: result.messages ? result.messages.length : 0
        });
        throw new Error('DOCX_EMPTY_CONTENT');
      }

      logger.info('DOCX extraction successful', {
        extractionId,
        textLength: text.length,
        warningCount: result.messages ? result.messages.length : 0
      });

      return text;
    } catch (error) {
      logger.error('DOCX extraction error', {
        extractionId,
        error: error.message
      });
      
      if (error.message.includes('not a valid') || error.message.includes('End of central directory')) {
        throw new Error('CORRUPTED_DOCX');
      }
      if (error.message.includes('password') || error.message.includes('encrypted')) {
        throw new Error('PASSWORD_PROTECTED');
      }
      if (error.message.includes('DOCX_NO_TEXT_CONTENT') || error.message.includes('DOCX_EMPTY_CONTENT')) {
        throw error;
      }
      
      throw new Error('DOCX_PROCESSING_ERROR');
    }
  }

  async extractFromDoc(file, extractionId) {
    try {
      logger.info('Extracting text from DOC', {
        extractionId,
        fileSize: file.size
      });
      
      // For older .doc files, try with mammoth (limited support)
      const options = {
        buffer: file.buffer,
        convertImage: mammoth.images.ignoreAll,
        ignoreEmptyParagraphs: false
      };
      
      const result = await mammoth.extractRawText(options);
      
      if (!result || typeof result.value !== 'string') {
        logger.warn('DOC parsing returned invalid data', {
          extractionId,
          hasResult: !!result,
          hasValue: !!(result && result.value)
        });
        throw new Error('DOC_NO_TEXT_CONTENT');
      }

      const text = result.value.trim();
      
      if (text.length === 0) {
        logger.warn('DOC contains no text content', {
          extractionId,
          warningCount: result.messages ? result.messages.length : 0
        });
        throw new Error('DOC_EMPTY_CONTENT');
      }

      logger.info('DOC extraction successful', {
        extractionId,
        textLength: text.length,
        warningCount: result.messages ? result.messages.length : 0
      });

      return text;
    } catch (error) {
      logger.error('DOC extraction error', {
        extractionId,
        error: error.message
      });
      
      if (error.message.includes('DOC_NO_TEXT_CONTENT') || error.message.includes('DOC_EMPTY_CONTENT')) {
        throw error;
      }
      
      // DOC files have limited support
      throw new Error('Legacy DOC files may not be fully supported. Please convert to DOCX or PDF for better results.');
    }
  }

  containsMaliciousContent(text) {
    try {
      // Check for potentially malicious patterns
      const lowercaseText = text.toLowerCase();
      
      for (const pattern of this.maliciousPatterns) {
        if (pattern.test(lowercaseText)) {
          return true;
        }
      }
      
      // Check for excessive script-like content
      const scriptPatterns = (lowercaseText.match(/<script|javascript:|eval\(|onclick/g) || []).length;
      if (scriptPatterns > 3) {
        return true;
      }
      
      return false;
    } catch (error) {
      logger.warn('Malicious content check error', { error: error.message });
      return false; // Default to safe if check fails
    }
  }

  cleanExtractedText(text) {
    try {
      if (!text || typeof text !== 'string') {
        return '';
      }

      // Clean and normalize text
      let cleanedText = text
        // Normalize line breaks
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        // Remove excessive whitespace
        .replace(/[ \t]+/g, ' ')
        // Remove excessive line breaks
        .replace(/\n{3,}/g, '\n\n')
        // Remove non-printable characters except newlines
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
        // Trim each line
        .split('\n')
        .map(line => line.trim())
        .join('\n')
        // Final trim
        .trim();

      return cleanedText;
    } catch (error) {
      logger.error('Text cleaning error', { error: error.message });
      return text; // Return original text if cleaning fails
    }
  }

  getFileInfo(file) {
    const processingId = crypto.randomUUID().substring(0, 8);
    
    try {
      const info = {
        processingId,
        name: file?.originalname || 'unknown',
        size: file?.size || 0,
        type: file?.mimetype || 'unknown',
        isSupported: file ? this.supportedTypes.includes(file.mimetype) : false,
        sizeInMB: file ? parseFloat((file.size / (1024 * 1024)).toFixed(2)) : 0,
        sizeInKB: file ? parseFloat((file.size / 1024).toFixed(2)) : 0,
        processorReady: this.initialized,
        withinSizeLimit: file ? (file.size <= this.maxFileSize && file.size >= this.minFileSize) : false,
        estimatedProcessingTime: this.estimateProcessingTime(file?.size || 0),
        supportedFormats: this.supportedTypes
      };

      return info;
    } catch (error) {
      logger.error('Get file info error', { error: error.message });
      
      return {
        processingId,
        name: 'unknown',
        size: 0,
        type: 'unknown',
        isSupported: false,
        sizeInMB: 0,
        sizeInKB: 0,
        processorReady: this.initialized,
        withinSizeLimit: false,
        estimatedProcessingTime: 0,
        supportedFormats: this.supportedTypes,
        error: 'Unable to analyze file'
      };
    }
  }

  estimateProcessingTime(fileSize) {
    try {
      // Rough estimates based on file size (in seconds)
      if (fileSize < 100 * 1024) return 1; // < 100KB: ~1 second
      if (fileSize < 500 * 1024) return 3; // < 500KB: ~3 seconds
      if (fileSize < 1024 * 1024) return 5; // < 1MB: ~5 seconds
      if (fileSize < 2 * 1024 * 1024) return 10; // < 2MB: ~10 seconds
      return 15; // Larger files: ~15 seconds
    } catch (error) {
      return 5; // Default estimate
    }
  }

  isReady() {
    return this.initialized;
  }

  getHealthStatus() {
    try {
      return {
        initialized: this.initialized,
        supportedTypes: this.supportedTypes,
        maxFileSize: this.maxFileSize,
        maxFileSizeMB: parseFloat((this.maxFileSize / (1024 * 1024)).toFixed(2)),
        extractionTimeout: this.extractionTimeout,
        extractionTimeoutMinutes: parseFloat((this.extractionTimeout / 1000 / 60).toFixed(2)),
        dependencies: {
          pdfParse: !!pdfParse,
          mammoth: !!mammoth
        },
        securityFeatures: {
          magicNumberValidation: true,
          maliciousContentDetection: true,
          fileSizeValidation: true,
          textLengthLimiting: true
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Health status error', { error: error.message });
      return {
        initialized: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

module.exports = new FileProcessor();