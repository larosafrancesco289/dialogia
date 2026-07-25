import './globals.css';
import '../styles/logo.css';
import Script from 'next/script';
import type { Metadata } from 'next';
import { injectThemeClass } from '@/lib/html';
import { Newsreader, Plus_Jakarta_Sans } from 'next/font/google';
import { TierProvider } from '@/lib/auth/tierContext';
import { Analytics } from '@vercel/analytics/next';

const newsreader = Newsreader({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-serif-display',
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
});

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans-display',
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: 'Dialogia — Private Multi-Model Chat',
  description: 'Local-only, privacy-first multi-model chat UI for OpenRouter.',
  icons: {
    icon: '/logo.jpg',
    apple: '/logo.jpg',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`bg-canvas text-fg ${newsreader.variable} ${plusJakartaSans.variable}`}
      suppressHydrationWarning
    >
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <Script id="theme-init" strategy="beforeInteractive">
          {injectThemeClass()}
        </Script>
      </head>
      <body>
        <TierProvider>{children}</TierProvider>
        <Analytics />
      </body>
    </html>
  );
}
