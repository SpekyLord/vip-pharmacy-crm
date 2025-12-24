/**
 * LoadingSpinner Component
 *
 * Displays a loading indicator with:
 * - Customizable size
 * - Optional loading text
 * - Full screen or inline mode
 */

const LoadingSpinner = ({ size = 'medium', text = 'Loading...', fullScreen = false }) => {
  const sizeClasses = {
    small: 'spinner-small',
    medium: 'spinner-medium',
    large: 'spinner-large',
  };

  const spinner = (
    <div className={`loading-spinner ${sizeClasses[size]}`}>
      <div className="spinner"></div>
      {text && <p className="spinner-text">{text}</p>}
    </div>
  );

  if (fullScreen) {
    return <div className="spinner-overlay">{spinner}</div>;
  }

  return spinner;
};

export default LoadingSpinner;
