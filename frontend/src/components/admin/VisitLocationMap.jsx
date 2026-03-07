/**
 * VisitLocationMap Component
 *
 * GPS Location Verification with single map view (Task 2.9)
 * Shows both clinic and employee locations on ONE map for easy comparison.
 *
 * Features:
 * - Blue marker: Doctor/Clinic location (Target)
 * - Red marker: Employee photo location (Actual)
 * - Dashed polyline connecting both points
 * - Green circle showing allowed radius (400m default)
 * - Verification badge (Verified/Suspicious)
 * - Distance deviation display
 *
 * PROPS (supports two formats):
 *
 * Format 1 - Individual props:
 * @prop {object} clinicCoords - { lat, lng } of doctor/clinic
 * @prop {object} employeeCoords - { lat, lng } of employee
 * @prop {number} allowedRadius - Allowed distance in meters (default: 400)
 * @prop {number} accuracy - GPS accuracy in meters
 *
 * Format 2 - visitData object:
 * @prop {object} visitData - {
 *   clinicLat, clinicLng,        // Clinic coordinates
 *   employeeLat, employeeLng,    // Employee coordinates
 *   clinicCoordinates,           // Alternative: { lat, lng }
 *   employeeCoordinates,         // Alternative: { lat, lng }
 *   accuracy,                    // GPS accuracy
 *   clinicName,                  // Optional: clinic name for display
 *   timestamp                    // Optional: visit timestamp
 * }
 */

import { useMemo } from 'react';
import { CheckCircle, AlertTriangle, MapPin } from 'lucide-react';
import MapView from '../common/MapView';

/* =============================================================================
   MOCK DATA EXAMPLE
   Use this as reference for the expected data structure
   ============================================================================= */

export const MOCK_VISIT_DATA = {
  // Example 1: Verified visit (~80m distance)
  verified: {
    clinicName: 'Santos Medical Clinic',
    clinicLat: 10.6969,
    clinicLng: 122.5648,
    employeeLat: 10.6975,
    employeeLng: 122.5652,
    accuracy: 12,
    timestamp: '2025-12-30T09:30:00Z',
  },
  // Example 2: Suspicious visit (~550m distance)
  suspicious: {
    clinicName: 'Rizal Health Center',
    clinicLat: 14.5995,
    clinicLng: 120.9842,
    employeeLat: 14.6040,
    employeeLng: 120.9890,
    accuracy: 18,
    timestamp: '2025-12-29T14:00:00Z',
  },
  // Example 3: Edge case (~380m distance)
  edge: {
    clinicName: 'Western Visayas Medical Center',
    clinicLat: 10.6920,
    clinicLng: 122.5700,
    employeeLat: 10.6954,
    employeeLng: 122.5700,
    accuracy: 15,
    timestamp: '2025-12-28T10:00:00Z',
  },
};

/* =============================================================================
   HAVERSINE FORMULA
   Calculates the great-circle distance between two GPS coordinates.
   Returns distance in meters.
   ============================================================================= */

const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371000; // Earth's radius in meters

  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

/* =============================================================================
   STYLES
   ============================================================================= */

