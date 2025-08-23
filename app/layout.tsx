import './globals.css';
import 'katex/dist/katex.min.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Dialogia — Private Multi-Model Chat',
  description: 'Local-only, privacy-first multi-model chat UI for OpenRouter.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="bg-surface text-fg">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(() => { try { var m = localStorage.getItem('theme') || 'auto'; var d = window.matchMedia('(prefers-color-scheme: dark)').matches; var dark = m === 'dark' || (m === 'auto' && d); document.documentElement.classList.toggle('dark', dark); } catch (_) {} })();`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
