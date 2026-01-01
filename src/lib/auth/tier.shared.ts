import type { AccessTier } from '@/lib/auth/types';

export function parseAccessTier(value: unknown): AccessTier {
  return value === 'free' || value === 'individual' || value === 'developer' || value === 'study'
    ? value
    : 'free';
}
