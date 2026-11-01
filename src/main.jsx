import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import './index.css'
import './i18n'
import App from './App.jsx'

// Tira a tela de abertura só depois que o app foi pintado (dois quadros após o commit)
const HideBootSplash = () => {
  useEffect(() => {
    const splash = document.getElementById('boot-splash');
    if (!splash) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      splash.classList.add('is-hidden');
      setTimeout(() => splash.remove(), 250);
    }));
  }, []);
  return null;
};

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <Analytics />
    <HideBootSplash />
  </StrictMode>,
)
