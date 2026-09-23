import type { ReactNode } from 'react';

type SidebarSearchProps = {
  value: string;
  onChange: (value: string) => void;
  collapsed?: boolean;
  /** An action beside the field (the sheet's new-folder button). */
  action?: ReactNode;
};

export function SidebarSearch({ value, onChange, collapsed, action }: SidebarSearchProps) {
  if (collapsed) return null;
  return (
    <div className="sidebar-section pb-2 flex items-center gap-2">
      <input
        className="input w-full text-base sm:text-sm"
        placeholder="Search chats"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {action}
    </div>
  );
}
