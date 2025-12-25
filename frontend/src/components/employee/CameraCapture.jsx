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

const CameraCapture = ({ onCapture, maxPhotos = 5 }) => {
  const [photos, setPhotos] = useState([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [gpsStatus, setGpsStatus] = useState('idle'); // idle, acquiring, ready, failed
  const [cachedLocation, setCachedLocation] = useState(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const gpsWatchId = useRef(null);

  // Cleanup GPS watch on unmount
  useEffect(() => {
    return () => {
      if (gpsWatchId.current) {
        navigator.geolocation.clearWatch(gpsWatchId.current);
        gpsWatchId.current = null;
      }
    };
  }, []);

  // Start continuous GPS tracking
  const startGPSTracking = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      setGpsStatus('failed');
      return;
    }

    setGpsStatus('acquiring');
    setError(null);

    gpsWatchId.current = navigator.geolocation.watchPosition(
      (position) => {
        setCachedLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
        setGpsStatus('ready');
      },
      (err) => {
        // Don't fail immediately on watch errors - keep trying
        console.warn('GPS update failed:', err.message);
        // Only show error if we don't have any cached location
        if (!cachedLocation) {
          setGpsStatus('acquiring');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 60000, // 1 minute
        maximumAge: 5000, // Allow 5-second-old readings
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
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsCapturing(true);

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
      {error && (
        <div className="camera-error">
          {error}
        </div>
      )}

      {isCapturing ? (
        <div className="camera-view">
          <video ref={videoRef} autoPlay playsInline className="camera-video" />

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
              disabled={isLoading || gpsStatus === 'acquiring'}
            >
              {getCaptureButtonText()}
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
