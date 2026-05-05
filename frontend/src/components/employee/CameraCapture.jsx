/**
 * CameraCapture Component (Photo Capture)
 *
 * Multi-source photo capture for visit proof:
 * - Camera capture (existing) with live viewfinder
 * - File picker / gallery upload (new)
 * - Clipboard paste (new)
 * - GPS acquired independently on mount (decoupled from camera)
 * - EXIF timestamp parsing for gallery photos (exifr)
 * - Multiple photo support (up to maxPhotos)
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import exifr from 'exifr';
// Phase N — Optional offline persistence (only triggers when caller passes
// a draftId prop). Importing eagerly is safe; offlineStore opens IndexedDB
// lazily on the first call.
import { offlineStore } from '../../utils/offlineStore';

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
    width: 100%;
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
    color: #f59e0b;
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
    height: 120px;
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

  .photo-taken-at {
    color: #d1d5db;
    font-size: 9px;
    margin-top: 1px;
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

  .photo-actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }

  .upload-btn {
    background: #6b7280;
    color: white;
    border: none;
    padding: 12px 20px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .upload-btn:hover:not(:disabled) {
    background: #4b5563;
  }

  .upload-btn:disabled {
    background: #d1d5db;
    cursor: not-allowed;
  }

  .paste-hint {
    color: #9ca3af;
    font-size: 12px;
    margin-top: 8px;
  }

  .source-badge {
    display: inline-block;
    font-size: 9px;
    padding: 1px 5px;
    border-radius: 3px;
    font-weight: 600;
    text-transform: uppercase;
    margin-bottom: 2px;
  }

  .photo-source-camera {
    background: #2563eb;
    color: white;
  }

  .photo-source-gallery {
    background: #7c3aed;
    color: white;
  }

  .photo-source-clipboard {
    background: #0891b2;
    color: white;
  }

  .no-gps-badge {
    color: #f59e0b;
  }

  @media (max-width: 480px) {
    .photo-actions {
      flex-direction: column;
    }
    .photo-actions button {
      width: 100%;
    }
  }
`;

// Compress and resize an image data URL.
// Scales down to fit within maxDimension (preserving aspect ratio),
// re-encodes as JPEG at the given quality.
const compressImage = (dataUrl, maxDimension = 1024, quality = 0.5) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;

      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('Failed to load image for compression'));
    img.src = dataUrl;
  });
};

// Phase N — convert a data URL to a Blob without going through fetch()
// (fetch on data: URLs is supported in modern browsers but iOS Safari has
// occasional flakiness; this synchronous conversion is more reliable).
const dataUrlToBlob = (dataUrl) => {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return null;
  const [meta, base64] = dataUrl.split(',');
  if (!base64) return null;
  const mimeMatch = /data:([^;]+)/.exec(meta);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  } catch {
    return null;
  }
};

/**
 * @param {object} props
 * @param {function} props.onCapture - (photos) => void; emits the array
 *        of captured photos. When draftId is set, each entry carries a
 *        `photoRef` (photo_<uuid>) pointing at the persisted Blob.
 * @param {number} [props.maxPhotos=5]
 * @param {string} [props.draftId] - Phase N: when provided, captured photos
 *        are immediately persisted as Blobs in offlineStore.visit_photos
 *        and the `photoRef` is added to each emitted entry. Required for
 *        the SW's multipart-replay path. Online callers (NewVisitPage)
 *        omit this prop and continue using the existing data-URL contract.
 * @param {Array} [props.initialPhotos] - Phase O: when VisitLogger restores
 *        an offline draft, it hydrates {data, photoRef, source} entries
 *        from offlineStore. Without seeding CameraCapture's internal photos
 *        state, the thumbnail grid shows empty even though the parent
 *        knows photos exist — so Submit was attempting to re-capture every
 *        time. Passing initialPhotos lets the child show the restored
 *        thumbnails immediately and lets the BDM remove individual photos
 *        from a draft. Used only on first mount; subsequent prop changes
 *        are ignored to avoid clobbering user-captured photos.
 */
