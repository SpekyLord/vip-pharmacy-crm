/**
 * MapView Component
 *
 * Reusable wrapper around react-leaflet (Task 2.9)
 * Supports multiple markers, polylines, and circles on a single map.
 *
 * Features:
 * - Custom colored markers (fixes Leaflet default icon issue)
 * - Polyline support with dashed option
 * - Circle overlay for radius visualization
 * - Clean, minimal UI
 *
 * @prop {object} center - { lat, lng } for map center
 * @prop {number} zoom - Initial zoom level (default: 16)
 * @prop {array} markers - Array of { position, color, label }
 * @prop {array} polylines - Array of { positions, color, dashed }
 * @prop {array} circles - Array of { center, radius, color }
 * @prop {string} height - Map container height (default: '300px')
 */

import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/* =============================================================================
   CUSTOM MARKER ICONS
   Fixes the default Leaflet marker icon issue in React/Vite builds.
   Creates colored pin markers using inline SVG/HTML.
   ============================================================================= */

const createMarkerIcon = (color = '#3b82f6') => {
  const markerHtml = `
    <div style="position: relative; display: flex; align-items: center; justify-content: center;">
      <svg width="28" height="36" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 22 14 22s14-11.5 14-22c0-7.732-6.268-14-14-14z" fill="${color}"/>
        <circle cx="14" cy="12" r="5" fill="white"/>
      </svg>
    </div>
  `;

  return new L.DivIcon({
    className: 'custom-marker-icon',
    html: markerHtml,
    iconSize: [28, 36],
    iconAnchor: [14, 36],
    popupAnchor: [0, -36],
  });
};

// Pre-defined marker colors
const MARKER_COLORS = {
  blue: '#3b82f6',
  red: '#ef4444',
  green: '#22c55e',
  amber: '#f59e0b',
  purple: '#a855f7',
};

/* =============================================================================
   STYLES
   ============================================================================= */

const mapStyles = `
  .map-view-container {
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid #e5e7eb;
    box-shadow: 0 1px 3px rgba(0,0,0,0.08);
  }

  .map-view-container .leaflet-container {
    width: 100%;
    font-family: inherit;
  }

  .custom-marker-icon {
    background: transparent;
    border: none;
  }

  .leaflet-popup-content-wrapper {
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  }

  .leaflet-popup-content {
    margin: 10px 12px;
    font-size: 13px;
    line-height: 1.4;
  }

  .marker-popup {
    text-align: center;
  }

  .marker-popup-label {
    font-weight: 600;
    color: #1f2937;
    margin-bottom: 2px;
  }

  .marker-popup-coords {
    font-size: 10px;
    color: #6b7280;
    font-family: monospace;
  }
`;

/* =============================================================================
   COMPONENT: MapView
   ============================================================================= */

const MapView = ({
  center = { lat: 10.7202, lng: 122.5621 },
  zoom = 16,
  markers = [],
  polylines = [],
  circles = [],
  height = '300px',
  scrollWheelZoom = true,
}) => {
  return (
    <div className="map-view-container" style={{ height }}>
      <style>{mapStyles}</style>
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={zoom}
        scrollWheelZoom={scrollWheelZoom}
        zoomControl={true}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Render Circles First (below markers) */}
        {circles.map((circle, idx) => (
          <Circle
            key={`circle-${idx}`}
            center={[circle.center.lat, circle.center.lng]}
            radius={circle.radius}
            pathOptions={{
              color: circle.color || '#22c55e',
              fillColor: circle.fillColor || circle.color || '#22c55e',
              fillOpacity: circle.fillOpacity || 0.15,
              weight: circle.weight || 2,
              dashArray: circle.dashed ? '5, 10' : undefined,
            }}
          />
        ))}

        {/* Render Polylines */}
        {polylines.map((line, idx) => (
          <Polyline
            key={`polyline-${idx}`}
            positions={line.positions.map((p) => [p.lat, p.lng])}
            pathOptions={{
              color: line.color || '#6b7280',
              weight: line.weight || 2,
              dashArray: line.dashed ? '8, 8' : undefined,
              opacity: line.opacity || 0.8,
            }}
          />
        ))}

        {/* Render Markers */}
        {markers.map((marker, idx) => {
          const colorHex = MARKER_COLORS[marker.color] || MARKER_COLORS.blue;
          const icon = createMarkerIcon(colorHex);

          return (
            <Marker
              key={`marker-${idx}`}
              position={[marker.position.lat, marker.position.lng]}
              icon={icon}
            >
              {marker.label && (
                <Popup>
                  <div className="marker-popup">
                    <div className="marker-popup-label">{marker.label}</div>
                    <div className="marker-popup-coords">
                      {marker.position.lat.toFixed(6)}, {marker.position.lng.toFixed(6)}
                    </div>
                  </div>
                </Popup>
              )}
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
};

export default MapView;