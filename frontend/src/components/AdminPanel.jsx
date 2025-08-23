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

  // FIXED: Helper function to decode text and fix encoding issues
  const cleanText = (text) => {
    if (!text || typeof text !== 'string') return text;
    
    // Fix common encoding issues
    return text
      .replace(/â€™/g, "'")
      .replace(/â€œ/g, '"')
      .replace(/â€\u009d/g, '"')
      .replace(/â€"/g, '—')
      .replace(/â€¢/g, '•')
      .replace(/Â/g, '')
      .replace(/&#x27;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
  };

  // Helper function to safely extract nested data
  const safeGet = (obj, path, defaultValue = null) => {
    try {
      const result = path.split('.').reduce((current, key) => current?.[key], obj) ?? defaultValue;
      return typeof result === 'string' ? cleanText(result) : result;
    } catch {
      return defaultValue;
    }
  };

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
        'Content-Type': 'application/json; charset=utf-8',
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
        headers: { 
          'Content-Type': 'application/json; charset=utf-8'
        },
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

  // FIXED: Load dashboard data
  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      const result = await apiRequest('/admin/dashboard');
      
      console.log('Dashboard API Result:', result); // Debug log
      
      if (result.success && result.data) {
        const dashboardData = {
          totalResumes: result.data.totalResumes || 0,
          todayResumes: result.data.todayResumes || 0,
          averageScore: result.data.averageScore || 0,
          recentResumes: (result.data.recentResumes || []).map(resume => ({
            id: resume.id,
            displayName: cleanText(resume.personalInfo?.name || resume.displayName || resume.fileName || 'Unknown'),
            fileName: cleanText(resume.fileName || ''),
            score: resume.score || 0,
            uploadedAt: resume.uploadedAt,
            
            personalInfo: {
              name: cleanText(resume.personalInfo?.name || 'Not extracted'),
              email: cleanText(resume.personalInfo?.email || 'Not found'),
              phone: cleanText(resume.personalInfo?.phone || 'Not found'),
              linkedin: cleanText(resume.personalInfo?.linkedin || 'Not found'),
              address: cleanText(resume.personalInfo?.address || 'Not found')
            },
            
            hasEmail: resume.hasEmail,
            hasPhone: resume.hasPhone,
            hasLinkedIn: resume.hasLinkedIn,
            roastLevel: resume.roastLevel,
            language: resume.language,
            roastType: resume.roastType,
            gender: resume.gender,
            wordCount: resume.wordCount,
            pageCount: resume.pageCount,
            fullData: resume.fullData || resume
          }))
        };
        
        console.log('Processed Dashboard Data:', dashboardData); // Debug log
        setDashboardData(dashboardData);
      } else {
        console.log('No data in dashboard response'); // Debug log
        setDashboardData({
          totalResumes: 0,
          todayResumes: 0,
          averageScore: 0,
          recentResumes: []
        });
      }
    } catch (error) {
      console.error('Dashboard error:', error); // Debug log
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

  // FIXED: Load resumes
  const loadResumes = useCallback(async () => {
    try {
      setLoading(true);
      const result = await apiRequest('/admin/resumes');
      
      console.log('Resumes API Result:', result); // Debug log
      
      if (result.success && result.data) {
        const resumesData = Array.isArray(result.data) ? result.data : 
                           Array.isArray(result.data.resumes) ? result.data.resumes : [];
        
        setResumes(resumesData.map(resume => {
          const personalInfo = resume.personalInfo || {};
          
          return {
            id: resume.id,
            originalFileName: cleanText(resume.fileName || 'Unknown'),
            fileSize: resume.fileSize || 0,
            uploadedAt: resume.uploadedAt || new Date(),
            score: resume.score || 0,
            
            displayName: cleanText(personalInfo.name || resume.fileName?.replace(/\.[^/.]+$/, "") || 'Unknown'),
            personalInfo: {
              name: cleanText(personalInfo.name || 'Not extracted'),
              email: cleanText(personalInfo.email || 'Not found'),
              phone: cleanText(personalInfo.phone || 'Not found'),
              linkedin: cleanText(personalInfo.linkedin || 'Not found'),
              address: cleanText(personalInfo.address || 'Not found')
            },
            
            language: resume.language || 'N/A',
            roastType: resume.roastType || 'N/A',
            roastLevel: resume.roastLevel || 'N/A',
            gender: resume.gender || 'N/A',
            
            wordCount: resume.wordCount || resume.analytics?.wordCount || 0,
            pageCount: resume.pageCount || resume.analytics?.pageCount || 1,
            
            hasEmail: resume.hasEmail || false,
            hasPhone: resume.hasPhone || false,
            hasLinkedIn: resume.hasLinkedIn || false,
            contactValidation: resume.contactValidation || {},
            
            fullData: resume.fullData || resume
          };
        }));
      } else {
        setResumes([]);
      }
    } catch (error) {
      console.error('Resumes error:', error); // Debug log
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
        setSelectedResume(resume.fullData || resume);
      }
      setShowResumeModal(true);
    } catch (error) {
      setSelectedResume(resume.fullData || resume);
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

  // FIXED: Resume details renderer
  const renderResumeDetails = () => {
    if (!selectedResume) return null;
    
    const fileInfo = selectedResume.fileInfo || {};
    const analysis = selectedResume.analysis || {};
    const extractedInfo = selectedResume.extractedInfo || {};
    const preferences = selectedResume.preferences || {};
    const timestamps = selectedResume.timestamps || {};
    const contactValidation = selectedResume.contactValidation || {};
    const resumeAnalytics = selectedResume.resumeAnalytics || analysis.resumeAnalytics || {};
    const personalInfo = selectedResume.personalInfo || extractedInfo.personalInfo || {};
    
    return (
      <div className="resume-details">
        <h3>📄 Basic Information</h3>
        <div className="info-grid">
          <p><strong>File:</strong> {cleanText(fileInfo.originalFileName || fileInfo.fileName || 'Unknown')}</p>
          <p><strong>Size:</strong> {((fileInfo.fileSize || 0) / 1024).toFixed(2)} KB</p>
          <p><strong>Type:</strong> {fileInfo.mimeType || 'Unknown'}</p>
          <p><strong>Uploaded:</strong> {new Date(timestamps.uploadedAt || selectedResume.createdAt || Date.now()).toLocaleString()}</p>
          <p><strong>Processed:</strong> {timestamps.processingCompletedAt ? new Date(timestamps.processingCompletedAt).toLocaleString() : 'N/A'}</p>
          <p><strong>File Hash:</strong> {fileInfo.fileHash || 'N/A'}</p>
        </div>

        <h3>👤 Personal Information</h3>
        <div className="personal-info-grid">
          <p><strong>Name:</strong> {cleanText(personalInfo.name || 'Not extracted')}</p>
          <p><strong>Email:</strong> {cleanText(personalInfo.email || 'Not found')}</p>
          <p><strong>Phone:</strong> {cleanText(personalInfo.phone || 'Not found')}</p>
          <p><strong>LinkedIn:</strong> {cleanText(personalInfo.linkedin || 'Not found')}</p>
          <p><strong>Address:</strong> {cleanText(personalInfo.address || 'Not found')}</p>
        </div>

        {analysis.overallScore && (
          <>
            <h3>📊 Analysis Results</h3>
            <div className="analysis-section">
              <p><strong>Overall Score:</strong> <span className="score-highlight">{analysis.overallScore}/100</span></p>
              
              {analysis.feedback && (
                <div className="feedback-section">
                  <h4>🤖 AI Feedback:</h4>
                  <div className="feedback-text">
                    {cleanText(analysis.feedback)}
                  </div>
                </div>
              )}

              {analysis.strengths && analysis.strengths.length > 0 && (
                <div className="strengths-section">
                  <h4>💪 Strengths:</h4>
                  <ul>
                    {analysis.strengths.map((strength, index) => (
                      <li key={index}>{cleanText(strength)}</li>
                    ))}
                  </ul>
                </div>
              )}

              {analysis.weaknesses && analysis.weaknesses.length > 0 && (
                <div className="weaknesses-section">
                  <h4>⚠️ Weaknesses:</h4>
                  <ul>
                    {analysis.weaknesses.map((weakness, index) => (
                      <li key={index}>{cleanText(weakness)}</li>
                    ))}
                  </ul>
                </div>
              )}

              {analysis.improvements && analysis.improvements.length > 0 && (
                <div className="improvements-section">
                  <h4>🎯 Improvements:</h4>
                  <ul>
                    {analysis.improvements.map((improvement, index) => (
                      <li key={index}>
                        {cleanText(typeof improvement === 'string' ? improvement : improvement.description || improvement.title)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </>
        )}

        <h3>📈 Document Analytics</h3>
        <div className="stats-grid">
          <div className="stat-item">
            <strong>Word Count:</strong> {resumeAnalytics.wordCount || 0}
          </div>
          <div className="stat-item">
            <strong>Page Count:</strong> {resumeAnalytics.pageCount || 1}
          </div>
          <div className="stat-item">
            <strong>Sections:</strong> {resumeAnalytics.sectionCount || 0}
          </div>
          <div className="stat-item">
            <strong>Bullet Points:</strong> {resumeAnalytics.bulletPointCount || 0}
          </div>
          <div className="stat-item">
            <strong>Achievements:</strong> {resumeAnalytics.quantifiableAchievements || 0}
          </div>
          <div className="stat-item">
            <strong>Action Verbs:</strong> {resumeAnalytics.actionVerbsUsed || 0}
          </div>
          <div className="stat-item">
            <strong>Readability Score:</strong> {resumeAnalytics.readabilityScore || 'N/A'}
          </div>
          <div className="stat-item">
            <strong>ATS Compatibility:</strong> {resumeAnalytics.atsCompatibility || 'N/A'}
          </div>
        </div>

        <h3>📞 Contact Information Status</h3>
        <div className="contact-validation">
          <div className="contact-grid">
            <div className="contact-item">
              <strong>Email:</strong> {contactValidation.hasEmail ? '✅ Found' : '❌ Missing'}
              {contactValidation.hasEmail && (
                <span className="validation-status">
                  {contactValidation.emailValid ? ' (Valid Format)' : ' (Invalid Format)'}
                </span>
              )}
            </div>
            <div className="contact-item">
              <strong>Phone:</strong> {contactValidation.hasPhone ? '✅ Found' : '❌ Missing'}
              {contactValidation.hasPhone && (
                <span className="validation-status">
                  {contactValidation.phoneValid ? ' (Valid Format)' : ' (Invalid Format)'}
                </span>
              )}
            </div>
            <div className="contact-item">
              <strong>LinkedIn:</strong> {contactValidation.hasLinkedIn ? '✅ Found' : '❌ Missing'}
              {contactValidation.hasLinkedIn && (
                <span className="validation-status">
                  {contactValidation.linkedInValid ? ' (Valid URL)' : ' (Invalid URL)'}
                </span>
              )}
            </div>
            <div className="contact-item">
              <strong>Address:</strong> {contactValidation.hasAddress ? '✅ Found' : '❌ Missing'}
            </div>
          </div>
        </div>

        {Object.keys(preferences).length > 0 && (
          <>
            <h3>⚙️ User Preferences</h3>
            <div className="preferences-grid">
              <p><strong>Gender:</strong> {preferences.gender || 'N/A'}</p>
              <p><strong>Roast Level:</strong> {preferences.roastLevel || 'N/A'}</p>
              <p><strong>Roast Type:</strong> {preferences.roastType || 'N/A'}</p>
              <p><strong>Language:</strong> {preferences.language || 'N/A'}</p>
            </div>
          </>
        )}

        {resumeAnalytics.industryKeywords && resumeAnalytics.industryKeywords.length > 0 && (
          <>
            <h3>🏷️ Industry Keywords Found</h3>
            <div className="keywords-section">
              <div className="keywords-tags">
                {resumeAnalytics.industryKeywords.slice(0, 15).map((keyword, index) => (
                  <span key={index} className="keyword-tag">{cleanText(keyword)}</span>
                ))}
                {resumeAnalytics.industryKeywords.length > 15 && (
                  <span className="keyword-tag more">
                    +{resumeAnalytics.industryKeywords.length - 15} more
                  </span>
                )}
              </div>
            </div>
          </>
        )}

        {(analysis.strongElements || analysis.missingElements) && (
          <>
            <h3>🔍 Content Analysis</h3>
            {analysis.strongElements && analysis.strongElements.length > 0 && (
              <div className="elements-section">
                <h4>✅ Strong Elements:</h4>
                <ul>
                  {analysis.strongElements.map((element, index) => (
                    <li key={index} className="strong-element">{cleanText(element)}</li>
                  ))}
                </ul>
              </div>
            )}
            
            {analysis.missingElements && analysis.missingElements.length > 0 && (
              <div className="elements-section">
                <h4>❌ Missing Elements:</h4>
                <ul>
                  {analysis.missingElements.map((element, index) => (
                    <li key={index} className="missing-element">{cleanText(element)}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {selectedResume.metadata && (
          <>
            <h3>🔧 Technical Metadata</h3>
            <div className="metadata-grid">
              <p><strong>Request ID:</strong> {selectedResume.metadata.requestId || 'N/A'}</p>
              <p><strong>Processing Time:</strong> {selectedResume.metadata.processingTime || 0}ms</p>
              <p><strong>Client IP:</strong> {selectedResume.metadata.clientIP || 'N/A'}</p>
              <p><strong>Country:</strong> {selectedResume.metadata.countryCode || selectedResume.securityInfo?.countryCode || 'N/A'}</p>
              <p><strong>GDPR Consent:</strong> {selectedResume.metadata.gdprConsent ? '✅ Yes' : '❌ No'}</p>
              <p><strong>Created:</strong> {new Date(selectedResume.metadata.createdAt || selectedResume.createdAt || Date.now()).toLocaleString()}</p>
            </div>
          </>
        )}
      </div>
    );
  };

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
              <span>⚠️ {cleanText(error)}</span>
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
          <span>⚠️ {cleanText(error)}</span>
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
        {currentView === 'dashboard' && !loading && (
          <div className="dashboard-view">
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-icon">📄</div>
                <div className="stat-content">
                  <h3>Total Resumes</h3>
                  <p className="stat-number">{dashboardData?.totalResumes || 0}</p>
                </div>
              </div>
              
              <div className="stat-card">
                <div className="stat-icon">📅</div>
                <div className="stat-content">
                  <h3>Today's Uploads</h3>
                  <p className="stat-number">{dashboardData?.todayResumes || 0}</p>
                </div>
              </div>
              
              <div className="stat-card">
                <div className="stat-icon">⭐</div>
                <div className="stat-content">
                  <h3>Average Score</h3>
                  <p className="stat-number">{(dashboardData?.averageScore || 0).toFixed(1)}/100</p>
                </div>
              </div>
            </div>

            <div className="recent-section">
              <h3>📋 Recent Resumes</h3>
              {dashboardData?.recentResumes?.length > 0 ? (
                <div className="recent-list">
                  {dashboardData.recentResumes.map((resume, index) => (
                    <div 
                      key={resume.id || index} 
                      className="recent-item"
                      onClick={() => handleResumeClick(resume)}
                    >
                      <div className="item-info">
                        <h4>{resume.personalInfo?.name || resume.displayName || resume.fileName || 'Unknown File'}</h4>
                        <p><strong>Email:</strong> {resume.personalInfo?.email || 'Not found'}</p>
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
                      <h4 title={resume.personalInfo?.name || resume.originalFileName}>
                        {(resume.personalInfo?.name || resume.displayName)?.length > 25 
                          ? (resume.personalInfo?.name || resume.displayName).substring(0, 25) + '...'
                          : (resume.personalInfo?.name || resume.displayName)
                        }
                      </h4>
                      <span className="score-badge">{resume.score}/100</span>
                    </div>
                    
                    <div className="card-content">
                      <p><strong>Name:</strong> {resume.personalInfo?.name || 'Not extracted'}</p>
                      <p><strong>Email:</strong> {resume.personalInfo?.email || 'Not found'}</p>
                      <p><strong>Phone:</strong> {resume.personalInfo?.phone || 'Not found'}</p>
                      <p><strong>LinkedIn:</strong> {resume.personalInfo?.linkedin || 'Not found'}</p>
                      <p><strong>File:</strong> {resume.originalFileName}</p>
                      <p><strong>Size:</strong> {(resume.fileSize / 1024).toFixed(1)} KB</p>
                      <p><strong>Words:</strong> {resume.wordCount || 'N/A'}</p>
                      <p><strong>Pages:</strong> {resume.pageCount || 1}</p>
                      <p><strong>Uploaded:</strong> {new Date(resume.uploadedAt).toLocaleDateString()}</p>
                      <p><strong>Language:</strong> {resume.language}</p>
                      <p><strong>Type:</strong> {resume.roastType}</p>
                      <p><strong>Level:</strong> {resume.roastLevel}</p>
                      
                      <div className="contact-indicators">
                        <span className={`indicator ${resume.hasEmail ? 'has' : 'missing'}`}>
                          📧 {resume.hasEmail ? '✓' : '✗'}
                        </span>
                        <span className={`indicator ${resume.hasPhone ? 'has' : 'missing'}`}>
                          📱 {resume.hasPhone ? '✓' : '✗'}
                        </span>
                        <span className={`indicator ${resume.hasLinkedIn ? 'has' : 'missing'}`}>
                          💼 {resume.hasLinkedIn ? '✓' : '✗'}
                        </span>
                      </div>
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