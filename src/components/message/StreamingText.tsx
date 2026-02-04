'use client';

import styles from './MessageCard.module.css';

export function StreamingText({ content }: { content: string }) {
  if (!content) return null;
  return <div className={styles.streamingText}>{content}</div>;
}
