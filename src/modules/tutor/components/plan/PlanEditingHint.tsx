import { useState, useEffect } from 'react';
import { LightBulbIcon } from '@heroicons/react/24/outline';

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
    <div className={`plan-agency-cue ${className ?? ''}`}>
      <LightBulbIcon className="plan-agency-cue__icon" />
      <span className="plan-agency-cue__text">
        <strong>Your plan can be adjusted.</strong> Ask your tutor to restructure, reorder, or skip
        topics.
      </span>
      <button
        className="plan-agency-cue__dismiss"
        onClick={handleDismiss}
        aria-label="Dismiss hint"
      >
        &times;
      </button>
    </div>
  );
}
