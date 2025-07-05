import React, { useState, useCallback, useMemo, useEffect } from 'react';
import './ResultsDisplay.css';

const ResultsDisplay = ({ results, onReset }) => {
  const [activeTab, setActiveTab] = useState('roast');
  const [isSharing, setIsSharing] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [error, setError] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [toasts, setToasts] = useState([]);

  // Toast management system
  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = Date.now() + Math.random();
    const newToast = { id, message, type, duration };
    
    setToasts(prev => [...prev, newToast]);
    
    // Auto-remove toast after duration
    setTimeout(() => {
      setToasts(prev => prev.filter(toast => toast.id !== id));
    }, duration);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

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
      addToast(`Switched to ${tabName} view`, 'info', 2000);
    }
  }, [addToast]);

  // Enhanced print functionality with toast feedback
  const handlePrint = useCallback(async () => {
    setIsPrinting(true);
    setError('');
    addToast('Preparing report for download...', 'info');

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
        }
      `;
      document.head.appendChild(printStyles);

      await new Promise(resolve => setTimeout(resolve, 100));
      window.print();

      addToast('Report download completed successfully!', 'success');

      setTimeout(() => {
        if (document.head.contains(printStyles)) {
          document.head.removeChild(printStyles);
        }
      }, 1000);

    } catch (error) {
      console.error('Print error:', error);
      addToast('Print failed. Please try again or use your browser\'s print function.', 'error');
    } finally {
      setIsPrinting(false);
    }
  }, [addToast]);

  // Enhanced clipboard functionality with better feedback
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
      
      addToast('Copied to clipboard successfully!', 'success');
      
    } catch (error) {
      console.error('Copy error:', error);
      addToast('Copy failed. Please try selecting and copying manually.', 'error');
    }
  }, [addToast]);

  // Enhanced reset handler with custom confirmation dialog
  const handleResetRequest = useCallback(() => {
    setShowResetConfirm(true);
  }, []);

  const handleResetConfirm = useCallback(() => {
    setShowResetConfirm(false);
    addToast('Starting new resume analysis...', 'info');
    onReset();
  }, [onReset, addToast]);

  const handleResetCancel = useCallback(() => {
    setShowResetConfirm(false);
    addToast('Analysis preserved', 'info', 2000);
  }, [addToast]);

  // Enhanced share functionality with better feedback
  const handleShare = useCallback(async () => {
    setIsSharing(true);
    setError('');
    addToast('Preparing share content...', 'info');

    try {
      const shareData = {
        title: 'CV Slayer Results',
        text: `I scored ${sanitizedScore}/100 on my resume analysis! Try CV Slayer for professional feedback.`,
        url: window.location.origin
      };

      if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
        await navigator.share(shareData);
        addToast('Shared successfully!', 'success');
      } else {
        await copyToClipboard(shareData.text + ' ' + shareData.url);
        addToast('Share content copied to clipboard!', 'success');
      }

    } catch (error) {
      if (error.name === 'AbortError') {
        addToast('Share cancelled', 'info', 2000);
        return;
      }
      console.error('Share error:', error);
      addToast('Share failed. Content copied to clipboard instead.', 'warning');
      await copyToClipboard(`I scored ${sanitizedScore}/100 on CV Slayer! ${window.location.origin}`);
    } finally {
      setIsSharing(false);
    }
  }, [sanitizedScore, copyToClipboard, addToast]);

  // Keyboard navigation support
  const handleKeyDown = useCallback((event, action) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      action();
    }
    if (event.key === 'Escape') {
      if (showResetConfirm) {
        handleResetCancel();
      }
    }
  }, [showResetConfirm, handleResetCancel]);

  // XSS Protection for text content
  const sanitizeText = useCallback((text) => {
    if (typeof text !== 'string') return '';
    return text
      .replace(/[<>]/g, '')
      .substring(0, 2000)
      .split('\n')
      .filter(line => line.trim().length > 0)
      .slice(0, 50);
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

  // Validate results prop
  if (!results) return null;

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
                {toast.type === 'success' && '✅'}
                {toast.type === 'error' && '❌'}
                {toast.type === 'warning' && '⚠️'}
                {toast.type === 'info' && 'ℹ️'}
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

      {/* Custom Confirmation Dialog */}
      {showResetConfirm && (
        <div className="confirmation-overlay" role="dialog" aria-modal="true">
          <div className="confirmation-dialog">
            <div className="dialog-header">
              <h3>🔄 Start New Analysis?</h3>
            </div>
            <div className="dialog-content">
              <p>This will clear your current results and start a new resume analysis.</p>
              <p>Are you sure you want to continue?</p>
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

      {/* Legacy error notification (keeping for backward compatibility) */}
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

      {/* Score Section */}
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

      {/* Tab Navigation */}
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

      {/* Tab Content */}
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

      {/* Action Buttons */}
      <div className="results-actions">
        <button 
          className="action-button secondary" 
          onClick={handleResetRequest}
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