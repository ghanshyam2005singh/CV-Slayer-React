import React, { useState, useEffect, useCallback, useMemo } from 'react';
import './Navbar.css';

const Navbar = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeSection, setActiveSection] = useState('home');
  const [error, setError] = useState('');

  // PRODUCTION FIX - Debounced scroll handler with rate limiting
  const handleScroll = useCallback(() => {
    const scrollY = window.scrollY;
    setIsScrolled(scrollY > 50);
    
    // PRODUCTION FIX - Validate sections array
    const validSections = ['home', 'features', 'upload', 'examples', 'contact'];
    let currentSection = 'home';
    
    try {
      for (const sectionId of validSections) {
        const element = document.getElementById(sectionId);
        if (element) {
          const rect = element.getBoundingClientRect();
          if (rect.top <= 100 && rect.bottom >= 100) {
            currentSection = sectionId;
            break;
          }
        }
      }
      setActiveSection(currentSection);
    } catch (error) {
      // PRODUCTION FIX - Silent fail for scroll detection
      console.debug('Navigation scroll detection failed');
    }
  }, []);

  // PRODUCTION FIX - Enhanced scroll event listener with proper throttling
  useEffect(() => {
    let ticking = false;
    let lastScrollTime = 0;
    
    const throttledScroll = () => {
      const now = Date.now();
      // Rate limit: max 60fps
      if (now - lastScrollTime < 16) return;
      
      if (!ticking) {
        requestAnimationFrame(() => {
          handleScroll();
          ticking = false;
          lastScrollTime = now;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', throttledScroll, { 
      passive: true,
      capture: false 
    });
    
    // Initial call to set correct state
    handleScroll();
    
    return () => {
      window.removeEventListener('scroll', throttledScroll);
    };
  }, [handleScroll]);

  // Enhanced menu toggle with accessibility
  const toggleMenu = useCallback(() => {
    setIsMenuOpen(prev => {
      const newState = !prev;
      
      // PRODUCTION FIX - Safe body scroll prevention
      try {
        if (newState) {
          document.body.style.overflow = 'hidden';
          document.body.setAttribute('aria-hidden', 'true');
        } else {
          document.body.style.overflow = 'unset';
          document.body.removeAttribute('aria-hidden');
        }
      } catch (error) {
        // Silent fail for body style changes
      }
      
      return newState;
    });
  }, []);

  // PRODUCTION FIX - Enhanced scroll to section with input validation
  const scrollToSection = useCallback(async (sectionId) => {
    // Input validation
    if (!sectionId || typeof sectionId !== 'string') {
      setError('Navigation failed. Please try again.');
      return;
    }

    // Sanitize input
    const sanitizedSectionId = sectionId.replace(/[^a-zA-Z0-9-_]/g, '');
    const validSections = ['home', 'features', 'upload', 'examples', 'contact'];
    
    if (!validSections.includes(sanitizedSectionId)) {
      setError('Section not found.');
      return;
    }

    setError('');
    setIsLoading(true);
    
    try {
      const element = document.getElementById(sanitizedSectionId);
      
      if (!element) {
        throw new Error('Section not available');
      }

      // Close mobile menu safely
      setIsMenuOpen(false);
      try {
        document.body.style.overflow = 'unset';
        document.body.removeAttribute('aria-hidden');
      } catch (error) {
        // Silent fail
      }

      // PRODUCTION FIX - Safe navbar height calculation
      let navbarHeight = 80;
      try {
        const navbar = document.querySelector('.navbar');
        if (navbar) {
          navbarHeight = navbar.offsetHeight;
        }
      } catch (error) {
        // Use default height
      }

      const elementPosition = Math.max(0, element.offsetTop - navbarHeight);

      // Smooth scroll with error handling
      if ('scrollTo' in window) {
        window.scrollTo({
          top: elementPosition,
          behavior: 'smooth'
        });
      } else {
        // Fallback for older browsers
        window.scrollTop = elementPosition;
      }

      // Update active section
      setActiveSection(sanitizedSectionId);

    } catch (error) {
      // PRODUCTION FIX - Generic error message
      setError('Navigation failed. Please try again.');
      
      // Auto-clear error after 3 seconds
      setTimeout(() => setError(''), 3000);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((event, sectionId) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      scrollToSection(sectionId);
    }
  }, [scrollToSection]);

  // PRODUCTION FIX - Safe escape key handler
  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape' && isMenuOpen) {
        setIsMenuOpen(false);
        try {
          document.body.style.overflow = 'unset';
          document.body.removeAttribute('aria-hidden');
        } catch (error) {
          // Silent fail
        }
      }
    };

    if (isMenuOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isMenuOpen]);

  // PRODUCTION FIX - Safe click outside handler
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isMenuOpen && event.target && !event.target.closest('.navbar-container')) {
        setIsMenuOpen(false);
        try {
          document.body.style.overflow = 'unset';
          document.body.removeAttribute('aria-hidden');
        } catch (error) {
          // Silent fail
        }
      }
    };

    if (isMenuOpen) {
      document.addEventListener('click', handleClickOutside, { passive: true });
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [isMenuOpen]);

  // PRODUCTION FIX - Safe cleanup on unmount
  useEffect(() => {
    return () => {
      try {
        document.body.style.overflow = 'unset';
        document.body.removeAttribute('aria-hidden');
      } catch (error) {
        // Silent fail during cleanup
      }
    };
  }, []);

  // PRODUCTION FIX - Memoized navigation items with validation
  const navigationItems = useMemo(() => [
    { 
      id: 'home', 
      label: 'Home', 
      ariaLabel: 'Navigate to home section',
      isValid: true 
    },
    { 
      id: 'features', 
      label: 'Features', 
      ariaLabel: 'Navigate to features section',
      isValid: true 
    },
    { 
      id: 'upload', 
      label: 'Upload Resume', 
      ariaLabel: 'Navigate to resume upload section', 
      isSpecial: true,
      isValid: true 
    },
    { 
      id: 'examples', 
      label: 'Examples', 
      ariaLabel: 'Navigate to examples section',
      isValid: true 
    },
    { 
      id: 'contact', 
      label: 'Contact', 
      ariaLabel: 'Navigate to contact section',
      isValid: true 
    }
  ].filter(item => item.isValid), []);

  // Handle logo click with loading state
  const handleLogoClick = useCallback(async () => {
    await scrollToSection('home');
  }, [scrollToSection]);

  return (
    <>
      {/* PRODUCTION FIX - Error notification with auto-dismiss */}
      {error && (
        <div className="navbar-error" role="alert" aria-live="polite">
          <span>⚠️ {error}</span>
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

      <nav 
        className={`navbar ${isScrolled ? 'navbar-scrolled' : ''} ${isMenuOpen ? 'navbar-menu-open' : ''}`}
        role="navigation"
        aria-label="Main navigation"
      >
        <div className="navbar-container">
          {/* PRODUCTION FIX - Enhanced Logo with safe loading state */}
          <div 
            className={`navbar-logo ${isLoading ? 'loading' : ''}`}
            onClick={handleLogoClick}
            onKeyDown={(e) => handleKeyDown(e, 'home')}
            role="button"
            tabIndex={0}
            aria-label="CV Slayer logo - navigate to home"
          >
            <span className="logo-text">
              CV Slayer
              {isLoading && (
                <span 
                  className="loading-spinner" 
                  aria-hidden="true"
                  aria-label="Loading"
                ></span>
              )}
            </span>
          </div>

          {/* PRODUCTION FIX - Enhanced Desktop Navigation with validation */}
          <ul 
            className={`navbar-menu ${isMenuOpen ? 'navbar-menu-active' : ''}`}
            role="menubar"
            id="navbar-menu"
          >
            {navigationItems.map((item) => (
              <li key={item.id} className="navbar-item" role="none">
                <button 
                  onClick={() => scrollToSection(item.id)}
                  onKeyDown={(e) => handleKeyDown(e, item.id)}
                  className={`navbar-link ${item.isSpecial ? 'cta-nav' : ''} ${activeSection === item.id ? 'active' : ''} ${isLoading ? 'disabled' : ''}`}
                  role="menuitem"
                  tabIndex={isMenuOpen || (typeof window !== 'undefined' && window.innerWidth > 768) ? 0 : -1}
                  aria-label={item.ariaLabel}
                  aria-current={activeSection === item.id ? 'page' : undefined}
                  disabled={isLoading}
                  type="button"
                >
                  {item.label}
                  {isLoading && activeSection === item.id && (
                    <span 
                      className="button-spinner" 
                      aria-hidden="true"
                      aria-label="Loading"
                    ></span>
                  )}
                </button>
              </li>
            ))}
          </ul>

          {/* PRODUCTION FIX - Enhanced Mobile Menu Toggle */}
          <button
            className={`navbar-toggle ${isMenuOpen ? 'active' : ''}`}
            onClick={toggleMenu}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleMenu();
              }
            }}
            aria-label={isMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={isMenuOpen}
            aria-controls="navbar-menu"
            type="button"
          >
            <span className="navbar-toggle-line" aria-hidden="true"></span>
            <span className="navbar-toggle-line" aria-hidden="true"></span>
            <span className="navbar-toggle-line" aria-hidden="true"></span>
            <span className="sr-only">
              {isMenuOpen ? 'Close menu' : 'Open menu'}
            </span>
          </button>
        </div>

        {/* PRODUCTION FIX - Safe mobile menu overlay */}
        {isMenuOpen && (
          <div 
            className="navbar-overlay"
            onClick={() => {
              setIsMenuOpen(false);
              try {
                document.body.style.overflow = 'unset';
                document.body.removeAttribute('aria-hidden');
              } catch (error) {
                // Silent fail
              }
            }}
            aria-hidden="true"
            role="presentation"
          />
        )}
      </nav>
    </>
  );
};

export default React.memo(Navbar);