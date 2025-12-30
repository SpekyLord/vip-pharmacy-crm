/**
 * GPSVerificationPage
 *
 * Test/Demo page for GPS Location Verification (Task 2.9)
 * Showcases the VisitLocationMap component with mock data.
 *
 * Includes two test scenarios:
 * 1. Suspicious: ~350m distance (exceeds 200m threshold)
 * 2. Verified: ~80m distance (within 200m threshold)
 *
 * Route: /admin/gps-verification (for testing)
 */

import { useState } from 'react';
import {
  MapPin,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
} from 'lucide-react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import VisitLocationMap from '../../components/admin/VisitLocationMap';

/* =============================================================================
   MOCK DATA
   Two scenarios in Iloilo City for testing verification logic
   ============================================================================= */

const MOCK_SCENARIOS = {
  suspicious: {
    name: 'Suspicious Visit',
    description: 'Employee logged visit ~350m away from clinic location',
    visitData: {
      visitCoordinates: {
        lat: 10.7235, // Near SM City Iloilo
        lng: 122.5580,
      },
      clinicCoordinates: {
        lat: 10.7202, // Iloilo City Center (Plaza Libertad area)
        lng: 122.5621,
      },
      accuracy: 15,
    },
  },
  verified: {
    name: 'Verified Visit',
    description: 'Employee logged visit ~80m from clinic location',
    visitData: {
      visitCoordinates: {
        lat: 10.7208, // Very close to clinic
        lng: 122.5615,
      },
      clinicCoordinates: {
        lat: 10.7202, // Iloilo City Center
        lng: 122.5621,
      },
      accuracy: 10,
    },
  },
  edge: {
    name: 'Edge Case (~200m)',
    description: 'Employee logged visit right at the boundary (~195m)',
    visitData: {
      visitCoordinates: {
        lat: 10.7220,
        lng: 122.5621,
      },
      clinicCoordinates: {
        lat: 10.7202,
        lng: 122.5621,
      },
      accuracy: 12,
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

  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 24px;
  }

  .page-header h1 {
    margin: 0;
    font-size: 28px;
    color: #1f2937;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .page-header-icon {
    width: 40px;
    height: 40px;
    background: linear-gradient(135deg, #3b82f6, #2563eb);
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
  }

  /* Scenario Selector */
  .scenario-selector {
    background: white;
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 24px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  }

  .scenario-selector h3 {
    margin: 0 0 16px 0;
    font-size: 16px;
    font-weight: 600;
    color: #1f2937;
  }

  .scenario-buttons {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }

  .scenario-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 20px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    border: 2px solid transparent;
  }

  .scenario-btn.suspicious {
    background: #fef2f2;
    color: #dc2626;
    border-color: #fecaca;
  }

  .scenario-btn.suspicious:hover,
  .scenario-btn.suspicious.active {
    background: #fee2e2;
    border-color: #dc2626;
  }

  .scenario-btn.verified {
    background: #f0fdf4;
    color: #16a34a;
    border-color: #bbf7d0;
  }

  .scenario-btn.verified:hover,
  .scenario-btn.verified.active {
    background: #dcfce7;
    border-color: #16a34a;
  }

  .scenario-btn.edge {
    background: #fef9c3;
    color: #a16207;
    border-color: #fde047;
  }

  .scenario-btn.edge:hover,
  .scenario-btn.edge.active {
    background: #fef08a;
    border-color: #ca8a04;
  }

  .scenario-description {
    margin-top: 12px;
    padding: 12px 16px;
    background: #f9fafb;
    border-radius: 8px;
    font-size: 14px;
    color: #6b7280;
  }

  /* Result Panel */
  .result-panel {
    margin-top: 20px;
    padding: 16px 20px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .result-panel.verified {
    background: #dcfce7;
    border: 1px solid #86efac;
  }

  .result-panel.suspicious {
    background: #fee2e2;
    border: 1px solid #fca5a5;
  }

  .result-panel-icon {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .result-panel.verified .result-panel-icon {
    background: #16a34a;
    color: white;
  }

  .result-panel.suspicious .result-panel-icon {
    background: #dc2626;
    color: white;
  }

  .result-panel-content h4 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }

  .result-panel.verified .result-panel-content h4 {
    color: #15803d;
  }

  .result-panel.suspicious .result-panel-content h4 {
    color: #dc2626;
  }

  .result-panel-content p {
    margin: 4px 0 0;
    font-size: 14px;
    color: #6b7280;
  }
`;

/* =============================================================================
   COMPONENT: GPSVerificationPage
   ============================================================================= */

const GPSVerificationPage = () => {
  const [activeScenario, setActiveScenario] = useState('suspicious');
  const [verificationResult, setVerificationResult] = useState(null);

  const currentScenario = MOCK_SCENARIOS[activeScenario];

  const handleVerificationResult = (result) => {
    setVerificationResult(result);
  };

  return (
    <div className="gps-page-layout">
      <style>{pageStyles}</style>
      <Navbar />
      <div className="gps-page-content">
        <Sidebar />
        <main className="gps-page-main">
          {/* Page Header */}
          <div className="page-header">
            <h1>
              <div className="page-header-icon">
                <MapPin size={20} />
              </div>
              GPS Verification Demo
            </h1>
          </div>

          {/* Scenario Selector */}
          <div className="scenario-selector">
            <h3>Select Test Scenario</h3>
            <div className="scenario-buttons">
              <button
                className={`scenario-btn suspicious ${activeScenario === 'suspicious' ? 'active' : ''}`}
                onClick={() => setActiveScenario('suspicious')}
              >
                <AlertTriangle size={18} />
                Suspicious (~350m)
              </button>
              <button
                className={`scenario-btn verified ${activeScenario === 'verified' ? 'active' : ''}`}
                onClick={() => setActiveScenario('verified')}
              >
                <CheckCircle size={18} />
                Verified (~80m)
              </button>
              <button
                className={`scenario-btn edge ${activeScenario === 'edge' ? 'active' : ''}`}
                onClick={() => setActiveScenario('edge')}
              >
                <RefreshCw size={18} />
                Edge Case (~195m)
              </button>
            </div>
            <div className="scenario-description">
              <strong>{currentScenario.name}:</strong> {currentScenario.description}
            </div>
          </div>

          {/* Verification Map Component */}
          <VisitLocationMap
            key={activeScenario} // Force re-render on scenario change
            visitData={currentScenario.visitData}
            allowedRadius={200}
            onVerificationResult={handleVerificationResult}
          />

          {/* Result Panel */}
          {verificationResult && (
            <div className={`result-panel ${verificationResult.isVerified ? 'verified' : 'suspicious'}`}>
              <div className="result-panel-icon">
                {verificationResult.isVerified ? (
                  <CheckCircle size={20} />
                ) : (
                  <AlertTriangle size={20} />
                )}
              </div>
              <div className="result-panel-content">
                <h4>
                  {verificationResult.isVerified
                    ? 'Location Verified'
                    : 'Location Mismatch Detected'}
                </h4>
                <p>
                  Distance: {verificationResult.distance}m | Threshold: 200m |
                  Status: {verificationResult.isVerified ? 'PASS' : 'FAIL'}
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default GPSVerificationPage;