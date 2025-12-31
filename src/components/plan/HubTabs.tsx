'use client';
import { motion } from 'framer-motion';

export type HubTabId = 'plan' | 'progress';

export function HubTabs({
  activeTab,
  onTabChange,
}: {
  activeTab: HubTabId;
  onTabChange: (tab: HubTabId) => void;
}) {
  const tabs: { id: HubTabId; label: string }[] = [
    { id: 'plan', label: 'Plan' },
    { id: 'progress', label: 'My Progress' },
  ];

  return (
    <div
      className="relative flex gap-1 p-1"
      style={{
        background: 'var(--marginalia-bg)',
        borderRadius: 'var(--radius-editorial)',
        border: '1px solid var(--rule-light)',
      }}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className="relative flex-1 px-4 py-2 text-sm font-medium transition-colors duration-200"
            style={{
              color: isActive ? 'var(--color-fg)' : 'var(--color-fg-muted)',
              borderRadius: 'calc(var(--radius-editorial) - 2px)',
              zIndex: isActive ? 1 : 0,
            }}
          >
            {isActive && (
              <motion.div
                layoutId="activeHubTab"
                className="absolute inset-0"
                style={{
                  background: 'var(--surface-paper)',
                  borderRadius: 'calc(var(--radius-editorial) - 2px)',
                  boxShadow: 'var(--shadow-1)',
                  border: '1px solid var(--rule-light)',
                }}
                transition={{
                  type: 'spring',
                  stiffness: 500,
                  damping: 35,
                }}
              />
            )}
            <span className="relative z-10">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
