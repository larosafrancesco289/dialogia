'use client';
import { useState, useEffect } from 'react';
import { XMarkIcon, LightBulbIcon } from '@heroicons/react/24/outline';

const DISMISS_KEY = 'dialogia:plan-editing-hint-dismissed';

export function PlanEditingHint({ className }: { className?: string }) {
  const [dismissed, setDismissed] = useState(true); // Start hidden to avoid flash

  useEffect(() => {
    const stored = localStorage.getItem(DISMISS_KEY);
    setDismissed(stored === 'true');
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem(DISMISS_KEY, 'true');
  };

  if (dismissed) return null;

  return (
    <div
      className={`flex items-start gap-3 p-3 text-xs ${className ?? ''}`}
      style={{
        background: 'var(--marginalia-bg)',
        borderRadius: 'var(--radius-editorial)',
        borderLeft: '2px solid var(--color-accent)',
        color: 'var(--color-fg-muted)',
      }}
    >
      <LightBulbIcon className="h-4 w-4 shrink-0 mt-0.5" style={{ color: 'var(--color-accent)' }} />
      <p className="flex-1 leading-relaxed">
        <span className="font-medium" style={{ color: 'var(--color-fg)' }}>
          Your plan is editable.
        </span>{' '}
        Adjust topic confidence below, or ask your tutor in the chat for restructuring and
        reordering.
      </p>
      <button
        onClick={handleDismiss}
        className="p-1 -mr-1 -mt-0.5 rounded transition-colors hover:bg-black/5 dark:hover:bg-white/5"
        aria-label="Dismiss hint"
      >
        <XMarkIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
