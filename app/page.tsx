import { headers } from 'next/headers';
import { HomeClient } from '@/components/HomeClient';

/**
 * Server entrypoint: detect mobile from request headers so the first paint
 * renders the right shell instead of flashing the desktop layout on phones.
 */
export default async function HomePage() {
  const requestHeaders = await headers();
  const clientHintMobile = requestHeaders.get('sec-ch-ua-mobile');
  const userAgent = requestHeaders.get('user-agent') ?? '';
  const initialIsMobile = clientHintMobile
    ? clientHintMobile.includes('?1')
    : /Mobi|Android|iPhone|iPod/i.test(userAgent);

  return <HomeClient initialIsMobile={initialIsMobile} />;
}
