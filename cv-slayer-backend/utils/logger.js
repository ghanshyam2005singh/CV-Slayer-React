class Logger {
  constructor() {
    this.enableConsoleOutput = true;
    console.log('✅ Simple logger initialized');
  }

  formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    
    if (Object.keys(meta).length > 0) {
      return `[${timestamp}] ${level.toUpperCase()}: ${message} | Meta: ${JSON.stringify(meta)}`;
    }
    
    return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
  }

  sanitizeMessage(message) {
    if (typeof message !== 'string') {
      message = String(message);
    }
    
    return message
      .replace(/password[=:]\s*\S+/gi, 'password=[REDACTED]')
      .replace(/token[=:]\s*\S+/gi, 'token=[REDACTED]')
      .replace(/key[=:]\s*\S+/gi, 'key=[REDACTED]')
      .replace(/secret[=:]\s*\S+/gi, 'secret=[REDACTED]')
      .replace(/authorization[=:]\s*\S+/gi, 'authorization=[REDACTED]')
      .replace(/bearer\s+\S+/gi, 'bearer [REDACTED]')
      .substring(0, 500);
  }

  logToConsole(level, message, meta = {}) {
    const colors = {
      error: '\x1b[31m', // Red
      warn: '\x1b[33m',  // Yellow
      info: '\x1b[36m',  // Cyan
      debug: '\x1b[90m'  // Gray
    };
    
    const reset = '\x1b[0m';
    const color = colors[level] || colors.info;
    
    const formattedMessage = this.formatMessage(level, this.sanitizeMessage(message), meta);
    console.log(`${color}${formattedMessage}${reset}`);
  }

  info(message, meta = {}) {
    this.logToConsole('info', message, meta);
  }

  error(message, meta = {}) {
    this.logToConsole('error', message, meta);
  }

  warn(message, meta = {}) {
    this.logToConsole('warn', message, meta);
  }

  debug(message, meta = {}) {
    if (process.env.NODE_ENV !== 'production') {
      this.logToConsole('debug', message, meta);
    }
  }

  logRequest(req, res, processingTime) {
    const logData = {
      method: req.method,
      url: req.originalUrl || req.url,
      status: res.statusCode,
      time: processingTime + 'ms',
      ip: req.ip
    };
    
    if (res.statusCode >= 400) {
      this.error('HTTP Request Error', logData);
    } else {
      this.info('HTTP Request', logData);
    }
  }

  logPerformance(operation, duration, metadata = {}) {
    this.info(`Performance: ${operation}`, {
      duration: duration + 'ms',
      ...metadata
    });
  }

  logError(error, context = {}) {
    this.error('Application Error', {
      message: error.message,
      stack: error.stack?.substring(0, 500),
      ...context
    });
  }

  // Simplified methods for compatibility
  async getRecentLogs() {
    return [];
  }

  async getLogStats() {
    return {
      total: 0,
      errors: 0,
      warnings: 0,
      info: 0,
      debug: 0,
      errorRate: 0
    };
  }

  async shutdown() {
    this.info('Logger shutting down');
  }
}

// Create singleton instance
const logger = new Logger();

module.exports = logger;