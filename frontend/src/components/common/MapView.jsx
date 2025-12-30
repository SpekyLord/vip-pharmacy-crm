/**
 * MapView Component
 *
 * Reusable wrapper around react-leaflet (Task 2.9)
 * Provides a clean interface for embedding maps throughout the app.
 *
 * Features:
 * - Configurable center and zoom
 * - Support for multiple markers with custom icons
 * - Polyline and Circle overlays
 * - Custom marker icons (fixes Leaflet default icon issue)
 *
 * @prop {object} center - { lat, lng } for map center
 * @prop {number} zoom - Initial zoom level (default: 15)
 * @prop {array} markers - Array of marker objects { position, color, label, popup }
 * @prop {array} polylines - Array of polyline objects { positions, color, dashed }
 * @prop {array} circles - Array of circle objects { center, radius, color }
 * @prop {string} height - Map container height (default: '400px')
 * @prop {boolean} scrollWheelZoom - Enable scroll zoom (default: false)
 */

import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/* =============================================================================
   CUSTOM MARKER ICONS
   Fixes the default Leaflet marker icon issue in React/Vite builds.
   Creates colored pin markers using inline SVG.
   ============================================================================= */

const createMarkerIcon = (color = '#3b82f6', label = '') => {
  const markerHtml = `
    <div style="position: relative;">
      <svg width="32" height="40" viewBox="0 0 32 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 0C7.164 0 0 7.164 0 16c0 12 16 24 16 24s16-12 16-24c0-8.836-7.164-16-16-16z" fill="${color}"/>
        <circle cx="16" cy="14" r="6" fill="white"/>
      </svg>
      ${label ? `<span style="
        position: absolute;
        top: 6px;
        left: 50%;
        transform: translateX(-50%);
        font-size: 10px;
        font-weight: bold;
        color: ${color};
      ">${label}</span>` : ''}
    </div>
  `;

  return new L.DivIcon({
    className: 'custom-marker-icon',
    html: markerHtml,
    iconSize: [32, 40],
    iconAnchor: [16, 40],
    popupAnchor: [0, -40],
  });
};

// Pre-defined marker colors
const MARKER_ICONS = {
  blue: createMarkerIcon('#3b82f6'),
  red: createMarkerIcon('#ef4444'),
  green: createMarkerIcon('#22c55e'),
  amber: createMarkerIcon('#f59e0b'),
  purple: createMarkerIcon('#a855f7'),
  default: createMarkerIcon('#6b7280'),
};

/* =============================================================================
   STYLES
   ============================================================================= */

const mapStyles = `
  .map-view-container {
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid #e5e7eb;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  }

  .map-view-container .leaflet-container {
    width: 100%;
    border-radius: 12px;
    font-family: inherit;
  }

  .custom-marker-icon {
    background: transparent;
    border: none;
  }

  .leaflet-popup-content-wrapper {
    border-radius: 10px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  }

  .leaflet-popup-content {
    margin: 12px 14px;
    font-size: 14px;
    line-height: 1.4;
  }

  .marker-popup-title {
    font-weight: 600;
    color: #1f2937;
    margin-bottom: 4px;
  }

  .marker-popup-subtitle {
    font-size: 12px;
    color: #6b7280;
  }
`;

/* =============================================================================
   COMPONENT: MapView
   ============================================================================= */

const MapView = ({
  center = { lat: 10.7202, lng: 122.5621 }, // Default: Iloilo City
  zoom = 15,
  markers = [],
  polylines = [],
  circles = [],
  height = '400px',
  scrollWheelZoom = false,
  className = '',
}) => {
  return (
    <div className={`map-view-container ${className}`} style={{ height }}>
      <style>{mapStyles}</style>
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={zoom}
        scrollWheelZoom={scrollWheelZoom}
        style={{ height: '100%', width: '100%' }}
      >
        {/* OpenStreetMap Tile Layer */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Circles (render first so they're below markers) */}
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

        {/* Polylines */}
        {polylines.map((line, idx) => (
          <Polyline
            key={`polyline-${idx}`}
            positions={line.positions.map((p) => [p.lat, p.lng])}
            pathOptions={{
              color: line.color || '#6b7280',
              weight: line.weight || 3,
              dashArray: line.dashed ? '10, 10' : undefined,
              opacity: line.opacity || 0.8,
            }}
          />
        ))}

        {/* Markers */}
        {markers.map((marker, idx) => (
          <Marker
            key={`marker-${idx}`}
            position={[marker.position.lat, marker.position.lng]}
            icon={MARKER_ICONS[marker.color] || MARKER_ICONS.default}
          >
            {marker.popup && (
              <Popup>
                <div className="marker-popup-title">{marker.popup.title}</div>
                {marker.popup.subtitle && (
                  <div className="marker-popup-subtitle">{marker.popup.subtitle}</div>
                )}
              </Popup>
            )}
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
};

export default MapView;