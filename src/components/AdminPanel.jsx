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

  // PRODUCTION FIX - Environment-based API configuration
  const API_BASE = process.env.REACT_APP_API_URL || '/api';
  const MAX_LOGIN_ATTEMPTS = 3;
  const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

  // PRODUCTION FIX - Input validation and sanitization
  const validateEmail = useCallback((email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.length <= 100;
  }, []);

  const sanitizeInput = useCallback((input) => {
    if (typeof input !== 'string') return '';
    return input.replace(/[<>]/g, '').trim().substring(0, 255);
  }, []);

  // PRODUCTION FIX - Enhanced authentication with security measures
  const handleLogin = useCallback(async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Input validation
    const sanitizedEmail = sanitizeInput(email);
    const sanitizedPassword = sanitizeInput(password);

    if (!validateEmail(sanitizedEmail)) {
      setError('Please enter a valid email address.');
      setLoading(false);
      return;
    }

    if (sanitizedPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      setLoading(false);
      return;
    }

    try {
      // PRODUCTION FIX - Enhanced fetch with timeout and security headers
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(`${API_BASE}/admin/login`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest' // CSRF protection
        },
        body: JSON.stringify({ 
          email: sanitizedEmail, 
          password: sanitizedPassword 
        }),
        signal: controller.signal,
        credentials: 'same-origin'
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success && result.token) {
        // PRODUCTION FIX - Secure token storage with expiry
        const expiryTime = Date.now() + SESSION_TIMEOUT;
        localStorage.setItem('adminToken', result.token);
        localStorage.setItem('adminTokenExpiry', expiryTime.toString());
        
        setIsAuthenticated(true);
        setSessionExpiry(expiryTime);
        await loadDashboard();
        
        // Clear sensitive form data
        setEmail('');
        setPassword('');
        
      } else {
        // PRODUCTION FIX - Generic error message
        setError('Invalid credentials. Please try again.');
      }
    } catch (error) {
      // PRODUCTION FIX - Generic error handling
      if (error.name === 'AbortError') {
        setError('Request timeout. Please try again.');
      } else {
        setError('Login failed. Please check your connection and try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [email, password, sanitizeInput, validateEmail, API_BASE]);

  // PRODUCTION FIX - Token validation with expiry check
  const validateToken = useCallback(() => {
    const token = localStorage.getItem('adminToken');
    const expiry = localStorage.getItem('adminTokenExpiry');
    
    if (!token || !expiry) {
      return false;
    }

    const expiryTime = parseInt(expiry, 10);
    if (Date.now() > expiryTime) {
      // Token expired
      localStorage.removeItem('adminToken');
      localStorage.removeItem('adminTokenExpiry');
      return false;
    }

    return true;
  }, []);

  // PRODUCTION FIX - Enhanced API call with error handling
  const makeAuthenticatedRequest = useCallback(async (endpoint, options = {}) => {
    if (!validateToken()) {
      setIsAuthenticated(false);
      throw new Error('Session expired');
    }

    const token = localStorage.getItem('adminToken');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          ...options.headers
        },
        signal: controller.signal,
        credentials: 'same-origin'
      });

      clearTimeout(timeoutId);

      if (response.status === 401) {
        // Token invalid
        handleLogout();
        throw new Error('Session expired');
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }, [validateToken, API_BASE]);

  // PRODUCTION FIX - Secure dashboard loading
  const loadDashboard = useCallback(async () => {
    try {
      const result = await makeAuthenticatedRequest('/admin/dashboard');
      
      if (result.success && result.data) {
        // PRODUCTION FIX - Sanitize dashboard data
        const sanitizedData = {
          totalResumes: Math.max(0, parseInt(result.data.totalResumes, 10) || 0),
          todayResumes: Math.max(0, parseInt(result.data.todayResumes, 10) || 0),
          averageScore: Math.max(0, Math.min(100, parseFloat(result.data.averageScore) || 0)),
          recentResumes: (result.data.recentResumes || [])
            .slice(0, 10) // Limit to 10 recent resumes
            .map(resume => ({
              id: sanitizeInput(resume.id),
              fileName: sanitizeInput(resume.fileName),
              score: Math.max(0, Math.min(100, parseInt(resume.score, 10) || 0)),
              uploadedAt: resume.uploadedAt
            }))
        };
        
        setDashboardData(sanitizedData);
      }
    } catch (error) {
      setError('Failed to load dashboard data.');
      console.error('Dashboard load error:', error.message);
    }
  }, [makeAuthenticatedRequest, sanitizeInput]);

  // PRODUCTION FIX - Secure resumes loading with pagination
  const loadResumes = useCallback(async (page = 1, limit = 50) => {
    try {
      const result = await makeAuthenticatedRequest(
        `/admin/resumes?page=${page}&limit=${limit}`
      );
      
      if (result.success && result.data && Array.isArray(result.data.resumes)) {
        // PRODUCTION FIX - Sanitize resume data
        const sanitizedResumes = result.data.resumes
          .slice(0, 100) // Hard limit for performance
          .map(resume => ({
            id: sanitizeInput(resume.id),
            originalFileName: sanitizeInput(resume.originalFileName),
            fileSize: Math.max(0, parseInt(resume.fileSize, 10) || 0),
            uploadedAt: resume.uploadedAt,
            analysis: resume.analysis ? {
              score: Math.max(0, Math.min(100, parseInt(resume.analysis.score, 10) || 0))
            } : null,
            preferences: resume.preferences ? {
              language: sanitizeInput(resume.preferences.language),
              roastType: sanitizeInput(resume.preferences.roastType)
            } : null,
            statistics: resume.statistics || null
          }));
        
        setResumes(sanitizedResumes);
      }
    } catch (error) {
      setError('Failed to load resumes.');
      console.error('Resumes load error:', error.message);
    }
  }, [makeAuthenticatedRequest, sanitizeInput]);

  // PRODUCTION FIX - Safe resume click handler
  const handleResumeClick = useCallback((resume) => {
    if (!resume || !resume.id) return;
    
    setSelectedResume(resume);
    setShowResumeModal(true);
  }, []);

  // PRODUCTION FIX - Secure logout with cleanup
  const handleLogout = useCallback(() => {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminTokenExpiry');
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

  // PRODUCTION FIX - Session expiry monitoring
  useEffect(() => {
    if (!isAuthenticated) return;

    const checkSession = () => {
      if (!validateToken()) {
        handleLogout();
        setError('Session expired. Please log in again.');
      }
    };

    const interval = setInterval(checkSession, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [isAuthenticated, validateToken, handleLogout]);

  // PRODUCTION FIX - Initial authentication check
  useEffect(() => {
    if (validateToken()) {
      setIsAuthenticated(true);
      loadDashboard();
    }
  }, [validateToken, loadDashboard]);

  // PRODUCTION FIX - Keyboard event handlers for accessibility
  const handleKeyDown = useCallback((event, action) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      action();
    }
  }, []);

  // PRODUCTION FIX - Sanitized resume display data
  const sanitizedResumeData = useMemo(() => {
    if (!selectedResume) return null;

    return {
      basicInfo: {
        originalFileName: sanitizeInput(selectedResume.originalFileName || ''),
        fileSize: Math.max(0, parseInt(selectedResume.fileSize, 10) || 0),
        uploadedAt: selectedResume.uploadedAt,
        id: sanitizeInput(selectedResume.id || '')
      },
      analysis: selectedResume.analysis ? {
        score: Math.max(0, Math.min(100, parseInt(selectedResume.analysis.score, 10) || 0)),
        atsScore: Math.max(0, Math.min(100, parseInt(selectedResume.analysis.atsScore, 10) || 0)),
        contentScore: Math.max(0, Math.min(100, parseInt(selectedResume.analysis.contentScore, 10) || 0)),
        formatScore: Math.max(0, Math.min(100, parseInt(selectedResume.analysis.formatScore, 10) || 0))
      } : null,
      preferences: selectedResume.preferences ? {
        language: sanitizeInput(selectedResume.preferences.language || ''),
        roastType: sanitizeInput(selectedResume.preferences.roastType || ''),
        industry: sanitizeInput(selectedResume.preferences.industry || ''),
        experienceLevel: sanitizeInput(selectedResume.preferences.experienceLevel || '')
      } : null,
      statistics: selectedResume.statistics || null
    };
  }, [selectedResume, sanitizeInput]);

  if (!isAuthenticated) {
    return (
      <div className="admin-login">
        <div className="login-container">
          <h2>CV Slayer Admin</h2>
          
          {/* PRODUCTION FIX - Error display */}
          {error && (
            <div className="error-message" role="alert" aria-live="polite">
              {error}
              <button 
                onClick={() => setError('')}
                className="error-close"
                aria-label="Close error message"
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
              minLength={8}
              maxLength={255}
              required
              disabled={loading}
              autoComplete="current-password"
            />
            <button type="submit" disabled={loading || !email || !password}>
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-panel">
      {/* PRODUCTION FIX - Error notification */}
      {error && (
        <div className="admin-error" role="alert" aria-live="polite">
          {error}
          <button onClick={() => setError('')} className="error-close">×</button>
        </div>
      )}

      <header className="admin-header">
        <h1>CV Slayer Admin Panel</h1>
        <div className="admin-nav">
          <button 
            className={currentView === 'dashboard' ? 'active' : ''}
            onClick={() => setCurrentView('dashboard')}
            disabled={loading}
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
          >
            Resumes ({resumes.length})
          </button>
          <button onClick={handleLogout} disabled={loading}>
            Logout
          </button>
        </div>
      </header>

      <div className="admin-content">
        {currentView === 'dashboard' && dashboardData && (
          <div className="dashboard-view">
            <div className="stats-grid">
              <div className="stat-card">
                <h3>Total Resumes</h3>
                <p>{dashboardData.totalResumes}</p>
              </div>
              <div className="stat-card">
                <h3>Today's Uploads</h3>
                <p>{dashboardData.todayResumes}</p>
              </div>
              <div className="stat-card">
                <h3>Average Score</h3>
                <p>{dashboardData.averageScore}/100</p>
              </div>
            </div>

            <div className="recent-resumes">
              <h3>Recent Resumes</h3>
              {dashboardData.recentResumes.map(resume => (
                <div 
                  key={resume.id} 
                  className="resume-card" 
                  onClick={() => handleResumeClick(resume)}
                  onKeyDown={(e) => handleKeyDown(e, () => handleResumeClick(resume))}
                  tabIndex={0}
                  role="button"
                  aria-label={`View details for ${resume.fileName}`}
                >
                  <h4>{resume.fileName}</h4>
                  <p>Score: {resume.score}/100</p>
                  <p>Uploaded: {new Date(resume.uploadedAt).toLocaleDateString()}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {currentView === 'resumes' && (
          <div className="resumes-view">
            <h3>All Resumes ({resumes.length})</h3>
            <div className="resumes-list">
              {resumes.map(resume => (
                <div 
                  key={resume.id} 
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
              ))}
            </div>
          </div>
        )}
      </div>

      {/* PRODUCTION FIX - Sanitized Resume Modal */}
      {showResumeModal && sanitizedResumeData && (
        <div className="modal-overlay" onClick={() => setShowResumeModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Resume Analysis Details</h2>
              <button 
                className="close-button" 
                onClick={() => setShowResumeModal(false)}
                aria-label="Close modal"
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
                      {sanitizedResumeData.analysis.atsScore && (
                        <div className="score-card">
                          <h4>ATS Score</h4>
                          <p className="score">{sanitizedResumeData.analysis.atsScore}/100</p>
                        </div>
                      )}
                      {sanitizedResumeData.analysis.contentScore && (
                        <div className="score-card">
                          <h4>Content Score</h4>
                          <p className="score">{sanitizedResumeData.analysis.contentScore}/100</p>
                        </div>
                      )}
                      {sanitizedResumeData.analysis.formatScore && (
                        <div className="score-card">
                          <h4>Format Score</h4>
                          <p className="score">{sanitizedResumeData.analysis.formatScore}/100</p>
                        </div>
                      )}
                    </div>
                  </section>
                )}

                {/* User Preferences */}
                {sanitizedResumeData.preferences && (
                  <section className="detail-section">
                    <h3>⚙️ User Preferences</h3>
                    <div className="info-grid">
                      <p><strong>Language:</strong> {sanitizedResumeData.preferences.language || 'N/A'}</p>
                      <p><strong>Roast Type:</strong> {sanitizedResumeData.preferences.roastType || 'N/A'}</p>
                      <p><strong>Industry:</strong> {sanitizedResumeData.preferences.industry || 'N/A'}</p>
                      <p><strong>Experience Level:</strong> {sanitizedResumeData.preferences.experienceLevel || 'N/A'}</p>
                    </div>
                  </section>
                )}

                {/* Document Statistics */}
                {sanitizedResumeData.statistics && (
                  <section className="detail-section">
                    <h3>📈 Document Statistics</h3>
                    <div className="stats-grid">
                      {Object.entries(sanitizedResumeData.statistics).map(([key, value]) => (
                        <div key={key} className="stat-item">
                          <span className="stat-label">{key}:</span>
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