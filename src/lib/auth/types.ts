/**
 * Access tier levels for the application.
 * - free: No code required, limited to free models, no voice mode
 * - individual: One-time use codes, full models, no voice mode
 * - developer: Full access including voice mode
 * - study: User study participants, forced tutor mode, restricted UI
 */
export type AccessTier = 'free' | 'individual' | 'developer' | 'study';

/**
 * Auth token claims with tier information.
 */
export interface AuthClaims {
  iat: number;
  exp: number;
  sub: string;
  tier: AccessTier;
}

/**
 * Code type determined during verification.
 */
export type CodeType = 'individual' | 'developer' | 'study';
