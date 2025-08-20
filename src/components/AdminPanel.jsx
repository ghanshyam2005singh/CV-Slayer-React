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

  // API configuration
  const API_BASE = useMemo(() => {
    return process.env.NODE_ENV === 'production' 
      ? `${window.location.origin}/api`
      : 'http://localhost:5000/api';
  }, []);

  // Validate token
  const isTokenValid = useCallback(() => {
    const token = localStorage.getItem('adminToken');
    const expiry = localStorage.getItem('adminTokenExpiry');
    return token && expiry && Date.now() < parseInt(expiry);
  }, []);

  // Logout handler
  const handleLogout = useCallback(() => {
    ['adminToken', 'adminTokenExpiry', 'adminUser'].forEach(item => 
      localStorage.removeItem(item)
    );
    setIsAuthenticated(false);
    setDashboardData(null);
    setResumes([]);
    setError('');
  }, []);

  // API request helper
  const apiRequest = useCallback(async (endpoint, options = {}) => {
    if (!isTokenValid()) {
      setIsAuthenticated(false);
      throw new Error('Session expired');
    }

    const token = localStorage.getItem('adminToken');
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    if (response.status === 401) {
      handleLogout();
      throw new Error('Session expired');
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `Request failed (${response.status})`);
    }

    return response.json();
  }, [API_BASE, isTokenValid, handleLogout]);

  // Login handler
  const handleLogin = useCallback(async (e) => {
    e.preventDefault();
    if (!email || !password) return;

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Login failed');
      }

      const result = await response.json();
      
      if (result.success && result.token) {
        const expiryTime = Date.now() + (30 * 60 * 1000); // 30 minutes
        localStorage.setItem('adminToken', result.token);
        localStorage.setItem('adminTokenExpiry', expiryTime.toString());
        localStorage.setItem('adminUser', JSON.stringify({ email }));
        
        setIsAuthenticated(true);
        setEmail('');
        setPassword('');
        
        // Load initial data
        setTimeout(loadDashboard, 100);
      } else {
        throw new Error('Invalid login response');
      }
    } catch (error) {
      setError(error.message.includes('fetch') 
        ? 'Cannot connect to server' 
        : error.message
      );
    } finally {
      setLoading(false);
    }
  }, [email, password, API_BASE]);

  // Load dashboard data
  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      const result = await apiRequest('/admin/dashboard');
      
      if (result.success && result.data) {
        setDashboardData(result.data);
      } else {
        // Fallback data
        setDashboardData({
          totalResumes: 0,
          todayResumes: 0,
          averageScore: 0,
          recentResumes: []
        });
      }
    } catch (error) {
      setError(`Dashboard error: ${error.message}`);
      setDashboardData({
        totalResumes: 0,
        todayResumes: 0,
        averageScore: 0,
        recentResumes: []
      });
    } finally {
      setLoading(false);
    }
  }, [apiRequest]);

  // Load resumes with proper nested field mapping
  const loadResumes = useCallback(async () => {
    try {
      setLoading(true);
      const result = await apiRequest('/admin/resumes');
      
      if (result.success && result.data) {
        const resumesData = Array.isArray(result.data) ? result.data : 
                           Array.isArray(result.data.resumes) ? result.data.resumes : [];
        
        setResumes(resumesData.map(resume => ({
          id: resume.resumeId || resume._id || resume.id,
          originalFileName: resume.originalFileName || resume.fileName || 'Unknown',
          fileSize: resume.fileSize || 0,
          uploadedAt: resume.uploadedAt || resume.timestamps?.uploadedAt,
          score: resume.analysis?.overallScore || resume.score || 0,
          language: resume.preferences?.roastSettings?.language || resume.preferences?.language || 'N/A',
          roastType: resume.preferences?.roastSettings?.type || resume.preferences?.roastType || 'N/A',
          // Extract display name from nested structure
          displayName: resume.extractedInfo?.personalInfo?.name || 
                      resume.extractedInfo?.name || 
                      (resume.originalFileName || resume.fileName || 'Unknown').replace(/\.[^/.]+$/, "")
        })));
      } else {
        setResumes([]);
      }
    } catch (error) {
      setError(`Resumes error: ${error.message}`);
      setResumes([]);
    } finally {
      setLoading(false);
    }
  }, [apiRequest]);

  // Handle resume click
  const handleResumeClick = useCallback(async (resume) => {
    try {
      const result = await apiRequest(`/admin/resume/${resume.id}`);
      if (result.success && result.data) {
        setSelectedResume(result.data);
      } else {
        setSelectedResume(resume);
      }
      setShowResumeModal(true);
    } catch (error) {
      setSelectedResume(resume);
      setShowResumeModal(true);
    }
  }, [apiRequest]);

  // Check authentication on mount
  useEffect(() => {
    if (isTokenValid()) {
      setIsAuthenticated(true);
      loadDashboard();
    }
  }, [isTokenValid, loadDashboard]);

  // Auto-clear errors
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Resume details renderer with proper nested field handling
  const renderResumeDetails = () => (
    <div className="resume-details">
      <h3>Basic Information</h3>
      <p><strong>File:</strong> {selectedResume.originalFileName || selectedResume.fileName || 'Unknown'}</p>
      <p><strong>Size:</strong> {((selectedResume.fileSize || 0) / 1024).toFixed(2)} KB</p>
      <p><strong>Uploaded:</strong> {new Date(selectedResume.uploadedAt || selectedResume.timestamps?.uploadedAt || Date.now()).toLocaleString()}</p>

      {selectedResume.analysis && (
        <>
          <h3>Analysis Results</h3>
          <p><strong>Overall Score:</strong> {selectedResume.analysis.overallScore || 0}/100</p>
          
          {selectedResume.analysis.scoringBreakdown && (
            <div className="scoring-breakdown">
              <h4>Score Breakdown:</h4>
              <p><strong>Contact Info:</strong> {selectedResume.analysis.scoringBreakdown.contactInfo || 0}/100</p>
              <p><strong>Work Experience:</strong> {selectedResume.analysis.scoringBreakdown.workExperience || 0}/100</p>
              <p><strong>Education:</strong> {selectedResume.analysis.scoringBreakdown.education || 0}/100</p>
              <p><strong>Skills:</strong> {selectedResume.analysis.scoringBreakdown.skills || 0}/100</p>
              <p><strong>Formatting:</strong> {selectedResume.analysis.scoringBreakdown.formatting || 0}/100</p>
              <p><strong>ATS Compatibility:</strong> {selectedResume.analysis.scoringBreakdown.atsCompatibility || 0}/100</p>
            </div>
          )}

          {selectedResume.analysis.feedback?.roastFeedback && (
            <div className="feedback-section">
              <h4>AI Feedback:</h4>
              <div className="feedback-text">
                {selectedResume.analysis.feedback.roastFeedback}
              </div>
            </div>
          )}

          {selectedResume.analysis.feedback?.strengths?.length > 0 && (
            <div className="strengths-section">
              <h4>💪 Strengths:</h4>
              <ul>
                {selectedResume.analysis.feedback.strengths.map((strength, index) => (
                  <li key={index}>{strength}</li>
                ))}
              </ul>
            </div>
          )}

          {selectedResume.analysis.feedback?.improvements?.length > 0 && (
            <div className="improvements-section">
              <h4>🎯 Improvements:</h4>
              {selectedResume.analysis.feedback.improvements.map((improvement, index) => (
                <div key={index} className={`improvement-item priority-${improvement.priority}`}>
                  <strong>{improvement.title}</strong>
                  <p>{improvement.description}</p>
                  {improvement.example && <small><em>Example: {improvement.example}</em></small>}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {selectedResume.extractedInfo && (
        <>
          <h3>Extracted Information</h3>
          <div className="extracted-info-grid">
            <div className="info-section">
              <h4>👤 Personal Details</h4>
              <p><strong>Name:</strong> {selectedResume.extractedInfo?.personalInfo?.name || 'N/A'}</p>
              <p><strong>Email:</strong> {selectedResume.extractedInfo?.personalInfo?.email || 'N/A'}</p>
              <p><strong>Phone:</strong> {selectedResume.extractedInfo?.personalInfo?.phone || 'N/A'}</p>
              <p><strong>Address:</strong> {selectedResume.extractedInfo?.personalInfo?.address?.full || 'N/A'}</p>
              <p><strong>LinkedIn:</strong> {selectedResume.extractedInfo?.personalInfo?.socialProfiles?.linkedin || 'N/A'}</p>
              <p><strong>GitHub:</strong> {selectedResume.extractedInfo?.personalInfo?.socialProfiles?.github || 'N/A'}</p>
              <p><strong>Portfolio:</strong> {selectedResume.extractedInfo?.personalInfo?.socialProfiles?.portfolio || 'N/A'}</p>
            </div>
            
            <div className="info-section">
              <h4>💼 Professional Info</h4>
              <p><strong>Professional Summary:</strong> {selectedResume.extractedInfo?.professionalSummary ? 'Yes' : 'No'}</p>
              <p><strong>Current Job:</strong> {selectedResume.extractedInfo?.experience?.[0]?.title || 'N/A'}</p>
              <p><strong>Current Company:</strong> {selectedResume.extractedInfo?.experience?.[0]?.company || 'N/A'}</p>
              <p><strong>Total Experience:</strong> {selectedResume.extractedInfo?.experience?.length || 0} positions</p>
            </div>
            
            <div className="info-section">
              <h4>🛠️ Skills & Education</h4>
              <p><strong>Technical Skills:</strong> {(selectedResume.extractedInfo?.skills?.technical || []).length}</p>
              <p><strong>Soft Skills:</strong> {(selectedResume.extractedInfo?.skills?.soft || []).length}</p>
              <p><strong>Languages:</strong> {(selectedResume.extractedInfo?.skills?.languages || []).length}</p>
              <p><strong>Tools:</strong> {(selectedResume.extractedInfo?.skills?.tools || []).length}</p>
              <p><strong>Frameworks:</strong> {(selectedResume.extractedInfo?.skills?.frameworks || []).length}</p>
              <p><strong>Education:</strong> {(selectedResume.extractedInfo?.education || []).length} entries</p>
              <p><strong>Projects:</strong> {(selectedResume.extractedInfo?.projects || []).length} listed</p>
              <p><strong>Certifications:</strong> {(selectedResume.extractedInfo?.certifications || []).length} found</p>
              <p><strong>Awards:</strong> {(selectedResume.extractedInfo?.awards || []).length} found</p>
            </div>
            
            {((selectedResume.extractedInfo?.skills?.technical?.length || 0) + 
              (selectedResume.extractedInfo?.skills?.soft?.length || 0)) > 0 && (
              <div className="info-section">
                <h4>🏷️ Skills List</h4>
                <div className="skills-tags">
                  {[...(selectedResume.extractedInfo?.skills?.technical || []), 
                    ...(selectedResume.extractedInfo?.skills?.soft || [])]
                    .slice(0, 15)
                    .map((skill, index) => (
                      <span key={index} className="skill-tag">{skill}</span>
                    ))}
                  {((selectedResume.extractedInfo?.skills?.technical?.length || 0) +
                    (selectedResume.extractedInfo?.skills?.soft?.length || 0)) > 15 && (
                    <span className="skill-tag more">
                      +{((selectedResume.extractedInfo?.skills?.technical?.length || 0) +
                        (selectedResume.extractedInfo?.skills?.soft?.length || 0)) - 15} more
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {selectedResume.preferences && (
        <>
          <h3>User Preferences</h3>
          <div className="preferences-grid">
            <p><strong>Gender:</strong> {selectedResume.preferences?.roastSettings?.gender || selectedResume.preferences?.gender || 'N/A'}</p>
            <p><strong>Roast Level:</strong> {selectedResume.preferences?.roastSettings?.level || selectedResume.preferences?.roastLevel || 'N/A'}</p>
            <p><strong>Roast Type:</strong> {selectedResume.preferences?.roastSettings?.type || selectedResume.preferences?.roastType || 'N/A'}</p>
            <p><strong>Language:</strong> {selectedResume.preferences?.roastSettings?.language || selectedResume.preferences?.language || 'N/A'}</p>
          </div>
        </>
      )}

      {(selectedResume.statistics || selectedResume.resumeAnalytics) && (
        <>
          <h3>Document Statistics</h3>
          <div className="stats-grid">
            <p><strong>Word Count:</strong> {selectedResume.statistics?.wordCount || selectedResume.resumeAnalytics?.wordCount || 0}</p>
            <p><strong>Page Count:</strong> {selectedResume.statistics?.pageCount || selectedResume.resumeAnalytics?.pageCount || 1}</p>
            <p><strong>Section Count:</strong> {selectedResume.statistics?.sectionCount || selectedResume.resumeAnalytics?.sectionCount || 0}</p>
            <p><strong>Bullet Points:</strong> {selectedResume.statistics?.bulletPointCount || selectedResume.resumeAnalytics?.bulletPointCount || 0}</p>
            <p><strong>Quantifiable Achievements:</strong> {selectedResume.statistics?.quantifiableAchievements || selectedResume.resumeAnalytics?.quantifiableAchievements || 0}</p>
            <p><strong>ATS Compatibility:</strong> {selectedResume.statistics?.atsCompatibility || selectedResume.resumeAnalytics?.atsCompatibility || 'N/A'}</p>
          </div>
        </>
      )}

      {selectedResume.contactValidation && (
        <>
          <h3>Contact Validation</h3>
          <div className="contact-validation">
            <p><strong>Has Email:</strong> {selectedResume.contactValidation.hasEmail ? '✅' : '❌'}</p>
            <p><strong>Email Valid:</strong> {selectedResume.contactValidation.emailValid ? '✅' : '❌'}</p>
            <p><strong>Has Phone:</strong> {selectedResume.contactValidation.hasPhone ? '✅' : '❌'}</p>
            <p><strong>Phone Valid:</strong> {selectedResume.contactValidation.phoneValid ? '✅' : '❌'}</p>
            <p><strong>Has LinkedIn:</strong> {selectedResume.contactValidation.hasLinkedIn ? '✅' : '❌'}</p>
            <p><strong>LinkedIn Valid:</strong> {selectedResume.contactValidation.linkedInValid ? '✅' : '❌'}</p>
            <p><strong>Has Address:</strong> {selectedResume.contactValidation.hasAddress ? '✅' : '❌'}</p>
          </div>
        </>
      )}
    </div>
  );

  // LOGIN UI
  if (!isAuthenticated) {
    return (
      <div className="admin-login">
        <div className="login-container">
          <div className="login-header">
            <h2>🛡️ Admin Panel</h2>
            <p>CV Slayer Dashboard</p>
          </div>
          
          {error && (
            <div className="error-alert">
              <span>⚠️ {error}</span>
              <button onClick={() => setError('')} className="close-btn">×</button>
            </div>
          )}

          <form onSubmit={handleLogin} className="login-form">
            <div className="input-group">
              <input
                type="email"
                placeholder="Email Address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                className="form-input"
              />
            </div>
            
            <div className="input-group">
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                className="form-input"
              />
            </div>
            
            <button 
              type="submit" 
              disabled={loading || !email || !password}
              className="login-btn"
            >
              {loading ? '🔄 Signing in...' : '🔐 Sign In'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // MAIN ADMIN UI
  return (
    <div className="admin-panel">
      {error && (
        <div className="error-banner">
          <span>⚠️ {error}</span>
          <button onClick={() => setError('')}>×</button>
        </div>
      )}

      {/* Header */}
      <header className="admin-header">
        <div className="header-content">
          <h1>📊 CV Slayer Admin</h1>
          <div className="header-actions">
            <div className="nav-tabs">
              <button 
                className={`nav-tab ${currentView === 'dashboard' ? 'active' : ''}`}
                onClick={() => { setCurrentView('dashboard'); loadDashboard(); }}
                disabled={loading}
              >
                📈 Dashboard
              </button>
              <button 
                className={`nav-tab ${currentView === 'resumes' ? 'active' : ''}`}
                onClick={() => { setCurrentView('resumes'); loadResumes(); }}
                disabled={loading}
              >
                📄 Resumes ({resumes.length})
              </button>
            </div>
            <button onClick={handleLogout} className="logout-btn">
              🚪 Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="admin-content">
        {loading && (
          <div className="loading-overlay">
            <div className="loading-spinner">🔄</div>
            <p>Loading...</p>
          </div>
        )}

        {/* Dashboard View */}
        {currentView === 'dashboard' && dashboardData && !loading && (
          <div className="dashboard-view">
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-icon">📄</div>
                <div className="stat-content">
                  <h3>Total Resumes</h3>
                  <p className="stat-number">{dashboardData.totalResumes || 0}</p>
                </div>
              </div>
              
              <div className="stat-card">
                <div className="stat-icon">📅</div>
                <div className="stat-content">
                  <h3>Today's Uploads</h3>
                  <p className="stat-number">{dashboardData.todayResumes || 0}</p>
                </div>
              </div>
              
              <div className="stat-card">
                <div className="stat-icon">⭐</div>
                <div className="stat-content">
                  <h3>Average Score</h3>
                  <p className="stat-number">{(dashboardData.averageScore || 0).toFixed(1)}/100</p>
                </div>
              </div>
            </div>

            <div className="recent-section">
              <h3>📋 Recent Resumes</h3>
              {dashboardData.recentResumes?.length > 0 ? (
                <div className="recent-list">
                  {dashboardData.recentResumes.map((resume, index) => (
                    <div 
                      key={resume.id || index} 
                      className="recent-item"
                      onClick={() => handleResumeClick(resume)}
                    >
                      <div className="item-info">
                        <h4>{resume.displayName || resume.fileName || 'Unknown File'}</h4>
                        <p>Score: {resume.score || 0}/100</p>
                        <small>{new Date(resume.uploadedAt).toLocaleDateString()}</small>
                      </div>
                      <div className="item-arrow">→</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <p>📭 No resumes uploaded yet</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Resumes View */}
        {currentView === 'resumes' && !loading && (
          <div className="resumes-view">
            <div className="view-header">
              <h3>📄 All Resumes ({resumes.length})</h3>
            </div>
            
            {resumes.length > 0 ? (
              <div className="resumes-grid">
                {resumes.map((resume, index) => (
                  <div 
                    key={resume.id || index} 
                    className="resume-card"
                    onClick={() => handleResumeClick(resume)}
                  >
                    <div className="card-header">
                      <h4 title={resume.originalFileName}>
                        {resume.displayName?.length > 25 
                          ? resume.displayName.substring(0, 25) + '...'
                          : resume.displayName
                        }
                      </h4>
                      <span className="score-badge">{resume.score}/100</span>
                    </div>
                    
                    <div className="card-content">
                      <p><strong>File:</strong> {resume.originalFileName}</p>
                      <p><strong>Size:</strong> {(resume.fileSize / 1024).toFixed(1)} KB</p>
                      <p><strong>Uploaded:</strong> {new Date(resume.uploadedAt).toLocaleDateString()}</p>
                      <p><strong>Language:</strong> {resume.language}</p>
                      <p><strong>Type:</strong> {resume.roastType}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <p>📭 No resumes found</p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Resume Modal */}
      {showResumeModal && selectedResume && (
        <div className="modal-overlay" onClick={() => setShowResumeModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>📄 Resume Details</h2>
              <button 
                className="close-btn" 
                onClick={() => setShowResumeModal(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              {renderResumeDetails()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;