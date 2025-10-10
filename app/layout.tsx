import './globals.css';
import 'katex/dist/katex.min.css';
import Script from 'next/script';
import type { Metadata } from 'next';
import { injectThemeClass } from '@/lib/html';

export const metadata: Metadata = {
  title: 'Dialogia — Private Multi-Model Chat',
  description: 'Local-only, privacy-first multi-model chat UI for OpenRouter.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="bg-surface text-fg" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <Script id="theme-init" strategy="beforeInteractive">
          {injectThemeClass()}
        </Script>
      </head>
      <body>{children}</body>
    </html>
  );
}
