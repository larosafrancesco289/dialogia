import { useChatStore } from '@/lib/store';
import { useEffect, useState } from 'react';
import { InlineNotice } from '@/components/ui/InlineNotice';
import { selectNotice, selectNoticeTone } from '@/lib/store/selectors';
import type { NoticeTone } from '@/lib/contracts/ui';

// Confirmations go quickly, facts stay long enough to read, problems linger.
const DISMISS_MS: Record<NoticeTone, number> = { success: 4000, info: 6000, error: 10000 };

export function GlobalNotice() {
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
  return (
    <div className="fixed inset-x-0 top-[calc(var(--chrome-height)+12px)] flex justify-center z-[100] px-4 pointer-events-none">
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
}
