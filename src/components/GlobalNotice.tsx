'use client';
import { useChatStore } from '@/lib/store';
import { useEffect, useState } from 'react';
import { InlineNotice } from '@/components/ui/InlineNotice';
import { selectNotice } from '@/lib/store/selectors';

export function GlobalNotice() {
  const notice = useChatStore(selectNotice);
  const setNotice = useChatStore((s) => s.setNotice);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(Boolean(notice));
  }, [notice]);

  if (!notice || !visible) return null;
  return (
    <div className="fixed inset-x-0 bottom-4 flex justify-center z-[100]">
      <InlineNotice
        message={notice}
        onDismiss={() => {
          setVisible(false);
          setNotice(undefined);
        }}
      />
    </div>
  );
}
