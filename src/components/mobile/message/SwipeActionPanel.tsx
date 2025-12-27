'use client';

import { motion } from 'framer-motion';
import {
  ClipboardDocumentIcon,
  PencilIcon,
  ArrowPathRoundedSquareIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import styles from './SwipeActionPanel.module.css';

export type SwipeAction = 'copy' | 'edit' | 'branch' | 'delete';

export interface SwipeActionPanelProps {
  /** Which side the panel appears on */
  side: 'left' | 'right';
  /** Message role determines available actions */
  role: 'user' | 'assistant' | 'system';
  /** How revealed the panel is (0-1) */
  revealProgress: number;
  /** Whether threshold is crossed */
  isActive: boolean;
  /** Callback when action is triggered */
  onAction?: (action: SwipeAction) => void;
}

interface ActionConfig {
  id: SwipeAction;
  icon: typeof ClipboardDocumentIcon;
  label: string;
  color: 'default' | 'accent' | 'danger';
}

// Left swipe reveals actions on the right
const rightActions: ActionConfig[] = [
  { id: 'copy', icon: ClipboardDocumentIcon, label: 'Copy', color: 'default' },
  { id: 'branch', icon: ArrowPathRoundedSquareIcon, label: 'Branch', color: 'accent' },
];

// Right swipe reveals actions on the left
const leftActionsUser: ActionConfig[] = [
  { id: 'edit', icon: PencilIcon, label: 'Edit', color: 'accent' },
  { id: 'delete', icon: TrashIcon, label: 'Delete', color: 'danger' },
];

const leftActionsAssistant: ActionConfig[] = [
  { id: 'copy', icon: ClipboardDocumentIcon, label: 'Copy', color: 'default' },
];

/**
 * SwipeActionPanel - Revealed action buttons for swipe gestures.
 *
 * Displays contextual actions based on message role:
 * - User messages: Edit, Delete (left), Copy, Branch (right)
 * - Assistant messages: Copy (left), Copy, Branch (right)
 */
export function SwipeActionPanel({
  side,
  role,
  revealProgress,
  isActive,
  onAction,
}: SwipeActionPanelProps) {
  const actions =
    side === 'left' ? (role === 'user' ? leftActionsUser : leftActionsAssistant) : rightActions;

  return (
    <div
      className={styles.panel}
      data-side={side}
      data-active={isActive}
      style={{ '--reveal-progress': revealProgress } as React.CSSProperties}
    >
      <div className={styles.actions}>
        {actions.map((action, index) => (
          <motion.button
            key={action.id}
            className={styles.actionButton}
            data-color={action.color}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{
              scale: isActive ? 1 : 0.8 + revealProgress * 0.2,
              opacity: revealProgress,
            }}
            transition={{
              type: 'spring',
              stiffness: 400,
              damping: 25,
              delay: index * 0.02,
            }}
            onClick={() => onAction?.(action.id)}
            aria-label={action.label}
          >
            <action.icon className={styles.actionIcon} />
            <span className={styles.actionLabel}>{action.label}</span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
