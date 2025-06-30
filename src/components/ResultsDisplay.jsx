import React, { useState, useCallback, useMemo, useEffect } from 'react';
import './ResultsDisplay.css';

const ResultsDisplay = ({ results, onReset }) => {
  const [activeTab, setActiveTab] = useState('roast');
  const [isSharing, setIsSharing] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [error, setError] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);

  // Enhanced score utilities with validation
  const getScoreColor = useCallback((score) => {
    const validScore = Number(score) || 0;
    if (validScore >= 80) return '#27ae60';
    if (validScore >= 60) return '#f39c12';
    return '#e74c3c';
  }, []);

  const getScoreEmoji = useCallback((score) => {
    const validScore = Number(score) || 0;
    if (validScore >= 80) return '🎉';
    if (validScore >= 60) return '😊';
    return '😅';
  }, []);

  const getScoreDescription = useCallback((score) => {
    const validScore = Number(score) || 0;
    if (validScore >= 80) return "Excellent! Your resume is impressive and well-structured.";
    if (validScore >= 60) return "Good work! There's room for improvement.";
    return "Needs work! But don't worry, we've got suggestions.";
  }, []);

  // Enhanced tab change with validation
  const handleTabChange = useCallback((tabName) => {
    const validTabs = ['roast', 'improvements', 'analysis'];
    if (validTabs.includes(tabName)) {
      setActiveTab(tabName);
      setError('');
    }
  }, []);

  // PRODUCTION FIX - Enhanced print functionality with error handling
  const handlePrint = useCallback(async () => {
    setIsPrinting(true);
    setError('');

    try {
      if (!window.print) {
        throw new Error('Print not supported');
      }

      const printStyles = document.createElement('style');
      printStyles.textContent = `
        @media print {
          .results-actions { display: none !important; }
          .results-tabs { display: none !important; }
          .tab-content { display: block !important; }
          .roast-content, .improvements-content, .analysis-content { 
            display: block !important; 
            page-break-inside: avoid;
          }
          body { print-color-adjust: exact; }
        }
      `;
      document.head.appendChild(printStyles);

      await new Promise(resolve => setTimeout(resolve, 100));
      window.print();

      setTimeout(() => {
        if (document.head.contains(printStyles)) {
          document.head.removeChild(printStyles);
        }
      }, 1000);

    } catch (error) {
      // PRODUCTION FIX - Generic error message
      setError('Print failed. Please try again.');
    } finally {
      setIsPrinting(false);
    }
  }, []);

  // PRODUCTION FIX - Sanitized clipboard functionality
  const copyToClipboard = useCallback(async (text) => {
    try {
      // Sanitize text before copying
      const sanitizedText = typeof text === 'string' ? text.substring(0, 1000) : '';
      
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(sanitizedText);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = sanitizedText;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 3000);
      
    } catch (error) {
      // PRODUCTION FIX - Generic error message
      setError('Copy failed. Please try again.');
    }
  }, []);

  // Enhanced reset handler with confirmation
  const handleReset = useCallback(() => {
    if (window.confirm('Analyze another resume? This will clear current results.')) {
      onReset();
    }
  }, [onReset]);

  // Keyboard navigation support
  const handleKeyDown = useCallback((event, action) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      action();
    }
  }, []);

  // PRODUCTION FIX - XSS Protection for text content
  const sanitizeText = useCallback((text) => {
    if (typeof text !== 'string') return '';
    return text
      .replace(/[<>]/g, '') // Remove HTML tags
      .substring(0, 2000) // Limit length
      .split('\n')
      .filter(line => line.trim().length > 0)
      .slice(0, 50); // Limit lines
  }, []);

  // Input validation and sanitization
  const sanitizedScore = useMemo(() => {
    if (!results || !results.score) return 0;
    const numScore = Number(results.score);
    return isNaN(numScore) ? 0 : Math.max(0, Math.min(100, Math.round(numScore)));
  }, [results]);

  const sanitizedFileName = useMemo(() => {
    if (!results || !results.originalFileName) return 'Unknown File';
    const fileName = results.originalFileName;
    if (typeof fileName !== 'string') return 'Unknown File';
    return fileName.length > 50 ? 
      fileName.substring(0, 47) + '...' : 
      fileName;
  }, [results]);

  // PRODUCTION FIX - Enhanced share functionality
  const handleShare = useCallback(async () => {
    setIsSharing(true);
    setError('');

    try {
      const shareData = {
        title: 'CV Slayer Results',
        text: `I scored ${sanitizedScore}/100 on my resume analysis! Try CV Slayer for professional feedback.`,
        url: window.location.origin
      };

      if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
        await navigator.share(shareData);
      } else {
        await copyToClipboard(shareData.text + ' ' + shareData.url);
      }

    } catch (error) {
      if (error.name === 'AbortError') {
        return;
      }
      // PRODUCTION FIX - Generic error message
      setError('Share failed. Please try again.');
    } finally {
      setIsSharing(false);
    }
  }, [sanitizedScore, copyToClipboard]);

  // PRODUCTION FIX - Validate and sanitize improvements array
  const validImprovements = useMemo(() => {
    if (!results || !Array.isArray(results.improvements)) return [];
    
    return results.improvements
      .filter(imp => imp && typeof imp === 'object')
      .map(improvement => ({
        priority: ['high', 'medium', 'low'].includes(improvement.priority) 
          ? improvement.priority 
          : 'medium',
        title: typeof improvement.title === 'string' 
          ? improvement.title.replace(/[<>]/g, '').substring(0, 100) 
          : 'Improvement',
        description: typeof improvement.description === 'string' 
          ? improvement.description.replace(/[<>]/g, '').substring(0, 300) 
          : '',
        example: typeof improvement.example === 'string' 
          ? improvement.example.replace(/[<>]/g, '').substring(0, 200) 
          : ''
      }))
      .slice(0, 10);
  }, [results]);

  // PRODUCTION FIX - Validate and sanitize strengths/weaknesses
  const validStrengths = useMemo(() => {
    if (!results || !Array.isArray(results.strengths)) return [];
    return results.strengths
      .filter(item => typeof item === 'string' && item.trim().length > 0)
      .map(item => item.replace(/[<>]/g, '').substring(0, 150))
      .slice(0, 8);
  }, [results]);

  const validWeaknesses = useMemo(() => {
    if (!results || !Array.isArray(results.weaknesses)) return [];
    return results.weaknesses
      .filter(item => typeof item === 'string' && item.trim().length > 0)
      .map(item => item.replace(/[<>]/g, '').substring(0, 150))
      .slice(0, 8);
  }, [results]);

  // Auto-clear error messages
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Validate results prop
  if (!results) return null;

  // Destructure with safe defaults
  const {
    roastFeedback = '',
    score = 0
  } = results;

  return (
    <div className="results-container" role="main" aria-label="Resume analysis results">
      {/* PRODUCTION FIX - Error notification */}
      {error && (
        <div className="error-notification" role="alert" aria-live="polite">
          <span>⚠️ {error}</span>
          <button 
            onClick={() => setError('')}
            className="error-close"
            aria-label="Close error message"
          >
            ×
          </button>
        </div>
      )}

      {/* Success notification */}
      {copySuccess && (
        <div className="success-notification" role="alert" aria-live="polite">
          <span>✅ Copied to clipboard!</span>
        </div>
      )}

      {/* MOBILE OPTIMIZED - Score Section */}
      <div className="score-section">
        <div 
          className="score-circle" 
          style={{ borderColor: getScoreColor(sanitizedScore) }}
          role="img"
          aria-label={`Resume score: ${sanitizedScore} out of 100`}
        >
          <span 
            className="score-number" 
            style={{ color: getScoreColor(sanitizedScore) }}
          >
            {sanitizedScore}
          </span>
          <span className="score-label">/ 100</span>
        </div>
        <div className="score-description">
          <h3>Overall Resume Rating {getScoreEmoji(sanitizedScore)}</h3>
          <p>{getScoreDescription(sanitizedScore)}</p>
        </div>
      </div>

      {/* MOBILE OPTIMIZED - Tab Navigation */}
      <div className="results-tabs" role="tablist" aria-label="Result sections">
        <button 
          className={`tab-button ${activeTab === 'roast' ? 'active' : ''}`}
          onClick={() => handleTabChange('roast')}
          role="tab"
          aria-selected={activeTab === 'roast'}
        >
          🔥 Roast
        </button>
        <button 
          className={`tab-button ${activeTab === 'improvements' ? 'active' : ''}`}
          onClick={() => handleTabChange('improvements')}
          role="tab"
          aria-selected={activeTab === 'improvements'}
        >
          💡 Tips ({validImprovements.length})
        </button>
        <button 
          className={`tab-button ${activeTab === 'analysis' ? 'active' : ''}`}
          onClick={() => handleTabChange('analysis')}
          role="tab"
          aria-selected={activeTab === 'analysis'}
        >
          📊 Analysis
        </button>
      </div>

      {/* PRODUCTION FIX - Sanitized Tab Content */}
      <div className="tab-content">
        {activeTab === 'roast' && (
          <div className="roast-content" role="tabpanel">
            <div className="roast-feedback">
              <h3>🔥 AI Feedback</h3>
              <div className="feedback-text">
                {sanitizeText(roastFeedback).length > 0 ? (
                  sanitizeText(roastFeedback).map((paragraph, index) => (
                    <p key={index}>{paragraph}</p>
                  ))
                ) : (
                  <p className="no-content">No feedback available.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'improvements' && (
          <div className="improvements-content" role="tabpanel">
            <h3>💡 Suggested Improvements</h3>
            <div className="improvements-list">
              {validImprovements.length > 0 ? (
                validImprovements.map((improvement, index) => (
                  <div key={index} className="improvement-item">
                    <div className="improvement-priority">
                      {improvement.priority === 'high' && '🔴'}
                      {improvement.priority === 'medium' && '🟡'}
                      {improvement.priority === 'low' && '🟢'}
                    </div>
                    <div className="improvement-content">
                      <h4>{improvement.title}</h4>
                      <p>{improvement.description}</p>
                      {improvement.example && (
                        <div className="improvement-example">
                          <strong>Example:</strong> {improvement.example}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <p className="no-content">No suggestions available.</p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'analysis' && (
          <div className="analysis-content" role="tabpanel">
            <div className="analysis-grid">
              <div className="strengths-section">
                <h3>✅ Strengths ({validStrengths.length})</h3>
                {validStrengths.length > 0 ? (
                  <ul className="strengths-list">
                    {validStrengths.map((strength, index) => (
                      <li key={index}>{strength}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="no-content">No strengths identified.</p>
                )}
              </div>
              
              <div className="weaknesses-section">
                <h3>❌ Areas to Improve ({validWeaknesses.length})</h3>
                {validWeaknesses.length > 0 ? (
                  <ul className="weaknesses-list">
                    {validWeaknesses.map((weakness, index) => (
                      <li key={index}>{weakness}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="no-content">No areas identified.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MOBILE OPTIMIZED - Action Buttons */}
      <div className="results-actions">
        <button 
          className="action-button secondary" 
          onClick={handleReset}
          aria-label="Analyze another resume"
        >
          🔄 Try Another
        </button>
        
        <button 
          className={`action-button primary ${isPrinting ? 'loading' : ''}`}
          onClick={handlePrint}
          disabled={isPrinting}
          aria-label="Download report"
        >
          {isPrinting ? 'Preparing...' : '📄 Download'}
        </button>
        
        <button 
          className={`action-button primary ${isSharing ? 'loading' : ''}`}
          onClick={handleShare}
          disabled={isSharing}
          aria-label="Share results"
        >
          {isSharing ? 'Sharing...' : '📤 Share'}
        </button>
      </div>
    </div>
  );
};

export default React.memo(ResultsDisplay);