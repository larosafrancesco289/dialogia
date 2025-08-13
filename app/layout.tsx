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
      <body>{children}</body>
    </html>
  );
}