const componentStyles = `
  .visit-location-map-wrapper {
    background: white;
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid #e5e7eb;
    box-shadow: 0 1px 3px rgba(0,0,0,0.08);
  }

  /* Legend */
  .vlm-legend {
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 12px 16px;
    background: #f9fafb;
    border-bottom: 1px solid #e5e7eb;
    font-size: 13px;
    flex-wrap: wrap;
  }

  .vlm-legend-item {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #4b5563;
  }

  .vlm-legend-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
  }

  .vlm-legend-dot.blue { background: #3b82f6; }
  .vlm-legend-dot.red { background: #ef4444; }

  .vlm-legend-line {
    width: 24px;
    height: 2px;
    background: repeating-linear-gradient(
      90deg,
      #6b7280 0px,
      #6b7280 4px,
      transparent 4px,
      transparent 8px
    );
  }

  .vlm-legend-circle {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: rgba(34, 197, 94, 0.2);
    border: 2px solid #22c55e;
  }

  /* Verification Panel */
  .vlm-verification {
    padding: 16px 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    border-top: 1px solid #e5e7eb;
    flex-wrap: wrap;
    background: #fafafa;
  }

  .vlm-stats {
    display: flex;
    align-items: center;
    gap: 24px;
    flex-wrap: wrap;
  }

  .vlm-stat {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .vlm-stat-label {
    font-size: 11px;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-weight: 500;
  }

  .vlm-stat-value {
    font-size: 16px;
    font-weight: 700;
    color: #1f2937;
  }

  .vlm-stat-value.warning {
    color: #dc2626;
  }

  .vlm-stat-value.success {
    color: #16a34a;
  }

  /* Verification Badge */
  .vlm-badge {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 18px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
  }

  .vlm-badge.verified {
    background: linear-gradient(135deg, #dcfce7, #bbf7d0);
    color: #15803d;
    border: 1px solid #86efac;
  }

  .vlm-badge.suspicious {
    background: linear-gradient(135deg, #fee2e2, #fecaca);
    color: #dc2626;
    border: 1px solid #fca5a5;
  }

  /* No Data State */
  .vlm-no-data {
    padding: 60px 20px;
    text-align: center;
    color: #6b7280;
  }

  .vlm-no-data-icon {
    width: 64px;
    height: 64px;
    margin: 0 auto 16px;
    background: #f3f4f6;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #9ca3af;
  }

  .vlm-no-data p {
    margin: 0;
    font-size: 14px;
  }

  @media (max-width: 540px) {
    .vlm-verification {
      flex-direction: column;
      align-items: flex-start;
      padding: 12px 16px;
    }
    .vlm-badge {
      width: 100%;
      justify-content: center;
      min-height: 44px;
    }
    .vlm-legend {
      gap: 12px;
      padding: 10px 12px;
      font-size: 12px;
    }
    .vlm-stats {
      gap: 16px;
      width: 100%;
    }
    .vlm-stat-value {
      font-size: 15px;
    }
  }
`;

/* =============================================================================
   COMPONENT: VisitLocationMap
   ============================================================================= */

