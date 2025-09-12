'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AccessPage() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

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
        body: JSON.stringify({ code: plain }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setError(data?.error || 'Invalid code');
      } else {
        router.replace('/');
      }
    } catch (e: any) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md glass-panel border border-border rounded-2xl p-6">
        <h1 className="text-2xl font-semibold mb-2">Enter Access Code</h1>
        <p className="text-sm text-muted-foreground mb-6">
          This private preview is gated. Ask the owner for an access code.
        </p>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            autoFocus
            type="password"
            inputMode="text"
            autoComplete="off"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 outline-none"
            placeholder="••••••••••"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-foreground text-background py-2 font-medium disabled:opacity-60"
          >
            {loading ? 'Checking…' : 'Unlock'}
          </button>
          {error && <div className="text-sm text-red-500">{String(error)}</div>}
        </form>
      </div>
    </div>
  );
}

