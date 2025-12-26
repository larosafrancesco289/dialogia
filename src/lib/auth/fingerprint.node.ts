import crypto from 'crypto';

export function computeSecretFingerprintNode(secret: string | undefined): string {
  if (!secret) return 'none';
  const hash = crypto.createHash('sha256').update(secret).digest('hex');
  return hash.slice(0, 8);
}
