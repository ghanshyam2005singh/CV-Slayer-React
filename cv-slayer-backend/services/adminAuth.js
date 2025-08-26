const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

class AdminAuth {
  constructor() {
    this.adminEmails = this.parseAdminEmails(process.env.ADMIN_EMAILS);
    this.adminPassword = process.env.ADMIN_PASSWORD;
    this.jwtSecret = process.env.JWT_SECRET || 'your-secret-key';
    this.tokenExpiry = '24h';
    
    // Bind methods
    this.requireAuth = this.requireAuth.bind(this);
    this.login = this.login.bind(this);
    this.logout = this.logout.bind(this);
  }

  parseAdminEmails(emailString) {
    if (!emailString) {
      console.log('⚠️ No ADMIN_EMAILS configured');
      return [];
    }
    
    const emails = emailString
      .split(',')
      .map(email => email.trim().toLowerCase())
      .filter(email => email.includes('@'));
    
    console.log('✅ Admin emails configured:', emails.length);
    return emails;
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

      // Simple email validation
      if (!normalizedEmail.includes('@') || normalizedEmail.length > 254) {
        return {
          success: false,
          error: 'Invalid email format'
        };
      }

      // Environment variable authentication
      if (this.adminEmails.includes(normalizedEmail) && password === this.adminPassword) {
        const tokenPayload = {
          email: normalizedEmail,
          role: 'admin',
          loginTime: new Date().toISOString(),
          iat: Math.floor(Date.now() / 1000)
        };

        const accessToken = jwt.sign(tokenPayload, this.jwtSecret, { 
          expiresIn: this.tokenExpiry
        });

        console.log('✅ Admin login successful:', normalizedEmail.substring(0, 3) + '***');

        return {
          success: true,
          token: accessToken,
          expiresIn: 86400, // 24 hours in seconds
          message: 'Login successful',
          user: {
            email: normalizedEmail,
            role: 'admin'
          }
        };
      }

      console.log('❌ Admin login failed:', normalizedEmail.substring(0, 3) + '***');
      
      return {
        success: false,
        error: 'Invalid credentials'
      };

    } catch (error) {
      console.error('❌ Login error:', error.message);
      
      return {
        success: false,
        error: 'Authentication failed'
      };
    }
  }

  async logout() {
    try {
      console.log('✅ Admin logout successful');
      
      return {
        success: true,
        message: 'Logout successful'
      };
    } catch (error) {
      console.error('❌ Logout error:', error.message);
      
      return {
        success: false,
        error: 'Logout failed'
      };
    }
  }

  requireAuth(req, res, next) {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          success: false,
          error: 'Authorization header required'
        });
      }

      const token = authHeader.replace('Bearer ', '');

      if (!token) {
        return res.status(401).json({
          success: false,
          error: 'Access token required'
        });
      }

      // Verify JWT token
      const decoded = jwt.verify(token, this.jwtSecret);
      
      if (decoded.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Admin access required'
        });
      }

      // Set admin info in request
      req.admin = {
        email: decoded.email,
        role: decoded.role,
        loginTime: decoded.loginTime
      };

      next();

    } catch (error) {
      let errorMessage = 'Invalid or expired token';

      if (error.name === 'TokenExpiredError') {
        errorMessage = 'Session expired. Please log in again.';
      } else if (error.name === 'JsonWebTokenError') {
        errorMessage = 'Invalid token format';
      }

      console.log('❌ Authentication failed:', errorMessage);

      return res.status(401).json({
        success: false,
        error: errorMessage
      });
    }
  }
}

module.exports = new AdminAuth();