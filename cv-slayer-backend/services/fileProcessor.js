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
    this.extractionTimeout = 30000; // 30 seconds
  }

  validateFile(file) {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new Error('No file provided');
    }

    if (!this.supportedTypes.includes(file.mimetype)) {
      throw new Error('Unsupported file type');
    }

    if (file.size > this.maxFileSize) {
      throw new Error('File too large');
    }

    if (file.size < 100) {
      throw new Error('File too small');
    }

    return true;
  }

  async extractText(file) {
    try {
      this.validateFile(file);

      console.log('Extracting text from:', file.originalname);

      let text;
      const extractionPromise = this.performExtraction(file);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Extraction timeout')), this.extractionTimeout)
      );

      text = await Promise.race([extractionPromise, timeoutPromise]);

      if (!text || typeof text !== 'string' || text.trim().length < 10) {
        throw new Error('No readable content found');
      }

      const cleanedText = this.cleanText(text);

      console.log('Text extracted successfully, length:', cleanedText.length);
      return cleanedText;

    } catch (error) {
      console.error('Text extraction failed:', error.message);
      throw new Error(error.message || 'Failed to process file');
    }
  }

  async performExtraction(file) {
    switch (file.mimetype) {
      case 'application/pdf':
        return await this.extractFromPDF(file);
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        return await this.extractFromDocx(file);
      case 'application/msword':
        return await this.extractFromDoc(file);
      default:
        throw new Error('Unsupported file format');
    }
  }

  async extractFromPDF(file) {
    try {
      const data = await pdfParse(file.buffer, {
        normalizeWhitespace: true,
        disableCombineTextItems: false
      });

      if (!data || !data.text) {
        throw new Error('PDF contains no text');
      }

      return data.text.trim();
    } catch (error) {
      if (error.message.includes('Invalid PDF') || error.message.includes('PDF header')) {
        throw new Error('Corrupted PDF file');
      }
      if (error.message.includes('password') || error.message.includes('encrypted')) {
        throw new Error('Password-protected PDFs not supported');
      }
      throw new Error('Failed to process PDF');
    }
  }

  async extractFromDocx(file) {
    try {
      const result = await mammoth.extractRawText({
        buffer: file.buffer,
        convertImage: mammoth.images.ignoreAll
      });

      if (!result || !result.value) {
        throw new Error('DOCX contains no text');
      }

      return result.value.trim();
    } catch (error) {
      if (error.message.includes('not a valid') || error.message.includes('End of central directory')) {
        throw new Error('Corrupted DOCX file');
      }
      throw new Error('Failed to process DOCX');
    }
  }

  async extractFromDoc(file) {
    try {
      const result = await mammoth.extractRawText({
        buffer: file.buffer,
        convertImage: mammoth.images.ignoreAll
      });

      if (!result || !result.value) {
        throw new Error('DOC contains no text');
      }

      return result.value.trim();
    } catch (error) {
      throw new Error('Legacy DOC files may not be fully supported. Please use DOCX or PDF.');
    }
  }

  cleanText(text) {
    if (!text || typeof text !== 'string') {
      return '';
    }

    return text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      .split('\n')
      .map(line => line.trim())
      .join('\n')
      .trim();
  }

  getFileInfo(file) {
    return {
      name: file?.originalname || 'unknown',
      size: file?.size || 0,
      type: file?.mimetype || 'unknown',
      isSupported: file ? this.supportedTypes.includes(file.mimetype) : false,
      sizeInMB: file ? parseFloat((file.size / (1024 * 1024)).toFixed(2)) : 0,
      withinSizeLimit: file ? (file.size <= this.maxFileSize && file.size >= 100) : false
    };
  }
}

module.exports = new FileProcessor();