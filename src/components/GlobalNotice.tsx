'use client';
import { useChatStore } from '@/lib/store';
import { useEffect, useState } from 'react';

export default function GlobalNotice() {
  const notice = useChatStore((s) => s.ui.notice);
  const setUI = useChatStore((s) => s.setUI);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(Boolean(notice));
  }, [notice]);

  if (!notice || !visible) return null;
  return (
    <div
      className="fixed inset-x-0 bottom-4 flex justify-center z-[100]"
      role="status"
      aria-live="polite"
    >
      <div className="card px-4 py-3 flex items-center gap-3 shadow-[var(--shadow-card)]">
        <div className="text-sm">{notice}</div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => {
            setVisible(false);
            setUI({ notice: undefined });
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

