/**
 * ErrorBoundary Component
 *
 * React Error Boundary that:
 * - Catches JavaScript errors in child components
 * - Displays a fallback UI instead of crashing the app
 * - Logs error details for debugging
 * - Provides a retry mechanism
 */

import { Component } from 'react';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log error details for debugging
    this.setState({ errorInfo });

    // In production, you could send this to an error reporting service
    if (import.meta.env.PROD) {
      // TODO: Send to error reporting service (e.g., Sentry)
      // errorReportingService.log(error, errorInfo);
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleGoHome = () => {
    window.location.href = '/login';
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div style={styles.container}>
          <div style={styles.content}>
            <div style={styles.icon}>!</div>
            <h1 style={styles.title}>Something went wrong</h1>
            <p style={styles.message}>
              We&apos;re sorry, but something unexpected happened. Please try again or return to the home page.
            </p>

            {/* Show error details in development */}
            {import.meta.env.DEV && this.state.error && (
              <details style={styles.details}>
                <summary style={styles.summary}>Error Details</summary>
                <pre style={styles.errorText}>
                  {this.state.error.toString()}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}

            <div style={styles.actions}>
              <button onClick={this.handleRetry} style={styles.primaryButton}>
                Try Again
              </button>
              <button onClick={this.handleGoHome} style={styles.secondaryButton}>
                Go to Login
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const styles = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    backgroundColor: '#f5f5f5',
    padding: '1rem',
  },
  content: {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '2rem',
    maxWidth: '500px',
    width: '100%',
    textAlign: 'center',
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
  },
  icon: {
    width: '60px',
    height: '60px',
    borderRadius: '50%',
    backgroundColor: '#ffebee',
    color: '#c62828',
    fontSize: '2rem',
    fontWeight: 'bold',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 1rem',
  },
  title: {
    fontSize: '1.5rem',
    color: '#333',
    margin: '0 0 0.5rem',
  },
  message: {
    color: '#666',
    marginBottom: '1.5rem',
    lineHeight: '1.5',
  },
  details: {
    textAlign: 'left',
    marginBottom: '1.5rem',
    backgroundColor: '#f5f5f5',
    borderRadius: '4px',
    padding: '0.5rem',
  },
  summary: {
    cursor: 'pointer',
    fontWeight: '500',
    color: '#666',
    padding: '0.5rem',
  },
  errorText: {
    fontSize: '0.75rem',
    color: '#c62828',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    maxHeight: '200px',
    overflow: 'auto',
    margin: '0.5rem 0 0',
    padding: '0.5rem',
    backgroundColor: '#fff',
    borderRadius: '4px',
  },
  actions: {
    display: 'flex',
    gap: '1rem',
    justifyContent: 'center',
  },
  primaryButton: {
    backgroundColor: '#1976d2',
    color: 'white',
    border: 'none',
    padding: '0.75rem 1.5rem',
    borderRadius: '4px',
    fontSize: '1rem',
    cursor: 'pointer',
    fontWeight: '500',
  },
  secondaryButton: {
    backgroundColor: 'white',
    color: '#666',
    border: '1px solid #ddd',
    padding: '0.75rem 1.5rem',
    borderRadius: '4px',
    fontSize: '1rem',
    cursor: 'pointer',
    fontWeight: '500',
  },
};

export default ErrorBoundary;
