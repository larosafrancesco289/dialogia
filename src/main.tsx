import '../styles/globals.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import { router } from './router';
import { syncThemeColor } from '@/lib/hooks/useThemeMode';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

// The theme class is on <html> already (index.html's inline script); the
// browser's bars follow it from the first frame.
syncThemeColor();

createRoot(container).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
