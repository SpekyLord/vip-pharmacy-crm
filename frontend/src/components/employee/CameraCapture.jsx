/**
 * CameraCapture Component
 *
 * Camera functionality for:
 * - Capturing visit photos with GPS location
 * - Each photo includes GPS coordinates and timestamp
 * - Preview before upload with accuracy indicator
 * - Multiple photo support (up to maxPhotos)
 * - GPS pre-acquisition when camera opens (60 second timeout)
 */

import { useState, useRef, useEffect } from 'react';

const cameraStyles = `
  .camera-capture {
    background: #f8f9fa;
    border-radius: 8px;
    padding: 16px;
  }

  .camera-error {
    background: #fee2e2;
    color: #dc2626;
    padding: 12px;
    border-radius: 6px;
    margin-bottom: 12px;
  }

  .camera-view {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }

  .camera-video {
    width: 100%;
    max-width: 480px;
    height: auto;
    border-radius: 8px;
    background: #000;
  }

  .gps-status-indicator {
    text-align: center;
    font-size: 14px;
    padding: 8px 12px;
    border-radius: 6px;
    background: #f0f0f0;
  }

  .gps-acquiring {
    color: #f59e0b;
  }

  .gps-ready {
    color: #10b981;
  }

  .gps-coordinates {
    font-size: 12px;
    color: #666;
    margin-top: 4px;
  }

  .gps-failed {
    color: #dc2626;
  }

  .camera-controls {
    display: flex;
    gap: 12px;
    justify-content: center;
    flex-wrap: wrap;
  }

  .btn-capture {
    background: #2563eb;
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 50px;
    font-size: 16px;
    cursor: pointer;
    min-width: 140px;
  }

  .btn-capture:hover:not(:disabled) {
    background: #1d4ed8;
  }

  .btn-capture:disabled {
    background: #9ca3af;
    cursor: not-allowed;
  }

  .btn-cancel {
    background: #6b7280;
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 50px;
    font-size: 16px;
    cursor: pointer;
  }

  .btn-cancel:hover {
    background: #4b5563;
  }

  .photo-preview {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 12px;
    margin-top: 16px;
  }

  .photo-thumbnail {
    position: relative;
    border-radius: 8px;
    overflow: hidden;
    background: #e5e7eb;
  }

  .photo-thumbnail img {
    width: 100%;
    height: 100px;
    object-fit: cover;
  }

  .photo-gps-badge {
    background: rgba(0, 0, 0, 0.7);
    color: white;
    font-size: 10px;
    padding: 4px 6px;
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    flex-direction: column;
  }

  .photo-coordinates {
    color: #9ca3af;
    font-size: 9px;
  }

  .accuracy-excellent { color: #10b981; }
  .accuracy-good { color: #3b82f6; }
  .accuracy-fair { color: #f59e0b; }
  .accuracy-poor { color: #ef4444; }

  .photo-remove {
    position: absolute;
    top: 4px;
    right: 4px;
    background: #ef4444;
    color: white;
    border: none;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    cursor: pointer;
    font-size: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .photo-remove:hover {
    background: #dc2626;
  }

  .camera-hint {
    color: #6b7280;
    font-size: 14px;
    text-align: center;
    margin-top: 8px;
  }

  .btn-secondary {
    background: #6b7280;
    color: white;
    border: none;
    padding: 12px 20px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
  }

  .btn-secondary:hover:not(:disabled) {
    background: #4b5563;
  }

  .btn-secondary:disabled {
    background: #d1d5db;
    cursor: not-allowed;
  }
`;

