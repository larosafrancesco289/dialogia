import type { NoticeId } from '@/lib/store/notices';

type NoticeStore = {
  setNotice: (notice?: NoticeId | string) => void;
};

export const notify = (get: () => NoticeStore, notice?: NoticeId | string) => {
  get().setNotice(notice);
};
