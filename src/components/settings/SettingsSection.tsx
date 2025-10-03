'use client';
import type { ReactNode } from 'react';

// Component: SettingsSection
// Responsibility: Standard card shell for grouped settings sections.
export default function SettingsSection(props: { title: string; children: ReactNode }) {
  const { title, children } = props;
  return (
    <div className="card p-4 space-y-3">
      <div className="text-sm font-medium text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}
