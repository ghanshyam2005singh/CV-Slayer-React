const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const crypto = require('crypto');

// Admin schema for MongoDB
const adminSchema = new mongoose.Schema({
  email: { 
    type: String, 
    required: true, 
    unique: true,
    lowercase: true,
    trim: true
  },
  password: { 
    type: String, 
    required: true,
    minlength: 8
  },
  role: { 
    type: String, 
    default: 'admin',
    enum: ['admin', 'super_admin']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date,
    default: null
  },
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: {
    type: Date,
    default: null
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

// Indexes for better performance
adminSchema.index({ email: 1 });
adminSchema.index({ isActive: 1 });

const Admin = mongoose.model('Admin', adminSchema);

class AdminAuth {
  constructor() {
    // Environment variables validation
    this.validateEnvironment();
    
    this.adminEmails = this.parseAdminEmails(process.env.ADMIN_EMAILS);
    this.adminPassword = process.env.ADMIN_PASSWORD;
    this.jwtSecret = process.env.JWT_SECRET;
    this.tokenExpiry = process.env.JWT_EXPIRY || '24h';
    this.maxLoginAttempts = 5;
    this.lockoutTime = 15 * 60 * 1000; // 15 minutes
    
    // BIND METHODS TO PRESERVE 'this' CONTEXT
    this.requireAuth = this.requireAuth.bind(this);
    this.login = this.login.bind(this);
    this.checkHealth = this.checkHealth.bind(this);
    this.createAdmin = this.createAdmin.bind(this);
    this.changePassword = this.changePassword.bind(this);
  }

  validateEnvironment() {
    const missingVars = [];
    
    if (!process.env.JWT_SECRET) {
      missingVars.push('JWT_SECRET');
    }
    
    if (!process.env.ADMIN_EMAILS && !process.env.ADMIN_PASSWORD) {
      console.warn('⚠️ No admin credentials configured. Please set ADMIN_EMAILS and ADMIN_PASSWORD');
    }
    
    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }
    
    // Validate JWT secret strength
    if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
      console.warn('⚠️ JWT_SECRET should be at least 32 characters long for security');
    }
  }

  parseAdminEmails(emailString) {
    if (!emailString) {
      console.warn('⚠️ No ADMIN_EMAILS configured. Admin access will rely on database only.');
      return [];
    }
    
    const emails = emailString
      .split(',')
      .map(email => email.trim().toLowerCase())
      .filter(email => {
        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
      });
    
    if (emails.length === 0) {
      console.warn('⚠️ No valid emails found in ADMIN_EMAILS');
    }
    
    return emails;
  }

  async login(email, password) {
    try {
      const normalizedEmail = email?.toLowerCase()?.trim();
      
      // Basic validation
      if (!email || !password) {
        return {
          success: false,
          error: 'Email and password are required',
          code: 'MISSING_CREDENTIALS'
        };
      }

      // Email format validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(normalizedEmail)) {
        return {
          success: false,
          error: 'Invalid email format',
          code: 'INVALID_EMAIL'
        };
      }

      // Environment variable authentication (if configured)
      if (this.adminEmails.length > 0 && this.adminPassword) {
        if (this.adminEmails.includes(normalizedEmail) && password === this.adminPassword) {
          const tokenPayload = {
            email: normalizedEmail,
            role: 'admin',
            loginTime: new Date().toISOString(),
            authMethod: 'env',
            sessionId: crypto.randomUUID()
          };

          const accessToken = jwt.sign(tokenPayload, this.jwtSecret, { 
            expiresIn: this.tokenExpiry,
            issuer: 'cv-slayer-api',
            audience: 'cv-slayer-admin'
          });

          const expiresInSeconds = this.parseTokenExpiry(this.tokenExpiry);

          return {
            success: true,
            token: accessToken,
            expiresIn: expiresInSeconds,
            message: 'Login successful',
            user: {
              email: normalizedEmail,
              role: 'admin',
              authMethod: 'environment'
            },
            loginTime: tokenPayload.loginTime
          };
        }
      }

      // MongoDB authentication (with rate limiting)
      try {
        if (mongoose.connection.readyState === 1) {
          const admin = await Admin.findOne({ 
            email: normalizedEmail,
            isActive: true
          }).maxTimeMS(5000);
          
          if (!admin) {
            return {
              success: false,
              error: 'Invalid credentials',
              code: 'INVALID_CREDENTIALS'
            };
          }

          // Check if account is locked
          if (admin.lockUntil && admin.lockUntil > Date.now()) {
            const remainingTime = Math.ceil((admin.lockUntil - Date.now()) / 1000 / 60);
            return {
              success: false,
              error: `Account locked. Try again in ${remainingTime} minutes`,
              code: 'ACCOUNT_LOCKED'
            };
          }

          // Verify password
          const isPasswordValid = await bcrypt.compare(password, admin.password);
          
          if (!isPasswordValid) {
            // Increment login attempts
            admin.loginAttempts += 1;
            
            if (admin.loginAttempts >= this.maxLoginAttempts) {
              admin.lockUntil = new Date(Date.now() + this.lockoutTime);
              admin.loginAttempts = 0;
            }
            
            await admin.save();
            
            return {
              success: false,
              error: 'Invalid credentials',
              code: 'INVALID_CREDENTIALS'
            };
          }

          // Successful login - reset attempts and update last login
          admin.loginAttempts = 0;
          admin.lockUntil = null;
          admin.lastLogin = new Date();
          await admin.save();

          const tokenPayload = {
            adminId: admin._id.toString(),
            email: normalizedEmail,
            role: admin.role,
            loginTime: new Date().toISOString(),
            authMethod: 'mongodb',
            sessionId: crypto.randomUUID()
          };

          const accessToken = jwt.sign(tokenPayload, this.jwtSecret, { 
            expiresIn: this.tokenExpiry,
            issuer: 'cv-slayer-api',
            audience: 'cv-slayer-admin'
          });

          const expiresInSeconds = this.parseTokenExpiry(this.tokenExpiry);

          return {
            success: true,
            token: accessToken,
            expiresIn: expiresInSeconds,
            message: 'Login successful',
            user: {
              id: admin._id.toString(),
              email: normalizedEmail,
              role: admin.role,
              authMethod: 'database',
              lastLogin: admin.lastLogin
            },
            loginTime: tokenPayload.loginTime
          };
        }
      } catch (mongoError) {
        console.error('MongoDB auth error:', mongoError.message);
        
        // If MongoDB is down but env auth is available, don't fail completely
        if (this.adminEmails.length === 0) {
          return {
            success: false,
            error: 'Authentication service temporarily unavailable',
            code: 'SERVICE_UNAVAILABLE'
          };
        }
      }

      return {
        success: false,
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS'
      };

    } catch (error) {
      console.error('Login error:', error.message);
      return {
        success: false,
        error: 'Authentication failed',
        code: 'AUTH_ERROR'
      };
    }
  }

  async createAdmin(email, password, role = 'admin') {
    try {
      const normalizedEmail = email?.toLowerCase()?.trim();
      
      // Validation
      if (!email || !password) {
        return {
          success: false,
          error: 'Email and password are required'
        };
      }

      if (password.length < 8) {
        return {
          success: false,
          error: 'Password must be at least 8 characters long'
        };
      }

      // Check if admin already exists
      const existingAdmin = await Admin.findOne({ email: normalizedEmail });
      if (existingAdmin) {
        return {
          success: false,
          error: 'Admin with this email already exists'
        };
      }

      // Hash password
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      // Create admin
      const admin = new Admin({
        email: normalizedEmail,
        password: hashedPassword,
        role: role,
        isActive: true
      });

      await admin.save();

      return {
        success: true,
        message: 'Admin created successfully',
        admin: {
          id: admin._id.toString(),
          email: admin.email,
          role: admin.role,
          createdAt: admin.createdAt
        }
      };

    } catch (error) {
      console.error('Create admin error:', error.message);
      return {
        success: false,
        error: 'Failed to create admin'
      };
    }
  }

  async changePassword(adminId, currentPassword, newPassword) {
    try {
      if (!currentPassword || !newPassword) {
        return {
          success: false,
          error: 'Current and new passwords are required'
        };
      }

      if (newPassword.length < 8) {
        return {
          success: false,
          error: 'New password must be at least 8 characters long'
        };
      }

      const admin = await Admin.findById(adminId);
      if (!admin) {
        return {
          success: false,
          error: 'Admin not found'
        };
      }

      // Verify current password
      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, admin.password);
      if (!isCurrentPasswordValid) {
        return {
          success: false,
          error: 'Current password is incorrect'
        };
      }

      // Hash new password
      const saltRounds = 12;
      const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

      // Update password
      admin.password = hashedNewPassword;
      await admin.save();

      return {
        success: true,
        message: 'Password changed successfully'
      };

    } catch (error) {
      console.error('Change password error:', error.message);
      return {
        success: false,
        error: 'Failed to change password'
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
      case 's': return timeValue;
      default: return 86400; // 24 hours default
    }
  }

  requireAuth(req, res, next) {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          success: false,
          error: { 
            message: 'Authorization header required',
            code: 'MISSING_AUTH_HEADER'
          }
        });
      }

      const token = authHeader.replace('Bearer ', '');

      if (!token) {
        return res.status(401).json({
          success: false,
          error: { 
            message: 'Access token required',
            code: 'MISSING_TOKEN'
          }
        });
      }

      // Verify JWT token
      const decoded = jwt.verify(token, this.jwtSecret, {
        issuer: 'cv-slayer-api',
        audience: 'cv-slayer-admin'
      });
      
      if (decoded.role !== 'admin' && decoded.role !== 'super_admin') {
        return res.status(403).json({
          success: false,
          error: { 
            message: 'Admin access required',
            code: 'INSUFFICIENT_PERMISSIONS'
          }
        });
      }

      // Set admin info in request
      req.admin = {
        id: decoded.adminId || 'env-admin',
        email: decoded.email,
        role: decoded.role,
        authMethod: decoded.authMethod || 'env',
        sessionId: decoded.sessionId
      };

      next();

    } catch (error) {
      let errorMessage = 'Invalid or expired token';
      let errorCode = 'INVALID_TOKEN';

      if (error.name === 'TokenExpiredError') {
        errorMessage = 'Session expired. Please log in again.';
        errorCode = 'TOKEN_EXPIRED';
      } else if (error.name === 'JsonWebTokenError') {
        errorMessage = 'Invalid token format';
        errorCode = 'MALFORMED_TOKEN';
      } else if (error.name === 'NotBeforeError') {
        errorMessage = 'Token not active yet';
        errorCode = 'TOKEN_NOT_ACTIVE';
      }

      return res.status(401).json({
        success: false,
        error: { 
          message: errorMessage,
          code: errorCode
        }
      });
    }
  }

  async checkHealth() {
    try {
      let mongoAdminCount = 0;
      let mongoConnected = false;
      
      try {
        if (mongoose.connection.readyState === 1) {
          mongoConnected = true;
          mongoAdminCount = await Admin.countDocuments({ isActive: true }).maxTimeMS(3000);
        }
      } catch (mongoError) {
        console.warn('MongoDB health check failed:', mongoError.message);
      }
      
      return {
        healthy: true,
        envAuth: {
          configured: this.adminEmails.length > 0 && !!this.adminPassword,
          emailCount: this.adminEmails.length,
          hasPassword: !!this.adminPassword
        },
        mongoAuth: {
          connected: mongoConnected,
          activeAdmins: mongoAdminCount,
          hasAdmins: mongoAdminCount > 0
        },
        jwt: {
          configured: !!this.jwtSecret,
          expiry: this.tokenExpiry,
          secretLength: this.jwtSecret ? this.jwtSecret.length : 0
        },
        security: {
          maxLoginAttempts: this.maxLoginAttempts,
          lockoutTimeMinutes: this.lockoutTime / 1000 / 60
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