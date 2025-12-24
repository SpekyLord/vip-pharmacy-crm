/**
 * ErrorMessage Component
 *
 * Displays error messages with:
 * - Different severity levels (error, warning, info)
 * - Optional retry button
 * - Dismissible option
 */

const ErrorMessage = ({
  message,
  type = 'error',
  onRetry = null,
  onDismiss = null,
}) => {
  const typeClasses = {
    error: 'error-message-error',
    warning: 'error-message-warning',
    info: 'error-message-info',
  };

  return (
    <div className={`error-message ${typeClasses[type]}`}>
      <div className="error-message-content">
        <span className="error-message-icon">
          {type === 'error' && '❌'}
          {type === 'warning' && '⚠️'}
          {type === 'info' && 'ℹ️'}
        </span>
        <p className="error-message-text">{message}</p>
      </div>
      <div className="error-message-actions">
        {onRetry && (
          <button onClick={onRetry} className="error-message-retry">
            Retry
          </button>
        )}
        {onDismiss && (
          <button onClick={onDismiss} className="error-message-dismiss">
            ✕
          </button>
        )}
      </div>
    </div>
  );
};

export default ErrorMessage;
