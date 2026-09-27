import '../styles/globals.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import { router } from './router';
import { initThemeMode } from '@/lib/hooks/useThemeMode';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

// The theme class is on <html> already (index.html's inline script); the
// browser's bars follow it from the first frame, and Auto follows the system.
initThemeMode();

// A tab left open across a release asks for chunks the new build no longer
// has. One reload fetches the new build; the stamp stops a reload loop when
// the chunk is missing for some other reason.
window.addEventListener('vite:preloadError', (event) => {
  const STAMP = 'dialogia-reloaded-for-chunk';
  try {
    const last = Number(sessionStorage.getItem(STAMP) ?? 0);
    if (Date.now() - last < 60_000) return;
    sessionStorage.setItem(STAMP, String(Date.now()));
  } catch {
    return;
  }
  event.preventDefault();
  window.location.reload();
});

createRoot(container).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
