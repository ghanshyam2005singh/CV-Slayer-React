const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');

class Logger {
  constructor() {
    // Production-safe configuration
    this.isProduction = process.env.NODE_ENV === 'production';
    
    if (!this.isProduction) {
      // Only create logs directory in development
      this.logsDir = path.join(__dirname, '../logs');
      this.initializeLogDirectory();
    }
    
    // Enhanced configuration
    this.maxFileSize = 10 * 1024 * 1024; // 10MB
    this.maxBackups = 5;
    this.logLevels = ['error', 'warn', 'info', 'debug'];
    this.enableConsoleOutput = true; // Always enable console output
    
    // Performance optimization
    this.writeQueue = [];
    this.isWriting = false;
    this.flushInterval = 1000; // 1 second
    
    // Start flush timer only in development
    if (!this.isProduction) {
      this.startFlushTimer();
    }
  }

  initializeLogDirectory() {
    // Only run in development
    if (this.isProduction) return;
    
    try {
      if (!fsSync.existsSync(this.logsDir)) {
        fsSync.mkdirSync(this.logsDir, { recursive: true });
      }
    } catch (error) {
      // Silent fail
    }
  }

  formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      message: this.sanitizeMessage(message),
      environment: process.env.NODE_ENV || 'development',
      service: 'cv-slayer-backend',
      pid: process.pid,
      ...(Object.keys(meta).length > 0 && { meta: this.sanitizeMeta(meta) })
    };

    return JSON.stringify(logEntry);
  }

  sanitizeMessage(message) {
    if (typeof message !== 'string') {
      message = String(message);
    }
    
    // Enhanced sensitive data patterns
    return message
      .replace(/password[=:]\s*\S+/gi, 'password=[REDACTED]')
      .replace(/token[=:]\s*\S+/gi, 'token=[REDACTED]')
      .replace(/key[=:]\s*\S+/gi, 'key=[REDACTED]')
      .replace(/secret[=:]\s*\S+/gi, 'secret=[REDACTED]')
      .replace(/authorization[=:]\s*\S+/gi, 'authorization=[REDACTED]')
      .replace(/bearer\s+\S+/gi, 'bearer [REDACTED]')
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]')
      .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE]')
      .replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, '[CARD]')
      .substring(0, 1000); // Increased limit
  }

  sanitizeMeta(meta) {
    const sanitized = { ...meta };
    
    // Recursively sanitize nested objects
    for (const [key, value] of Object.entries(sanitized)) {
      if (typeof value === 'string') {
        sanitized[key] = this.sanitizeMessage(value);
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeMeta(value);
      } else if (Array.isArray(value)) {
        sanitized[key] = value.map(item => 
          typeof item === 'string' ? this.sanitizeMessage(item) : item
        );
      }
    }
    
    return sanitized;
  }

  // Fixed: Single writeToFile method with proper production handling
  async writeToFile(level, message, meta = {}) {
    // Always log to console
    this.logToConsole(level, message, meta);
    
    // Only write to file in development
    if (!this.isProduction) {
      const logEntry = {
        level,
        message,
        meta,
        timestamp: Date.now()
      };
      
      // Add to write queue for batch processing
      this.writeQueue.push(logEntry);
    }
  }

  logToConsole(level, message, meta) {
    const colors = {
      error: '\x1b[31m', // Red
      warn: '\x1b[33m',  // Yellow
      info: '\x1b[36m',  // Cyan
      debug: '\x1b[90m'  // Gray
    };
    
    const reset = '\x1b[0m';
    const color = colors[level] || colors.info;
    const timestamp = new Date().toISOString();
    
    console.log(`${color}[${timestamp}] ${level.toUpperCase()}: ${message}${reset}`);
    
    if (Object.keys(meta).length > 0) {
      console.log(`${color}Meta:${reset}`, meta);
    }
  }

  startFlushTimer() {
    setInterval(async () => {
      await this.flushLogs();
    }, this.flushInterval);
  }

  // Fixed: Single flushLogs method with proper production checks
  async flushLogs() {
    // Skip file operations in production
    if (this.isProduction || this.isWriting || this.writeQueue.length === 0) {
      return;
    }
    
    this.isWriting = true;
    const logsToWrite = [...this.writeQueue];
    this.writeQueue = [];
    
    try {
      // Group logs by level
      const logsByLevel = logsToWrite.reduce((acc, log) => {
        if (!acc[log.level]) acc[log.level] = [];
        acc[log.level].push(log);
        return acc;
      }, {});
      
      // Write to files (development only)
      for (const [level, logs] of Object.entries(logsByLevel)) {
        const logFile = path.join(this.logsDir, `${level}.log`);
        const logContent = logs
          .map(log => this.formatMessage(log.level, log.message, log.meta))
          .join('\n') + '\n';
        
        await this.rotateLogIfNeeded(logFile);
        await fs.appendFile(logFile, logContent);
      }
    } catch (error) {
      // Silent fail - put logs back in queue
      this.writeQueue.unshift(...logsToWrite);
    } finally {
      this.isWriting = false;
    }
  }

  async rotateLogIfNeeded(logFile) {
    try {
      const stats = await fs.stat(logFile);
      
      if (stats.size > this.maxFileSize) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = `${logFile}.${timestamp}`;
        
        // Move current log to backup
        await fs.rename(logFile, backupFile);
        
        // Cleanup old backups
        await this.cleanupOldBackups(path.dirname(logFile), path.basename(logFile));
      }
    } catch (error) {
      // File doesn't exist or other error - continue
    }
  }

  async cleanupOldBackups(dir, baseName) {
    try {
      const files = await fs.readdir(dir);
      const backupFiles = files
        .filter(file => file.startsWith(`${baseName}.`))
        .sort()
        .reverse();
      
      // Remove excess backups
      const filesToDelete = backupFiles.slice(this.maxBackups);
      for (const file of filesToDelete) {
        try {
          await fs.unlink(path.join(dir, file));
        } catch (error) {
          // Continue on deletion errors
        }
      }
    } catch (error) {
      // Continue on cleanup errors
    }
  }

  // Enhanced logging methods
  info(message, meta = {}) {
    this.writeToFile('info', message, meta);
  }

  error(message, meta = {}) {
    this.writeToFile('error', message, meta);
  }

  warn(message, meta = {}) {
    this.writeToFile('warn', message, meta);
  }

  debug(message, meta = {}) {
    if (process.env.NODE_ENV !== 'production') {
      this.writeToFile('debug', message, meta);
    }
  }

  // Request logging helper
  logRequest(req, res, processingTime) {
    const logData = {
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode: res.statusCode,
      processingTime,
      userAgent: req.get('User-Agent'),
      ip: req.ip || req.connection.remoteAddress,
      contentLength: res.get('Content-Length'),
      timestamp: new Date().toISOString()
    };
    
    if (res.statusCode >= 400) {
      this.error('HTTP Request Error', logData);
    } else {
      this.info('HTTP Request', logData);
    }
  }

  // Performance logging
  logPerformance(operation, duration, metadata = {}) {
    this.info('Performance Metric', {
      operation,
      duration,
      ...metadata
    });
  }

  // Error logging with stack trace
  logError(error, context = {}) {
    const errorData = {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code,
      ...context
    };
    
    this.error('Application Error', errorData);
  }

  // Fixed: getRecentLogs with proper production handling
  async getRecentLogs(options = {}) {
    // In production, return empty array since no file logs
    if (this.isProduction) {
      return [];
    }

    const {
      level = 'all',
      limit = 100,
      startDate,
      endDate
    } = options;

    try {
      const logs = [];
      let levels = level === 'all' ? this.logLevels : [level];
      
      for (const logLevel of levels) {
        const logFile = path.join(this.logsDir, `${logLevel}.log`);
        
        try {
          const content = await fs.readFile(logFile, 'utf8');
          const lines = content.trim().split('\n').filter(line => line);
          
          for (const line of lines) {
            try {
              const logEntry = JSON.parse(line);
              
              // Filter by date range if provided
              if (startDate || endDate) {
                const logDate = new Date(logEntry.timestamp);
                if (startDate && logDate < new Date(startDate)) continue;
                if (endDate && logDate > new Date(endDate)) continue;
              }
              
              logs.push(logEntry);
            } catch (e) {
              // Skip invalid JSON lines
            }
          }
        } catch (error) {
          // File doesn't exist - continue
        }
      }
      
      // Sort by timestamp and limit
      return logs
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, Math.min(limit, 1000));
        
    } catch (error) {
      return [];
    }
  }

  // Fixed: getLogStats with proper production handling
  async getLogStats(timeRange = '24h') {
    // In production, return basic stats since no file logs
    if (this.isProduction) {
      return {
        total: 0,
        timeRange,
        errors: 0,
        warnings: 0,
        info: 0,
        debug: 0,
        errorRate: 0,
        hourlyVolume: [],
        lastError: null,
        note: 'File logging disabled in production - using console logs only'
      };
    }

    try {
      const now = new Date();
      const startDate = new Date();
      
      // Calculate start date based on time range
      switch (timeRange) {
        case '1h':
          startDate.setHours(now.getHours() - 1);
          break;
        case '24h':
          startDate.setDate(now.getDate() - 1);
          break;
        case '7d':
          startDate.setDate(now.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(now.getDate() - 30);
          break;
        default:
          startDate.setDate(now.getDate() - 1);
      }
      
      const logs = await this.getRecentLogs({
        level: 'all',
        limit: 10000,
        startDate: startDate.toISOString()
      });
      
      const stats = {
        total: logs.length,
        timeRange,
        errors: logs.filter(log => log.level === 'ERROR').length,
        warnings: logs.filter(log => log.level === 'WARN').length,
        info: logs.filter(log => log.level === 'INFO').length,
        debug: logs.filter(log => log.level === 'DEBUG').length,
        
        // Error rate
        errorRate: logs.length > 0 ? 
          ((logs.filter(log => log.level === 'ERROR').length / logs.length) * 100).toFixed(2) : 0,
        
        // Most recent error
        lastError: logs.find(log => log.level === 'ERROR'),
        
        // Log volume by hour (for recent logs)
        hourlyVolume: this.calculateHourlyVolume(logs)
      };
      
      return stats;
      
    } catch (error) {
      return {
        total: 0,
        timeRange,
        errors: 0,
        warnings: 0,
        info: 0,
        debug: 0,
        errorRate: 0,
        hourlyVolume: [],
        lastError: null
      };
    }
  }

  calculateHourlyVolume(logs) {
    const hourlyData = {};
    
    logs.forEach(log => {
      const hour = new Date(log.timestamp).toISOString().substr(0, 13); // YYYY-MM-DDTHH
      hourlyData[hour] = (hourlyData[hour] || 0) + 1;
    });
    
    return Object.entries(hourlyData)
      .map(([hour, count]) => ({ hour, count }))
      .sort((a, b) => a.hour.localeCompare(b.hour))
      .slice(-24); // Last 24 hours
  }

  // Health check method
  getHealthStatus() {
    return {
      status: 'healthy',
      environment: process.env.NODE_ENV || 'development',
      loggingMode: this.isProduction ? 'console-only' : 'console-and-file',
      queueSize: this.writeQueue.length,
      isWriting: this.isWriting,
      enableConsoleOutput: this.enableConsoleOutput,
      timestamp: new Date().toISOString()
    };
  }

  // Graceful shutdown - flush remaining logs
  async shutdown() {
    this.info('Logger shutting down');
    if (!this.isProduction) {
      await this.flushLogs();
    }
  }
}

// Create singleton instance
const logger = new Logger();

// Graceful shutdown handler
process.on('SIGINT', async () => {
  await logger.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await logger.shutdown();
  process.exit(0);
});

module.exports = logger;