import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// Error Boundary for production crashes
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Only log in development
    if (process.env.NODE_ENV !== 'production') {
      console.error('App crashed:', error, errorInfo);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '20px',
          textAlign: 'center',
          backgroundColor: '#f8f9fa'
        }}>
          <h1 style={{ color: '#dc3545', marginBottom: '20px' }}>
            Oops! Something went wrong
          </h1>
          <p style={{ color: '#666', marginBottom: '20px' }}>
            We're sorry for the inconvenience. Please refresh the page.
          </p>
          <button 
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 20px',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer'
            }}
          >
            Refresh Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

const root = ReactDOM.createRoot(document.getElementById('root'));

// PRODUCTION FIX - Remove StrictMode for production, add Error Boundary
if (process.env.NODE_ENV === 'production') {
  root.render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
} else {
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
}

// PRODUCTION FIX - Only report web vitals in development
if (process.env.NODE_ENV !== 'production') {
  import('./reportWebVitals').then(({ default: reportWebVitals }) => {
    reportWebVitals();
  });
}