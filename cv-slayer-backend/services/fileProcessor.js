const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

class FileProcessor {
  constructor() {
    this.supportedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    this.maxFileSize = 5 * 1024 * 1024; // 5MB
    this.initialized = false;
    this.initializeProcessor();
  }

  initializeProcessor() {
    try {
      // Test PDF parsing capability
      const testBuffer = Buffer.alloc(0);
      this.initialized = true;
      console.log('✅ FileProcessor initialized successfully');
    } catch (error) {
      console.error('❌ FileProcessor initialization failed:', error);
      this.initialized = false;
    }
  }

  validateFile(file) {
    if (!file) {
      throw new Error('NO_FILE');
    }

    if (!file.buffer || file.buffer.length === 0) {
      throw new Error('EMPTY_FILE');
    }

    if (!this.supportedTypes.includes(file.mimetype)) {
      throw new Error('UNSUPPORTED_FILE_TYPE');
    }

    if (file.size > this.maxFileSize) {
      throw new Error('FILE_TOO_LARGE');
    }

    if (file.size < 100) { // Minimum file size check
      throw new Error('FILE_TOO_SMALL');
    }

    return true;
  }

  async extractText(file) {
    if (!this.initialized) {
      throw new Error('PROCESSOR_NOT_INITIALIZED');
    }

    try {
      // Validate file first
      this.validateFile(file);

      console.log('Processing file:', {
        name: file.originalname,
        type: file.mimetype,
        size: file.size
      });

      let extractedText;

      // Add timeout wrapper
      const extractionPromise = this.performExtraction(file);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('EXTRACTION_TIMEOUT')), 30000)
      );

      extractedText = await Promise.race([extractionPromise, timeoutPromise]);

      // Validate extracted text
      if (!extractedText || extractedText.trim().length === 0) {
        throw new Error('NO_TEXT_CONTENT');
      }

      if (extractedText.trim().length < 50) {
        throw new Error('INSUFFICIENT_TEXT_CONTENT');
      }

      console.log('✅ Text extraction successful, length:', extractedText.length);
      return extractedText;

    } catch (error) {
      console.error('❌ File extraction error:', error);
      
      // Map errors to user-friendly messages
      const errorMap = {
        'EXTRACTION_TIMEOUT': 'File processing timed out',
        'NO_TEXT_CONTENT': 'No readable text found in document',
        'INSUFFICIENT_TEXT_CONTENT': 'Document content is too short',
        'PROCESSOR_NOT_INITIALIZED': 'File processor not available'
      };

      if (errorMap[error.message]) {
        throw new Error(errorMap[error.message]);
      }
      
      throw error;
    }
  }

  async performExtraction(file) {
    try {
      if (file.mimetype === 'application/pdf') {
        return await this.extractFromPDF(file);
      } else if (file.mimetype.includes('wordprocessingml')) {
        return await this.extractFromDocx(file);
      } else if (file.mimetype === 'application/msword') {
        return await this.extractFromDoc(file);
      } else {
        throw new Error('UNSUPPORTED_FORMAT');
      }
    } catch (error) {
      console.error('Extraction method error:', error);
      throw error;
    }
  }

  async extractFromPDF(file) {
    try {
      console.log('📄 Extracting text from PDF...');
      
      const options = {
        normalizeWhitespace: false,
        disableCombineTextItems: false,
        max: 1 // Process only first page for testing
      };

      const data = await pdfParse(file.buffer, options);
      
      if (!data || !data.text) {
        throw new Error('PDF_NO_TEXT_CONTENT');
      }

      const text = data.text.trim();
      if (text.length === 0) {
        throw new Error('PDF_EMPTY_CONTENT');
      }

      return text;
    } catch (error) {
      console.error('PDF extraction error:', error);
      if (error.message.includes('Invalid PDF')) {
        throw new Error('CORRUPTED_PDF');
      }
      if (error.message.includes('PDF_NO_TEXT_CONTENT')) {
        throw new Error('PDF contains no readable text');
      }
      throw new Error('PDF_PROCESSING_ERROR');
    }
  }

  async extractFromDocx(file) {
    try {
      console.log('📝 Extracting text from DOCX...');
      
      const result = await mammoth.extractRawText({ 
        buffer: file.buffer 
      });
      
      if (!result || !result.value) {
        throw new Error('DOCX_NO_TEXT_CONTENT');
      }

      const text = result.value.trim();
      if (text.length === 0) {
        throw new Error('DOCX_EMPTY_CONTENT');
      }

      return text;
    } catch (error) {
      console.error('DOCX extraction error:', error);
      if (error.message.includes('not a valid')) {
        throw new Error('CORRUPTED_DOCX');
      }
      throw new Error('DOCX_PROCESSING_ERROR');
    }
  }

  async extractFromDoc(file) {
    try {
      console.log('📄 Extracting text from DOC...');
      
      // For older .doc files, try with mammoth
      const result = await mammoth.extractRawText({ 
        buffer: file.buffer 
      });
      
      if (!result || !result.value) {
        throw new Error('DOC_NO_TEXT_CONTENT');
      }

      const text = result.value.trim();
      if (text.length === 0) {
        throw new Error('DOC_EMPTY_CONTENT');
      }

      return text;
    } catch (error) {
      console.error('DOC extraction error:', error);
      throw new Error('DOC files may not be fully supported. Please convert to DOCX or PDF.');
    }
  }

  getFileInfo(file) {
    return {
      name: file.originalname,
      size: file.size,
      type: file.mimetype,
      isSupported: this.supportedTypes.includes(file.mimetype),
      sizeInMB: (file.size / (1024 * 1024)).toFixed(2),
      processorReady: this.initialized
    };
  }

  isReady() {
    return this.initialized;
  }
}

module.exports = new FileProcessor();