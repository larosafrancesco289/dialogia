import type { NoticeTone } from '@/lib/contracts/ui';
import type { NoticeId } from '@/lib/store/notices';

type NoticeStore = {
  setNotice: (notice?: NoticeId | string, tone?: NoticeTone) => void;
};

/** Raise a notice; without a tone it reads as something gone wrong. */
export const notify = (get: () => NoticeStore, notice?: NoticeId | string, tone?: NoticeTone) => {
  get().setNotice(notice, tone);
};
