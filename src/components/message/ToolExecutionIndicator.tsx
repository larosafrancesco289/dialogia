'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { AcademicCapIcon, MapIcon, CogIcon } from '@heroicons/react/24/outline';
import type { ToolCallLogEntry, ToolCallCategory } from '@/lib/types';
import styles from './ToolExecutionIndicator.module.css';

type ToolExecutionIndicatorProps = {
  toolCalls: ToolCallLogEntry[];
  isExecuting: boolean;
};

const TOOL_LABELS: Record<string, string> = {
  web_search: 'Searching the web',
  quiz: 'Creating quiz',
  learning_plan: 'Building learning plan',
  record_learning: 'Recording progress',
  ask_student_question: 'Preparing question',
  plan_proposal: 'Proposing plan',
};

const CATEGORY_ICONS: Record<ToolCallCategory | 'default', typeof CogIcon> = {
  search: CogIcon,
  tutor: AcademicCapIcon,
  planning: MapIcon,
  system: CogIcon,
  other: CogIcon,
  default: CogIcon,
};

const CATEGORY_LABELS: Record<ToolCallCategory | 'default', string> = {
  search: 'Search',
  tutor: 'Tutor',
  planning: 'Planning',
  system: 'System',
  other: 'Processing',
  default: 'Processing',
};

function getToolDisplayName(name: string): string {
  return TOOL_LABELS[name] ?? name.replace(/_/g, ' ');
}

function getCategoryIcon(category?: ToolCallCategory): typeof CogIcon {
  return CATEGORY_ICONS[category ?? 'default'];
}

function getCategoryLabel(category?: ToolCallCategory): string {
  return CATEGORY_LABELS[category ?? 'default'];
}

function getStatusClass(status: string): string {
  switch (status) {
    case 'pending':
      return styles.pending;
    case 'success':
      return styles.success;
    case 'error':
      return styles.error;
    default:
      return '';
  }
}

export function ToolExecutionIndicator({
  toolCalls,
  isExecuting,
}: ToolExecutionIndicatorProps): React.ReactNode {
  if (toolCalls.length === 0) return null;

  return (
    <AnimatePresence mode="popLayout">
      <div className={styles.stack}>
        {toolCalls.map((tool) => {
          const Icon = getCategoryIcon(tool.category);
          const categoryLabel = getCategoryLabel(tool.category);
          const isActive = tool.status === 'pending' && isExecuting;

          return (
            <motion.div
              key={tool.id}
              layout
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.96 }}
              transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
              className={`${styles.indicator} ${isActive ? styles.executing : ''}`}
            >
              {isActive && <div className={styles.shimmer} />}

              <div className={`${styles.iconContainer} ${isActive ? styles.executing : ''}`}>
                <Icon className={styles.icon} />
              </div>

              <div className={styles.content}>
                <span className={`${styles.label} ${isActive ? styles.executing : ''}`}>
                  {categoryLabel}
                </span>
                <span className={styles.toolName}>{getToolDisplayName(tool.name)}</span>
              </div>

              <span className={`${styles.statusDot} ${getStatusClass(tool.status)}`} />
            </motion.div>
          );
        })}
      </div>
    </AnimatePresence>
  );
}