const CameraCapture = ({ onCapture, maxPhotos = 5 }) => {
  const [photos, setPhotos] = useState([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [gpsStatus, setGpsStatus] = useState('idle'); // idle, acquiring, ready, failed
  const [cachedLocation, setCachedLocation] = useState(null);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const gpsWatchId = useRef(null);

  // Cleanup camera and GPS on unmount
  useEffect(() => {
    return () => {
      // Cleanup camera stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      // Cleanup GPS watch
      if (gpsWatchId.current) {
        navigator.geolocation.clearWatch(gpsWatchId.current);
        gpsWatchId.current = null;
      }
    };
  }, []);

  // Attach stream to video element when capturing starts
  // This fixes the race condition where srcObject was set before video element existed
  useEffect(() => {
    if (isCapturing && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [isCapturing]);

  // Start continuous GPS tracking with quick initial fix
  const startGPSTracking = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      setGpsStatus('failed');
      return;
    }

    setGpsStatus('acquiring');
    setError(null);

    // Track if we got a location (using ref to avoid stale closure)
    let hasLocation = false;

    const handlePosition = (position) => {
      hasLocation = true;
      setCachedLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      });
      setGpsStatus('ready');
    };

    const handleError = (err) => {
      console.warn('GPS error:', err.message);
      // Only show acquiring if we don't have a location yet
      if (!hasLocation) {
        setGpsStatus('acquiring');
      }
    };

    // First: Try quick low-accuracy position (usually instant from cached/network)
    navigator.geolocation.getCurrentPosition(
      handlePosition,
      () => {}, // Ignore error, watchPosition will keep trying
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 30000 }
    );

    // Then: Start watching for high-accuracy updates
    gpsWatchId.current = navigator.geolocation.watchPosition(
      handlePosition,
      handleError,
      {
        enableHighAccuracy: true,
        timeout: 15000, // 15 seconds per attempt
        maximumAge: 5000,
      }
    );
  };

  // Stop GPS tracking
  const stopGPSTracking = () => {
    if (gpsWatchId.current) {
      navigator.geolocation.clearWatch(gpsWatchId.current);
      gpsWatchId.current = null;
    }
    setGpsStatus('idle');
    setCachedLocation(null);
  };

  const startCamera = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      setIsCapturing(true); // useEffect will attach stream to video element

      // Start GPS tracking immediately when camera opens
      startGPSTracking();
    } catch (err) {
      console.error('Error accessing camera:', err);
      setError('Unable to access camera. Please allow camera permission.');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    stopGPSTracking();
    setIsCapturing(false);
    setIsVideoReady(false);
  };

  // Handle video metadata loaded - ensures video dimensions are available
  const handleVideoLoaded = () => {
    if (videoRef.current && videoRef.current.videoWidth > 0 && videoRef.current.videoHeight > 0) {
      setIsVideoReady(true);
    }
  };

  // Get GPS location with configurable options (for retry fallback)
  const getGPSLocation = (options = {}) => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          });
        },
        (err) => {
          reject(new Error(`GPS error: ${err.message}`));
        },
        {
          enableHighAccuracy: options.enableHighAccuracy ?? true,
          timeout: options.timeout ?? 60000,
          maximumAge: options.maximumAge ?? 5000,
        }
      );
    });
  };

  // Retry GPS with fallback to lower accuracy
  const getGPSWithRetry = async () => {
    // First attempt: high accuracy, 60 seconds
    try {
      return await getGPSLocation({ enableHighAccuracy: true, timeout: 60000 });
    } catch (err) {
      console.warn('High accuracy GPS failed, trying lower accuracy:', err.message);
      // Second attempt: lower accuracy, 30 seconds
      return await getGPSLocation({ enableHighAccuracy: false, timeout: 30000 });
    }
  };

  // Capture photo with GPS location
  const capturePhoto = async () => {
    if (!videoRef.current) return;

    // Validate video is ready with proper dimensions
    if (!videoRef.current.videoWidth || !videoRef.current.videoHeight) {
      setError('Camera not ready. Please wait for video to load.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      let location = cachedLocation;

      // If no cached location, try one more time with extended timeout
      if (!location) {
        setGpsStatus('acquiring');
        try {
          location = await getGPSWithRetry();
          setCachedLocation(location);
          setGpsStatus('ready');
        } catch (err) {
          setError('Unable to get GPS location. Please ensure location is enabled and try again.');
          setGpsStatus('failed');
          setIsLoading(false);
          return;
        }
      }

      // Capture photo from video stream
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(videoRef.current, 0, 0);

      const photoData = canvas.toDataURL('image/jpeg', 0.8);

      // Create photo object with GPS data
      const photoWithGps = {
        data: photoData,
        location: location,
        capturedAt: new Date().toISOString(),
      };

      const newPhotos = [...photos, photoWithGps];
      setPhotos(newPhotos);
      onCapture?.(newPhotos);

      if (newPhotos.length >= maxPhotos) {
        stopCamera();
      }
    } catch (err) {
      console.error('Error capturing photo:', err);
      setError(err.message || 'Failed to capture photo with location');
    } finally {
      setIsLoading(false);
    }
  };

  const removePhoto = (index) => {
    const newPhotos = photos.filter((_, i) => i !== index);
    setPhotos(newPhotos);
    onCapture?.(newPhotos);
  };

  // Format GPS accuracy for display
  const formatAccuracy = (meters) => {
    if (meters < 10) return 'Excellent';
    if (meters < 30) return 'Good';
    if (meters < 100) return 'Fair';
    return 'Poor';
  };

  // Check if GPS accuracy is acceptable for visit proof (within 100 meters)
  const isAccuracyAcceptable = (meters) => meters <= 100;

  // Get button text based on GPS status
  const getCaptureButtonText = () => {
    if (isLoading) return 'Capturing...';
    if (gpsStatus === 'acquiring') return 'Waiting for GPS...';
    return 'Take Photo';
  };

  return (
    <div className="camera-capture">
      <style>{cameraStyles}</style>
      {error && (
        <div className="camera-error">
          {error}
        </div>
      )}

      {isCapturing ? (
        <div className="camera-view">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="camera-video"
            onLoadedMetadata={handleVideoLoaded}
          />

          {/* GPS Status Indicator */}
          <div className="gps-status-indicator">
            {gpsStatus === 'acquiring' && (
              <span className="gps-acquiring">Acquiring GPS...</span>
            )}
            {gpsStatus === 'ready' && cachedLocation && (
              <div className="gps-ready">
                <div>GPS Ready ({Math.round(cachedLocation.accuracy)}m accuracy)</div>
                <div className="gps-coordinates">
                  Lat: {cachedLocation.latitude.toFixed(6)}, Lng: {cachedLocation.longitude.toFixed(6)}
                </div>
              </div>
            )}
            {gpsStatus === 'failed' && (
              <span className="gps-failed">GPS Unavailable</span>
            )}
          </div>

          <div className="camera-controls">
            <button
              type="button"
              onClick={capturePhoto}
              className="btn-capture"
              disabled={isLoading || gpsStatus === 'acquiring' || !isVideoReady}
            >
              {!isVideoReady ? 'Loading camera...' : getCaptureButtonText()}
            </button>
            <button type="button" onClick={stopCamera} className="btn-cancel">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={startCamera}
          disabled={photos.length >= maxPhotos}
          className="btn btn-secondary"
        >
          Open Camera ({photos.length}/{maxPhotos})
        </button>
      )}

      {photos.length > 0 && (
        <div className="photo-preview">
          {photos.map((photo, index) => (
            <div key={index} className="photo-thumbnail">
              <img src={photo.data} alt={`Captured ${index + 1}`} />
              <div className="photo-gps-badge">
                <span className={`accuracy-${formatAccuracy(photo.location.accuracy).toLowerCase()}`}>
                  GPS: {formatAccuracy(photo.location.accuracy)} ({Math.round(photo.location.accuracy)}m)
                </span>
                <span className="photo-coordinates">
                  {photo.location.latitude.toFixed(6)}, {photo.location.longitude.toFixed(6)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => removePhoto(index)}
                className="photo-remove"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {photos.length === 0 && !isCapturing && (
        <p className="camera-hint">
          Take at least 1 photo as proof of visit. GPS location will be captured automatically.
        </p>
      )}
    </div>
  );
};

export default CameraCapture;
