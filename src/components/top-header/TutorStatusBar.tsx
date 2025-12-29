'use client';
import { useState } from 'react';
import { ChevronRightIcon } from '@heroicons/react/24/outline';

type Milestone = {
  id: string;
  status: 'not_started' | 'in_progress' | 'completed';
  name: string;
};

/**
 * Status bar showing progress milestones and breadcrumb path.
 * Appears as second row when tutor mode is ON.
 */
export function TutorStatusBar({
  milestones,
  breadcrumbPath,
  currentNodeId,
}: {
  milestones: Milestone[];
  breadcrumbPath: string[];
  currentNodeId?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  // On mobile, show compact view by default
  const toggleExpand = () => setExpanded((v) => !v);

  return (
    <div
      className={`tutor-status-bar ${expanded ? 'tutor-status-bar--expanded' : ''}`}
      onClick={toggleExpand}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleExpand();
        }
      }}
    >
      {/* Milestone dots */}
      <div className="tutor-status-bar__milestones">
        {milestones.map((m, i) => {
          let stateClass = '';
          if (m.status === 'completed') stateClass = 'tutor-status-bar__milestone--completed';
          else if (m.status === 'in_progress' || m.id === currentNodeId)
            stateClass = 'tutor-status-bar__milestone--active';

          return (
            <span
              key={m.id}
              className={`tutor-status-bar__milestone ${stateClass}`}
              title={m.name}
            />
          );
        })}
      </div>

      {/* Breadcrumb path */}
      <nav className="tutor-status-bar__breadcrumb" aria-label="Learning path">
        {breadcrumbPath.map((segment, i) => (
          <span key={i} className="tutor-status-bar__breadcrumb-item">
            {i > 0 && <ChevronRightIcon className="h-3 w-3 mx-1 opacity-50" />}
            <span className={i === breadcrumbPath.length - 1 ? 'font-medium' : ''}>
              {segment}
            </span>
          </span>
        ))}
      </nav>
    </div>
  );
}
