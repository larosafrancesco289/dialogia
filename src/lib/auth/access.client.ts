export type AccessGateResult = {
  ok: boolean;
  error?: string;
};

export async function verifyAccessCode(code: string): Promise<AccessGateResult> {
  const res = await fetch('/api/auth/verify-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ code }),
  });
  const data = (await res.json()) as { ok?: boolean; error?: string } | undefined;
  if (!res.ok || !data?.ok) {
    return { ok: false, error: data?.error };
  }
  return { ok: true };
}

export async function setFreeTierAccess(): Promise<AccessGateResult> {
  const res = await fetch('/api/auth/set-free-tier', {
    method: 'POST',
    credentials: 'include',
  });
  const data = (await res.json()) as { ok?: boolean; error?: string } | undefined;
  if (!res.ok || !data?.ok) {
    return { ok: false, error: data?.error };
  }
  return { ok: true };
}

export function getAccessCodeErrorMessage(errorCode: string | undefined): string {
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
