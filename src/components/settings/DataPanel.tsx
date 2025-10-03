'use client';
// Component: DataPanel
// Responsibility: Export and import data controls.

export default function DataPanel(props: {
  onExport: () => Promise<void> | void;
  onImportPicked: (file?: File | null) => Promise<void> | void;
}) {
  const { onExport, onImportPicked } = props;
  return (
    <div className="card p-4 space-y-3">
      <div className="text-sm font-medium text-muted-foreground">Data</div>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <button className="btn" onClick={() => onExport()}>
            Export all
          </button>
          <label className="btn">
            Import JSON
            <input
              type="file"
              accept="application/json"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0] || null;
                await onImportPicked(f ?? null);
                if (e.target) (e.target as HTMLInputElement).value = '';
              }}
            />
          </label>
        </div>
        <div className="text-xs text-muted-foreground">
          Export or import your chats and settings.
        </div>
      </div>
    </div>
  );
}
