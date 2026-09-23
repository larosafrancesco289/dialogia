import type { ReactNode } from 'react';

// Component: SettingsSection
// Responsibility: One ruled section of the settings page, headed by a rubric
// label. Sections are divided by hairlines, never boxed.
export function SettingsSection(props: { title: string; children: ReactNode }) {
  const { title, children } = props;
  return (
    <section className="settings-section">
      <h3 className="settings-section-header">{title}</h3>
      <div className="settings-section-content">{children}</div>
    </section>
  );
}
