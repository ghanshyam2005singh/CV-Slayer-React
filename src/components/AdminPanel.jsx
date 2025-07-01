import React, { useState, useEffect, useCallback, useMemo } from 'react';
import './AdminPanel.css';

const AdminPanel = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [dashboardData, setDashboardData] = useState(null);
  const [resumes, setResumes] = useState([]);
  const [currentView, setCurrentView] = useState('dashboard');
  const [selectedResume, setSelectedResume] = useState(null);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [error, setError] = useState('');
  const [sessionExpiry, setSessionExpiry] = useState(null);

  // Production-ready API configuration
  const API_BASE = useMemo(() => {
    if (process.env.NODE_ENV === 'production') {
      return `${window.location.origin}/api`;
    }
    return process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
  }, []);

  const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

  // Input validation and sanitization
  const validateEmail = useCallback((email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.length <= 100;
  }, []);

  const sanitizeInput = useCallback((input) => {
    if (typeof input !== 'string') return '';
    return input.replace(/[<>]/g, '').trim().substring(0, 255);
  }, []);

  // Token validation
  const validateToken = useCallback(() => {
    const token = localStorage.getItem('adminToken');
    const expiry = localStorage.getItem('adminTokenExpiry');
    
    if (!token || !expiry) {
      return false;
    }

    const expiryTime = parseInt(expiry, 10);
    if (Date.now() > expiryTime) {
      localStorage.removeItem('adminToken');
      localStorage.removeItem('adminTokenExpiry');
      localStorage.removeItem('adminUser');
      return false;
    }

    return true;
  }, []);

  // Secure logout with cleanup
  const handleLogout = useCallback(() => {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminTokenExpiry');
    localStorage.removeItem('adminUser');
    setIsAuthenticated(false);
    setEmail('');
    setPassword('');
    setDashboardData(null);
    setResumes([]);
    setSelectedResume(null);
    setShowResumeModal(false);
    setError('');
    setSessionExpiry(null);
  }, []);

  // Enhanced authenticated API calls
  const makeAuthenticatedRequest = useCallback(async (endpoint, options = {}) => {
  const token = localStorage.getItem('adminToken');
  const expiry = localStorage.getItem('adminTokenExpiry');
  
  console.log('🔑 Making request to:', `${API_BASE}${endpoint}`);
  console.log('🔑 Token exists:', !!token);
  console.log('🔑 Token expiry:', expiry ? new Date(parseInt(expiry)).toLocaleString() : 'None');
  console.log('🔑 Token valid:', expiry ? Date.now() < parseInt(expiry) : false);
  
  if (token) {
    console.log('🔑 Token (first 50 chars):', token.substring(0, 50) + '...');
    console.log('🔑 Token (last 50 chars):', '...' + token.substring(token.length - 50));
  }

  try {
    const requestHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options.headers
    };
    
    if (token) {
      requestHeaders['Authorization'] = `Bearer ${token}`;
      console.log('🔑 Authorization header set:', `Bearer ${token.substring(0, 20)}...`);
    } else {
      console.log('❌ No token available for authorization');
    }

    console.log('📤 Request headers:', requestHeaders);

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: requestHeaders
    });

    console.log(`📡 ${endpoint} response status:`, response.status);
    console.log(`📡 ${endpoint} response headers:`, Object.fromEntries(response.headers.entries()));

    if (response.status === 401) {
      console.log('🚫 Unauthorized - checking token details...');
      
      // Let's see what the backend is saying
      try {
        const errorText = await response.text();
        console.log('🚫 401 Response body:', errorText);
      } catch (e) {
        console.log('🚫 Could not read 401 response body');
      }
      
      handleLogout();
      throw new Error('Session expired. Please log in again.');
    }

    if (!response.ok) {
      let errorMessage = `Request failed (${response.status})`;
      try {
        const errorData = await response.json();
        console.error('❌ API Error response:', errorData);
        errorMessage = errorData.error?.message || errorData.message || errorMessage;
      } catch (parseError) {
        console.error('❌ Could not parse error response');
      }
      throw new Error(errorMessage);
    }

    const result = await response.json();
    console.log(`✅ ${endpoint} success:`, result);
    return result;
    
  } catch (error) {
    console.error('💥 API Request failed:', error);
    throw error;
  }
}, [API_BASE, handleLogout]);

// ...existing code...

