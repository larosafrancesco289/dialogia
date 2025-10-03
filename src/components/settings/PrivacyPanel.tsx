'use client';
// Component: PrivacyPanel
// Responsibility: Zero Data Retention toggle and related notices.

export default function PrivacyPanel(props: {
  zdrOnly: boolean | undefined;
  setZdrOnly: (v: boolean) => void;
  reloadModels: () => void;
}) {
  const { zdrOnly, setZdrOnly, reloadModels } = props;
  return (
    <div className="card p-4 space-y-3">
      <div className="text-sm font-medium text-muted-foreground">Privacy</div>
      <div className="space-y-2">
        <label className="text-sm flex items-center justify-between">
          <span>Zero Data Retention (ZDR) only</span>
          <div className="segmented">
            <button
              className={`segment ${zdrOnly === true ? 'is-active' : ''}`}
              onClick={() => {
                setZdrOnly(true);
                reloadModels();
              }}
            >
              On
            </button>
            <button
              className={`segment ${zdrOnly === false ? 'is-active' : ''}`}
              onClick={() => {
                setZdrOnly(false);
                reloadModels();
              }}
            >
              Off
            </button>
          </div>
        </label>
      </div>
    </div>
  );
}
