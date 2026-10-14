import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Đăng ký Service Worker cho PWA và Push Notifications trên Mobile
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => {
        console.log('✅ Superbrain PWA Service Worker đã đăng ký thành công:', reg.scope);
      })
      .catch((err) => {
        console.warn('Lỗi khi đăng ký Service Worker:', err);
      });
  });
}
