'use client';
import { ChevronDoubleRightIcon } from '@heroicons/react/24/outline';
import { HubTabs, type HubTabId } from '@/components/plan/HubTabs';

export function LearningPanelHeader({
  activeTab,
  onTabChange,
  onCollapse,
  showProgressTab,
}: {
  activeTab: HubTabId;
  onTabChange: (tab: HubTabId) => void;
  onCollapse: () => void;
  showProgressTab: boolean;
}) {
  return (
    <div className="learning-panel__header">
      <div className="learning-panel__title-row">
        <span className="learning-panel__title">Learning Hub</span>
        <button
          className="learning-panel__collapse-btn"
          onClick={onCollapse}
          title="Collapse panel"
          aria-label="Collapse panel"
        >
          <ChevronDoubleRightIcon className="h-3.5 w-3.5" />
        </button>
      </div>
      {showProgressTab && <HubTabs activeTab={activeTab} onTabChange={onTabChange} />}
    </div>
  );
}