// Load dashboard data - SIMPLIFIED VERSION
const loadDashboard = useCallback(async () => {
  try {
    setLoading(true);
    setError('');
    console.log('📊 Loading dashboard data...');
    
    const result = await makeAuthenticatedRequest('/admin/dashboard');
    
    if (result.success && result.data) {
      setDashboardData(result.data);
      console.log('✅ Dashboard loaded successfully');
    } else {
      throw new Error('Invalid dashboard response format');
    }
    
  } catch (error) {
    console.error('❌ Dashboard load error:', error.message);
    setError(`Failed to load dashboard: ${error.message}`);
    
    // Set fallback data to prevent UI issues
    setDashboardData({
      totalResumes: 0,
      todayResumes: 0,
      averageScore: 0,
      recentResumes: []
    });
  } finally {
    setLoading(false);
  }
}, [makeAuthenticatedRequest]);


// Enhanced login handler
const handleLogin = useCallback(async (e) => {
  e.preventDefault();
  setLoading(true);
  setError('');

  const sanitizedEmail = sanitizeInput(email);
  const sanitizedPassword = sanitizeInput(password);

  if (!validateEmail(sanitizedEmail)) {
    setError('Please enter a valid email address.');
    setLoading(false);
    return;
  }

  if (sanitizedPassword.length < 1) {
    setError('Password is required.');
    setLoading(false);
    return;
  }

  try {
    console.log('🔐 Attempting login to:', `${API_BASE}/admin/login`);

    const response = await fetch(`${API_BASE}/admin/login`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ 
        email: sanitizedEmail, 
        password: sanitizedPassword 
      })
    });

    console.log('📡 Login response status:', response.status);

    if (!response.ok) {
      let errorMessage = 'Login failed. Please try again.';
      try {
        const errorData = await response.json();
        console.error('❌ Login error:', errorData);
        
        if (response.status === 429) {
          errorMessage = 'Too many login attempts. Please wait 1 minute and try again.';
        } else {
          errorMessage = errorData.error?.message || errorMessage;
        }
      } catch {
        if (response.status === 429) {
          errorMessage = 'Too many login attempts. Please wait 1 minute and try again.';
        } else {
          errorMessage = `Login failed (${response.status}). Please check your credentials.`;
        }
      }
      throw new Error(errorMessage);
    }

    const result = await response.json();
    console.log('✅ Login successful:', result);
    
    if (result.success && result.token) {
      // Use backend's expiry time instead of frontend calculation
      const expiryTime = result.expiresIn ? 
        Date.now() + (result.expiresIn * 1000) : // Backend provides seconds
        Date.now() + (24 * 60 * 60 * 1000); // Fallback to 24 hours
      
      localStorage.setItem('adminToken', result.token);
      localStorage.setItem('adminTokenExpiry', expiryTime.toString());
      localStorage.setItem('adminUser', JSON.stringify({ email: sanitizedEmail }));
      
      console.log('💾 Token stored with expiry:', new Date(expiryTime).toLocaleString());
      
      setIsAuthenticated(true);
      setSessionExpiry(expiryTime);
      setEmail('');
      setPassword('');
      
      console.log('🎉 Authentication successful!');
      
      // Load dashboard data after successful login
      setTimeout(() => {
        loadDashboard();
      }, 100);

    } else {
      console.error('❌ Invalid login response:', result);
      setError('Invalid credentials. Please try again.');
    }
  } catch (error) {
    console.error('💥 Login error:', error);

    if (error.message.includes('Failed to fetch') || error.message.includes('fetch')) {
      setError('Cannot connect to server. Please check if the backend is running on port 5000.');
    } else if (error.message.includes('CORS')) {
      setError('Connection blocked by browser security. Please check server configuration.');
    } else {
      setError(error.message || 'Login failed. Please try again.');
    }
  } finally {
    setLoading(false);
  }
}, [email, password, sanitizeInput, validateEmail, API_BASE, loadDashboard]);

  // Load resumes data
  const loadResumes = useCallback(async (page = 1, limit = 50) => {
    try {
      setLoading(true);
      console.log('📄 Loading resumes data...');
      
      const result = await makeAuthenticatedRequest(`/admin/resumes?page=${page}&limit=${limit}`);
      console.log('✅ Resumes data loaded:', result);
      
      if (result.success && result.data) {
        const resumesData = result.data.resumes || result.data || [];
        
        // Format the resumes data properly
        const formattedResumes = resumesData.map(resume => ({
          id: resume.resumeId || resume._id || resume.id,
          originalFileName: resume.originalFileName || resume.fileName || 'Unknown',
          fileName: resume.fileName || resume.originalFileName || 'Unknown',
          fileSize: resume.fileSize || 0,
          uploadedAt: resume.uploadedAt || resume.createdAt || new Date().toISOString(),
          analysis: {
            score: resume.analysis?.score || resume.score || 0,
            atsScore: resume.analysis?.atsScore || 0,
            contentScore: resume.analysis?.contentScore || 0,
            formatScore: resume.analysis?.formatScore || 0,
            roastFeedback: resume.analysis?.roastFeedback || resume.roastFeedback || '',
            strengths: resume.analysis?.strengths || [],
            weaknesses: resume.analysis?.weaknesses || [],
            improvements: resume.analysis?.improvements || []
          },
          preferences: {
            language: resume.preferences?.language || resume.language || 'N/A',
            roastType: resume.preferences?.roastType || resume.roastType || 'N/A',
            roastLevel: resume.preferences?.roastLevel || resume.roastLevel || 'N/A',
            gender: resume.preferences?.gender || resume.gender || 'N/A'
          },
          statistics: {
            hasEmail: resume.statistics?.hasEmail || Boolean(resume.extractedInfo?.email),
            hasPhone: resume.statistics?.hasPhone || Boolean(resume.extractedInfo?.phone),
            hasLinkedIn: resume.statistics?.hasLinkedIn || Boolean(resume.extractedInfo?.linkedin),
            hasGitHub: resume.statistics?.hasGitHub || false,
            wordCount: resume.statistics?.wordCount || 0,
            pageCount: resume.statistics?.pageCount || 1
          },
          extractedInfo: resume.extractedInfo || {}
        }));
        
        setResumes(formattedResumes);
        console.log(`✅ Loaded ${formattedResumes.length} resumes`);
        
      } else {
        setResumes([]);
        console.log('📄 No resumes found');
      }
      
    } catch (error) {
      console.error('❌ Resumes load error:', error.message);
      setError(`Failed to load resumes: ${error.message}`);
      setResumes([]);
    } finally {
      setLoading(false);
    }
  }, [makeAuthenticatedRequest]);

  // Load individual resume details
  const loadResumeDetails = useCallback(async (resumeId) => {
    try {
      const result = await makeAuthenticatedRequest(`/admin/resume/${resumeId}`);
      
      if (result.success && result.data) {
        return result.data;
      } else {
        throw new Error('Invalid resume details response');
      }
      
    } catch (error) {
      console.error('Resume details load error:', error.message);
      setError(`Failed to load resume details: ${error.message}`);
      return null;
    }
  }, [makeAuthenticatedRequest]);

  // Enhanced resume click handler
  const handleResumeClick = useCallback(async (resume) => {
    if (!resume || !resume.id) return;
    
    try {
      setLoading(true);
      
      // Try to load full details from the backend
      const fullDetails = await loadResumeDetails(resume.id);
      
      if (fullDetails) {
        setSelectedResume(fullDetails);
      } else {
        // Fallback to the basic resume data
        setSelectedResume(resume);
      }
      
      setShowResumeModal(true);
      
    } catch (error) {
      // Still show the modal with basic data
      setSelectedResume(resume);
      setShowResumeModal(true);
    } finally {
      setLoading(false);
    }
  }, [loadResumeDetails]);

  // Session expiry monitoring
 useEffect(() => {
  // Skip token validation on initial load - let the login handle it
  console.log('🔄 Initial load - checking stored auth...');
  
  const token = localStorage.getItem('adminToken');
  const expiry = localStorage.getItem('adminTokenExpiry');
  
  if (token && expiry) {
    const expiryTime = parseInt(expiry, 10);
    if (Date.now() < expiryTime) {
      console.log('✅ Valid token found, auto-authenticating');
      setIsAuthenticated(true);
      // Don't load dashboard immediately - wait for user interaction
    } else {
      console.log('⏰ Token expired, clearing storage');
      handleLogout();
    }
  } else {
    console.log('❌ No valid token found');
  }
}, [handleLogout]);


  // Auto-clear errors
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 8000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Keyboard event handlers for accessibility
  const handleKeyDown = useCallback((event, action) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      action();
    }
  }, []);

  // Sanitized resume display data
  const sanitizedResumeData = useMemo(() => {
    if (!selectedResume) return null;

    return {
      basicInfo: {
        originalFileName: sanitizeInput(selectedResume.originalFileName || selectedResume.fileName || ''),
        fileSize: Math.max(0, parseInt(selectedResume.fileSize, 10) || 0),
        uploadedAt: selectedResume.uploadedAt || selectedResume.createdAt,
        id: sanitizeInput(selectedResume.resumeId || selectedResume._id || selectedResume.id || '')
      },
      analysis: selectedResume.analysis ? {
        score: Math.max(0, Math.min(100, parseInt(selectedResume.analysis.score, 10) || 0)),
        atsScore: Math.max(0, Math.min(100, parseInt(selectedResume.analysis.atsScore, 10) || 0)),
        contentScore: Math.max(0, Math.min(100, parseInt(selectedResume.analysis.contentScore, 10) || 0)),
        formatScore: Math.max(0, Math.min(100, parseInt(selectedResume.analysis.formatScore, 10) || 0)),
        roastFeedback: selectedResume.analysis.roastFeedback || selectedResume.roastFeedback || '',
        strengths: selectedResume.analysis.strengths || [],
        weaknesses: selectedResume.analysis.weaknesses || [],
        improvements: selectedResume.analysis.improvements || []
      } : null,
      preferences: selectedResume.preferences ? {
        language: sanitizeInput(selectedResume.preferences.language || ''),
        roastType: sanitizeInput(selectedResume.preferences.roastType || ''),
        roastLevel: sanitizeInput(selectedResume.preferences.roastLevel || ''),
        gender: sanitizeInput(selectedResume.preferences.gender || '')
      } : null,
      statistics: selectedResume.statistics || null,
      extractedInfo: selectedResume.extractedInfo || null
    };
  }, [selectedResume, sanitizeInput]);

  if (!isAuthenticated) {
    return (
      <div className="admin-login">
        <div className="login-container">
          <h2>CV Slayer Admin</h2>
          
          {error && (
            <div className="error-message" role="alert" aria-live="polite">
              {error}
              <button 
                onClick={() => setError('')}
                className="error-close"
                aria-label="Close error message"
                type="button"
              >
                ×
              </button>
            </div>
          )}

          <form onSubmit={handleLogin}>
            <input
              type="email"
              placeholder="Admin Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={100}
              required
              disabled={loading}
              autoComplete="email"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              autoComplete="current-password"
            />
            <button type="submit" disabled={loading || !email || !password}>
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </form>

          <div style={{ marginTop: '20px', fontSize: '12px', color: '#666' }}>
            <p>API: {API_BASE}</p>
            <p>Status: {loading ? 'Connecting...' : 'Ready'}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-panel">
      {error && (
        <div className="admin-error" role="alert" aria-live="polite">
          {error}
          <button onClick={() => setError('')} className="error-close" type="button">×</button>
        </div>
      )}

      <header className="admin-header">
        <h1>CV Slayer Admin Panel</h1>
        <div className="admin-nav">
          <button 
            className={currentView === 'dashboard' ? 'active' : ''}
            onClick={() => {
              setCurrentView('dashboard');
              loadDashboard();
            }}
            disabled={loading}
            type="button"
          >
            Dashboard
          </button>
          <button 
            className={currentView === 'resumes' ? 'active' : ''}
            onClick={() => {
              setCurrentView('resumes');
              loadResumes();
            }}
            disabled={loading}
            type="button"
          >
            Resumes ({resumes.length})
          </button>
          <button onClick={handleLogout} disabled={loading} type="button">
            Logout
          </button>
        </div>
      </header>

      <div className="admin-content">
        {loading && (
          <div className="loading">
            <div className="loading-spinner"></div>
            <p>Loading...</p>
          </div>
        )}

        {currentView === 'dashboard' && dashboardData && !loading && (
          <div className="dashboard-view">
            <div className="stats-grid">
              <div className="stat-card">
                <h3>Total Resumes</h3>
                <p>{dashboardData.totalResumes || 0}</p>
              </div>
              <div className="stat-card">
                <h3>Today's Uploads</h3>
                <p>{dashboardData.todayResumes || 0}</p>
              </div>
              <div className="stat-card">
                <h3>Average Score</h3>
                <p>{(dashboardData.averageScore || 0).toFixed(1)}/100</p>
              </div>
            </div>

            <div className="recent-resumes">
              <h3>Recent Resumes</h3>
              {dashboardData.recentResumes && dashboardData.recentResumes.length > 0 ? (
                dashboardData.recentResumes.map((resume, index) => (
                  <div 
                    key={resume.id || index} 
                    className="resume-card" 
                    onClick={() => handleResumeClick(resume)}
                    onKeyDown={(e) => handleKeyDown(e, () => handleResumeClick(resume))}
                    tabIndex={0}
                    role="button"
                    aria-label={`View details for ${resume.fileName || 'resume'}`}
                  >
                    <h4>{resume.fileName || 'Unknown File'}</h4>
                    <p>Score: {resume.score || 0}/100</p>
                    <p>Uploaded: {new Date(resume.uploadedAt || Date.now()).toLocaleDateString()}</p>
                  </div>
                ))
              ) : (
                <p>No resumes uploaded yet. Upload a resume to see it here!</p>
              )}
            </div>
          </div>
        )}

        {currentView === 'resumes' && !loading && (
          <div className="resumes-view">
            <h3>All Resumes ({resumes.length})</h3>
            <div className="resumes-list">
              {resumes.length > 0 ? (
                resumes.map((resume, index) => (
                  <div 
                    key={resume.id || index} 
                    className="resume-item" 
                    onClick={() => handleResumeClick(resume)}
                    onKeyDown={(e) => handleKeyDown(e, () => handleResumeClick(resume))}
                    tabIndex={0}
                    role="button"
                    aria-label={`View details for ${resume.originalFileName}`}
                  >
                    <h4>{resume.originalFileName}</h4>
                    <div className="resume-details">
                      <p><strong>Score:</strong> {resume.analysis?.score || 'N/A'}/100</p>
                      <p><strong>Size:</strong> {(resume.fileSize / 1024).toFixed(1)} KB</p>
                      <p><strong>Uploaded:</strong> {new Date(resume.uploadedAt).toLocaleDateString()}</p>
                      <p><strong>Language:</strong> {resume.preferences?.language || 'N/A'}</p>
                      <p><strong>Roast Type:</strong> {resume.preferences?.roastType || 'N/A'}</p>
                    </div>
                    <div className="resume-stats">
                      <span>Email: {resume.statistics?.hasEmail ? '✅' : '❌'}</span>
                      <span>Phone: {resume.statistics?.hasPhone ? '✅' : '❌'}</span>
                      <span>LinkedIn: {resume.statistics?.hasLinkedIn ? '✅' : '❌'}</span>
                    </div>
                  </div>
                ))
              ) : (
                <p>No resumes found. Upload some resumes to see them here!</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Enhanced Resume Modal */}
      {showResumeModal && sanitizedResumeData && (
        <div className="modal-overlay" onClick={() => setShowResumeModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Resume Analysis Details</h2>
              <button 
                className="close-button" 
                onClick={() => setShowResumeModal(false)}
                aria-label="Close modal"
                type="button"
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="resume-full-details">
                
                {/* Basic File Information */}
                <section className="detail-section">
                  <h3>📄 File Information</h3>
                  <div className="info-grid">
                    <p><strong>File Name:</strong> {sanitizedResumeData.basicInfo.originalFileName}</p>
                    <p><strong>File Size:</strong> {(sanitizedResumeData.basicInfo.fileSize / 1024).toFixed(2)} KB</p>
                    <p><strong>Upload Date:</strong> {new Date(sanitizedResumeData.basicInfo.uploadedAt).toLocaleString()}</p>
                    <p><strong>File ID:</strong> {sanitizedResumeData.basicInfo.id}</p>
                  </div>
                </section>

                {/* Analysis Results */}
                {sanitizedResumeData.analysis && (
                  <section className="detail-section">
                    <h3>📊 Analysis Results</h3>
                    <div className="analysis-grid">
                      <div className="score-card">
                        <h4>Overall Score</h4>
                        <p className="score">{sanitizedResumeData.analysis.score}/100</p>
                      </div>
                      {sanitizedResumeData.analysis.atsScore > 0 && (
                        <div className="score-card">
                          <h4>ATS Score</h4>
                          <p className="score">{sanitizedResumeData.analysis.atsScore}/100</p>
                        </div>
                      )}
                      {sanitizedResumeData.analysis.contentScore > 0 && (
                        <div className="score-card">
                          <h4>Content Score</h4>
                          <p className="score">{sanitizedResumeData.analysis.contentScore}/100</p>
                        </div>
                      )}
                      {sanitizedResumeData.analysis.formatScore > 0 && (
                        <div className="score-card">
                          <h4>Format Score</h4>
                          <p className="score">{sanitizedResumeData.analysis.formatScore}/100</p>
                        </div>
                      )}
                    </div>

                    {/* AI Feedback */}
                    {sanitizedResumeData.analysis.roastFeedback && (
                      <div className="feedback-section">
                        <h4>🤖 AI Feedback</h4>
                        <div className="feedback-content">
                          <p>{sanitizedResumeData.analysis.roastFeedback}</p>
                        </div>
                      </div>
                    )}

                    {/* Strengths and Weaknesses */}
                    {(sanitizedResumeData.analysis.strengths?.length > 0 || sanitizedResumeData.analysis.weaknesses?.length > 0) && (
                      <div className="strengths-weaknesses">
                        {sanitizedResumeData.analysis.strengths?.length > 0 && (
                          <div className="strengths">
                            <h4>✅ Strengths</h4>
                            <ul>
                              {sanitizedResumeData.analysis.strengths.map((strength, index) => (
                                <li key={index}>{strength}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        
                        {sanitizedResumeData.analysis.weaknesses?.length > 0 && (
                          <div className="weaknesses">
                            <h4>⚠️ Areas for Improvement</h4>
                            <ul>
                              {sanitizedResumeData.analysis.weaknesses.map((weakness, index) => (
                                <li key={index}>{weakness}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </section>
                )}

                {/* User Preferences */}
                {sanitizedResumeData.preferences && (
                  <section className="detail-section">
                    <h3>⚙️ User Preferences</h3>
                    <div className="info-grid">
                      <p><strong>Language:</strong> {sanitizedResumeData.preferences.language || 'N/A'}</p>
                      <p><strong>Roast Type:</strong> {sanitizedResumeData.preferences.roastType || 'N/A'}</p>
                      <p><strong>Roast Level:</strong> {sanitizedResumeData.preferences.roastLevel || 'N/A'}</p>
                      <p><strong>Gender:</strong> {sanitizedResumeData.preferences.gender || 'N/A'}</p>
                    </div>
                  </section>
                )}

                {/* Extracted Information */}
                {sanitizedResumeData.extractedInfo && Object.keys(sanitizedResumeData.extractedInfo).length > 0 && (
                  <section className="detail-section">
                    <h3>📋 Extracted Information</h3>
                    
                    {/* Personal Info */}
                    {sanitizedResumeData.extractedInfo.personalInfo && (
                      <div className="extracted-section">
                        <h4>👤 Personal Information</h4>
                        <div className="info-grid">
                          <p><strong>Name:</strong> {sanitizedResumeData.extractedInfo.personalInfo.name || 'N/A'}</p>
                          <p><strong>Email:</strong> {sanitizedResumeData.extractedInfo.personalInfo.email || sanitizedResumeData.extractedInfo.email || 'N/A'}</p>
                          <p><strong>Phone:</strong> {sanitizedResumeData.extractedInfo.personalInfo.phone || sanitizedResumeData.extractedInfo.phone || 'N/A'}</p>
                          <p><strong>LinkedIn:</strong> {sanitizedResumeData.extractedInfo.personalInfo.linkedin || sanitizedResumeData.extractedInfo.linkedin || 'N/A'}</p>
                        </div>
                      </div>
                    )}

                    {/* Skills */}
                    {sanitizedResumeData.extractedInfo.skills && (
                      <div className="extracted-section">
                        <h4>🛠️ Skills</h4>
                        {sanitizedResumeData.extractedInfo.skills.all?.length > 0 ? (
                          <div className="skills-container">
                            {sanitizedResumeData.extractedInfo.skills.all.slice(0, 20).map((skill, index) => (
                              <span key={index} className="skill-tag">{skill}</span>
                            ))}
                          </div>
                        ) : (
                          <p>No skills extracted</p>
                        )}
                      </div>
                    )}
                  </section>
                )}

                {/* Document Statistics */}
                {sanitizedResumeData.statistics && (
                  <section className="detail-section">
                    <h3>📈 Document Statistics</h3>
                    <div className="stats-grid">
                      {Object.entries(sanitizedResumeData.statistics).map(([key, value]) => (
                        <div key={key} className="stat-item">
                          <span className="stat-label">{key.replace(/([A-Z])/g, ' $1').toLowerCase()}:</span>
                          <span className="stat-value">
                            {typeof value === 'boolean' ? (value ? '✅ Yes' : '❌ No') : value || 'N/A'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(AdminPanel);