import React, { useState, useCallback, useMemo, useEffect } from 'react';
import './ResultsDisplay.css';

const ResultsDisplay = ({ results, onReset }) => {
  const [activeTab, setActiveTab] = useState('roast');
  const [isSharing, setIsSharing] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [error, setError] = useState('');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [toasts, setToasts] = useState([]);

  function decodeHtmlEntities(text) {
  const txt = document.createElement('textarea');
  txt.innerHTML = text;
  return txt.value;
}

  // Score calculation with validation
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

  // Validate and sanitize improvements array
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

  // Validate and sanitize strengths/weaknesses
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

  // Toast management system
  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = Date.now() + Math.random();
    const newToast = { id, message, type, duration };
    
    setToasts(prev => [...prev, newToast]);
    
    setTimeout(() => {
      setToasts(prev => prev.filter(toast => toast.id !== id));
    }, duration);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  // Score utilities with clean colors
  const getScoreColor = useCallback((score) => {
    const validScore = Number(score) || 0;
    if (validScore >= 80) return '#2ecc71'; // Clean green
    if (validScore >= 60) return '#f39c12'; // Clean orange
    return '#e74c3c'; // Clean red
  }, []);

  const getScoreEmoji = useCallback((score) => {
    const validScore = Number(score) || 0;
    if (validScore >= 80) return '🎯';
    if (validScore >= 60) return '👍';
    return '💪';
  }, []);

  const getScoreDescription = useCallback((score) => {
    const validScore = Number(score) || 0;
    if (validScore >= 80) return "Outstanding resume! You're ready to impress employers.";
    if (validScore >= 60) return "Good foundation with room for strategic improvements.";
    return "Let's transform your resume into a powerful tool.";
  }, []);

  // Enhanced tab change
  const handleTabChange = useCallback((tabName) => {
    const validTabs = ['roast', 'improvements', 'analysis'];
    if (validTabs.includes(tabName)) {
      setActiveTab(tabName);
      setError('');
    }
  }, []);

  // Enhanced print functionality
  const handlePrint = useCallback(async () => {
    setIsPrinting(true);
    setError('');
    addToast('Preparing your report...', 'info');

    try {
      if (!window.print) {
        throw new Error('Print not supported in this browser');
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
          .toast-container { display: none !important; }
          .confirmation-dialog { display: none !important; }
          body { print-color-adjust: exact; }
          .results-container { box-shadow: none !important; }
        }
      `;
      document.head.appendChild(printStyles);

      await new Promise(resolve => setTimeout(resolve, 100));
      window.print();

      addToast('Report ready for download!', 'success');

      setTimeout(() => {
        if (document.head.contains(printStyles)) {
          document.head.removeChild(printStyles);
        }
      }, 1000);

    } catch (error) {
      addToast('Unable to generate report. Please try again.', 'error');
    } finally {
      setIsPrinting(false);
    }
  }, [addToast]);

  // Enhanced clipboard functionality
  const copyToClipboard = useCallback(async (text) => {
    try {
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
      
      addToast('Copied to clipboard!', 'success');
      
    } catch (error) {
      addToast('Copy failed. Please select and copy manually.', 'error');
    }
  }, [addToast]);

  // Reset handlers
  const handleResetRequest = useCallback(() => {
    setShowResetConfirm(true);
  }, []);

  const handleResetConfirm = useCallback(() => {
    setShowResetConfirm(false);
    addToast('Starting fresh analysis...', 'info');
    onReset();
  }, [onReset, addToast]);

  const handleResetCancel = useCallback(() => {
    setShowResetConfirm(false);
  }, []);

  // Share functionality
  const handleShare = useCallback(async () => {
    setIsSharing(true);
    setError('');
    addToast('Preparing share content...', 'info');

    try {
      const shareData = {
        title: 'CV Slayer Results',
        text: `My resume scored ${sanitizedScore}/100 on CV Slayer! Get professional feedback on your resume too.`,
        url: window.location.origin
      };

      if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
        await navigator.share(shareData);
        addToast('Shared successfully!', 'success');
      } else {
        await copyToClipboard(shareData.text + ' ' + shareData.url);
        addToast('Share link copied to clipboard!', 'success');
      }

    } catch (error) {
      if (error.name === 'AbortError') {
        addToast('Share cancelled', 'info', 2000);
        return;
      }
      addToast('Share failed. Content copied to clipboard instead.', 'warning');
      await copyToClipboard(`My resume scored ${sanitizedScore}/100 on CV Slayer! ${window.location.origin}`);
    } finally {
      setIsSharing(false);
    }
  }, [sanitizedScore, copyToClipboard, addToast]);

  // XSS Protection for text content
  const sanitizeText = useCallback((text) => {
    if (typeof text !== 'string') return [];
    return text
      .replace(/[<>]/g, '')
      .substring(0, 2000)
      .split('\n')
      .filter(line => line.trim().length > 0)
      .slice(0, 50);
  }, []);

  // Auto-clear error messages
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Keyboard event listener for escape key
  useEffect(() => {
    const handleEscapeKey = (event) => {
      if (event.key === 'Escape' && showResetConfirm) {
        handleResetCancel();
      }
    };

    document.addEventListener('keydown', handleEscapeKey);
    return () => document.removeEventListener('keydown', handleEscapeKey);
  }, [showResetConfirm, handleResetCancel]);

  // Early validation
  if (!results) {
    return (
      <div className="results-error">
        <div className="error-icon">📄</div>
        <h3>No Results Available</h3>
        <p>The analysis results could not be loaded. Please try analyzing your resume again.</p>
        <button onClick={onReset} className="action-button primary">
          <span className="button-icon">🔄</span>
          Try Again
        </button>
      </div>
    );
  }

  // Destructure with safe defaults
  const {
    roastFeedback = '',
    score = 0
  } = results;

  return (
    <div className="results-container" role="main" aria-label="Resume analysis results">
      {/* Toast Notification System */}
      <div className="toast-container" aria-live="polite">
        {toasts.map((toast) => (
          <div 
            key={toast.id}
            className={`toast toast-${toast.type}`}
            role="alert"
          >
            <div className="toast-content">
              <span className="toast-icon">
                {toast.type === 'success' && '✓'}
                {toast.type === 'error' && '✕'}
                {toast.type === 'warning' && '!'}
                {toast.type === 'info' && 'i'}
              </span>
              <span className="toast-message">{toast.message}</span>
            </div>
            <button 
              className="toast-close"
              onClick={() => removeToast(toast.id)}
              aria-label="Close notification"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Confirmation Dialog */}
      {showResetConfirm && (
        <div className="confirmation-overlay" role="dialog" aria-modal="true">
          <div className="confirmation-dialog">
            <div className="dialog-header">
              <h3>Start New Analysis?</h3>
            </div>
            <div className="dialog-content">
              <p>This will clear your current results and start a new resume analysis.</p>
              <p><strong>Are you sure you want to continue?</strong></p>
            </div>
            <div className="dialog-actions">
              <button 
                className="dialog-button secondary"
                onClick={handleResetCancel}
                autoFocus
              >
                Cancel
              </button>
              <button 
                className="dialog-button primary"
                onClick={handleResetConfirm}
              >
                Yes, Start New
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header Section */}
      <div className="results-header">
        <div className="header-info">
          <h1 className="results-title">Resume Analysis Complete</h1>
          <p className="file-name">Analysis for: <strong>{sanitizedFileName}</strong></p>
        </div>
        <div className="header-actions">
          <button 
            className="action-button secondary small" 
            onClick={handleResetRequest}
            aria-label="Analyze another resume"
          >
            <span className="button-icon">🔄</span>
            New Analysis
          </button>
        </div>
      </div>

      {/* Score Section */}
      <div className="score-section">
        <div className="score-container">
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
          <div className="score-details">
            <h2 className="score-title">
              Overall Resume Score {getScoreEmoji(sanitizedScore)}
            </h2>
            <p className="score-description">{getScoreDescription(sanitizedScore)}</p>
            <div className="score-breakdown">
              <div className="score-bar">
                <div 
                  className="score-fill" 
                  style={{ 
                    width: `${sanitizedScore}%`,
                    backgroundColor: getScoreColor(sanitizedScore)
                  }}
                />
              </div>
              <div className="score-labels">
                <span className="label-start">0</span>
                <span className="label-middle">50</span>
                <span className="label-end">100</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="results-tabs" role="tablist" aria-label="Result sections">
        <button 
          className={`tab-button ${activeTab === 'roast' ? 'active' : ''}`}
          onClick={() => handleTabChange('roast')}
          role="tab"
          aria-selected={activeTab === 'roast'}
        >
          <span className="tab-icon">🔥</span>
          <span className="tab-text">Feedback</span>
        </button>
        <button 
          className={`tab-button ${activeTab === 'improvements' ? 'active' : ''}`}
          onClick={() => handleTabChange('improvements')}
          role="tab"
          aria-selected={activeTab === 'improvements'}
        >
          <span className="tab-icon">💡</span>
          <span className="tab-text">Improvements</span>
          <span className="tab-count">({validImprovements.length})</span>
        </button>
        <button 
          className={`tab-button ${activeTab === 'analysis' ? 'active' : ''}`}
          onClick={() => handleTabChange('analysis')}
          role="tab"
          aria-selected={activeTab === 'analysis'}
        >
          <span className="tab-icon">📊</span>
          <span className="tab-text">Analysis</span>
        </button>
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {activeTab === 'roast' && (
          <div className="roast-content" role="tabpanel">
            <div className="content-section">
              <div className="section-header">
                <h3>
                  <span className="section-icon">🔥</span>
                  Professional Feedback
                </h3>
                <p>Honest insights to help improve your resume</p>
              </div>
              <div className="feedback-text">
                {sanitizeText(roastFeedback).length > 0 ? (
                  <div className="feedback-content">
                    {sanitizeText(decodeHtmlEntities(roastFeedback)).map((paragraph, index) => (
  <p key={index} className="feedback-paragraph">{paragraph}</p>
))}
                  </div>
                ) : (
                  <div className="no-content">
                    <span className="no-content-icon">📝</span>
                    <p>No feedback available for this analysis.</p>
                  </div>
                )}
              </div>
              <div className="section-actions">
                <button 
                  className="action-button secondary"
                  onClick={() => copyToClipboard(roastFeedback)}
                >
                  <span className="button-icon">📋</span>
                  Copy Feedback
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'improvements' && (
          <div className="improvements-content" role="tabpanel">
            <div className="content-section">
              <div className="section-header">
                <h3>
                  <span className="section-icon">💡</span>
                  Improvement Suggestions
                </h3>
                <p>Actionable steps to enhance your resume</p>
              </div>
              <div className="improvements-list">
                {validImprovements.length > 0 ? (
                  validImprovements.map((improvement, index) => (
                    <div key={index} className={`improvement-item priority-${improvement.priority}`}>
                      <div className="improvement-header">
                        <div className="improvement-priority">
                          <span className="priority-indicator">
                            {improvement.priority === 'high' && '🔴'}
                            {improvement.priority === 'medium' && '🟡'}
                            {improvement.priority === 'low' && '🟢'}
                          </span>
                          <span className="priority-text">
                            {improvement.priority.charAt(0).toUpperCase() + improvement.priority.slice(1)} Priority
                          </span>
                        </div>
                      </div>
                      <div className="improvement-content">
                        <h4 className="improvement-title">{improvement.title}</h4>
                        <p className="improvement-description">{improvement.description}</p>
                        {improvement.example && (
                          <div className="improvement-example">
                            <strong>Example:</strong> {improvement.example}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="no-content">
                    <span className="no-content-icon">✨</span>
                    <p>No specific improvements identified. Your resume looks good!</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'analysis' && (
          <div className="analysis-content" role="tabpanel">
            <div className="content-section">
              <div className="section-header">
                <h3>
                  <span className="section-icon">📊</span>
                  Detailed Analysis
                </h3>
                <p>Comprehensive breakdown of strengths and areas for improvement</p>
              </div>
              <div className="analysis-grid">
                <div className="strengths-section">
                  <div className="subsection-header">
                    <h4>
                      <span className="subsection-icon">✅</span>
                      Strengths
                      <span className="item-count">({validStrengths.length})</span>
                    </h4>
                  </div>
                  {validStrengths.length > 0 ? (
                    <ul className="analysis-list strengths-list">
                      {validStrengths.map((strength, index) => (
                        <li key={index} className="analysis-item">
                          <span className="item-bullet">•</span>
                          <span className="item-text">{strength}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="no-content small">
                      <p>No specific strengths identified in this analysis.</p>
                    </div>
                  )}
                </div>
                
                <div className="weaknesses-section">
                  <div className="subsection-header">
                    <h4>
                      <span className="subsection-icon">🎯</span>
                      Areas to Improve
                      <span className="item-count">({validWeaknesses.length})</span>
                    </h4>
                  </div>
                  {validWeaknesses.length > 0 ? (
                    <ul className="analysis-list weaknesses-list">
                      {validWeaknesses.map((weakness, index) => (
                        <li key={index} className="analysis-item">
                          <span className="item-bullet">•</span>
                          <span className="item-text">{weakness}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="no-content small">
                      <p>No specific areas for improvement identified.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="results-actions">
        <button 
          className={`action-button primary ${isPrinting ? 'loading' : ''}`}
          onClick={handlePrint}
          disabled={isPrinting}
          aria-label="Download report"
        >
          <span className="button-icon">📄</span>
          <span className="button-text">
            {isPrinting ? 'Preparing...' : 'Download Report'}
          </span>
        </button>
        
        <button 
          className={`action-button secondary ${isSharing ? 'loading' : ''}`}
          onClick={handleShare}
          disabled={isSharing}
          aria-label="Share results"
        >
          <span className="button-icon">📤</span>
          <span className="button-text">
            {isSharing ? 'Sharing...' : 'Share Results'}
          </span>
        </button>
      </div>
    </div>
  );
};

export default React.memo(ResultsDisplay);