const VisitLocationMap = ({
  // Format 1: Individual props
  clinicCoords = null,
  employeeCoords = null,
  // Format 2: visitData object
  visitData = null,
  // Common props
  allowedRadius = 400,
  accuracy = null,
  height = '300px',
}) => {
  /* ---------------------------------------------------------------------------
     Normalize coordinates from either prop format
     --------------------------------------------------------------------------- */

  const normalizedData = useMemo(() => {
    let clinic = null;
    let employee = null;
    let gpsAccuracy = accuracy;

    // Priority 1: Direct props
    if (clinicCoords && employeeCoords) {
      clinic = clinicCoords;
      employee = employeeCoords;
    }
    // Priority 2: visitData object
    else if (visitData) {
      // Try clinicCoordinates/employeeCoordinates format
      if (visitData.clinicCoordinates && visitData.employeeCoordinates) {
        clinic = visitData.clinicCoordinates;
        employee = visitData.employeeCoordinates;
      }
      // Try clinicLat/clinicLng format
      else if (visitData.clinicLat && visitData.clinicLng && visitData.employeeLat && visitData.employeeLng) {
        clinic = { lat: visitData.clinicLat, lng: visitData.clinicLng };
        employee = { lat: visitData.employeeLat, lng: visitData.employeeLng };
      }

      // Get accuracy from visitData if not provided directly
      if (!gpsAccuracy && visitData.accuracy) {
        gpsAccuracy = visitData.accuracy;
      }
    }

    return { clinic, employee, accuracy: gpsAccuracy || 10 };
  }, [clinicCoords, employeeCoords, visitData, accuracy]);

  /* ---------------------------------------------------------------------------
     Calculate verification result
     --------------------------------------------------------------------------- */

  const verification = useMemo(() => {
    const { clinic, employee } = normalizedData;

    if (!clinic || !employee) {
      return { distance: 0, isVerified: false, isValid: false };
    }

    const distance = calculateDistance(
      clinic.lat,
      clinic.lng,
      employee.lat,
      employee.lng
    );

    return {
      distance: Math.round(distance),
      isVerified: distance <= allowedRadius,
      isValid: true,
    };
  }, [normalizedData, allowedRadius]);

  /* ---------------------------------------------------------------------------
     Build map data
     --------------------------------------------------------------------------- */

  const { clinic, employee } = normalizedData;

  const mapCenter = useMemo(() => {
    if (!clinic || !employee) {
      return { lat: 10.7202, lng: 122.5621 };
    }
    return {
      lat: (clinic.lat + employee.lat) / 2,
      lng: (clinic.lng + employee.lng) / 2,
    };
  }, [clinic, employee]);

  const markers = useMemo(() => {
    if (!clinic || !employee) return [];
    return [
      {
        position: clinic,
        color: 'blue',
        label: 'Doctor/Clinic Location',
      },
      {
        position: employee,
        color: 'red',
        label: 'Employee Photo Location',
      },
    ];
  }, [clinic, employee]);

  const polylines = useMemo(() => {
    if (!clinic || !employee) return [];
    return [
      {
        positions: [clinic, employee],
        color: '#6b7280',
        dashed: true,
        weight: 2,
      },
    ];
  }, [clinic, employee]);

  const circles = useMemo(() => {
    if (!clinic) return [];
    return [
      {
        center: clinic,
        radius: allowedRadius,
        color: '#22c55e',
        fillColor: '#22c55e',
        fillOpacity: 0.12,
        weight: 2,
        dashed: true,
      },
    ];
  }, [clinic, allowedRadius]);

  // Calculate zoom based on distance
  const zoomLevel = useMemo(() => {
    if (verification.distance > 800) return 14;
    if (verification.distance > 400) return 15;
    if (verification.distance > 200) return 16;
    return 17;
  }, [verification.distance]);

  /* ---------------------------------------------------------------------------
     Render - No Data State
     --------------------------------------------------------------------------- */

  if (!verification.isValid) {
    return (
      <div className="visit-location-map-wrapper">
        <style>{componentStyles}</style>
        <div className="vlm-no-data">
          <div className="vlm-no-data-icon">
            <MapPin size={28} />
          </div>
          <p>Location data not available for verification</p>
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------------------
     Render - Map with Verification
     --------------------------------------------------------------------------- */

  return (
    <div className="visit-location-map-wrapper">
      <style>{componentStyles}</style>

      {/* Legend */}
      <div className="vlm-legend">
        <div className="vlm-legend-item">
          <span className="vlm-legend-dot blue" />
          Clinic Location
        </div>
        <div className="vlm-legend-item">
          <span className="vlm-legend-dot red" />
          Employee Location
        </div>
        <div className="vlm-legend-item">
          <span className="vlm-legend-line" />
          Distance Line
        </div>
        <div className="vlm-legend-item">
          <span className="vlm-legend-circle" />
          Allowed Zone ({allowedRadius}m)
        </div>
      </div>

      {/* Map */}
      <MapView
        center={mapCenter}
        zoom={zoomLevel}
        markers={markers}
        polylines={polylines}
        circles={circles}
        height={height}
      />

      {/* Verification Panel */}
      <div className="vlm-verification">
        <div className="vlm-stats">
          <div className="vlm-stat">
            <span className="vlm-stat-label">Distance Deviation</span>
            <span className={`vlm-stat-value ${verification.isVerified ? 'success' : 'warning'}`}>
              {verification.distance} meters
            </span>
          </div>
          <div className="vlm-stat">
            <span className="vlm-stat-label">Allowed Radius</span>
            <span className="vlm-stat-value">{allowedRadius}m</span>
          </div>
          <div className="vlm-stat">
            <span className="vlm-stat-label">GPS Accuracy</span>
            <span className="vlm-stat-value">±{normalizedData.accuracy}m</span>
          </div>
        </div>

        <div className={`vlm-badge ${verification.isVerified ? 'verified' : 'suspicious'}`}>
          {verification.isVerified ? (
            <>
              <CheckCircle size={18} />
              Verified ✓
            </>
          ) : (
            <>
              <AlertTriangle size={18} />
              Suspicious ⚠
            </>
          )}
        </div>
      </div>
    </div>
  );
};

/* =============================================================================
   DEFAULT EXPORT WITH MOCK DATA WRAPPER
   For standalone testing - renders with suspicious mock data by default
   ============================================================================= */

const VisitLocationMapWithMockData = (props) => {
  // Use suspicious mock data by default to show the warning state
  const defaultMockData = MOCK_VISIT_DATA.suspicious;

  return (
    <VisitLocationMap
      visitData={defaultMockData}
      allowedRadius={400}
      {...props}
    />
  );
};

// Export both
export { VisitLocationMap, VisitLocationMapWithMockData };
export default VisitLocationMap;