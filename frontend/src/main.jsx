import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { EntityProvider } from './context/EntityContext.jsx';
import './index.css';
import './styles/tablet-optimized.css';
import { offlineManager } from './utils/offlineManager';
import { syncOfflineDrafts } from './services/offlineClmSync';

// Register service worker for offline-first PWA capability
offlineManager.init();

// Auto-sync offline CLM drafts when connectivity returns
offlineManager.onStatusChange((isOnline) => {
  if (isOnline) {
    syncOfflineDrafts().then(({ synced, failed }) => {
      if (synced > 0) {
        console.log(`[OfflineSync] Synced ${synced} CLM sessions${failed ? `, ${failed} failed` : ''}`);
      }
    });
  }
});

// Apply persisted dark mode preference as early as possible
try {
  const stored = localStorage.getItem('darkMode');
  if (stored === 'true' || stored === 'false') {
    document.body.classList.toggle('dark-mode', stored === 'true');
  }
} catch {
  // Ignore storage access errors (e.g. privacy mode)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <AuthProvider>
        <EntityProvider>
          <App />
        </EntityProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
