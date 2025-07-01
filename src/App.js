import React, { useState, useCallback, useMemo, useEffect } from 'react';
import './App.css';
import Navbar from './components/Navbar';
import ResultsDisplay from './components/ResultsDisplay';
import AdminPanel from './components/AdminPanel';

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

  // Enhanced file validation with better error messages
  const validateFile = useCallback((file) => {
    if (!file) return 'Please select a file';
    
    const allowedTypes = [
      'application/pdf', 
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 
      'application/msword'
    ];
    const maxSize = 5 * 1024 * 1024; // 5MB
    
    if (!allowedTypes.includes(file.type)) {
      return 'Please upload only PDF or Word documents (.pdf, .doc, .docx)';
    }
    
    if (file.size > maxSize) {
      return 'File size must be less than 5MB. Please compress your file and try again.';
    }
    
    if (file.size === 0) {
      return 'The selected file appears to be empty. Please select a valid resume file.';
    }
    
    return null;
  }, []);

  // Enhanced file change handler with cleanup
  const handleFileChange = useCallback((e) => {
    const file = e.target.files[0];
    setError('');
    
    if (file) {
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        setSelectedFile(null);
        // Clear the file input
        e.target.value = '';
        return;
      }
      setSelectedFile(file);
    } else {
      setSelectedFile(null);
    }
  }, [validateFile]);

  // Enhanced input change handler with validation
  const handleInputChange = useCallback((e) => {
    const { name, value } = e.target;
    
    // Validate input values
    const validValues = {
      gender: ['male', 'female', 'other'],
      roastLevel: ['pyar', 'ache', 'dhang'],
      roastType: ['funny', 'serious', 'sarcastic', 'motivational'],
      language: ['english', 'hindi', 'hinglish']
    };
    
    if (validValues[name] && validValues[name].includes(value)) {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
      setError(''); // Clear any existing errors
    }
  }, []);

  // Enhanced reset handler with complete cleanup
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
    
    // Clear file input if it exists
    const fileInput = document.getElementById('resumeFile');
    if (fileInput) {
      fileInput.value = '';
    }
  }, []);

  // Enhanced submit function with proper error handling and API configuration
  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    
    // Validation checks
    if (!agreedToTerms) {
      setError('Please accept our Terms & Conditions and Privacy Policy to continue');
      return;
    }
    
    if (!selectedFile) {
      setError('Please select a resume file to analyze');
      return;
    }
    
    // Additional file validation before submission
    const validationError = validateFile(selectedFile);
    if (validationError) {
      setError(validationError);
      return;
    }
    
    setIsLoading(true);
    setError('');
    setLoadingStep('uploading');

    try {
      // Prepare form data with validated inputs
      const formDataToSend = new FormData();
      formDataToSend.append('resume', selectedFile);
      formDataToSend.append('gender', formData.gender);
      formDataToSend.append('roastLevel', formData.roastLevel);
      formDataToSend.append('roastType', formData.roastType);
      formDataToSend.append('language', formData.language);
      formDataToSend.append('consentGiven', 'true');
      formDataToSend.append('termsAccepted', 'true');

      setLoadingStep('analyzing');

      // Production-ready API URL configuration
      const getApiUrl = () => {
        if (process.env.NODE_ENV === 'production') {
          // For production deployment
          return `${window.location.origin}/api/resume/analyze`;
        } else {
          // For development
          return process.env.REACT_APP_API_URL 
            ? `${process.env.REACT_APP_API_URL}/resume/analyze`
            : 'http://localhost:5000/api/resume/analyze';
        }
      };

      const apiUrl = getApiUrl();

      // Make API request with proper error handling
      const response = await fetch(apiUrl, {
        method: 'POST',
        body: formDataToSend,
        headers: {
          'Accept': 'application/json',
        },
        // Add timeout for production
        signal: AbortSignal.timeout ? AbortSignal.timeout(60000) : undefined
      });

      setLoadingStep('processing');

      // Enhanced response handling
      if (!response.ok) {
        let errorMessage = 'Analysis failed. Please try again.';
        
        try {
          const errorData = await response.json();
          errorMessage = errorData.error?.message || errorMessage;
        } catch (parseError) {
          // If response is not JSON, use status-based error
          switch (response.status) {
            case 400:
              errorMessage = 'Invalid file or request. Please check your file and try again.';
              break;
            case 413:
              errorMessage = 'File too large. Please use a file smaller than 5MB.';
              break;
            case 429:
              errorMessage = 'Too many requests. Please wait a few minutes and try again.';
              break;
            case 500:
              errorMessage = 'Server error. Please try again later.';
              break;
            case 503:
              errorMessage = 'Service temporarily unavailable. Please try again later.';
              break;
            default:
              errorMessage = `Server error (${response.status}). Please try again.`;
          }
        }
        
        throw new Error(errorMessage);
      }

      const result = await response.json();

      // Validate response structure
      if (!result.success || !result.data) {
        throw new Error(result.error?.message || 'Invalid response from server. Please try again.');
      }

      // Validate required fields in response
      const requiredFields = ['roastFeedback', 'score'];
      const missingFields = requiredFields.filter(field => !result.data[field]);
      
      if (missingFields.length > 0) {
        throw new Error('Incomplete analysis received. Please try again.');
      }

      setLoadingStep('complete');
      
      // Delay result display for better UX
      setTimeout(() => {
        setResults(result.data);
        setIsLoading(false);
        setLoadingStep('');
      }, 800);

    } catch (error) {
      // Enhanced error handling
      let userFriendlyMessage;
      
      if (error.name === 'AbortError') {
        userFriendlyMessage = 'Request timed out. Please try again with a smaller file.';
      } else if (error.message.includes('fetch')) {
        userFriendlyMessage = 'Cannot connect to server. Please check your internet connection and try again.';
      } else if (error.message.includes('NetworkError')) {
        userFriendlyMessage = 'Network error. Please check your connection and try again.';
      } else {
        userFriendlyMessage = error.message || 'An unexpected error occurred. Please try again.';
      }
      
      setError(userFriendlyMessage);
      setIsLoading(false);
      setLoadingStep('');
    }
  }, [selectedFile, formData, agreedToTerms, validateFile]);

  // Auto-clear errors after 10 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 10000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Enhanced admin route check with proper routing
  const isAdminRoute = useMemo(() => {
    return window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/');
  }, []);
  
  if (isAdminRoute) {
    return <AdminPanel />;
  }

  // Show results if available
  if (results) {
    return (
      <div className="app">
        <Navbar />
        <div style={{ padding: '80px 20px 40px' }}>
          <ResultsDisplay results={results} onReset={handleReset} />
        </div>
      </div>
    );
  }

  // Enhanced loading component with proper step progression
  if (isLoading) {
    const getLoadingMessage = () => {
      const messages = {
        hindi: {
          uploading: '📤 आपका resume upload हो रहा है...',
          analyzing: '🔍 AI आपका resume पढ़ रहा है...',
          processing: '🤖 Feedback तैयार हो रहा है...',
          complete: '✅ Roast तैयार है!'
        },
        hinglish: {
          uploading: '📤 Tumhara resume upload ho raha hai...',
          analyzing: '🔍 AI tumhara resume dekh raha hai...',
          processing: '🤖 Roast ready ho raha hai...',
          complete: '✅ Ho gaya bhai!'
        },
        english: {
          uploading: '📤 Uploading your resume...',
          analyzing: '🔍 AI is analyzing your content...',
          processing: '🤖 Generating feedback...',
          complete: '✅ Analysis complete!'
        }
      };
      
      return messages[formData.language]?.[loadingStep] || messages.english[loadingStep] || 'Processing...';
    };

    const getProgressPercentage = () => {
      const percentages = {
        uploading: 25,
        analyzing: 50,
        processing: 75,
        complete: 100
      };
      return percentages[loadingStep] || 0;
    };

    return (
      <div className="app">
        <Navbar />
        <div className="loading-container">
          <div className="loading-animation">
            <div className="roast-loading">
              <div className="fire-animation">🔥</div>
              <div className="ai-avatar">🤖</div>
              <div className="resume-icon">📄</div>
            </div>
            
            <div className="loading-progress">
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${getProgressPercentage()}%` }}
                ></div>
              </div>
              <div className="loading-steps">
                <div className={`step ${['uploading', 'analyzing', 'processing', 'complete'].includes(loadingStep) ? 'active' : ''}`}>
                  <span className="step-icon">📤</span>
                  <span className="step-text">Uploading</span>
                </div>
                <div className={`step ${['analyzing', 'processing', 'complete'].includes(loadingStep) ? 'active' : ''}`}>
                  <span className="step-icon">🔍</span>
                  <span className="step-text">Analyzing</span>
                </div>
                <div className={`step ${['processing', 'complete'].includes(loadingStep) ? 'active' : ''}`}>
                  <span className="step-icon">🤖</span>
                  <span className="step-text">Processing</span>
                </div>
                <div className={`step ${loadingStep === 'complete' ? 'active' : ''}`}>
                  <span className="step-icon">💬</span>
                  <span className="step-text">Complete</span>
                </div>
              </div>
              <div className="loading-percentage">
                {getProgressPercentage()}%
              </div>
            </div>
          </div>
          
          <div className="loading-content">
            <h2 className="loading-title">
              {getLoadingMessage()}
            </h2>
            
            <div className="loading-messages">
              {formData.roastLevel === 'dhang' && (
                <div className="roast-preview savage">
                  {formData.language === 'hindi' && (
                    <p>"तैयार हो जाओ, कड़वी सच्चाई सुनने के लिए! 😤"</p>
                  )}
                  {formData.language === 'hinglish' && (
                    <p>"Ready ho jao, brutal feedback aa raha hai! 😈"</p>
                  )}
                  {formData.language === 'english' && (
                    <p>"Brace yourself for some brutal honesty! 😤"</p>
                  )}
                </div>
              )}
              
              {formData.roastLevel === 'ache' && (
                <div className="roast-preview balanced">
                  {formData.language === 'hindi' && (
                    <p>"संतुलित feedback मिलेगा - अच्छा और बुरा दोनों! 🤔"</p>
                  )}
                  {formData.language === 'hinglish' && (
                    <p>"Balanced feedback milega - achha aur bura dono! 🤔"</p>
                  )}
                  {formData.language === 'english' && (
                    <p>"Preparing balanced feedback with pros and cons! 🤔"</p>
                  )}
                </div>
              )}
              
              {formData.roastLevel === 'pyar' && (
                <div className="roast-preview gentle">
                  {formData.language === 'hindi' && (
                    <p>"प्यार से feedback दे रहे हैं, चिंता मत करो! 😊"</p>
                  )}
                  {formData.language === 'hinglish' && (
                    <p>"Pyaar se feedback de rahe hain, tension nahi! 😊"</p>
                  )}
                  {formData.language === 'english' && (
                    <p>"Preparing gentle, constructive feedback! 😊"</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <Navbar />
      
      {/* Hero Section */}
      <section id="home" className="hero">
        <div className="container">
          <div className="hero-content">
            <h1 className="hero-title">
              CV Slayer
            </h1>
            <p className="hero-subtitle">
              Brutally Honest Resume Roaster with AI-Powered Feedback
            </p>
            <p className="hero-description">
              Get personalized feedback on your resume with humor, honesty, and actionable improvement suggestions.
            </p>
            <a href="#upload" className="cta-button">
              Start Roasting 🔥
            </a>
          </div>
          <div className="hero-visual">
            <div className="floating-resume">📄</div>
            <div className="floating-fire">🔥</div>
            <div className="floating-ai">🤖</div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="features">
        <div className="container">
          <h2>Why Choose CV Slayer?</h2>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">🤖</div>
              <h3>AI-Powered Analysis</h3>
              <p>Advanced AI analyzes your resume content and structure</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🎭</div>
              <h3>Multiple Styles</h3>
              <p>Choose from funny, serious, or sarcastic feedback</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🌍</div>
              <h3>Multi-Language</h3>
              <p>Get feedback in English, Hindi, or Hinglish</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">💡</div>
              <h3>Actionable Tips</h3>
              <p>Receive specific suggestions to improve your resume</p>
            </div>
          </div>
        </div>
      </section>

      {/* Upload Section */}
      <section id="upload" className="upload-section">
        <div className="container">
          <h2>Upload Your Resume</h2>
          
          {error && (
            <div className="error-message" role="alert" aria-live="polite">
              <span>⚠️ {error}</span>
              <button 
                className="error-close"
                onClick={() => setError('')}
                aria-label="Close error message"
                type="button"
              >
                ×
              </button>
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="upload-form" noValidate>
            <div className="form-group">
              <label htmlFor="resumeFile" className="file-label">
                <div className="file-icon">📁</div>
                <span className="file-text">
                  {selectedFile ? selectedFile.name : "Choose Resume (PDF/DOCX)"}
                </span>
              </label>
              <input 
                type="file" 
                id="resumeFile" 
                accept=".pdf,.docx,.doc"
                onChange={handleFileChange}
                required
                disabled={isLoading}
                aria-describedby="file-hint"
              />
              <small id="file-hint" className="file-hint">
                Max file size: 5MB. Supported formats: PDF, DOC, DOCX
              </small>
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="gender">Gender</label>
                <select 
                  id="gender"
                  name="gender" 
                  value={formData.gender} 
                  onChange={handleInputChange}
                  disabled={isLoading}
                  required
                >
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other/Neutral</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="roastLevel">Roast Level</label>
                <select 
                  id="roastLevel"
                  name="roastLevel" 
                  value={formData.roastLevel} 
                  onChange={handleInputChange}
                  disabled={isLoading}
                  required
                >
                  <option value="pyar">Gentle</option>
                  <option value="ache">Balanced</option>
                  <option value="dhang">Savage</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="roastType">Style</label>
                <select 
                  id="roastType"
                  name="roastType" 
                  value={formData.roastType} 
                  onChange={handleInputChange}
                  disabled={isLoading}
                  required
                >
                  <option value="funny">Funny</option>
                  <option value="serious">Serious</option>
                  <option value="sarcastic">Sarcastic</option>
                  <option value="motivational">Motivational</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="language">Language</label>
                <select 
                  id="language"
                  name="language" 
                  value={formData.language} 
                  onChange={handleInputChange}
                  disabled={isLoading}
                  required
                >
                  <option value="english">English</option>
                  <option value="hindi">Hindi</option>
                  <option value="hinglish">Hinglish</option>
                </select>
              </div>
            </div>

            {/* Terms & Conditions Section */}
            <div className="terms-section">
              <div className="terms-checkbox">
                <input 
                  type="checkbox" 
                  id="agreeTerms" 
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  disabled={isLoading}
                  required
                  aria-describedby="terms-description"
                />
                <label htmlFor="agreeTerms" className="terms-label">
                  <span id="terms-description">
                    I acknowledge and agree to the processing of my resume data as outlined in our
                  </span>
                  <br />
                  <button 
                    type="button" 
                    className="terms-link"
                    onClick={() => setShowTermsModal(true)}
                    disabled={isLoading}
                    aria-label="Open Terms of Service and Privacy Policy"
                  >
                    Terms of Service & Privacy Policy
                  </button>
                </label>
              </div>
            </div>

            <button 
              type="submit" 
              className="submit-button" 
              disabled={!selectedFile || !agreedToTerms || isLoading}
              aria-describedby="submit-status"
            >
              {isLoading ? 'Analyzing...' : 'Roast My Resume!'}
            </button>
            <div id="submit-status" className="sr-only">
              {isLoading ? 'Analysis in progress' : 'Ready to submit'}
            </div>
          </form>
        </div>
      </section>

      {/* Terms Modal */}
      {showTermsModal && (
        <div 
          className="modal-overlay" 
          onClick={() => setShowTermsModal(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 id="modal-title">Terms of Service & Privacy Policy</h2>
              <button 
                className="modal-close"
                onClick={() => setShowTermsModal(false)}
                aria-label="Close modal"
                type="button"
              >
                ×
              </button>
            </div>
            
            <div className="modal-body">
              <div className="terms-content">
                <section className="terms-section-modal">
                  <h3>🔐 Data Processing & Privacy Notice</h3>
                  <p>
                    Welcome to CV Slayer. By using our services, you agree to our data processing practices 
                    for resume analysis and feedback generation.
                  </p>
                </section>

                <section className="terms-section-modal">
                  <h3>📄 Document Processing</h3>
                  <p>
                    Your resume is temporarily processed for analysis. Files are automatically deleted 
                    after processing. Analysis results may be retained for service improvement.
                  </p>
                </section>

                <section className="terms-section-modal">
                  <h3>🤖 AI Processing</h3>
                  <p>
                    We use AI to analyze your resume content and provide feedback. Your data helps 
                    improve our services through anonymized learning.
                  </p>
                </section>

                <section className="terms-section-modal">
                  <h3>📞 Contact</h3>
                  <p>
                    For questions about data processing, contact: outlercodie.com@gmail.com
                  </p>
                </section>

                <div className="terms-footer">
                  <p><strong>Last Updated:</strong> December 2024</p>
                  <p><strong>Service Provider:</strong> Iron Industry</p>
                </div>
              </div>
            </div>
            
            <div className="modal-footer">
              <button 
                className="btn-secondary"
                onClick={() => setShowTermsModal(false)}
                type="button"
              >
                Close
              </button>
              <button 
                className="btn-primary"
                onClick={() => {
                  setAgreedToTerms(true);
                  setShowTermsModal(false);
                }}
                type="button"
              >
                Accept Terms
              </button>
            </div>
          </div>
        </div>
      )}

      {/* How It Works Section */}
      <section id="how-it-works" className="how-it-works">
        <div className="container">
          <h2>How It Works</h2>
          <div className="steps-container">
            <div className="step">
              <div className="step-number">1</div>
              <div className="step-content">
                <h3>Upload</h3>
                <p>Upload your resume file securely</p>
              </div>
            </div>
            <div className="step">
              <div className="step-number">2</div>
              <div className="step-content">
                <h3>Customize</h3>
                <p>Choose your preferences</p>
              </div>
            </div>
            <div className="step">
              <div className="step-number">3</div>
              <div className="step-content">
                <h3>Analyze</h3>
                <p>AI processes your resume</p>
              </div>
            </div>
            <div className="step">
              <div className="step-number">4</div>
              <div className="step-content">
                <h3>Results</h3>
                <p>Get detailed feedback</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Sample Roasts */}
      <section id="examples" className="sample-roasts">
        <div className="container">
          <h2>Sample Feedback</h2>
          <div className="roast-examples">
            <div className="roast-card">
              <h4>Funny Style</h4>
              <blockquote>
                "Bhai, 'Microsoft Office expert' likhne se tu Excel ka Picasso nahi ban jata. 
                Try adding some actual achievements! 🤷‍♂️"
              </blockquote>
              <div className="suggestion">
                <strong>Suggestion:</strong> Quantify your skills with specific examples.
              </div>
            </div>
            
            <div className="roast-card">
              <h4>Serious Style</h4>
              <blockquote>
                "Your resume lacks quantifiable achievements. Instead of 'handled customer service,' 
                specify 'Managed 50+ customer inquiries daily with 95% satisfaction rate.'"
              </blockquote>
              <div className="suggestion">
                <strong>Suggestion:</strong> Use numbers and metrics to demonstrate impact.
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
              <div className="privacy-links">
                <button 
                  className="footer-link"
                  onClick={() => setShowTermsModal(true)}
                  type="button"
                >
                  Privacy Policy
                </button>
                <span>|</span>
                <button 
                  className="footer-link"
                  onClick={() => setShowTermsModal(true)}
                  type="button"
                >
                  Terms of Service
                </button>
              </div>
            </div>
            <div className="footer-section">
              <h4>Contact</h4>
              <p>Email: outlercodie.com@gmail.com</p>
              <p>Website: iron-industry.tech</p>
            </div>
            <div className="footer-section">
              <h4>Iron Industry</h4>
              <p>A startup building innovative solutions</p>
              <p>🔒 Your data is secure with us</p>
            </div>
          </div>
          <div className="footer-bottom">
            <p>&copy; 2024 Iron Industry. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;