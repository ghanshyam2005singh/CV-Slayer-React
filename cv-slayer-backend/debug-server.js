const jwt = require('jsonwebtoken');
const adminAuth = require('./services/adminAuth');
require('dotenv').config();

async function debugTokenAuth() {
  try {
    console.log('🔧 JWT_SECRET from env:', process.env.JWT_SECRET);
    console.log('🔧 JWT_EXPIRY from env:', process.env.JWT_EXPIRY || '24h');
    
    // Step 1: Test login to get a fresh token
    console.log('\n🔐 Step 1: Testing login...');
    const loginResult = await adminAuth.login('ghanshyam2005singh@gmail.com', 'Heeriye@2005');
    
    if (!loginResult.success) {
      console.log('❌ Login failed:', loginResult.error);
      return;
    }
    
    console.log('✅ Login successful');
    console.log('🔑 Generated token:', loginResult.token);
    
    // Step 2: Verify the token manually
    console.log('\n🔍 Step 2: Manual token verification...');
    try {
      const decoded = jwt.verify(loginResult.token, process.env.JWT_SECRET);
      console.log('✅ Token verification successful:', decoded);
      
      // Check expiry
      const now = Math.floor(Date.now() / 1000);
      console.log('⏰ Current timestamp:', now);
      console.log('⏰ Token expiry:', decoded.exp);
      console.log('⏰ Token valid for:', decoded.exp - now, 'seconds');
      console.log('⏰ Token is valid:', now < decoded.exp);
      
    } catch (verifyError) {
      console.log('❌ Token verification failed:', verifyError.message);
      return;
    }
    
    // Step 3: Test the requireAuth middleware
    console.log('\n🔒 Step 3: Testing requireAuth middleware...');
    
    const mockReq = {
      headers: {
        authorization: `Bearer ${loginResult.token}`
      }
    };
    
    let authResult = null;
    const mockRes = {
      status: (code) => ({
        json: (data) => {
          authResult = { status: code, data };
          console.log(`❌ Auth middleware failed with status ${code}:`, data);
          return mockRes;
        }
      })
    };
    
    const mockNext = () => {
      authResult = { status: 200, admin: mockReq.admin };
      console.log('✅ Auth middleware successful!');
      console.log('👤 Admin info set:', mockReq.admin);
    };
    
    adminAuth.requireAuth(mockReq, mockRes, mockNext);
    
    if (authResult && authResult.status === 200) {
      console.log('🎉 Token authentication is working correctly!');
      console.log('💡 The issue might be in the frontend token storage or transmission');
    } else {
      console.log('❌ Auth middleware failed:', authResult);
    }
    
  } catch (error) {
    console.error('💥 Debug failed:', error.message);
  }
}

debugTokenAuth();