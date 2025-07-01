const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

// Admin schema for MongoDB (optional)
const adminSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'admin' },
  createdAt: { type: Date, default: Date.now }
});

const Admin = mongoose.model('Admin', adminSchema);

class AdminAuth {
  constructor() {
    // Environment variables
    this.adminEmails = this.parseAdminEmails(process.env.ADMIN_EMAILS);
    this.adminPassword = process.env.ADMIN_PASSWORD;
    this.jwtSecret = process.env.JWT_SECRET || 'your-default-jwt-secret-for-development';
    this.tokenExpiry = process.env.JWT_EXPIRY || '24h';
    
    // Basic validation
    if (!this.adminPassword) {
      console.warn('⚠️ ADMIN_PASSWORD not set in environment variables');
    }
    if (!process.env.JWT_SECRET) {
      console.warn('⚠️ JWT_SECRET not set, using default (not recommended for production)');
    }
    
    // BIND METHODS TO PRESERVE 'this' CONTEXT
    this.requireAuth = this.requireAuth.bind(this);
    this.login = this.login.bind(this);
    this.checkHealth = this.checkHealth.bind(this);
  }

  parseAdminEmails(emailString) {
    if (!emailString) return ['ghanshyam2005singh@gmail.com'];
    
    return emailString
      .split(',')
      .map(email => email.trim().toLowerCase())
      .filter(email => email.includes('@'));
  }

  async login(email, password) {
    try {
      const normalizedEmail = email?.toLowerCase()?.trim();
      
      // Basic validation
      if (!email || !password) {
        return {
          success: false,
          error: 'Email and password are required'
        };
      }

      // Environment variable authentication
      if (this.adminEmails.includes(normalizedEmail) && password === this.adminPassword) {
        const tokenPayload = {
          email: normalizedEmail,
          role: 'admin',
          loginTime: new Date().toISOString(),
          authMethod: 'env'
        };

        const accessToken = jwt.sign(tokenPayload, this.jwtSecret, { 
          expiresIn: this.tokenExpiry
        });

        const expiresInSeconds = this.parseTokenExpiry(this.tokenExpiry);

        return {
          success: true,
          token: accessToken,
          expiresIn: expiresInSeconds,
          message: 'Login successful',
          loginTime: tokenPayload.loginTime
        };
      }

      // MongoDB fallback (with timeout protection)
      try {
        if (mongoose.connection.readyState === 1) {
          const admin = await Admin.findOne({ email: normalizedEmail }).maxTimeMS(3000);
          
          if (admin) {
            const isPasswordValid = await bcrypt.compare(password, admin.password);
            
            if (isPasswordValid) {
              const tokenPayload = {
                adminId: admin._id,
                email: normalizedEmail,
                role: 'admin',
                loginTime: new Date().toISOString(),
                authMethod: 'mongodb'
              };

              const accessToken = jwt.sign(tokenPayload, this.jwtSecret, { 
                expiresIn: this.tokenExpiry
              });

              const expiresInSeconds = this.parseTokenExpiry(this.tokenExpiry);

              return {
                success: true,
                token: accessToken,
                expiresIn: expiresInSeconds,
                message: 'Login successful',
                loginTime: tokenPayload.loginTime
              };
            }
          }
        }
      } catch (mongoError) {
        console.log('MongoDB auth unavailable:', mongoError.message);
      }

      return {
        success: false,
        error: 'Invalid credentials'
      };

    } catch (error) {
      console.error('Login error:', error.message);
      return {
        success: false,
        error: 'Authentication failed'
      };
    }
  }

  parseTokenExpiry(expiry) {
    const timeUnit = expiry.slice(-1);
    const timeValue = parseInt(expiry.slice(0, -1));
    
    switch (timeUnit) {
      case 'h': return timeValue * 3600;
      case 'm': return timeValue * 60;
      case 'd': return timeValue * 86400;
      default: return 86400; // 24 hours default
    }
  }

  requireAuth(req, res, next) {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          success: false,
          error: { message: 'Authorization required' }
        });
      }

      const token = authHeader.replace('Bearer ', '');

      if (!token) {
        return res.status(401).json({
          success: false,
          error: { message: 'Access token required' }
        });
      }

      // Verify JWT token
      if (!this.jwtSecret) {
        console.error('CRITICAL: JWT Secret is undefined!');
        return res.status(500).json({
          success: false,
          error: { message: 'Server configuration error' }
        });
      }

      const decoded = jwt.verify(token, this.jwtSecret);
      
      if (decoded.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: { message: 'Admin access required' }
        });
      }

      // Set admin info in request
      req.admin = {
        id: decoded.adminId || 'env-admin',
        email: decoded.email,
        role: decoded.role,
        authMethod: decoded.authMethod || 'env'
      };

      next();

    } catch (error) {
      let errorMessage = 'Invalid or expired token';

      if (error.name === 'TokenExpiredError') {
        errorMessage = 'Session expired. Please log in again.';
      } else if (error.name === 'JsonWebTokenError') {
        errorMessage = 'Invalid token format';
      }

      return res.status(401).json({
        success: false,
        error: { message: errorMessage }
      });
    }
  }

  async checkHealth() {
    try {
      let mongoAdminCount = 0;
      
      try {
        if (mongoose.connection.readyState === 1) {
          mongoAdminCount = await Admin.countDocuments().maxTimeMS(3000);
        }
      } catch (mongoError) {
        // MongoDB not available, that's okay
      }
      
      return {
        healthy: true,
        envAuth: {
          hasAdminEmails: this.adminEmails.length > 0,
          adminEmails: this.adminEmails,
          hasPassword: !!this.adminPassword
        },
        mongoAuth: {
          hasAdmins: mongoAdminCount > 0,
          adminCount: mongoAdminCount,
          connected: mongoose.connection.readyState === 1
        },
        jwt: {
          hasSecret: !!this.jwtSecret,
          expiry: this.tokenExpiry
        }
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message
      };
    }
  }
}

module.exports = new AdminAuth();