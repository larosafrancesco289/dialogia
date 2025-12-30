import { jsonError } from '@/lib/server/route';

// Anthropic API is currently disabled - code preserved for future re-enablement
// To re-enable:
// 1. Set NEXT_PUBLIC_USE_ANTHROPIC_PROXY=true and ANTHROPIC_API_KEY in Vercel
// 2. Restore the original handler from git history

export async function GET() {
  return jsonError(503, 'provider_disabled', 'Anthropic API is currently unavailable');
}
