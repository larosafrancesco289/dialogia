'use client';
import { useState } from 'react';

export default function AccessPage() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [freeTierLoading, setFreeTierLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const plain = code.trim();
    if (!plain) return setError('Enter access code');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ code: plain }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        const errorMessage = getErrorMessage(data?.error);
        setError(errorMessage);
      } else {
        // Force full navigation so the new HttpOnly cookie is sent to the server
        window.location.replace('/');
      }
    } catch (e: any) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const continueWithFreeTier = async () => {
    setError(null);
    setFreeTierLoading(true);
    try {
      const res = await fetch('/api/auth/set-free-tier', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setError(data?.error || 'Failed to set free tier');
      } else {
        window.location.replace('/');
      }
    } catch (e: any) {
      setError('Network error');
    } finally {
      setFreeTierLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md glass-panel border border-border rounded-2xl p-6">
        <h1 className="text-2xl font-semibold mb-2">Welcome to Dialogia</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Enter an access code for full features, or continue with the free tier.
        </p>

        {/* Code entry form */}
        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            autoFocus
            type="password"
            inputMode="text"
            autoComplete="off"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 outline-none"
            placeholder="Access code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={loading || freeTierLoading}
          />
          <button
            type="submit"
            disabled={loading || freeTierLoading}
            className="rounded-lg bg-foreground text-background py-2 font-medium disabled:opacity-60"
          >
            {loading ? 'Checking…' : 'Unlock Full Access'}
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-muted-foreground uppercase tracking-wide">or</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* Free tier button */}
        <button
          onClick={continueWithFreeTier}
          disabled={loading || freeTierLoading}
          className="w-full rounded-lg border border-border bg-background py-2 font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-60"
        >
          {freeTierLoading ? 'Loading…' : 'Continue with Free Tier'}
        </button>
        <p className="text-xs text-muted-foreground mt-2 text-center">
          Free tier includes select models with limited features
        </p>

        {/* Error display */}
        {error && (
          <div
            className="text-sm mt-4 text-center"
            style={{ color: 'var(--color-danger)' }}
          >
            {String(error)}
          </div>
        )}
      </div>
    </div>
  );
}

function getErrorMessage(errorCode: string | undefined): string {
  switch (errorCode) {
    case 'invalid_code':
      return 'Invalid access code';
    case 'code_already_used':
      return 'This code has already been used';
    case 'missing_code':
      return 'Please enter an access code';
    case 'codes_unconfigured':
      return 'Access codes not configured';
    default:
      return errorCode || 'An error occurred';
  }
}
