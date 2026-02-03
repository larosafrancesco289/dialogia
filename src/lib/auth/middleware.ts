import { PUBLIC_AUTH_PATHS } from '@/lib/auth/shared';
import { verifyAuthTokenEdgeDetailed } from '@/lib/auth/token.edge';

export function isPublicAuthPath(pathname: string): boolean {
  return PUBLIC_AUTH_PATHS.includes(pathname);
}

export async function verifyAuthToken(token: string, secret: string) {
  return verifyAuthTokenEdgeDetailed(token, secret);
}
