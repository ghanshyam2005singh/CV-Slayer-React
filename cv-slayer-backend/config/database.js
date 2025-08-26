const mongoose = require('mongoose');
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
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
        new winston.transports.Console({ format: winston.format.simple() })
      ]
});

// Only add console logging in development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

let isConnected = false;
let connectionAttempts = 0;
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 5000; // 5 seconds

const connectDB = async () => {
  if (isConnected && mongoose.connection.readyState === 1) {
    logger.info('Database already connected');
    return;
  }

  try {
    const mongoUri = process.env.MONGODB_URI;
    
    if (!mongoUri) {
      throw new Error('MONGODB_URI not found in environment variables');
    }

    logger.info('Connecting to MongoDB Atlas...', {
      // Hide credentials in logs - only show sanitized URI
      uri: mongoUri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@')
    });
    
    // Production-optimized connection options
    const options = {
      serverSelectionTimeoutMS: process.env.NODE_ENV === 'production' ? 30000 : 15000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 30000,
      maxPoolSize: process.env.NODE_ENV === 'production' ? 50 : 10,
      minPoolSize: process.env.NODE_ENV === 'production' ? 5 : 1,
      maxIdleTimeMS: 30000,
      bufferCommands: false,
      autoIndex: process.env.NODE_ENV !== 'production', // Disable in production for performance
      retryWrites: true,
      writeConcern: {
        w: 'majority',
        j: true,
        wtimeout: 30000
      },
      readPreference: 'primary',
      heartbeatFrequencyMS: 10000
    };

    const conn = await mongoose.connect(mongoUri, options);
    
    isConnected = true;
    connectionAttempts = 0;

    logger.info('MongoDB Connected successfully', {
      host: conn.connection.host,
      database: conn.connection.name,
      environment: process.env.NODE_ENV
    });

    // Enhanced connection event handlers with secure logging
    mongoose.connection.on('error', (err) => {
      logger.error('Database error occurred', { 
        error: err.message,
        stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined
      });
      isConnected = false;
      
      // Attempt reconnection in production
      if (process.env.NODE_ENV === 'production') {
        setTimeout(() => {
          if (connectionAttempts < MAX_RETRY_ATTEMPTS) {
            reconnectWithRetry();
          }
        }, RETRY_DELAY);
      }
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('Database disconnected');
      isConnected = false;
    });

    mongoose.connection.on('reconnected', () => {
      logger.info('Database reconnected successfully');
      isConnected = true;
      connectionAttempts = 0;
    });

    mongoose.connection.on('close', () => {
      isConnected = false;
      logger.info('Database connection closed');
    });

    // Production monitoring events
    mongoose.connection.on('connected', () => {
      logger.info('MongoDB Atlas connection established', {
        timestamp: new Date().toISOString()
      });
    });

  } catch (error) {
    isConnected = false;
    connectionAttempts++;
    
    // Enhanced secure error logging
    logger.error('Database connection failed', {
      error: error.message,
      attempt: connectionAttempts,
      maxAttempts: MAX_RETRY_ATTEMPTS,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
    });
    
    // Provide helpful error messages in development only
    if (process.env.NODE_ENV !== 'production') {
      if (error.message.includes('authentication failed')) {
        logger.error('Authentication failed - Check MongoDB Atlas credentials');
      } else if (error.message.includes('network') || error.message.includes('ENOTFOUND')) {
        logger.error('Network error - Check internet connection and MongoDB Atlas access');
      } else if (error.message.includes('timeout')) {
        logger.error('Connection timeout - Check MongoDB Atlas cluster status');
      } else if (error.message.includes('bad auth')) {
        logger.error('Authentication failed - Verify MongoDB credentials');
      } else if (error.message.includes('ip whitelist')) {
        logger.error('IP not whitelisted - Add IP to MongoDB Atlas network access');
      }
    }
    
    // Retry logic for production
    if (process.env.NODE_ENV === 'production' && connectionAttempts < MAX_RETRY_ATTEMPTS) {
      logger.info('Retrying database connection', {
        attempt: connectionAttempts,
        maxAttempts: MAX_RETRY_ATTEMPTS,
        retryDelay: RETRY_DELAY * connectionAttempts
      });
      setTimeout(() => connectDB(), RETRY_DELAY * connectionAttempts);
      return;
    }
    
    throw new Error(`Database connection failed after ${connectionAttempts} attempts`);
  }
};

