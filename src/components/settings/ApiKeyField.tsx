import { useState } from 'react';
import { deleteKey, setKey } from '@/lib/keys/store';
import { useProviderKeys } from '@/lib/hooks/useProviderKeys';

// Component: ApiKeyField
// Responsibility: Paste, replace, or remove one stored key. The stored value is
// never rendered — only its last four characters, so the user can tell which
// key is in there without it being readable over a shoulder or in a screenshot.
export function ApiKeyField(props: {
  keyRef: string;
  label: string;
  placeholder?: string;
  helpText?: string;
  onChanged?: () => void;
}) {
  const { keyRef, label, placeholder, helpText, onChanged } = props;
  const { hasKey, describeKey } = useProviderKeys();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const stored = hasKey(keyRef);

  const save = async () => {
    if (!draft.trim()) return;
    setBusy(true);
    try {
      await setKey(keyRef, draft);
      setDraft('');
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await deleteKey(keyRef);
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-sm" htmlFor={`key-${keyRef}`}>
        {label}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id={`key-${keyRef}`}
          type="password"
          className="input flex-1 min-w-0 text-base sm:text-sm"
          autoComplete="off"
          spellCheck={false}
          placeholder={stored ? `Stored ${describeKey(keyRef)} — paste to replace` : placeholder}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void save();
          }}
        />
        <button className="btn btn-sm" disabled={busy || !draft.trim()} onClick={() => void save()}>
          {stored ? 'Replace' : 'Save'}
        </button>
        {stored && (
          <button
            className="btn btn-ghost btn-sm"
            disabled={busy}
            onClick={() => void remove()}
            aria-label={`Remove the ${label}`}
          >
            Remove
          </button>
        )}
      </div>
      {helpText && <p className="text-xs text-muted-foreground">{helpText}</p>}
    </div>
  );
}
