/**
 * GPSVerificationPage
 *
 * Test/Demo page for GPS Location Verification (Task 2.9)
 * Showcases the VisitLocationMap component with different scenarios.
 *
 * Threshold: 400 meters
 * - Within 400m = VERIFIED ✓
 * - Beyond 400m = SUSPICIOUS ⚠
 *
 * Test Scenarios:
 * 1. Suspicious: ~550m distance (exceeds 400m threshold)
 * 2. Verified: ~80m distance (well within 400m threshold)
 * 3. Edge Case: ~380m (just within threshold)
 *
 * Route: /admin/gps-verification
 */

import { useState } from 'react';
import {
  MapPin,
  AlertTriangle,
  CheckCircle,
  Navigation,
  Info,
} from 'lucide-react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import VisitLocationMap, { MOCK_VISIT_DATA } from '../../components/admin/VisitLocationMap';

/* =============================================================================
   MOCK SCENARIOS
   Using coordinates from Iloilo City, Philippines for realistic testing
   ============================================================================= */

const MOCK_SCENARIOS = {
  suspicious: {
    name: 'Suspicious - Location Mismatch',
    description: 'Employee photo taken ~550m away from clinic (exceeds 400m threshold)',
    icon: AlertTriangle,
    color: 'red',
    // Using visitData format (old style)
    visitData: {
      clinicName: 'Rizal Health Center',
      clinicLat: 14.5995,
      clinicLng: 120.9842,
      employeeLat: 14.6040,
      employeeLng: 120.9890,
      accuracy: 18,
      timestamp: new Date().toISOString(),
    },
  },
  verified: {
    name: 'Verified - Within Range',
    description: 'Employee photo taken ~80m from clinic (well within 400m threshold)',
    icon: CheckCircle,
    color: 'green',
    // Using individual coords format (new style)
    clinicCoords: { lat: 10.6969, lng: 122.5648 },
    employeeCoords: { lat: 10.6975, lng: 122.5652 },
    accuracy: 12,
  },
  edge: {
    name: 'Edge Case - Near Threshold',
    description: 'Employee photo taken ~380m from clinic (just within 400m threshold)',
    icon: Navigation,
    color: 'amber',
    // Using visitData with clinicCoordinates format (alternative)
    visitData: {
      clinicName: 'Western Visayas Medical Center',
      clinicCoordinates: { lat: 10.6920, lng: 122.5700 },
      employeeCoordinates: { lat: 10.6954, lng: 122.5700 },
      accuracy: 15,
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    },
  },
};

/* =============================================================================
   STYLES
   ============================================================================= */

const pageStyles = `
  .gps-page-layout {
    min-height: 100vh;
    background: #f3f4f6;
  }

  .gps-page-content {
    display: flex;
  }

  .gps-page-main {
    flex: 1;
    padding: 24px;
    max-width: 1200px;
  }

  /* Page Header */
  .page-header {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 24px;
  }

  .page-header h1 {
    margin: 0;
    font-size: 28px;
    color: #1f2937;
  }

  .page-header-icon {
    width: 48px;
    height: 48px;
    background: linear-gradient(135deg, #3b82f6, #2563eb);
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
  }

  /* Info Banner */
  .info-banner {
    background: linear-gradient(135deg, #eff6ff, #dbeafe);
    border: 1px solid #bfdbfe;
    border-radius: 12px;
    padding: 16px 20px;
    margin-bottom: 24px;
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .info-banner-icon {
    width: 40px;
    height: 40px;
    background: white;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #2563eb;
    flex-shrink: 0;
  }

  .info-banner-content {
    flex: 1;
  }

  .info-banner-title {
    font-weight: 600;
    color: #1e40af;
    margin-bottom: 2px;
  }

  .info-banner-text {
    font-size: 14px;
    color: #3b82f6;
  }

  /* Scenario Selector */
  .scenario-selector {
    background: white;
    border-radius: 16px;
    padding: 24px;
    margin-bottom: 24px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    border: 1px solid #e5e7eb;
  }

  .scenario-selector h3 {
    margin: 0 0 20px 0;
    font-size: 16px;
    font-weight: 600;
    color: #1f2937;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .scenario-buttons {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }

  .scenario-btn {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 24px;
    border-radius: 12px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    border: 2px solid transparent;
    transition: all 0.2s;
    flex: 1;
    min-width: 180px;
    justify-content: center;
  }

  .scenario-btn.red {
    background: linear-gradient(135deg, #fef2f2, #fee2e2);
    color: #dc2626;
    border-color: #fecaca;
  }

  .scenario-btn.red:hover,
  .scenario-btn.red.active {
    background: linear-gradient(135deg, #fee2e2, #fecaca);
    border-color: #dc2626;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(220, 38, 38, 0.2);
  }

  .scenario-btn.green {
    background: linear-gradient(135deg, #f0fdf4, #dcfce7);
    color: #16a34a;
    border-color: #bbf7d0;
  }

  .scenario-btn.green:hover,
  .scenario-btn.green.active {
    background: linear-gradient(135deg, #dcfce7, #bbf7d0);
    border-color: #16a34a;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(34, 197, 94, 0.2);
  }

  .scenario-btn.amber {
    background: linear-gradient(135deg, #fefce8, #fef9c3);
    color: #b45309;
    border-color: #fde047;
  }

  .scenario-btn.amber:hover,
  .scenario-btn.amber.active {
    background: linear-gradient(135deg, #fef9c3, #fde047);
    border-color: #f59e0b;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(245, 158, 11, 0.2);
  }

  .scenario-description {
    margin-top: 20px;
    padding: 16px 20px;
    background: #f9fafb;
    border-radius: 10px;
    font-size: 14px;
    color: #4b5563;
    border-left: 4px solid #3b82f6;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .scenario-description strong {
    color: #1f2937;
  }

  .scenario-description-icon {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .scenario-description-icon.red {
    background: #fee2e2;
    color: #dc2626;
  }

  .scenario-description-icon.green {
    background: #dcfce7;
    color: #16a34a;
  }

  .scenario-description-icon.amber {
    background: #fef3c7;
    color: #d97706;
  }

  /* Props Reference */
  .props-reference {
    background: white;
    border-radius: 16px;
    padding: 24px;
    margin-top: 24px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    border: 1px solid #e5e7eb;
  }

  .props-reference h3 {
    margin: 0 0 16px 0;
    font-size: 16px;
    font-weight: 600;
    color: #1f2937;
  }

  .props-code {
    background: #1f2937;
    border-radius: 10px;
    padding: 20px;
    overflow-x: auto;
  }

  .props-code pre {
    margin: 0;
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: 13px;
    color: #e5e7eb;
    line-height: 1.6;
  }

  .props-code .comment {
    color: #6b7280;
  }

  .props-code .key {
    color: #93c5fd;
  }

  .props-code .value {
    color: #86efac;
  }

  .props-code .number {
    color: #fde68a;
  }

  @media (max-width: 768px) {
    .scenario-buttons {
      flex-direction: column;
    }
    .scenario-btn {
      min-width: 100%;
    }
  }
`;