const CameraCapture = ({ onCapture, maxPhotos = 5, draftId, initialPhotos }) => {
  // Lazy initializer covers the synchronous case (online flow seeds initialPhotos
  // before mount). The useEffect below covers the async case (offline draft
  // restore — VisitLogger fetches drafts in a useEffect after mount, so
  // initialPhotos transitions [] → [restored...] one tick later).
  const [photos, setPhotos] = useState(() => (
    Array.isArray(initialPhotos) && initialPhotos.length > 0 ? initialPhotos : []
  ));
  // Phase O — seed from late-arriving initialPhotos exactly once. Guarded
  // by photos.length === 0 so user-captured photos can't be clobbered when
  // the parent's restoration callback fires after the BDM already started
  // taking new photos. Tracked by a ref so the seed is one-shot per mount.
  const initialSeededRef = useRef(false);
  useEffect(() => {
    if (initialSeededRef.current) return;
    if (photos.length > 0) {
      initialSeededRef.current = true; // user already captured — never re-seed
      return;
    }
    if (Array.isArray(initialPhotos) && initialPhotos.length > 0) {
      setPhotos(initialPhotos);
      initialSeededRef.current = true;
    }
  }, [initialPhotos, photos.length]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [gpsStatus, setGpsStatus] = useState('acquiring');
  const [cachedLocation, setCachedLocation] = useState(null);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [facingMode, setFacingMode] = useState('environment');
  const [isSwitchingCamera, setIsSwitchingCamera] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const gpsWatchId = useRef(null);
  const gpsTimeoutId = useRef(null);
  const fileInputRef = useRef(null);
  const containerRef = useRef(null);
  const hasLocationRef = useRef(false);
  const gpsSessionRef = useRef(0);

  // GPS timeout duration (5 minutes max to prevent battery drain)
  const GPS_TIMEOUT_MS = 5 * 60 * 1000;

  const clearGPSTracking = useCallback(() => {
    if (gpsWatchId.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(gpsWatchId.current);
      gpsWatchId.current = null;
    }
    if (gpsWatchId.current !== null && !navigator.geolocation) {
      gpsWatchId.current = null;
    }
    if (gpsTimeoutId.current !== null) {
      clearTimeout(gpsTimeoutId.current);
      gpsTimeoutId.current = null;
    }
  }, []);

  // Start continuous GPS tracking with quick initial fix
  const startGPSTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      setGpsStatus('failed');
      return;
    }

    clearGPSTracking();
    hasLocationRef.current = false;
    setCachedLocation(null);
    setGpsStatus('acquiring');
    setError(null);
    const sessionId = gpsSessionRef.current + 1;
    gpsSessionRef.current = sessionId;

    const handlePosition = (position) => {
      if (gpsSessionRef.current !== sessionId) return;
      hasLocationRef.current = true;
      const loc = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      };
      setCachedLocation(loc);
      setGpsStatus('ready');
    };

    const handleError = () => {
      if (gpsSessionRef.current !== sessionId) return;
      if (!hasLocationRef.current) {
        setGpsStatus('failed');
      }
    };

    // First: Try quick low-accuracy position (usually instant from cached/network)
    navigator.geolocation.getCurrentPosition(
      handlePosition,
      () => {},
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 30000 }
    );

    // Then: Start watching for high-accuracy updates
    gpsWatchId.current = navigator.geolocation.watchPosition(
      handlePosition,
      handleError,
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 5000,
      }
    );

    // Set a maximum timeout (5 minutes) to stop GPS tracking and prevent battery drain
    gpsTimeoutId.current = setTimeout(() => {
      if (gpsSessionRef.current !== sessionId) return;
      clearGPSTracking();
      if (!hasLocationRef.current) {
        setGpsStatus('failed');
      }
    }, GPS_TIMEOUT_MS);
  }, [GPS_TIMEOUT_MS, clearGPSTracking]);

  // Start GPS tracking on mount (decoupled from camera)
  useEffect(() => {
    startGPSTracking();
    const videoEl = videoRef.current;

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (videoEl) {
        videoEl.srcObject = null;
      }
      gpsSessionRef.current += 1;
      clearGPSTracking();
    };
  }, [startGPSTracking, clearGPSTracking]);

  // Attach stream to video element when capturing starts
  useEffect(() => {
    if (isCapturing && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [isCapturing]);

  // Clipboard paste listener
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onPaste = (e) => {
      handlePaste(e);
    };

    container.addEventListener('paste', onPaste);
    return () => container.removeEventListener('paste', onPaste);
  });

  // Parse EXIF metadata from a File (timestamp + GPS if available)
  const getExifMetadata = async (file) => {
    const result = {
      capturedAt: new Date().toISOString(),
      exifLocation: null,
    };
    try {
      const exifData = await exifr.parse(file, {
        pick: ['DateTimeOriginal', 'GPSLatitude', 'GPSLongitude', 'GPSAltitude'],
        gps: true,
      });
      if (exifData?.DateTimeOriginal) {
        result.capturedAt = new Date(exifData.DateTimeOriginal).toISOString();
      }
      if (exifData?.latitude != null && exifData?.longitude != null) {
        result.exifLocation = {
          latitude: exifData.latitude,
          longitude: exifData.longitude,
          accuracy: null, // EXIF GPS has no accuracy field
          source: 'exif',
        };
      }
    } catch {
      // No EXIF or parse error — fall back to defaults
    }
    return result;
  };

  // Read a File as base64 data URL
  const readFileAsDataURL = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  };

  // Add photos from File objects (used by gallery and clipboard)
  const addPhotosFromFiles = async (files, source) => {
    const remaining = maxPhotos - photos.length;
    if (remaining <= 0) return;

    const filesToProcess = Array.from(files).slice(0, remaining);
    setIsLoading(true);
    setError(null);

    try {
      const newPhotoEntries = [];

      for (const file of filesToProcess) {
        // Validate file type
        if (!file.type.startsWith('image/')) continue;

        // Reject raw files over 10MB (compressed output will be much smaller)
        if (file.size > 10 * 1024 * 1024) {
          setError(`File "${file.name}" is too large (over 10MB) and was skipped.`);
          continue;
        }

        const [dataUrl, exifMeta] = await Promise.all([
          readFileAsDataURL(file),
          getExifMetadata(file),
        ]);

        // Compress the image (resize to max 1024px, JPEG 50%)
        const compressedData = await compressImage(dataUrl);

        // Use device GPS if available, fall back to EXIF GPS from photo
        const photoLocation = cachedLocation || exifMeta.exifLocation || null;

        const entry = {
          data: compressedData,
          location: photoLocation,
          capturedAt: exifMeta.capturedAt,
          source,
        };

        // Phase N — Offline persistence. Only fires when caller opts in
        // via draftId. Failures here are non-fatal; the photo still lives
        // in component state as a data URL, and the online submit path
        // doesn't depend on the Blob anyway.
        if (draftId) {
          try {
            const blob = dataUrlToBlob(compressedData);
            if (blob) {
              const ref = await offlineStore.saveVisitPhoto(blob, {
                draftId,
                capturedAt: entry.capturedAt,
                source,
                gps: photoLocation,
              });
              entry.photoRef = ref;
            }
          } catch (persistErr) {
            console.warn('[CameraCapture] Phase N blob persist failed:', persistErr);
          }
        }

        newPhotoEntries.push(entry);
      }

      if (newPhotoEntries.length > 0) {
        const updatedPhotos = [...photos, ...newPhotoEntries];
        setPhotos(updatedPhotos);
        onCapture?.(updatedPhotos);
      }
    } catch (err) {
      console.error(`Error processing ${source} photos:`, err);
      setError(`Failed to process ${source} photo(s).`);
    } finally {
      setIsLoading(false);
    }
  };

  // Gallery file picker handler
  const handleFileSelect = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      addPhotosFromFiles(files, 'gallery');
    }
    // Reset input so same file can be re-selected
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Clipboard paste handler
  const handlePaste = (e) => {
    if (photos.length >= maxPhotos) return;

    const items = e.clipboardData?.items;
    if (!items) return;

    const imageFiles = [];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }

    if (imageFiles.length > 0) {
      e.preventDefault();
      addPhotosFromFiles(imageFiles, 'clipboard');
    }
  };

  const startCamera = async (mode = facingMode) => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode },
      });
      streamRef.current = stream;
      setIsCapturing(true);
    } catch (err) {
      console.error('Error accessing camera:', err);
      setError('Unable to access camera. Please allow camera permission.');
    }
  };

  // Switch between front (user) and back (environment) cameras.
  // Stops the current track and starts a new one with the toggled facing mode.
  // Falls back to the previous camera if the requested one is unavailable
  // (e.g., laptops with only a front camera).
  const switchCamera = async () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setIsSwitchingCamera(true);
    setIsVideoReady(false);
    setError(null);

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: nextMode },
      });
      streamRef.current = stream;
      setFacingMode(nextMode);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error('Error switching camera:', err);
      setError(
        nextMode === 'user'
          ? 'Front camera unavailable on this device.'
          : 'Back camera unavailable on this device.'
      );
      try {
        const fallback = await navigator.mediaDevices.getUserMedia({
          video: { facingMode },
        });
        streamRef.current = fallback;
        if (videoRef.current) {
          videoRef.current.srcObject = fallback;
        }
      } catch {
        setIsCapturing(false);
      }
    } finally {
      setIsSwitchingCamera(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCapturing(false);
    setIsVideoReady(false);
  };

  const handleVideoLoaded = () => {
    if (videoRef.current && videoRef.current.videoWidth > 0 && videoRef.current.videoHeight > 0) {
      setIsVideoReady(true);
    }
  };

  // Capture photo from camera (GPS attached if available)
  const capturePhoto = async () => {
    if (!videoRef.current) return;

    if (!videoRef.current.videoWidth || !videoRef.current.videoHeight) {
      setError('Camera not ready. Please wait for video to load.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Use cached GPS if available — not required
      const location = cachedLocation || null;

      // Capture at native resolution
      const rawCanvas = document.createElement('canvas');
      rawCanvas.width = videoRef.current.videoWidth;
      rawCanvas.height = videoRef.current.videoHeight;
      const ctx = rawCanvas.getContext('2d');
      ctx.drawImage(videoRef.current, 0, 0);
      const rawData = rawCanvas.toDataURL('image/jpeg', 0.9);

      // Compress: resize to max 1024px, JPEG 50% quality
      const photoData = await compressImage(rawData);

      const photoWithGps = {
        data: photoData,
        location: location,
        capturedAt: new Date().toISOString(),
        source: 'camera',
      };

      // Phase N — Offline persistence (opt-in via draftId).
      if (draftId) {
        try {
          const blob = dataUrlToBlob(photoData);
          if (blob) {
            const ref = await offlineStore.saveVisitPhoto(blob, {
              draftId,
              capturedAt: photoWithGps.capturedAt,
              source: 'camera',
              gps: location,
            });
            photoWithGps.photoRef = ref;
          }
        } catch (persistErr) {
          console.warn('[CameraCapture] Phase N blob persist failed:', persistErr);
        }
      }

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
    const removed = photos[index];
    const newPhotos = photos.filter((_, i) => i !== index);
    setPhotos(newPhotos);
    onCapture?.(newPhotos);

    // Phase N — Drop the persisted Blob too. Best-effort; if it fails the
    // 7-day age-eviction sweep cleans orphans up.
    if (removed?.photoRef) {
      offlineStore.deleteVisitPhoto(removed.photoRef).catch(() => {
        // ignore — orphan will age out
      });
    }
  };

  const formatAccuracy = (meters) => {
    if (meters < 10) return 'Excellent';
    if (meters < 30) return 'Good';
    if (meters < 100) return 'Fair';
    return 'Poor';
  };

  const getCaptureButtonText = () => {
    if (isLoading) return 'Capturing...';
    return 'Take Photo';
  };

  const isFull = photos.length >= maxPhotos;

  const renderGPSStatus = () => (
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
        <span className="gps-failed">GPS Unavailable — you can still log your visit</span>
      )}
    </div>
  );

  const formatCapturedAt = (isoString) => {
    if (!isoString) return null;
    try {
      const date = new Date(isoString);
      if (isNaN(date.getTime())) return null;
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return null;
    }
  };

  const renderPhotoBadge = (photo) => {
    const hasGps = photo.location != null;
    const sourceBadgeClass = `source-badge photo-source-${photo.source || 'camera'}`;
    const sourceLabel = photo.source === 'gallery' ? 'Gallery' : photo.source === 'clipboard' ? 'Clipboard' : 'Camera';
    const takenAt = formatCapturedAt(photo.capturedAt);

    return (
      <div className="photo-gps-badge">
        <span className={sourceBadgeClass}>{sourceLabel}</span>
        {takenAt && (
          <span className="photo-taken-at">Taken: {takenAt}</span>
        )}
        {hasGps ? (
          <>
            {photo.location.accuracy != null ? (
              <span className={`accuracy-${formatAccuracy(photo.location.accuracy).toLowerCase()}`}>
                GPS: {formatAccuracy(photo.location.accuracy)} ({Math.round(photo.location.accuracy)}m)
              </span>
            ) : (
              <span className="accuracy-fair">GPS: From photo</span>
            )}
            <span className="photo-coordinates">
              {photo.location.latitude.toFixed(6)}, {photo.location.longitude.toFixed(6)}
            </span>
          </>
        ) : (
          <span className="no-gps-badge">No GPS</span>
        )}
      </div>
    );
  };

  return (
    <div className="camera-capture" ref={containerRef} tabIndex={-1}>
      <style>{cameraStyles}</style>

      {error && (
        <div className="camera-error">
          {error}
        </div>
      )}

      {/* GPS status - always visible since GPS starts on mount */}
      {!isCapturing && renderGPSStatus()}

      {isCapturing ? (
        <div className="camera-view">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="camera-video"
            onLoadedMetadata={handleVideoLoaded}
          />

          {renderGPSStatus()}

          <div className="camera-controls">
            <button
              type="button"
              onClick={capturePhoto}
              className="btn-capture"
              disabled={isLoading || !isVideoReady || isSwitchingCamera}
            >
              {!isVideoReady ? 'Loading camera...' : getCaptureButtonText()}
            </button>
            <button
              type="button"
              onClick={switchCamera}
              className="btn-cancel"
              disabled={isSwitchingCamera || isLoading}
              title={facingMode === 'environment' ? 'Switch to front camera' : 'Switch to back camera'}
            >
              {isSwitchingCamera
                ? 'Switching...'
                : facingMode === 'environment'
                ? 'Switch to Front'
                : 'Switch to Back'}
            </button>
            <button type="button" onClick={stopCamera} className="btn-cancel">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="photo-actions" style={{ marginTop: '12px' }}>
          <button
            type="button"
            onClick={startCamera}
            disabled={isFull}
            className="btn btn-secondary"
          >
            Open Camera ({photos.length}/{maxPhotos})
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isFull || isLoading}
            className="upload-btn"
          >
            {isLoading ? 'Processing...' : 'Upload from Gallery'}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
        </div>
      )}

      {photos.length > 0 && (
        <div className="photo-preview">
          {photos.map((photo, index) => (
            <div key={index} className="photo-thumbnail">
              <img src={photo.data} alt={`Photo ${index + 1}`} />
              {renderPhotoBadge(photo)}
              <button
                type="button"
                onClick={() => removePhoto(index)}
                className="photo-remove"
              >
                &#x2715;
              </button>
            </div>
          ))}
        </div>
      )}

      {photos.length === 0 && !isCapturing && (
        <p className="camera-hint">
          Take a photo, upload from gallery, or paste from clipboard. GPS location is attached automatically when available.
        </p>
      )}

      {!isCapturing && !isFull && (
        <p className="paste-hint">
          You can also paste images from clipboard (Ctrl+V)
        </p>
      )}
    </div>
  );
};

export default CameraCapture;