// Enhanced reconnection with exponential backoff
const reconnectWithRetry = async () => {
  if (connectionAttempts >= MAX_RETRY_ATTEMPTS) {
    logger.error('Max reconnection attempts reached', {
      attempts: connectionAttempts,
      maxAttempts: MAX_RETRY_ATTEMPTS
    });
    return;
  }

  connectionAttempts++;
  const delay = RETRY_DELAY * Math.pow(2, connectionAttempts - 1); // Exponential backoff
  
  logger.info('Attempting database reconnection', {
    attempt: connectionAttempts,
    maxAttempts: MAX_RETRY_ATTEMPTS,
    delay: delay
  });

  setTimeout(async () => {
    try {
      await connectDB();
    } catch (error) {
      logger.error('Reconnection failed', {
        error: error.message,
        attempt: connectionAttempts
      });
    }
  }, delay);
};

const getConnectionStatus = () => {
  const state = mongoose.connection.readyState;
  const stateMap = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };

  return {
    connected: isConnected && state === 1,
    status: stateMap[state] || 'unknown',
    state: state,
    host: mongoose.connection.host || 'unknown',
    name: mongoose.connection.name || 'unknown',
    attempts: connectionAttempts,
    maxAttempts: MAX_RETRY_ATTEMPTS,
    lastConnectionTime: mongoose.connection.readyState === 1 ? new Date().toISOString() : null,
    environment: process.env.NODE_ENV || 'unknown'
  };
};

const closeConnection = async () => {
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
      isConnected = false;
      logger.info('Database connection closed successfully');
    }
  } catch (error) {
    logger.error('Error closing database connection', { error: error.message });
    throw new Error('Failed to close database connection');
  }
};

// Health check function for monitoring
const healthCheck = async () => {
  try {
    if (!isConnected || mongoose.connection.readyState !== 1) {
      return { 
        healthy: false, 
        message: 'Database not connected',
        timestamp: new Date().toISOString()
      };
    }

    // Ping the database
    await mongoose.connection.db.admin().ping();
    
    return { 
      healthy: true, 
      message: 'Database connection healthy',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      connectionInfo: {
        host: mongoose.connection.host,
        name: mongoose.connection.name,
        readyState: mongoose.connection.readyState
      }
    };
  } catch (error) {
    logger.error('Database health check failed', { error: error.message });
    return { 
      healthy: false, 
      message: 'Database ping failed',
      error: process.env.NODE_ENV === 'production' ? 'Health check failed' : error.message,
      timestamp: new Date().toISOString()
    };
  }
};

// Graceful shutdown for production
const gracefulShutdown = async () => {
  try {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      isConnected = false;
      logger.info('Database connection closed gracefully during shutdown');
    }
  } catch (error) {
    logger.error('Error during graceful database shutdown', { error: error.message });
  }
};

// Database performance monitoring
const getPerformanceMetrics = () => {
  if (mongoose.connection.readyState !== 1) {
    return { available: false, message: 'Database not connected' };
  }

  return {
    available: true,
    connectionPool: {
      maxPoolSize: mongoose.connection.options?.maxPoolSize || 'unknown',
      minPoolSize: mongoose.connection.options?.minPoolSize || 'unknown'
    },
    readyState: mongoose.connection.readyState,
    host: mongoose.connection.host,
    database: mongoose.connection.name,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  };
};

module.exports = {
  connectDB,
  getConnectionStatus,
  closeConnection,
  healthCheck,
  gracefulShutdown,
  reconnectWithRetry,
  getPerformanceMetrics
};