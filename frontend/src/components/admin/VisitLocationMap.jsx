/**
 * VisitLocationMap Component
 *
 * GPS Location Verification for Admin Visit Reviews (Task 2.9)
 * Compares employee's visit location against the doctor's clinic location.
 *
 * Features:
 * - Haversine formula for accurate distance calculation
 * - Visual comparison with two markers (blue=employee, red=clinic)
 * - Dashed polyline connecting the two points
 * - Circle showing allowed radius around clinic
 * - Suspicious/Verified badge based on distance threshold
 *
 * @prop {object} visitData - Contains visitCoordinates, clinicCoordinates, accuracy
 * @prop {number} allowedRadius - Maximum allowed distance in meters (default: 200)
 * @prop {function} onVerificationResult - Callback with { isVerified, distance }
 */

import { useMemo } from 'react';
import {
  MapPin,
  Navigation,
  AlertTriangle,
  CheckCircle,
  Ruler,
  Target,
  User,
  Building,
} from 'lucide-react';
import MapView from '../common/MapView';

/* =============================================================================
   HAVERSINE FORMULA
   Calculates the distance between two GPS coordinates in meters.
   This is the standard formula for calculating distances on a sphere.
   ============================================================================= */

const calculateDistance = (coord1, coord2) => {
  const R = 6371000; // Earth's radius in meters

  const lat1 = (coord1.lat * Math.PI) / 180;
  const lat2 = (coord2.lat * Math.PI) / 180;
  const deltaLat = ((coord2.lat - coord1.lat) * Math.PI) / 180;
  const deltaLng = ((coord2.lng - coord1.lng) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
};

/* =============================================================================
   STYLES
   ============================================================================= */

const componentStyles = `
  .visit-location-map {
    background: white;
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  }

  .vlm-header {
    padding: 20px 24px;
    border-bottom: 1px solid #e5e7eb;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 16px;
  }

  .vlm-title {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 18px;
    font-weight: 600;
    color: #1f2937;
    margin: 0;
  }

  .vlm-title-icon {
    width: 36px;
    height: 36px;
    background: linear-gradient(135deg, #3b82f6, #2563eb);
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
  }

  /* Verification Badge */
  .verification-badge {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 18px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
  }

  .verification-badge.verified {
    background: linear-gradient(135deg, #dcfce7, #bbf7d0);
    color: #15803d;
    border: 1px solid #86efac;
  }

  .verification-badge.suspicious {
    background: linear-gradient(135deg, #fee2e2, #fecaca);
    color: #dc2626;
    border: 1px solid #fca5a5;
    animation: pulse-warning 2s infinite;
  }

  @keyframes pulse-warning {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.8; }
  }

  /* Map Container */
  .vlm-map-container {
    padding: 20px;
    background: #f9fafb;
  }

  /* Info Panel */
  .vlm-info-panel {
    padding: 20px 24px;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    border-top: 1px solid #e5e7eb;
  }

  .vlm-info-card {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 14px;
    background: #f9fafb;
    border-radius: 10px;
  }

  .vlm-info-icon {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .vlm-info-icon.blue { background: #dbeafe; color: #2563eb; }
  .vlm-info-icon.red { background: #fee2e2; color: #dc2626; }
  .vlm-info-icon.amber { background: #fef3c7; color: #d97706; }
  .vlm-info-icon.green { background: #dcfce7; color: #16a34a; }

  .vlm-info-content {
    flex: 1;
    min-width: 0;
  }

  .vlm-info-label {
    font-size: 12px;
    color: #6b7280;
    margin-bottom: 4px;
  }

  .vlm-info-value {
    font-size: 14px;
    font-weight: 600;
    color: #1f2937;
  }

  .vlm-info-coords {
    font-size: 11px;
    color: #9ca3af;
    font-family: monospace;
    margin-top: 4px;
  }

  /* Distance Highlight */
  .vlm-distance-card {
    grid-column: span 2;
    background: white;
    border: 2px solid #e5e7eb;
    padding: 16px 20px;
  }

  .vlm-distance-card.warning {
    border-color: #fca5a5;
    background: #fef2f2;
  }

  .vlm-distance-card.success {
    border-color: #86efac;
    background: #f0fdf4;
  }

  .vlm-distance-value {
    font-size: 28px;
    font-weight: 700;
    color: #1f2937;
  }

  .vlm-distance-unit {
    font-size: 16px;
    font-weight: 500;
    color: #6b7280;
    margin-left: 4px;
  }

  .vlm-distance-comparison {
    font-size: 13px;
    color: #6b7280;
    margin-top: 4px;
  }

  /* Legend */
  .vlm-legend {
    padding: 16px 24px;
    background: #f9fafb;
    border-top: 1px solid #e5e7eb;
    display: flex;
    flex-wrap: wrap;
    gap: 20px;
  }

  .vlm-legend-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: #4b5563;
  }

  .vlm-legend-marker {
    width: 12px;
    height: 12px;
    border-radius: 50%;
  }

  .vlm-legend-marker.blue { background: #3b82f6; }
  .vlm-legend-marker.red { background: #ef4444; }

  .vlm-legend-line {
    width: 24px;
    height: 2px;
    background: repeating-linear-gradient(
      90deg,
      #6b7280 0px,
      #6b7280 5px,
      transparent 5px,
      transparent 10px
    );
  }

  .vlm-legend-circle {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: rgba(34, 197, 94, 0.2);
    border: 2px solid #22c55e;
  }

  @media (max-width: 640px) {
    .vlm-header {
      flex-direction: column;
      align-items: flex-start;
    }
    .vlm-distance-card {
      grid-column: span 1;
    }
  }
`;

/* =============================================================================
   COMPONENT: VisitLocationMap
   ============================================================================= */

const VisitLocationMap = ({
  visitData,
  allowedRadius = 200,
  onVerificationResult = null,
}) => {
  /* ---------------------------------------------------------------------------
     Calculate distance and verification status
     --------------------------------------------------------------------------- */

  const verification = useMemo(() => {
    if (!visitData?.visitCoordinates || !visitData?.clinicCoordinates) {
      return { distance: 0, isVerified: false, isValid: false };
    }

    const distance = calculateDistance(
      visitData.visitCoordinates,
      visitData.clinicCoordinates
    );

    const isVerified = distance <= allowedRadius;

    // Callback with result
    if (onVerificationResult) {
      onVerificationResult({ isVerified, distance: Math.round(distance) });
    }

    return {
      distance: Math.round(distance),
      isVerified,
      isValid: true,
    };
  }, [visitData, allowedRadius, onVerificationResult]);

  /* ---------------------------------------------------------------------------
     Build map data
     --------------------------------------------------------------------------- */

  const mapCenter = useMemo(() => {
    if (!visitData?.visitCoordinates || !visitData?.clinicCoordinates) {
      return { lat: 10.7202, lng: 122.5621 }; // Default: Iloilo City
    }

    // Center the map between the two points
    return {
      lat: (visitData.visitCoordinates.lat + visitData.clinicCoordinates.lat) / 2,
      lng: (visitData.visitCoordinates.lng + visitData.clinicCoordinates.lng) / 2,
    };
  }, [visitData]);

  const markers = useMemo(() => {
    if (!visitData?.visitCoordinates || !visitData?.clinicCoordinates) return [];

    return [
      {
        position: visitData.visitCoordinates,
        color: 'blue',
        popup: {
          title: 'Employee Visit Location',
          subtitle: `GPS: ${visitData.visitCoordinates.lat.toFixed(6)}, ${visitData.visitCoordinates.lng.toFixed(6)}`,
        },
      },
      {
        position: visitData.clinicCoordinates,
        color: 'red',
        popup: {
          title: 'Clinic Location',
          subtitle: `GPS: ${visitData.clinicCoordinates.lat.toFixed(6)}, ${visitData.clinicCoordinates.lng.toFixed(6)}`,
        },
      },
    ];
  }, [visitData]);

  const polylines = useMemo(() => {
    if (!visitData?.visitCoordinates || !visitData?.clinicCoordinates) return [];

    return [
      {
        positions: [visitData.visitCoordinates, visitData.clinicCoordinates],
        color: '#6b7280',
        dashed: true,
        weight: 3,
        opacity: 0.7,
      },
    ];
  }, [visitData]);

  const circles = useMemo(() => {
    if (!visitData?.clinicCoordinates) return [];

    return [
      {
        center: visitData.clinicCoordinates,
        radius: allowedRadius,
        color: '#22c55e',
        fillColor: '#22c55e',
        fillOpacity: 0.1,
        weight: 2,
        dashed: true,
      },
    ];
  }, [visitData, allowedRadius]);

  // Calculate appropriate zoom level based on distance
  const zoomLevel = useMemo(() => {
    if (verification.distance > 1000) return 14;
    if (verification.distance > 500) return 15;
    if (verification.distance > 200) return 16;
    return 17;
  }, [verification.distance]);

  /* ---------------------------------------------------------------------------
     Render
     --------------------------------------------------------------------------- */

  if (!verification.isValid) {
    return (
      <div className="visit-location-map">
        <style>{componentStyles}</style>
        <div className="vlm-header">
          <h3 className="vlm-title">
            <div className="vlm-title-icon">
              <MapPin size={18} />
            </div>
            GPS Location Verification
          </h3>
        </div>
        <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>
          No location data available
        </div>
      </div>
    );
  }

  return (
    <div className="visit-location-map">
      <style>{componentStyles}</style>

      {/* Header with Verification Badge */}
      <div className="vlm-header">
        <h3 className="vlm-title">
          <div className="vlm-title-icon">
            <MapPin size={18} />
          </div>
          GPS Location Verification
        </h3>

        <div
          className={`verification-badge ${verification.isVerified ? 'verified' : 'suspicious'}`}
        >
          {verification.isVerified ? (
            <>
              <CheckCircle size={18} />
              VERIFIED: WITHIN RANGE
            </>
          ) : (
            <>
              <AlertTriangle size={18} />
              SUSPICIOUS: LOCATION MISMATCH
            </>
          )}
        </div>
      </div>

      {/* Map */}
      <div className="vlm-map-container">
        <MapView
          center={mapCenter}
          zoom={zoomLevel}
          markers={markers}
          polylines={polylines}
          circles={circles}
          height="350px"
          scrollWheelZoom={true}
        />
      </div>

      {/* Info Panel */}
      <div className="vlm-info-panel">
        {/* Employee Location */}
        <div className="vlm-info-card">
          <div className="vlm-info-icon blue">
            <User size={20} />
          </div>
          <div className="vlm-info-content">
            <div className="vlm-info-label">Employee Visit Location</div>
            <div className="vlm-info-value">Logged Position</div>
            <div className="vlm-info-coords">
              {visitData.visitCoordinates.lat.toFixed(6)}, {visitData.visitCoordinates.lng.toFixed(6)}
            </div>
          </div>
        </div>

        {/* Clinic Location */}
        <div className="vlm-info-card">
          <div className="vlm-info-icon red">
            <Building size={20} />
          </div>
          <div className="vlm-info-content">
            <div className="vlm-info-label">Clinic Location</div>
            <div className="vlm-info-value">Expected Position</div>
            <div className="vlm-info-coords">
              {visitData.clinicCoordinates.lat.toFixed(6)}, {visitData.clinicCoordinates.lng.toFixed(6)}
            </div>
          </div>
        </div>

        {/* GPS Accuracy */}
        <div className="vlm-info-card">
          <div className="vlm-info-icon amber">
            <Target size={20} />
          </div>
          <div className="vlm-info-content">
            <div className="vlm-info-label">GPS Accuracy</div>
            <div className="vlm-info-value">±{visitData.accuracy || 10} meters</div>
          </div>
        </div>

        {/* Allowed Radius */}
        <div className="vlm-info-card">
          <div className="vlm-info-icon green">
            <Navigation size={20} />
          </div>
          <div className="vlm-info-content">
            <div className="vlm-info-label">Allowed Radius</div>
            <div className="vlm-info-value">{allowedRadius} meters</div>
          </div>
        </div>

        {/* Distance - Full Width */}
        <div
          className={`vlm-info-card vlm-distance-card ${
            verification.isVerified ? 'success' : 'warning'
          }`}
        >
          <div className={`vlm-info-icon ${verification.isVerified ? 'green' : 'red'}`}>
            <Ruler size={20} />
          </div>
          <div className="vlm-info-content">
            <div className="vlm-info-label">Calculated Distance</div>
            <div className="vlm-distance-value">
              {verification.distance}
              <span className="vlm-distance-unit">m</span>
            </div>
            <div className="vlm-distance-comparison">
              {verification.isVerified
                ? `✓ Within ${allowedRadius}m allowed radius`
                : `⚠ Exceeds ${allowedRadius}m allowed radius by ${verification.distance - allowedRadius}m`}
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="vlm-legend">
        <div className="vlm-legend-item">
          <div className="vlm-legend-marker blue" />
          Employee Location
        </div>
        <div className="vlm-legend-item">
          <div className="vlm-legend-marker red" />
          Clinic Location
        </div>
        <div className="vlm-legend-item">
          <div className="vlm-legend-line" />
          Distance Line
        </div>
        <div className="vlm-legend-item">
          <div className="vlm-legend-circle" />
          Allowed Radius ({allowedRadius}m)
        </div>
      </div>
    </div>
  );
};

export default VisitLocationMap;