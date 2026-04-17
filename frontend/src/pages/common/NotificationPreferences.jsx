/**
 * NotificationPreferences Page
 *
 * Settings page for managing notification preferences.
 *
 * Features:
 * - Push notification toggle (connected to hook)
 * - Notification channels (Email, SMS, In-App)
 * - Notification categories (Approvals, Alerts, System)
 * - Quiet hours configuration
 * - Save preferences functionality
 *
 * Route: /notifications/preferences
 */

import { useState, useEffect } from 'react';
import {
  Bell,
  BellOff,
  Mail,
  MessageSquare,
  Smartphone,
  Shield,
  CheckCircle,
  AlertTriangle,
  Settings,
  Clock,
  Save,
  ArrowLeft,
  Info,
  Loader2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import usePushNotifications from '../../hooks/usePushNotifications';
import notificationPreferenceService from '../../services/notificationPreferenceService';
import PageGuide from '../../components/common/PageGuide';

/* =============================================================================
   STYLES
   ============================================================================= */

const styles = `
  .np-layout {
    min-height: 100vh;
    background: #f3f4f6;
  }

  .np-content {
    display: flex;
  }

  .np-main {
    flex: 1;
    padding: 24px;
    max-width: 800px;
  }

  /* Header */
  .np-header {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 24px;
  }

  .np-back-btn {
    width: 44px;
    height: 44px;
    border-radius: 10px;
    border: none;
    background: white;
    color: #6b7280;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    transition: all 0.15s;
  }

  .np-back-btn:hover {
    background: #f3f4f6;
    color: #374151;
  }

  .np-header-content h1 {
    margin: 0 0 4px 0;
    font-size: 24px;
    font-weight: 700;
    color: #1f2937;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .np-header-content p {
    margin: 0;
    font-size: 14px;
    color: #6b7280;
  }

  /* Card */
  .np-card {
    background: white;
    border-radius: 16px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    border: 1px solid #e5e7eb;
    margin-bottom: 20px;
    overflow: hidden;
  }

  .np-card-header {
    padding: 18px 20px;
    border-bottom: 1px solid #e5e7eb;
    background: #fafafa;
  }

  .np-card-title {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 16px;
    font-weight: 600;
    color: #1f2937;
    margin: 0 0 4px 0;
  }

  .np-card-title .icon {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
  }

  .np-card-title .icon.blue { background: #3b82f6; }
  .np-card-title .icon.purple { background: #8b5cf6; }
  .np-card-title .icon.amber { background: #f59e0b; }
  .np-card-title .icon.green { background: #22c55e; }

  .np-card-desc {
    font-size: 13px;
    color: #6b7280;
    margin: 0;
  }

  .np-card-body {
    padding: 20px;
  }

  /* Push Toggle (Large) */
  .np-push-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px;
    background: #f9fafb;
    border-radius: 12px;
    border: 1px solid #e5e7eb;
  }

  .np-push-info {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .np-push-icon {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .np-push-icon.enabled {
    background: #dcfce7;
    color: #16a34a;
  }

  .np-push-icon.disabled {
    background: #f3f4f6;
    color: #9ca3af;
  }

  .np-push-text h3 {
    margin: 0 0 4px 0;
    font-size: 15px;
    font-weight: 600;
    color: #1f2937;
  }

  .np-push-text p {
    margin: 0;
    font-size: 13px;
    color: #6b7280;
  }

  /* Toggle Switch */
  .np-switch {
    position: relative;
    width: 52px;
    height: 28px;
    flex-shrink: 0;
  }

  .np-switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .np-switch-slider {
    position: absolute;
    cursor: pointer;
    inset: 0;
    background: #d1d5db;
    border-radius: 14px;
    transition: all 0.3s;
  }

  .np-switch-slider::before {
    content: '';
    position: absolute;
    width: 22px;
    height: 22px;
    left: 3px;
    bottom: 3px;
    background: white;
    border-radius: 50%;
    transition: all 0.3s;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
  }

  .np-switch input:checked + .np-switch-slider {
    background: #22c55e;
  }

  .np-switch input:checked + .np-switch-slider::before {
    transform: translateX(24px);
  }

  .np-switch input:disabled + .np-switch-slider {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Permission Alert */
  .np-permission-alert {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 14px 16px;
    background: #fef3c7;
    border: 1px solid #fcd34d;
    border-radius: 10px;
    margin-top: 16px;
  }

  .np-permission-alert.denied {
    background: #fee2e2;
    border-color: #fca5a5;
  }

  .np-permission-alert .icon {
    flex-shrink: 0;
    color: #d97706;
  }

  .np-permission-alert.denied .icon {
    color: #dc2626;
  }

  .np-permission-alert p {
    margin: 0;
    font-size: 13px;
    color: #92400e;
  }

  .np-permission-alert.denied p {
    color: #991b1b;
  }

  .np-permission-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-top: 10px;
    padding: 8px 14px;
    background: white;
    border: 1px solid #fcd34d;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    color: #92400e;
    cursor: pointer;
    transition: all 0.15s;
  }

  .np-permission-btn:hover {
    background: #fef9c3;
  }

  /* Option Row */
  .np-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 0;
    border-bottom: 1px solid #f3f4f6;
  }

  .np-option:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }

  .np-option:first-child {
    padding-top: 0;
  }

  .np-option-info {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .np-option-icon {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f3f4f6;
    color: #6b7280;
  }

  .np-option-icon.blue { background: #dbeafe; color: #2563eb; }
  .np-option-icon.green { background: #dcfce7; color: #16a34a; }
  .np-option-icon.purple { background: #f3e8ff; color: #7c3aed; }
  .np-option-icon.amber { background: #fef3c7; color: #d97706; }
  .np-option-icon.red { background: #fee2e2; color: #dc2626; }
  .np-option-icon.cyan { background: #cffafe; color: #0891b2; }

  .np-option-text h4 {
    margin: 0 0 2px 0;
    font-size: 14px;
    font-weight: 600;
    color: #1f2937;
  }

  .np-option-text p {
    margin: 0;
    font-size: 12px;
    color: #6b7280;
  }

  /* Checkbox */
  .np-checkbox {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }

  .np-checkbox input {
    width: 20px;
    height: 20px;
    accent-color: #2563eb;
    cursor: pointer;
  }

  .np-checkbox span {
    font-size: 14px;
    color: #374151;
  }

  /* Quiet Hours */
  .np-quiet-hours {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .np-time-input {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .np-time-input label {
    font-size: 13px;
    color: #6b7280;
  }

  .np-time-input input {
    padding: 8px 12px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    font-size: 14px;
    color: #374151;
    width: 110px;
  }

  .np-time-input input:focus {
    outline: none;
    border-color: #2563eb;
  }

  /* Save Button */
  .np-save-section {
    display: flex;
    justify-content: flex-end;
    padding: 20px;
    border-top: 1px solid #e5e7eb;
    background: #fafafa;
  }

  .np-save-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 24px;
    background: #2563eb;
    color: white;
    border: none;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }

  .np-save-btn:hover {
    background: #1d4ed8;
  }

  .np-save-btn:disabled {
    background: #93c5fd;
    cursor: not-allowed;
  }

  .np-save-btn .spinner {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  /* Toast */
  .np-toast {
    position: fixed;
    bottom: 24px;
    right: 24px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 20px;
    background: #1f2937;
    color: white;
    border-radius: 10px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.2);
    animation: toastSlide 0.3s ease-out;
    z-index: 1000;
  }

  @keyframes toastSlide {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .np-toast.success {
    background: #059669;
  }

  .np-toast.error {
    background: #dc2626;
  }

  /* Test Sound Button */
  .np-test-sound {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    background: #f3f4f6;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    font-size: 13px;
    color: #374151;
    cursor: pointer;
    transition: all 0.15s;
  }

  .np-test-sound:hover {
    background: #e5e7eb;
  }

  /* Select dropdown */
  .np-select {
    padding: 8px 12px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    font-size: 14px;
    color: #374151;
    background: white;
    cursor: pointer;
    min-width: 140px;
  }

  .np-select:focus {
    outline: none;
    border-color: #2563eb;
  }

  /* ===== DARK MODE ===== */
  body.dark-mode .np-layout {
    background: #0b1220;
  }

  body.dark-mode .np-back-btn {
    background: #0f172a;
    color: #cbd5e1;
    box-shadow: none;
  }

  body.dark-mode .np-back-btn:hover {
    background: #1e293b;
    color: #f1f5f9;
  }

  body.dark-mode .np-header-content h1 {
    color: #f1f5f9;
  }

  body.dark-mode .np-header-content p {
    color: #94a3b8;
  }

  body.dark-mode .np-card {
    background: #0f172a;
    border-color: #1e293b;
    box-shadow: none;
  }

  body.dark-mode .np-card-header {
    background: #0b1220;
    border-bottom-color: #1e293b;
  }

  body.dark-mode .np-card-title {
    color: #f1f5f9;
  }

  body.dark-mode .np-card-desc {
    color: #94a3b8;
  }

  body.dark-mode .np-push-toggle {
    background: #0b1220;
    border-color: #1e293b;
  }

  body.dark-mode .np-push-text h3 {
    color: #f1f5f9;
  }

  body.dark-mode .np-push-text p {
    color: #94a3b8;
  }

  body.dark-mode .np-test-sound {
    background: #1e293b;
    border-color: #334155;
    color: #e2e8f0;
  }

  body.dark-mode .np-test-sound:hover {
    background: #334155;
  }

  body.dark-mode .np-select {
    background: #0b1220;
    border-color: #1e293b;
    color: #e2e8f0;
  }

  @media (max-width: 640px) {
    .np-main {
      padding: 16px;
    }
    .np-push-toggle {
      flex-direction: column;
      align-items: flex-start;
      gap: 16px;
    }
    .np-quiet-hours {
      flex-direction: column;
      align-items: flex-start;
    }
  }

  @media (max-width: 480px) {
    .np-main {
      padding: 16px;
      padding-bottom: 80px;
    }
    .np-page-title {
      font-size: 22px;
    }
    .np-card {
      padding: 16px;
    }
    .np-toggle-label {
      font-size: 14px;
    }
    .np-save-btn {
      width: 100%;
      min-height: 48px;
    }
  }
`;

/* =============================================================================
   COMPONENT
   ============================================================================= */

const NotificationPreferences = () => {
  const navigate = useNavigate();
  const {
    permission,
    isSubscribed,
    isLoading,
    isSupported,
    toggleSubscription,
    requestPermission,
    playNotificationSound,
  } = usePushNotifications();

  // Local state for preferences
  const [preferences, setPreferences] = useState({
    // Channels
    emailNotifications: true,
    smsNotifications: false,
    inAppAlerts: true,

    // Categories
    visitApprovals: true,
    securityAlerts: true,
    systemUpdates: true,
    reminders: true,
    messages: true,

    // Sound
    soundEnabled: true,

    // Quiet Hours
    quietHoursEnabled: false,
    quietHoursStart: '22:00',
    quietHoursEnd: '07:00',

    // Email scheduling
    weeklyComplianceSummary: true,
  });

  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingPrefs, setIsLoadingPrefs] = useState(true);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('Preferences saved successfully');
  const [toastType, setToastType] = useState('success');

  // Load preferences from API on mount
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const response = await notificationPreferenceService.getPreferences();
        if (response.success && response.data) {
          setPreferences(prev => ({
            ...prev,
            ...response.data,
          }));
        }
      } catch (err) {
        console.error('Failed to load preferences:', err);
      } finally {
        setIsLoadingPrefs(false);
      }
    };
    loadPreferences();
  }, []);

  /**
   * Update preference
   */
  const updatePreference = (key, value) => {
    setPreferences(prev => ({ ...prev, [key]: value }));
  };

  /**
   * Handle push toggle
   */
  const handlePushToggle = async () => {
    await toggleSubscription();
  };

  /**
   * Handle save
   */
  const handleSave = async () => {
    setIsSaving(true);
    try {
      await notificationPreferenceService.updatePreferences(preferences);
      setToastMessage('Preferences saved successfully');
      setToastType('success');
    } catch (err) {
      console.error('Failed to save preferences:', err);
      setToastMessage('Failed to save preferences');
      setToastType('error');
    } finally {
      setIsSaving(false);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    }
  };

  /**
   * Test notification sound
   */
  const handleTestSound = () => {
    playNotificationSound();
  };

  return (
    <div className="np-layout">
      <style>{styles}</style>
      <Navbar />
      <div className="np-content">
        <Sidebar />
        <main className="np-main">
          <PageGuide pageKey="notification-preferences" />
          {/* Header */}
          <div className="np-header">
            <button className="np-back-btn" onClick={() => navigate(-1)}>
              <ArrowLeft size={20} />
            </button>
            <div className="np-header-content">
              <h1>
                <Settings size={24} />
                Notification Preferences
              </h1>
              <p>Manage how and when you receive notifications</p>
            </div>
          </div>

          {/* Push Notifications Card */}
          <div className="np-card">
            <div className="np-card-header">
              <h2 className="np-card-title">
                <div className="icon blue">
                  <Bell size={16} />
                </div>
                Push Notifications
              </h2>
              <p className="np-card-desc">Receive real-time alerts on your device</p>
            </div>
            <div className="np-card-body">
              <div className="np-push-toggle">
                <div className="np-push-info">
                  <div className={`np-push-icon ${isSubscribed ? 'enabled' : 'disabled'}`}>
                    {isSubscribed ? <Bell size={24} /> : <BellOff size={24} />}
                  </div>
                  <div className="np-push-text">
                    <h3>Push Notifications</h3>
                    <p>
                      {isSubscribed
                        ? 'You will receive push notifications'
                        : 'Enable to receive instant alerts'}
                    </p>
                  </div>
                </div>
                <label className="np-switch">
                  <input
                    type="checkbox"
                    checked={isSubscribed}
                    onChange={handlePushToggle}
                    disabled={isLoading || !isSupported}
                  />
                  <span className="np-switch-slider" />
                </label>
              </div>

              {/* Permission Alert */}
              {!isSupported && (
                <div className="np-permission-alert denied">
                  <AlertTriangle size={18} className="icon" />
                  <p>Push notifications are not supported in this browser.</p>
                </div>
              )}

              {isSupported && permission === 'default' && !isSubscribed && (
                <div className="np-permission-alert">
                  <Info size={18} className="icon" />
                  <div>
                    <p>You need to grant permission to receive push notifications.</p>
                    <button className="np-permission-btn" onClick={requestPermission}>
                      <Bell size={14} />
                      Enable Notifications
                    </button>
                  </div>
                </div>
              )}

              {isSupported && permission === 'denied' && (
                <div className="np-permission-alert denied">
                  <AlertTriangle size={18} className="icon" />
                  <p>
                    Notifications are blocked. Please enable them in your browser settings
                    to receive push notifications.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Notification Channels Card */}
          <div className="np-card">
            <div className="np-card-header">
              <h2 className="np-card-title">
                <div className="icon purple">
                  <MessageSquare size={16} />
                </div>
                Notification Channels
              </h2>
              <p className="np-card-desc">Choose how you want to be notified</p>
            </div>
            <div className="np-card-body">
              <div className="np-option">
                <div className="np-option-info">
                  <div className="np-option-icon blue">
                    <Mail size={18} />
                  </div>
                  <div className="np-option-text">
                    <h4>Email Notifications</h4>
                    <p>Receive notifications via email</p>
                  </div>
                </div>
                <label className="np-switch">
                  <input
                    type="checkbox"
                    checked={preferences.emailNotifications}
                    onChange={(e) => updatePreference('emailNotifications', e.target.checked)}
                  />
                  <span className="np-switch-slider" />
                </label>
              </div>

              <div className="np-option">
                <div className="np-option-info">
                  <div className="np-option-icon green">
                    <Smartphone size={18} />
                  </div>
                  <div className="np-option-text">
                    <h4>SMS Notifications</h4>
                    <p>Receive text messages for urgent alerts</p>
                  </div>
                </div>
                <label className="np-switch">
                  <input
                    type="checkbox"
                    checked={preferences.smsNotifications}
                    onChange={(e) => updatePreference('smsNotifications', e.target.checked)}
                  />
                  <span className="np-switch-slider" />
                </label>
              </div>

              <div className="np-option">
                <div className="np-option-info">
                  <div className="np-option-icon purple">
                    <Bell size={18} />
                  </div>
                  <div className="np-option-text">
                    <h4>In-App Alerts</h4>
                    <p>Show notifications within the application</p>
                  </div>
                </div>
                <label className="np-switch">
                  <input
                    type="checkbox"
                    checked={preferences.inAppAlerts}
                    onChange={(e) => updatePreference('inAppAlerts', e.target.checked)}
                  />
                  <span className="np-switch-slider" />
                </label>
              </div>
            </div>
          </div>

          {/* Notification Categories Card */}
          <div className="np-card">
            <div className="np-card-header">
              <h2 className="np-card-title">
                <div className="icon amber">
                  <Settings size={16} />
                </div>
                Notification Categories
              </h2>
              <p className="np-card-desc">Select which types of notifications to receive</p>
            </div>
            <div className="np-card-body">
              <div className="np-option">
                <div className="np-option-info">
                  <div className="np-option-icon green">
                    <CheckCircle size={18} />
                  </div>
                  <div className="np-option-text">
                    <h4>Visit Approvals</h4>
                    <p>When visits are approved or rejected</p>
                  </div>
                </div>
                <label className="np-switch">
                  <input
                    type="checkbox"
                    checked={preferences.visitApprovals}
                    onChange={(e) => updatePreference('visitApprovals', e.target.checked)}
                  />
                  <span className="np-switch-slider" />
                </label>
              </div>

              <div className="np-option">
                <div className="np-option-info">
                  <div className="np-option-icon red">
                    <Shield size={18} />
                  </div>
                  <div className="np-option-text">
                    <h4>Security Alerts</h4>
                    <p>Login attempts and account security</p>
                  </div>
                </div>
                <label className="np-switch">
                  <input
                    type="checkbox"
                    checked={preferences.securityAlerts}
                    onChange={(e) => updatePreference('securityAlerts', e.target.checked)}
                  />
                  <span className="np-switch-slider" />
                </label>
              </div>

              <div className="np-option">
                <div className="np-option-info">
                  <div className="np-option-icon cyan">
                    <Info size={18} />
                  </div>
                  <div className="np-option-text">
                    <h4>System Updates</h4>
                    <p>Maintenance and feature announcements</p>
                  </div>
                </div>
                <label className="np-switch">
                  <input
                    type="checkbox"
                    checked={preferences.systemUpdates}
                    onChange={(e) => updatePreference('systemUpdates', e.target.checked)}
                  />
                  <span className="np-switch-slider" />
                </label>
              </div>

              <div className="np-option">
                <div className="np-option-info">
                  <div className="np-option-icon amber">
                    <Clock size={18} />
                  </div>
                  <div className="np-option-text">
                    <h4>Reminders</h4>
                    <p>Upcoming visits and task reminders</p>
                  </div>
                </div>
                <label className="np-switch">
                  <input
                    type="checkbox"
                    checked={preferences.reminders}
                    onChange={(e) => updatePreference('reminders', e.target.checked)}
                  />
                  <span className="np-switch-slider" />
                </label>
              </div>

              <div className="np-option">
                <div className="np-option-info">
                  <div className="np-option-icon blue">
                    <MessageSquare size={18} />
                  </div>
                  <div className="np-option-text">
                    <h4>Messages</h4>
                    <p>New messages from team members</p>
                  </div>
                </div>
                <label className="np-switch">
                  <input
                    type="checkbox"
                    checked={preferences.messages}
                    onChange={(e) => updatePreference('messages', e.target.checked)}
                  />
                  <span className="np-switch-slider" />
                </label>
              </div>
            </div>
          </div>

          {/* Sound & Quiet Hours Card */}
          <div className="np-card">
            <div className="np-card-header">
              <h2 className="np-card-title">
                <div className="icon green">
                  <Volume2 size={16} />
                </div>
                Sound & Quiet Hours
              </h2>
              <p className="np-card-desc">Configure notification sounds and do-not-disturb times</p>
            </div>
            <div className="np-card-body">
              <div className="np-option">
                <div className="np-option-info">
                  <div className="np-option-icon purple">
                    {preferences.soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
                  </div>
                  <div className="np-option-text">
                    <h4>Notification Sound</h4>
                    <p>Play a sound when notifications arrive</p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button className="np-test-sound" onClick={handleTestSound}>
                    <Volume2 size={14} />
                    Test
                  </button>
                  <label className="np-switch">
                    <input
                      type="checkbox"
                      checked={preferences.soundEnabled}
                      onChange={(e) => updatePreference('soundEnabled', e.target.checked)}
                    />
                    <span className="np-switch-slider" />
                  </label>
                </div>
              </div>

              <div className="np-option">
                <div className="np-option-info">
                  <div className="np-option-icon amber">
                    <Clock size={18} />
                  </div>
                  <div className="np-option-text">
                    <h4>Quiet Hours</h4>
                    <p>Pause notifications during specific times</p>
                  </div>
                </div>
                <label className="np-switch">
                  <input
                    type="checkbox"
                    checked={preferences.quietHoursEnabled}
                    onChange={(e) => updatePreference('quietHoursEnabled', e.target.checked)}
                  />
                  <span className="np-switch-slider" />
                </label>
              </div>

              {preferences.quietHoursEnabled && (
                <div className="np-quiet-hours" style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #f3f4f6' }}>
                  <div className="np-time-input">
                    <label>From:</label>
                    <input
                      type="time"
                      value={preferences.quietHoursStart}
                      onChange={(e) => updatePreference('quietHoursStart', e.target.value)}
                    />
                  </div>
                  <div className="np-time-input">
                    <label>To:</label>
                    <input
                      type="time"
                      value={preferences.quietHoursEnd}
                      onChange={(e) => updatePreference('quietHoursEnd', e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Email Schedule Card */}
          <div className="np-card">
            <div className="np-card-header">
              <h2 className="np-card-title">
                <div className="icon blue">
                  <Mail size={16} />
                </div>
                Email Schedule
              </h2>
              <p className="np-card-desc">Configure automated email reports and alerts</p>
            </div>
            <div className="np-card-body">
              <div className="np-option">
                <div className="np-option-info">
                  <div className="np-option-icon green">
                    <CheckCircle size={18} />
                  </div>
                  <div className="np-option-text">
                    <h4>Weekly Compliance Summary</h4>
                    <p>Receive a weekly email with your compliance stats</p>
                  </div>
                </div>
                <label className="np-switch">
                  <input
                    type="checkbox"
                    checked={preferences.weeklyComplianceSummary}
                    onChange={(e) => updatePreference('weeklyComplianceSummary', e.target.checked)}
                  />
                  <span className="np-switch-slider" />
                </label>
              </div>

            </div>

            {/* Save Button */}
            <div className="np-save-section">
              <button className="np-save-btn" onClick={handleSave} disabled={isSaving || isLoadingPrefs}>
                {isSaving ? (
                  <>
                    <Loader2 size={18} className="spinner" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save size={18} />
                    Save Preferences
                  </>
                )}
              </button>
            </div>
          </div>
        </main>
      </div>

      {/* Toast */}
      {showToast && (
        <div className={`np-toast ${toastType}`}>
          {toastType === 'success' ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
          {toastMessage}
        </div>
      )}
    </div>
  );
};

export default NotificationPreferences;