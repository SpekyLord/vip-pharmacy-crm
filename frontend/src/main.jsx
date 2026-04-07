import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { EntityProvider } from './context/EntityContext.jsx';
import './index.css';
import './styles/tablet-optimized.css';

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
    <BrowserRouter>
      <AuthProvider>
        <EntityProvider>
          <App />
        </EntityProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
