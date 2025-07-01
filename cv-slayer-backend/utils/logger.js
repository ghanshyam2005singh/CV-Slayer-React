const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

class Logger {
  constructor() {
    // Create logs directory if it doesn't exist
    this.logsDir = path.join(__dirname, '../logs');
    this.initializeLogDirectory();
    
    // Basic configuration
    this.maxFileSize = 10 * 1024 * 1024; // 10MB
    this.maxBackups = 5;
    this.logLevels = ['error', 'warn', 'info'];
  }

  initializeLogDirectory() {
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
      environment: process.env.NODE_ENV || 'development'
    };

    return JSON.stringify(logEntry);
  }

  sanitizeMessage(message) {
    if (typeof message !== 'string') {
      message = String(message);
    }
    
    // Remove sensitive data patterns
    return message
      .replace(/password[=:]\s*\S+/gi, 'password=[REDACTED]')
      .replace(/token[=:]\s*\S+/gi, 'token=[REDACTED]')
      .replace(/key[=:]\s*\S+/gi, 'key=[REDACTED]')
      .replace(/secret[=:]\s*\S+/gi, 'secret=[REDACTED]')
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]')
      .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE]')
      .substring(0, 500);
  }

  async writeToFile(level, message, meta = {}) {
    try {
      const logFile = path.join(this.logsDir, `${level}.log`);
      const logContent = this.formatMessage(level, message, meta) + '\n';
      
      // Check file size and rotate if necessary
      await this.rotateLogIfNeeded(logFile);
      
      // Append to log file
      await fs.appendFile(logFile, logContent);
    } catch (error) {
      // Silent fail
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

  info(message, meta = {}) {
    this.writeToFile('info', message, meta);
  }

  error(message, meta = {}) {
    this.writeToFile('error', message, meta);
  }

  warn(message, meta = {}) {
    this.writeToFile('warn', message, meta);
  }

  async getRecentLogs(options = {}) {
    const {
      level = 'all',
      limit = 100
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

  async getLogStats() {
    try {
      const logs = await this.getRecentLogs({
        level: 'all',
        limit: 1000
      });
      
      const stats = {
        total: logs.length,
        errors: logs.filter(log => log.level === 'ERROR').length,
        warnings: logs.filter(log => log.level === 'WARN').length,
        info: logs.filter(log => log.level === 'INFO').length
      };
      
      return stats;
      
    } catch (error) {
      return {
        total: 0,
        errors: 0,
        warnings: 0,
        info: 0
      };
    }
  }
}

// Create singleton instance
const logger = new Logger();

module.exports = logger;