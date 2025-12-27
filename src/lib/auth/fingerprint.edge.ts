export async function computeSecretFingerprintEdge(secret: string | undefined): Promise<string> {
  if (!secret) return 'none';
  const data = new TextEncoder().encode(secret);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray
    .slice(0, 4)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
