import type { ReactNode } from 'react';
import { useT } from '@/lib/i18n';

type SidebarSearchProps = {
  value: string;
  onChange: (value: string) => void;
  collapsed?: boolean;
  /** An action beside the field (the sheet's new-folder button). */
  action?: ReactNode;
};

export function SidebarSearch({ value, onChange, collapsed, action }: SidebarSearchProps) {
  const t = useT();
  if (collapsed) return null;
  return (
    <div className="sidebar-section pb-2 flex items-center gap-2">
      <input
        className="input w-full text-base sm:text-sm"
        placeholder={t('sidebar.search')}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={t('sidebar.search')}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && value) {
            event.preventDefault();
            onChange('');
          }
        }}
      />
      {action}
    </div>
  );
}
