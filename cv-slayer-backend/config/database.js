const mongoose = require('mongoose');

let isConnected = false;

const connectDB = async () => {
  if (isConnected && mongoose.connection.readyState === 1) {
    return;
  }

  try {
    const mongoUri = process.env.MONGODB_URI;
    
    if (!mongoUri) {
      throw new Error('MONGODB_URI environment variable is required');
    }

    console.log('Connecting to database...');
    
    // Simplified, reliable connection options
    const options = {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
      maxPoolSize: 10,
      minPoolSize: 2,
      bufferCommands: false,
      autoIndex: false, // Prevents duplicate index warnings
      retryWrites: true
    };

    await mongoose.connect(mongoUri, options);
    
    isConnected = true;
    console.log('✅ Database connected successfully');

    // Simple event handlers
    mongoose.connection.on('error', (err) => {
      console.error('❌ Database error:', err.message);
      isConnected = false;
    });

    mongoose.connection.on('disconnected', () => {
      console.log('⚠️ Database disconnected');
      isConnected = false;
    });

    mongoose.connection.on('reconnected', () => {
      console.log('✅ Database reconnected');
      isConnected = true;
    });

  } catch (error) {
    isConnected = false;
    console.error('❌ Database connection failed:', error.message);
    
    // Helpful error messages
    if (error.message.includes('authentication')) {
      console.error('💡 Check database username/password');
    } else if (error.message.includes('network') || error.message.includes('ENOTFOUND')) {
      console.error('💡 Check internet connection and database URL');
    } else if (error.message.includes('timeout')) {
      console.error('💡 Database server might be slow or unreachable');
    }
    
    throw error;
  }
};

const getConnectionStatus = () => {
  return {
    connected: isConnected && mongoose.connection.readyState === 1,
    status: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  };
};

const closeConnection = async () => {
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
      isConnected = false;
      console.log('✅ Database connection closed');
    }
  } catch (error) {
    console.error('❌ Error closing database:', error.message);
  }
};

const healthCheck = async () => {
  try {
    if (!isConnected || mongoose.connection.readyState !== 1) {
      return { healthy: false, message: 'Not connected' };
    }

    await mongoose.connection.db.admin().ping();
    return { healthy: true, message: 'Database responsive' };
  } catch (error) {
    return { healthy: false, message: error.message };
  }
};

module.exports = {
  connectDB,
  getConnectionStatus,
  closeConnection,
  healthCheck
};