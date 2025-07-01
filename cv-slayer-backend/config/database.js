const mongoose = require('mongoose');

let isConnected = false;
let connectionAttempts = 0;
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 5000; // 5 seconds

const connectDB = async () => {
  if (isConnected && mongoose.connection.readyState === 1) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('✅ Database already connected');
    }
    return;
  }

  try {
    const mongoUri = process.env.MONGODB_URI;
    
    if (!mongoUri) {
      throw new Error('MONGODB_URI not found in environment variables');
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log('🔗 Connecting to MongoDB Atlas...');
      console.log('📍 URI:', mongoUri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@')); // Hide credentials in logs
    }
    
    // Production-optimized connection options (fixed for current Mongoose version)
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
      // Removed serverSelectionRetryDelayMS as it's not supported in current Mongoose versions
    };

    const conn = await mongoose.connect(mongoUri, options);
    
    isConnected = true;
    connectionAttempts = 0;

    if (process.env.NODE_ENV !== 'production') {
      console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
      console.log(`📊 Database: ${conn.connection.name}`);
    }

    // Enhanced connection event handlers
    mongoose.connection.on('error', (err) => {
      if (process.env.NODE_ENV !== 'production') {
        console.error('❌ Database error:', err.message);
      }
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
      if (process.env.NODE_ENV !== 'production') {
        console.warn('⚠️ Database disconnected');
      }
      isConnected = false;
    });

    mongoose.connection.on('reconnected', () => {
      if (process.env.NODE_ENV !== 'production') {
        console.log('✅ Database reconnected');
      }
      isConnected = true;
      connectionAttempts = 0;
    });

    mongoose.connection.on('close', () => {
      isConnected = false;
      if (process.env.NODE_ENV !== 'production') {
        console.log('📪 Database connection closed');
      }
    });

    // Production monitoring
    if (process.env.NODE_ENV === 'production') {
      mongoose.connection.on('connected', () => {
        console.log('✅ MongoDB Atlas connection established');
      });
    }

  } catch (error) {
    isConnected = false;
    connectionAttempts++;
    
    // Enhanced error logging for development
    if (process.env.NODE_ENV !== 'production') {
      console.error('❌ Database connection failed:', error.message);
      
      // More specific error messages for development
      if (error.message.includes('authentication failed')) {
        console.error('🔐 Check your MongoDB Atlas username and password');
      } else if (error.message.includes('network') || error.message.includes('ENOTFOUND')) {
        console.error('🌐 Check your internet connection and MongoDB Atlas network access');
      } else if (error.message.includes('timeout')) {
        console.error('⏱️ Connection timeout - check MongoDB Atlas cluster status');
      } else if (error.message.includes('bad auth')) {
        console.error('🔑 Authentication failed - verify your MongoDB credentials');
      } else if (error.message.includes('ip whitelist')) {
        console.error('🛡️ IP not whitelisted - add your IP to MongoDB Atlas network access');
      }
    }
    
    // Retry logic for production
    if (process.env.NODE_ENV === 'production' && connectionAttempts < MAX_RETRY_ATTEMPTS) {
      console.log(`🔄 Retrying database connection (${connectionAttempts}/${MAX_RETRY_ATTEMPTS})...`);
      setTimeout(() => connectDB(), RETRY_DELAY * connectionAttempts);
      return;
    }
    
    throw new Error(`Database connection failed after ${connectionAttempts} attempts`);
  }
};

// Enhanced reconnection with exponential backoff
const reconnectWithRetry = async () => {
  if (connectionAttempts >= MAX_RETRY_ATTEMPTS) {
    console.error('❌ Max reconnection attempts reached');
    return;
  }

  connectionAttempts++;
  const delay = RETRY_DELAY * Math.pow(2, connectionAttempts - 1); // Exponential backoff
  
  if (process.env.NODE_ENV !== 'production') {
    console.log(`🔄 Attempting to reconnect to database (${connectionAttempts}/${MAX_RETRY_ATTEMPTS})...`);
  }

  setTimeout(async () => {
    try {
      await connectDB();
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('❌ Reconnection failed:', error.message);
      }
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
    lastConnectionTime: mongoose.connection.readyState === 1 ? new Date().toISOString() : null
  };
};

const closeConnection = async () => {
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
      isConnected = false;
      
      if (process.env.NODE_ENV !== 'production') {
        console.log('✅ Database connection closed');
      }
    }
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('❌ Error closing database connection:', error.message);
    }
    throw new Error('Failed to close database connection');
  }
};

// Health check function
const healthCheck = async () => {
  try {
    if (!isConnected || mongoose.connection.readyState !== 1) {
      return { healthy: false, message: 'Database not connected' };
    }

    // Ping the database
    await mongoose.connection.db.admin().ping();
    
    return { 
      healthy: true, 
      message: 'Database connection healthy',
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return { 
      healthy: false, 
      message: 'Database ping failed',
      error: error.message 
    };
  }
};

// Graceful shutdown
const gracefulShutdown = async () => {
  try {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      isConnected = false;
      console.log('✅ Database connection closed gracefully');
    }
  } catch (error) {
    console.error('❌ Error during graceful database shutdown:', error.message);
  }
};

module.exports = {
  connectDB,
  getConnectionStatus,
  closeConnection,
  healthCheck,
  gracefulShutdown,
  reconnectWithRetry
};