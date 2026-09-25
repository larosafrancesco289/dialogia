import { useChatStore } from '@/lib/store';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { InlineNotice } from '@/components/ui/InlineNotice';
import { selectNotice, selectNoticeTone } from '@/lib/store/selectors';
import type { NoticeTone } from '@/lib/contracts/ui';

// Confirmations go quickly, facts stay long enough to read, problems linger.
const DISMISS_MS: Record<NoticeTone, number> = { success: 3000, info: 6000, error: 10000 };

/**
 * The app's one toast. On a phone it is portalled to the page: the phone
 * shell is its own stacking context, which would keep it under Settings.
 */
export function GlobalNotice({ portal = false }: { portal?: boolean }) {
  const notice = useChatStore(selectNotice);
  const tone = useChatStore(selectNoticeTone);
  const setNotice = useChatStore((s) => s.setNotice);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(Boolean(notice));
    if (!notice) return;
    const tid = setTimeout(() => {
      setVisible(false);
      setNotice(undefined);
    }, DISMISS_MS[tone]);
    return () => clearTimeout(tid);
  }, [notice, tone, setNotice]);

  if (!notice || !visible) return null;
  const slot = (
    <div className="notice-slot">
      <InlineNotice
        message={notice}
        tone={tone}
        onDismiss={() => {
          setVisible(false);
          setNotice(undefined);
        }}
      />
    </div>
  );
  return portal ? createPortal(slot, document.body) : slot;
}
