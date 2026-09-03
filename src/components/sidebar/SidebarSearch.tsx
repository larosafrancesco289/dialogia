type SidebarSearchProps = {
  value: string;
  onChange: (value: string) => void;
  collapsed?: boolean;
};

export function SidebarSearch({ value, onChange, collapsed }: SidebarSearchProps) {
  if (collapsed) return null;
  return (
    <div className="sidebar-section pb-2">
      <input
        className="input w-full text-base sm:text-sm"
        placeholder="Search chats"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
