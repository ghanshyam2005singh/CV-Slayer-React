import React, { useState, useCallback, useMemo, useEffect } from 'react';
import './App.css';
import Navbar from './components/Navbar';
import ResultsDisplay from './components/ResultsDisplay';
import AdminPanel from './components/AdminPanel';

// Error Boundary Component
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Only log in development
    if (process.env.NODE_ENV === 'development') {
      console.error('Error caught by boundary:', error, errorInfo);
    }
    this.setState({ error: error });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <div className="error-content">
            <div className="error-icon">⚠️</div>
            <h2>Something went wrong</h2>
            <p>We apologize for the inconvenience. Please refresh the page and try again.</p>
            <button 
              onClick={() => window.location.reload()}
              className="error-reload-btn"
            >
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

  // Production API Configuration
  const API_CONFIG = useMemo(() => ({
    baseURL: process.env.NODE_ENV === 'production' 
      ? window.location.origin 
      : process.env.REACT_APP_API_URL || 'http://localhost:5000',
    timeout: 180000, // 3 minutes for production
    maxFileSize: 10 * 1024 * 1024, // 10MB
    allowedTypes: [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword'
    ]
  }), []);

  // Enhanced file validation
  const validateFile = useCallback((file) => {
    if (!file) return 'Please select a resume file';
    
    if (!API_CONFIG.allowedTypes.includes(file.type)) {
      return 'Please upload only PDF or Word documents (.pdf, .doc, .docx)';
    }
    
    if (file.size > API_CONFIG.maxFileSize) {
      return `File size must be less than ${API_CONFIG.maxFileSize / (1024 * 1024)}MB`;
    }
    
    if (file.size === 0) {
      return 'Selected file appears to be empty';
    }
    
    return null;
  }, [API_CONFIG]);

  // Secure file change handler
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

  // Secure input validation
  const handleInputChange = useCallback((e) => {
    const { name, value } = e.target;
    
    const validValues = {
      gender: ['male', 'female', 'other'],
      roastLevel: ['pyar', 'ache', 'dhang'],
      roastType: ['funny', 'serious', 'sarcastic', 'motivational'],
      language: ['english', 'hindi', 'hinglish']
    };
    
    if (validValues[name]?.includes(value)) {
      setFormData(prev => ({ ...prev, [name]: value }));
      setError('');
    }
  }, []);

  // Complete state reset
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

  const statusMessages = {
  400: 'Invalid file or request',
  413: 'File too large',
  409: 'This resume file has already been analyzed. Please upload a different file.',
  429: 'Too many requests. Please wait and try again',
  500: 'Server error. Please try again later',
  503: 'Service temporarily unavailable'
};

  // Production-ready submit handler
  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    
    if (!agreedToTerms) {
      setError('Please accept the Terms & Conditions to continue');
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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.timeout);

    try {
      const formDataToSend = new FormData();
      formDataToSend.append('resume', selectedFile);
      formDataToSend.append('gender', formData.gender);
      formDataToSend.append('roastLevel', formData.roastLevel);
      formDataToSend.append('roastType', formData.roastType);
      formDataToSend.append('language', formData.language);
      formDataToSend.append('consentGiven', 'true');
      formDataToSend.append('termsAccepted', 'true');

      setLoadingStep('analyzing');

      const apiUrl = `${API_CONFIG.baseURL}/api/resume/analyze`;
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        body: formDataToSend,
        signal: controller.signal,
        headers: {
          'Accept': 'application/json'
        }
      });

      clearTimeout(timeoutId);
      setLoadingStep('processing');

      if (!response.ok) {
        let errorMessage = 'Analysis failed. Please try again.';
        
        try {
          const errorData = await response.json();
          errorMessage = errorData.error?.message || errorData.message || errorMessage;
        } catch {
          const statusMessages = {
            400: 'Invalid file or request',
            413: 'File too large',
            429: 'Too many requests. Please wait and try again',
            500: 'Server error. Please try again later',
            503: 'Service temporarily unavailable'
          };
          errorMessage = statusMessages[response.status] || `Error ${response.status}`;
        }
        
        throw new Error(errorMessage);
      }

      const responseText = await response.text();
      let result;
      
      try {
        result = JSON.parse(responseText);
      } catch {
        throw new Error('Invalid server response');
      }

      // Handle both nested and flat response structures
      let processedData;
      if (result.data) {
        processedData = result.data;
      } else if (result.success !== false) {
        processedData = {
          score: result.score,
          roastFeedback: result.roastFeedback,
          improvements: result.improvements || [],
          strengths: result.strengths || [],
          weaknesses: result.weaknesses || []
        };
      } else {
        throw new Error(result.error?.message || 'Analysis failed');
      }

      if (!processedData.roastFeedback && !processedData.score) {
        throw new Error('Incomplete analysis received');
      }

      const finalResults = {
        ...processedData,
        originalFileName: selectedFile.name,
        score: Number(processedData.score) || 0,
        roastFeedback: processedData.roastFeedback || '',
        improvements: Array.isArray(processedData.improvements) ? processedData.improvements : [],
        strengths: Array.isArray(processedData.strengths) ? processedData.strengths : [],
        weaknesses: Array.isArray(processedData.weaknesses) ? processedData.weaknesses : []
      };

      setLoadingStep('complete');
      
      setTimeout(() => {
        setResults(finalResults);
        setIsLoading(false);
        setLoadingStep('');
      }, 1000);

    } catch (error) {
      clearTimeout(timeoutId);
      
      let userMessage;
      if (error.name === 'AbortError') {
        userMessage = 'Request timed out. Please try with a smaller file';
      } else if (error.message.includes('fetch') || error.message.includes('Network')) {
        userMessage = 'Connection failed. Please check your internet and try again';
      } else {
        userMessage = error.message || 'An error occurred. Please try again';
      }
      
      setError(userMessage);
      setIsLoading(false);
      setLoadingStep('');
    }
  }, [selectedFile, formData, agreedToTerms, validateFile, API_CONFIG]);

  // Auto-clear errors
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 8000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Admin route check
  const isAdminRoute = useMemo(() => {
    return window.location.pathname.startsWith('/admin');
  }, []);
  
  if (isAdminRoute) {
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
        hindi: {
          uploading: 'आपका resume upload हो रहा है...',
          analyzing: 'AI आपका resume analyze कर रहा है...',
          processing: 'Feedback तैयार हो रहा है...',
          complete: 'Analysis पूरा हो गया!'
        },
        hinglish: {
          uploading: 'Resume upload ho raha hai...',
          analyzing: 'AI analysis kar raha hai...',
          processing: 'Feedback ready kar rahe hain...',
          complete: 'Bas ho gaya!'
        },
        english: {
          uploading: 'Uploading your resume...',
          analyzing: 'AI is analyzing your resume...',
          processing: 'Generating personalized feedback...',
          complete: 'Analysis complete!'
        }
      };
      
      return messages[formData.language]?.[loadingStep] || messages.english[loadingStep] || 'Processing...';
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
                  
                  <div className="loading-steps">
                    {['uploading', 'analyzing', 'processing', 'complete'].map((step, index) => (
                      <div 
                        key={step}
                        className={`step ${loadingStep === step || index < ['uploading', 'analyzing', 'processing', 'complete'].indexOf(loadingStep) ? 'active' : ''}`}
                      >
                        <div className="step-icon">
                          {step === 'uploading' && '📤'}
                          {step === 'analyzing' && '🔍'}
                          {step === 'processing' && '🤖'}
                          {step === 'complete' && '✅'}
                        </div>
                        <span className="step-label">
                          {step.charAt(0).toUpperCase() + step.slice(1)}
                        </span>
                      </div>
                    ))}
                  </div>
                  
                  <div className="progress-percentage">
                    {getProgressPercentage()}%
                  </div>
                </div>
              </div>
              
              <div className="loading-content">
                <h2 className="loading-title">{getLoadingMessage()}</h2>
                
                <div className="roast-preview">
                  {formData.roastLevel === 'dhang' && (
                    <div className="preview-card savage">
                      <div className="preview-icon">😈</div>
                      <p>
                        {formData.language === 'hindi' && "तैयार हो जाओ कड़वी सच्चाई के लिए!"}
                        {formData.language === 'hinglish' && "Brutal honesty incoming, brace yourself!"}
                        {formData.language === 'english' && "Preparing some brutal honesty..."}
                      </p>
                    </div>
                  )}
                  
                  {formData.roastLevel === 'ache' && (
                    <div className="preview-card balanced">
                      <div className="preview-icon">🤔</div>
                      <p>
                        {formData.language === 'hindi' && "संतुलित feedback तैयार कर रहे हैं"}
                        {formData.language === 'hinglish' && "Balanced feedback aa raha hai"}
                        {formData.language === 'english' && "Preparing balanced feedback..."}
                      </p>
                    </div>
                  )}
                  
                  {formData.roastLevel === 'pyar' && (
                    <div className="preview-card gentle">
                      <div className="preview-icon">😊</div>
                      <p>
                        {formData.language === 'hindi' && "प्यार से feedback दे रहे हैं"}
                        {formData.language === 'hinglish' && "Gentle feedback ban raha hai"}
                        {formData.language === 'english' && "Preparing gentle feedback..."}
                      </p>
                    </div>
                  )}
                </div>
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
                  Get brutally honest AI-powered feedback on your resume with humor, insights, and actionable improvements
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
                <p>Advanced machine learning analyzes content, structure, and ATS compatibility</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">🎭</div>
                <h3>Multiple Personalities</h3>
                <p>Choose from gentle guidance to brutal honesty - whatever motivates you</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">🌍</div>
                <h3>Multi-Language Support</h3>
                <p>Get feedback in English, Hindi, or Hinglish for better understanding</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">💡</div>
                <h3>Actionable Insights</h3>
                <p>Specific, implementable suggestions to improve your resume immediately</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">📊</div>
                <h3>ATS Optimization</h3>
                <p>Ensure your resume passes Applicant Tracking Systems</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">🔒</div>
                <h3>Privacy First</h3>
                <p>Your data is processed securely and never shared</p>
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
                      aria-label="Close error"
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
                        <option value="pyar">😊 Gentle (Supportive)</option>
                        <option value="ache">🤔 Balanced (Honest)</option>
                        <option value="dhang">😈 Savage (Brutal)</option>
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
                    <h4>🔐 Privacy & Data Processing</h4>
                    <p>Your resume is processed temporarily for analysis. Files are automatically deleted after processing. We use industry-standard security measures to protect your data.</p>
                  </section>

                  <section>
                    <h4>🤖 AI Analysis</h4>
                    <p>We use advanced AI to analyze your resume content and provide feedback. Your data helps improve our service through anonymized machine learning.</p>
                  </section>

                  <section>
                    <h4>📞 Contact</h4>
                    <p>For questions about our services: outlercodie.com@gmail.com</p>
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
                <p>Upload your resume securely</p>
              </div>
              <div className="step-card">
                <div className="step-number">2</div>
                <div className="step-icon">⚙️</div>
                <h3>Customize</h3>
                <p>Choose your roasting preferences</p>
              </div>
              <div className="step-card">
                <div className="step-number">3</div>
                <div className="step-icon">🤖</div>
                <h3>Analyze</h3>
                <p>AI processes and analyzes</p>
              </div>
              <div className="step-card">
                <div className="step-number">4</div>
                <div className="step-icon">📊</div>
                <h3>Results</h3>
                <p>Get detailed feedback</p>
              </div>
            </div>
          </div>
        </section>

        {/* Sample Results */}
        <section id="examples"  className="sample-results">
          <div className="container">
            <div className="section-header">
              <h2>Sample Roasts</h2>
              <p>See what different styles look like</p>
            </div>
            <div className="samples-grid">
              <div className="sample-card funny">
                <div className="sample-header">
                  <span className="sample-type">😄 Funny Style</span>
                  <span className="sample-level">Gentle</span>
                </div>
                <blockquote>
                  "Your resume says 'Excel expert' but I bet you still Google how to make pie charts! 😅 Let's add some actual numbers to back up those claims."
                </blockquote>
                <div className="sample-footer">
                  <strong>Focus:</strong> Humor with constructive feedback
                </div>
              </div>
              
              <div className="sample-card savage">
                <div className="sample-header">
                  <span className="sample-type">😈 Savage Style</span>
                  <span className="sample-level">Brutal</span>
                </div>
                <blockquote>
                  "Bhai, tumhara resume dekh ke lagta hai ChatGPT ne 5 minute mein banaya hai. Itna generic content dekh ke recruiter ko neend aa jayegi!"
                </blockquote>
                <div className="sample-footer">
                  <strong>Focus:</strong> Brutal honesty with real talk
                </div>
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
                <div className="footer-links">
                  <button onClick={() => setShowTermsModal(true)}>
                    Privacy Policy
                  </button>
                  <button onClick={() => setShowTermsModal(true)}>
                    Terms of Service
                  </button>
                </div>
              </div>
              <div className="footer-section">
                <h4>Contact</h4>
                <p>outlercodie.com@gmail.com</p>
                <p><a href='https://iron-industry.tech'>Iron Industry</a></p>
              </div>
              <div className="footer-section">
                <h4>Iron Industry</h4>
                <p>Building innovative solutions</p>
                <p>🔒 Your data is secure</p>
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