const express = require('express');
const cors = require('cors');

const app = express();

// Enable CORS for all origins during testing
app.use(cors({
  origin: true,
  credentials: false
}));

app.use(express.json());

// Test endpoints
app.get('/api/test', (req, res) => {
  res.json({ success: true, message: 'Backend is working!' });
});

app.post('/api/admin/login', (req, res) => {
  console.log('Login attempt:', req.body);
  res.json({ 
    success: true, 
    token: 'test-token-12345',
    message: 'Test login successful' 
  });
});

app.get('/api/admin/dashboard', (req, res) => {
  res.json({
    success: true,
    data: {
      totalResumes: 0,
      todayResumes: 0,
      averageScore: 0,
      recentResumes: []
    }
  });
});

app.get('/api/admin/resumes', (req, res) => {
  res.json({
    success: true,
    data: {
      resumes: [],
      total: 0
    }
  });
});

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`🧪 Test server running on http://localhost:${PORT}`);
  console.log('📝 Test these URLs:');
  console.log(`   GET  http://localhost:${PORT}/api/test`);
  console.log(`   POST http://localhost:${PORT}/api/admin/login`);
  console.log(`   GET  http://localhost:${PORT}/api/admin/dashboard`);
});