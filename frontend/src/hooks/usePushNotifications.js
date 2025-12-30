/**
 * usePushNotifications Hook
 *
 * Custom hook for managing push notification permissions and subscriptions.
 *
 * Features:
 * - Request browser notification permission
 * - Manage subscription state
 * - Play notification sounds
 * - Mock subscription to backend
 *
 * Usage:
 * const { permission, isSubscribed, requestPermission, subscribeToPush } = usePushNotifications();
 */

import { useState, useEffect, useCallback } from 'react';

const usePushNotifications = () => {
  // Permission state: 'default' | 'granted' | 'denied'
  const [permission, setPermission] = useState('default');
  
  // Subscription state
  const [isSubscribed, setIsSubscribed] = useState(false);
  
  // Loading state for async operations
  const [isLoading, setIsLoading] = useState(false);
  
  // Error state
  const [error, setError] = useState(null);

  /**
   * Check initial permission status on mount
   */
  useEffect(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission);
      
      // Check if already subscribed (from localStorage)
      const subscribed = localStorage.getItem('pushNotificationsSubscribed');
      if (subscribed === 'true' && Notification.permission === 'granted') {
        setIsSubscribed(true);
      }
    } else {
      setError('Push notifications are not supported in this browser');
    }
  }, []);

  /**
   * Request notification permission from the browser
   * @returns {Promise<string>} The permission status
   */
  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) {
      setError('Push notifications are not supported in this browser');
      return 'denied';
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      
      if (result === 'granted') {
        console.log('✅ Notification permission granted');
        // Auto-subscribe when permission is granted
        await subscribeToPush();
      } else if (result === 'denied') {
        console.log('❌ Notification permission denied');
        setIsSubscribed(false);
        localStorage.setItem('pushNotificationsSubscribed', 'false');
      }
      
      return result;
    } catch (err) {
      console.error('Error requesting notification permission:', err);
      setError('Failed to request notification permission');
      return 'denied';
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Subscribe to push notifications
   * This is a mock function that simulates sending subscription to backend
   * @returns {Promise<boolean>} Success status
   */
  const subscribeToPush = useCallback(async () => {
    if (permission !== 'granted') {
      console.warn('Cannot subscribe: Permission not granted');
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Mock subscription object (in real app, this would come from service worker)
      const mockSubscription = {
        endpoint: 'https://fcm.googleapis.com/fcm/send/mock-endpoint-' + Date.now(),
        expirationTime: null,
        keys: {
          p256dh: 'mock-p256dh-key-' + Math.random().toString(36).substring(7),
          auth: 'mock-auth-key-' + Math.random().toString(36).substring(7),
        },
        userId: 'current-user-id',
        deviceInfo: {
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          language: navigator.language,
        },
        subscribedAt: new Date().toISOString(),
      };

      // Simulate API call to backend
      console.log('📤 Sending subscription to backend:', mockSubscription);
      
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Mock successful response
      console.log('✅ Subscription registered successfully');
      
      setIsSubscribed(true);
      localStorage.setItem('pushNotificationsSubscribed', 'true');
      
      // Show a test notification
      showTestNotification();
      
      return true;
    } catch (err) {
      console.error('Error subscribing to push:', err);
      setError('Failed to subscribe to push notifications');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [permission]);

  /**
   * Unsubscribe from push notifications
   * @returns {Promise<boolean>} Success status
   */
  const unsubscribeFromPush = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Simulate API call to remove subscription from backend
      console.log('📤 Removing subscription from backend...');
      
      await new Promise(resolve => setTimeout(resolve, 300));
      
      console.log('✅ Unsubscribed successfully');
      
      setIsSubscribed(false);
      localStorage.setItem('pushNotificationsSubscribed', 'false');
      
      return true;
    } catch (err) {
      console.error('Error unsubscribing:', err);
      setError('Failed to unsubscribe from push notifications');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Play a notification sound
   * Creates an audio context and plays a short beep
   */
  const playNotificationSound = useCallback(() => {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      // Configure the beep sound
      oscillator.frequency.value = 880; // A5 note
      oscillator.type = 'sine';
      
      // Fade out
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

      // Play for 300ms
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);

      console.log('🔔 Notification sound played');
    } catch (err) {
      console.warn('Could not play notification sound:', err);
    }
  }, []);

  /**
   * Show a test notification
   */
  const showTestNotification = useCallback(() => {
    if (permission === 'granted') {
      const notification = new Notification('VIP Pharmacy CRM', {
        body: 'Push notifications are now enabled!',
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: 'test-notification',
        requireInteraction: false,
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };

      // Auto-close after 5 seconds
      setTimeout(() => notification.close(), 5000);
      
      playNotificationSound();
    }
  }, [permission, playNotificationSound]);

  /**
   * Show a custom notification
   * @param {string} title - Notification title
   * @param {object} options - Notification options
   */
  const showNotification = useCallback((title, options = {}) => {
    if (permission !== 'granted') {
      console.warn('Cannot show notification: Permission not granted');
      return null;
    }

    const notification = new Notification(title, {
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      ...options,
    });

    if (options.playSound !== false) {
      playNotificationSound();
    }

    return notification;
  }, [permission, playNotificationSound]);

  /**
   * Toggle subscription state
   */
  const toggleSubscription = useCallback(async () => {
    if (isSubscribed) {
      return await unsubscribeFromPush();
    } else {
      if (permission !== 'granted') {
        const result = await requestPermission();
        return result === 'granted';
      }
      return await subscribeToPush();
    }
  }, [isSubscribed, permission, requestPermission, subscribeToPush, unsubscribeFromPush]);

  return {
    // State
    permission,
    isSubscribed,
    isLoading,
    error,
    
    // Check if notifications are supported
    isSupported: 'Notification' in window,
    
    // Functions
    requestPermission,
    subscribeToPush,
    unsubscribeFromPush,
    toggleSubscription,
    playNotificationSound,
    showNotification,
    showTestNotification,
  };
};

export default usePushNotifications;