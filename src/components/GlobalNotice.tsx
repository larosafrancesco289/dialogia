import { useChatStore } from '@/lib/store';
import { useEffect, useState } from 'react';
import { InlineNotice } from '@/components/ui/InlineNotice';
import { selectNotice } from '@/lib/store/selectors';
import { isSuccessNotice } from '@/lib/store/notices';

const SUCCESS_DISMISS_MS = 4000;
const ERROR_DISMISS_MS = 10000;

export function GlobalNotice() {
  const notice = useChatStore(selectNotice);
  const setNotice = useChatStore((s) => s.setNotice);
  const [visible, setVisible] = useState(false);

  const isSuccess = !!notice && isSuccessNotice(notice);

  useEffect(() => {
    setVisible(Boolean(notice));
    if (!notice) return;
    // Auto-dismiss: confirmations go quickly, errors linger long enough to read.
    const tid = setTimeout(
      () => {
        setVisible(false);
        setNotice(undefined);
      },
      isSuccessNotice(notice) ? SUCCESS_DISMISS_MS : ERROR_DISMISS_MS,
    );
    return () => clearTimeout(tid);
  }, [notice, setNotice]);

  if (!notice || !visible) return null;
  return (
    <div className="fixed inset-x-0 bottom-4 flex justify-center z-[100]">
      <InlineNotice
        message={notice}
        role={isSuccess ? 'status' : 'alert'}
        onDismiss={() => {
          setVisible(false);
          setNotice(undefined);
        }}
      />
    </div>
  );
}
