/**
 * CameraCapture Component
 *
 * Camera functionality for:
 * - Capturing visit photos
 * - Prescription images
 * - Preview before upload
 * - Multiple photo support
 */

import { useState, useRef } from 'react';

const CameraCapture = ({ onCapture, maxPhotos = 3 }) => {
  const [photos, setPhotos] = useState([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsCapturing(true);
    } catch (error) {
      console.error('Error accessing camera:', error);
      alert('Unable to access camera');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    setIsCapturing(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;

    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoRef.current, 0, 0);

    const photoData = canvas.toDataURL('image/jpeg');
    const newPhotos = [...photos, photoData];
    setPhotos(newPhotos);
    onCapture?.(newPhotos);

    if (newPhotos.length >= maxPhotos) {
      stopCamera();
    }
  };

  const removePhoto = (index) => {
    const newPhotos = photos.filter((_, i) => i !== index);
    setPhotos(newPhotos);
    onCapture?.(newPhotos);
  };

  return (
    <div className="camera-capture">
      {isCapturing ? (
        <div className="camera-view">
          <video ref={videoRef} autoPlay playsInline className="camera-video" />
          <div className="camera-controls">
            <button type="button" onClick={capturePhoto} className="btn-capture">
              📷 Capture
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
          📷 Take Photo ({photos.length}/{maxPhotos})
        </button>
      )}

      {photos.length > 0 && (
        <div className="photo-preview">
          {photos.map((photo, index) => (
            <div key={index} className="photo-thumbnail">
              <img src={photo} alt={`Captured ${index + 1}`} />
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
    </div>
  );
};

export default CameraCapture;