/* =============================================================================
   COMPONENT: GPSVerificationPage
   ============================================================================= */

const GPSVerificationPage = () => {
  const [activeScenario, setActiveScenario] = useState('suspicious');
  const scenario = MOCK_SCENARIOS[activeScenario];
  const ScenarioIcon = scenario.icon;

  return (
    <div className="gps-page-layout">
      <style>{pageStyles}</style>
      <Navbar />
      <div className="gps-page-content">
        <Sidebar />
        <main className="gps-page-main">
          {/* Page Header */}
          <div className="page-header">
            <div className="page-header-icon">
              <MapPin size={24} />
            </div>
            <h1>GPS Verification Demo</h1>
          </div>

          {/* Info Banner */}
          <div className="info-banner">
            <div className="info-banner-icon">
              <Info size={20} />
            </div>
            <div className="info-banner-content">
              <div className="info-banner-title">Verification Threshold: 400 meters</div>
              <div className="info-banner-text">
                Visits with employee photo taken within 400m of the clinic are marked as VERIFIED.
                Beyond 400m is flagged as SUSPICIOUS.
              </div>
            </div>
          </div>

          {/* Scenario Selector */}
          <div className="scenario-selector">
            <h3>
              <Navigation size={18} />
              Select Test Scenario
            </h3>
            <div className="scenario-buttons">
              <button
                className={`scenario-btn red ${activeScenario === 'suspicious' ? 'active' : ''}`}
                onClick={() => setActiveScenario('suspicious')}
              >
                <AlertTriangle size={18} />
                Suspicious (~550m)
              </button>
              <button
                className={`scenario-btn green ${activeScenario === 'verified' ? 'active' : ''}`}
                onClick={() => setActiveScenario('verified')}
              >
                <CheckCircle size={18} />
                Verified (~80m)
              </button>
              <button
                className={`scenario-btn amber ${activeScenario === 'edge' ? 'active' : ''}`}
                onClick={() => setActiveScenario('edge')}
              >
                <Navigation size={18} />
                Edge Case (~380m)
              </button>
            </div>
            <div className="scenario-description">
              <div className={`scenario-description-icon ${scenario.color}`}>
                <ScenarioIcon size={18} />
              </div>
              <div>
                <strong>{scenario.name}:</strong> {scenario.description}
              </div>
            </div>
          </div>

          {/* Map Component - Supports multiple prop formats */}
          <VisitLocationMap
            key={activeScenario}
            // Pass visitData if available
            visitData={scenario.visitData || null}
            // Or pass individual coords
            clinicCoords={scenario.clinicCoords || null}
            employeeCoords={scenario.employeeCoords || null}
            // Common props
            allowedRadius={400}
            accuracy={scenario.accuracy || null}
            height="350px"
          />

          {/* Props Reference */}
          <div className="props-reference">
            <h3>📚 Component Usage Reference</h3>
            <div className="props-code">
              <pre>
{`// Format 1: Using visitData object
<VisitLocationMap
  visitData={{
    clinicLat: 10.6969,
    clinicLng: 122.5648,
    employeeLat: 10.6975,
    employeeLng: 122.5652,
    accuracy: 12,
    clinicName: 'Santos Clinic'  // optional
  }}
  allowedRadius={400}
/>

// Format 2: Using individual props
<VisitLocationMap
  clinicCoords={{ lat: 10.6969, lng: 122.5648 }}
  employeeCoords={{ lat: 10.6975, lng: 122.5652 }}
  accuracy={12}
  allowedRadius={400}
/>

// Format 3: Using visitData with coordinate objects
<VisitLocationMap
  visitData={{
    clinicCoordinates: { lat: 10.6969, lng: 122.5648 },
    employeeCoordinates: { lat: 10.6975, lng: 122.5652 },
    accuracy: 12
  }}
  allowedRadius={400}
/>`}
              </pre>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default GPSVerificationPage;