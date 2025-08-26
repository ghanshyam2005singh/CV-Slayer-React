import React, { useState, useCallback, useMemo } from 'react';
import './App.css';
import Navbar from './components/Navbar';
import ResultsDisplay from './components/ResultsDisplay';
import AdminPanel from './components/AdminPanel';

// Simple Error Boundary
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <div className="error-content">
            <div className="error-icon">⚠️</div>
            <h2>Something went wrong</h2>
            <p>Please refresh the page and try again.</p>
            <button onClick={() => window.location.reload()} className="error-reload-btn">
              🔄 Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [results, setResults] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [formData, setFormData] = useState({
    gender: 'male',
    roastLevel: 'pyar',
    roastType: 'funny',
    language: 'english'
  });

  // Simple API config
  const API_CONFIG = useMemo(() => ({
    baseURL: process.env.NODE_ENV === 'production' 
      ? process.env.REACT_APP_API_URL || 'https://cv-slayer.onrender.com'
      : 'http://localhost:5000',
    timeout: 120000,
    maxFileSize: 10 * 1024 * 1024
  }), []);

  // Simple file validation
  const validateFile = useCallback((file) => {
    if (!file) return 'Please select a resume file';
    
    const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'];
    if (!allowedTypes.includes(file.type)) {
      return 'Please upload PDF or Word documents only';
    }
    
    if (file.size > API_CONFIG.maxFileSize) {
      return 'File too large (max 10MB)';
    }
    
    return null;
  }, [API_CONFIG.maxFileSize]);

  // Simple file handler
  const handleFileChange = useCallback((e) => {
    const file = e.target.files[0];
    setError('');
    
    if (file) {
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        setSelectedFile(null);
        e.target.value = '';
        return;
      }
      setSelectedFile(file);
    } else {
      setSelectedFile(null);
    }
  }, [validateFile]);

  // Simple input handler
  const handleInputChange = useCallback((e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  }, []);

  // Simple reset
  const handleReset = useCallback(() => {
    setResults(null);
    setSelectedFile(null);
    setError('');
    setLoadingStep('');
    setIsLoading(false);
    setFormData({
      gender: 'male',
      roastLevel: 'pyar',
      roastType: 'funny',
      language: 'english'
    });
    
    const fileInput = document.getElementById('resumeFile');
    if (fileInput) fileInput.value = '';
  }, []);

  // Simple submit handler
  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    
    if (!agreedToTerms) {
      setError('Please accept the Terms & Conditions');
      return;
    }
    
    if (!selectedFile) {
      setError('Please select a resume file');
      return;
    }
    
    const validationError = validateFile(selectedFile);
    if (validationError) {
      setError(validationError);
      return;
    }
    
    setIsLoading(true);
    setError('');
    setLoadingStep('uploading');

    try {
      const formDataToSend = new FormData();
      formDataToSend.append('resume', selectedFile);
      formDataToSend.append('gender', formData.gender);
      formDataToSend.append('roastLevel', formData.roastLevel);
      formDataToSend.append('roastType', formData.roastType);
      formDataToSend.append('language', formData.language);
      formDataToSend.append('consentGiven', 'true');

      setLoadingStep('analyzing');

      const response = await fetch(`${API_CONFIG.baseURL}/api/resume/analyze`, {
        method: 'POST',
        body: formDataToSend
      });

      setLoadingStep('processing');

      if (!response.ok) {
        throw new Error(`Error ${response.status}: Please try again`);
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error?.message || 'Analysis failed');
      }

      const processedData = result.data || result;
      
      const finalResults = {
        ...processedData,
        originalFileName: selectedFile.name,
        score: Number(processedData.score) || 0,
        roastFeedback: processedData.roastFeedback || '',
        improvements: processedData.improvements || [],
        strengths: processedData.strengths || [],
        weaknesses: processedData.weaknesses || []
      };

      setLoadingStep('complete');
      setTimeout(() => {
        setResults(finalResults);
        setIsLoading(false);
        setLoadingStep('');
      }, 1000);

    } catch (error) {
      console.error('Submit error:', error);
      setError(error.message || 'An error occurred. Please try again');
      setIsLoading(false);
      setLoadingStep('');
    }
  }, [selectedFile, formData, agreedToTerms, validateFile, API_CONFIG.baseURL]);

  // Admin route check
  if (window.location.pathname.startsWith('/admin')) {
    return (
      <ErrorBoundary>
        <AdminPanel />
      </ErrorBoundary>
    );
  }

  // Results view
  if (results) {
    return (
      <ErrorBoundary>
        <div className="app">
          <Navbar />
          <main className="main-content">
            <ResultsDisplay results={results} onReset={handleReset} />
          </main>
        </div>
      </ErrorBoundary>
    );
  }

  // Loading view
  if (isLoading) {
    const getLoadingMessage = () => {
      const messages = {
        uploading: 'Uploading your resume...',
        analyzing: 'AI is analyzing your resume...',
        processing: 'Generating feedback...',
        complete: 'Analysis complete!'
      };
      return messages[loadingStep] || 'Processing...';
    };

    const getProgressPercentage = () => {
      const percentages = { uploading: 25, analyzing: 50, processing: 75, complete: 100 };
      return percentages[loadingStep] || 0;
    };

    return (
      <ErrorBoundary>
        <div className="app">
          <Navbar />
          <main className="loading-container">
            <div className="loading-wrapper">
              <div className="loading-animation">
                <div className="roast-icons">
                  <div className="icon fire">🔥</div>
                  <div className="icon ai">🤖</div>
                  <div className="icon resume">📄</div>
                </div>
                
                <div className="progress-section">
                  <div className="progress-bar">
                    <div 
                      className="progress-fill" 
                      style={{ width: `${getProgressPercentage()}%` }}
                    />
                  </div>
                  <div className="progress-percentage">
                    {getProgressPercentage()}%
                  </div>
                </div>
              </div>
              
              <div className="loading-content">
                <h2 className="loading-title">{getLoadingMessage()}</h2>
              </div>
            </div>
          </main>
        </div>
      </ErrorBoundary>
    );
  }

  // Main application
  return (
    <ErrorBoundary>
      <div className="app">
        <Navbar />
        
        {/* Hero Section */}
        <section id="home" className="hero">
          <div className="hero-background">
            <div className="hero-pattern"></div>
          </div>
          <div className="container">
            <div className="hero-content">
              <div className="hero-text">
                <h1 className="hero-title">
                  <span className="title-main">CV Slayer</span>
                  <span className="title-sub">Resume Roaster</span>
                </h1>
                <p className="hero-subtitle">
                  Get AI-powered feedback on your resume with humor and actionable improvements
                </p>
                <div className="hero-features">
                  <div className="feature-tag">🤖 AI-Powered</div>
                  <div className="feature-tag">🎭 Multiple Styles</div>
                  <div className="feature-tag">🌍 Multi-Language</div>
                </div>
                <a href="#upload" className="cta-button">
                  <span>Start Roasting</span>
                  <div className="cta-icon">🔥</div>
                </a>
              </div>
              <div className="hero-visual">
                <div className="floating-elements">
                  <div className="floating-item resume">📄</div>
                  <div className="floating-item fire">🔥</div>
                  <div className="floating-item ai">🤖</div>
                  <div className="floating-item chart">📊</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="features">
          <div className="container">
            <div className="section-header">
              <h2>Why Choose CV Slayer?</h2>
              <p>Professional resume analysis with personality</p>
            </div>
            <div className="features-grid">
              <div className="feature-card">
                <div className="feature-icon">🤖</div>
                <h3>AI-Powered Analysis</h3>
                <p>Advanced AI analyzes content, structure, and ATS compatibility</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">🎭</div>
                <h3>Multiple Personalities</h3>
                <p>Choose from gentle guidance to brutal honesty</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">🌍</div>
                <h3>Multi-Language Support</h3>
                <p>Get feedback in English, Hindi, or Hinglish</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">💡</div>
                <h3>Actionable Insights</h3>
                <p>Specific suggestions to improve your resume</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">📊</div>
                <h3>ATS Optimization</h3>
                <p>Ensure your resume passes tracking systems</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">🔒</div>
                <h3>Privacy First</h3>
                <p>Your data is processed securely</p>
              </div>
            </div>
          </div>
        </section>

        {/* Upload Section */}
        <section id="upload" className="upload-section">
          <div className="container">
            <div className="upload-wrapper">
              
              {error && (
                <div className="error-alert" role="alert">
                  <div className="error-content">
                    <span className="error-icon">⚠️</span>
                    <span className="error-text">{error}</span>
                    <button 
                      className="error-close"
                      onClick={() => setError('')}
                    >
                      ×
                    </button>
                  </div>
                </div>
              )}
              
              <form onSubmit={handleSubmit} className="upload-form">
                <div className="file-upload-section">
                  <label htmlFor="resumeFile" className="file-upload-label">
                    <div className="file-upload-area">
                      <div className="file-icon">📄</div>
                      <div className="file-text">
                        <span className="file-primary">
                          {selectedFile ? selectedFile.name : "Choose your resume"}
                        </span>
                        <span className="file-secondary">
                          PDF, DOC, DOCX up to 10MB
                        </span>
                      </div>
                      <div className="file-button">Browse</div>
                    </div>
                  </label>
                  <input 
                    type="file" 
                    id="resumeFile" 
                    accept=".pdf,.docx,.doc"
                    onChange={handleFileChange}
                    disabled={isLoading}
                    required
                  />
                </div>

                <div className="form-options">
                  <div className="option-group">
                    <label>Gender</label>
                    <div className="select-wrapper">
                      <select 
                        name="gender" 
                        value={formData.gender} 
                        onChange={handleInputChange}
                        disabled={isLoading}
                      >
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="other">Other/Neutral</option>
                      </select>
                    </div>
                  </div>

                  <div className="option-group">
                    <label>Roast Level</label>
                    <div className="select-wrapper">
                      <select 
                        name="roastLevel" 
                        value={formData.roastLevel} 
                        onChange={handleInputChange}
                        disabled={isLoading}
                      >
                        <option value="pyar">😊 Gentle</option>
                        <option value="ache">🤔 Balanced</option>
                        <option value="dhang">😈 Savage</option>
                      </select>
                    </div>
                  </div>

                  <div className="option-group">
                    <label>Style</label>
                    <div className="select-wrapper">
                      <select 
                        name="roastType" 
                        value={formData.roastType} 
                        onChange={handleInputChange}
                        disabled={isLoading}
                      >
                        <option value="funny">😄 Funny</option>
                        <option value="serious">🎯 Professional</option>
                        <option value="sarcastic">😏 Sarcastic</option>
                        <option value="motivational">💪 Motivational</option>
                      </select>
                    </div>
                  </div>

                  <div className="option-group">
                    <label>Language</label>
                    <div className="select-wrapper">
                      <select 
                        name="language" 
                        value={formData.language} 
                        onChange={handleInputChange}
                        disabled={isLoading}
                      >
                        <option value="english">🇺🇸 English</option>
                        <option value="hindi">🇮🇳 Hindi</option>
                        <option value="hinglish">🌍 Hinglish</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="terms-section">
                  <label className="terms-checkbox">
                    <input 
                      type="checkbox" 
                      checked={agreedToTerms}
                      onChange={(e) => setAgreedToTerms(e.target.checked)}
                      disabled={isLoading}
                      required
                    />
                    <span className="checkmark"></span>
                    <span className="terms-text">
                      I agree to the{' '}
                      <button 
                        type="button" 
                        className="terms-link"
                        onClick={() => setShowTermsModal(true)}
                      >
                        Terms of Service & Privacy Policy
                      </button>
                    </span>
                  </label>
                </div>

                <button 
                  type="submit" 
                  className="submit-button"
                  disabled={!selectedFile || !agreedToTerms || isLoading}
                >
                  <span>{isLoading ? 'Analyzing...' : 'Roast My Resume!'}</span>
                  <div className="submit-icon">🚀</div>
                </button>
              </form>
            </div>
          </div>
        </section>

        {/* Terms Modal */}
        {showTermsModal && (
          <div className="modal-overlay" onClick={() => setShowTermsModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Terms of Service & Privacy Policy</h3>
                <button 
                  className="modal-close"
                  onClick={() => setShowTermsModal(false)}
                >
                  ×
                </button>
              </div>
              
              <div className="modal-body">
                <div className="terms-content">
                  <section>
                    <h4>🔐 Privacy & Data</h4>
                    <p>Your resume is processed temporarily for analysis. Files are deleted after processing.</p>
                  </section>

                  <section>
                    <h4>🤖 AI Analysis</h4>
                    <p>We use AI to analyze your resume and provide feedback.</p>
                  </section>

                  <section>
                    <h4>📞 Contact</h4>
                    <p>Questions? Email: outlercodie.com@gmail.com</p>
                  </section>
                </div>
              </div>
              
              <div className="modal-footer">
                <button 
                  className="btn-secondary"
                  onClick={() => setShowTermsModal(false)}
                >
                  Close
                </button>
                <button 
                  className="btn-primary"
                  onClick={() => {
                    setAgreedToTerms(true);
                    setShowTermsModal(false);
                  }}
                >
                  Accept Terms
                </button>
              </div>
            </div>
          </div>
        )}

        {/* How It Works */}
        <section className="how-it-works">
          <div className="container">
            <div className="steps-grid">
              <div className="step-card">
                <div className="step-number">1</div>
                <div className="step-icon">📤</div>
                <h3>Upload</h3>
                <p>Upload your resume</p>
              </div>
              <div className="step-card">
                <div className="step-number">2</div>
                <div className="step-icon">⚙️</div>
                <h3>Customize</h3>
                <p>Choose preferences</p>
              </div>
              <div className="step-card">
                <div className="step-number">3</div>
                <div className="step-icon">🤖</div>
                <h3>Analyze</h3>
                <p>AI analyzes content</p>
              </div>
              <div className="step-card">
                <div className="step-number">4</div>
                <div className="step-icon">📊</div>
                <h3>Results</h3>
                <p>Get feedback</p>
              </div>
            </div>
          </div>
        </section>

        {/* Sample Results */}
        <section id="examples" className="sample-results">
          <div className="container">
            <div className="section-header">
              <h2>Sample Roasts</h2>
              <p>See different feedback styles</p>
            </div>
            <div className="samples-grid">
              <div className="sample-card funny">
                <div className="sample-header">
                  <span className="sample-type">😄 Funny Style</span>
                  <span className="sample-level">Gentle</span>
                </div>
                <blockquote>
                  "Your resume says 'Excel expert' but I bet you still Google how to make pie charts! 😅"
                </blockquote>
              </div>
              
              <div className="sample-card savage">
                <div className="sample-header">
                  <span className="sample-type">😈 Savage Style</span>
                  <span className="sample-level">Brutal</span>
                </div>
                <blockquote>
                  "This resume looks like ChatGPT made it in 5 minutes. Way too generic!"
                </blockquote>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer id="contact" className="footer">
          <div className="container">
            <div className="footer-content">
              <div className="footer-section">
                <h3>CV Slayer</h3>
                <p>Making resumes better, one roast at a time.</p>
              </div>
              <div className="footer-section">
                <h4>Contact</h4>
                <p>outlercodie.com@gmail.com</p>
                <p><a href='https://iron-industry.tech'>Iron Industry</a></p>
              </div>
            </div>
            <div className="footer-bottom">
              <p>&copy; 2024 Iron Industry. All rights reserved.</p>
            </div>
          </div>
        </footer>
      </div>
    </ErrorBoundary>
  );
}

export default App;