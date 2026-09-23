import { useEffect, useRef } from 'react';
import { motion, useTransform, type MotionValue } from 'framer-motion';
import { Cog6ToothIcon } from '@heroicons/react/24/outline';
import { ChatSidebar } from '@/components/sidebar/ChatSidebar';
import { LogoMark } from '@/components/ui/LogoMark';
import { ModuleSlot } from '@/components/ModuleSlot';
import styles from './MobileDrawer.module.css';

/**
 * The phone's chat list: the desktop sidebar, drawn in from the left edge.
 * It sits on the chrome's recessed tone beside the page it pushes aside,
 * with the book's name at the top and Settings at the foot.
 */
export function MobileDrawer({
  open,
  width,
  offset,
  onOpenSettings,
}: {
  open: boolean;
  width: number;
  offset: MotionValue<number>;
  onOpenSettings: () => void;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const x = useTransform(offset, (v) => v - width);
  // Fully shut, it is gone: nothing to tab into, nothing peeking at the edge.
  const visibility = useTransform(offset, (v) => (v > 0 ? 'visible' : 'hidden'));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open) {
      el.removeAttribute('inert');
      el.focus({ preventScroll: true });
    } else {
      el.setAttribute('inert', '');
    }
  }, [open]);

  return (
    <motion.nav
      ref={ref}
      className={styles.drawer}
      style={{ width, x, visibility }}
      aria-label="Chats"
      aria-hidden={!open}
      tabIndex={-1}
    >
      <div className={styles.head}>
        <div className="brand">
          <LogoMark className="brand__mark" />
          <span className="brand__name">Dialogia</span>
        </div>
      </div>

      <ModuleSlot slot="phoneDrawer" />

      <div className={styles.list}>
        <ChatSidebar collapsed={false} embedded />
      </div>

      <div className={styles.foot}>
        <button type="button" className={styles.footItem} onClick={onOpenSettings}>
          <Cog6ToothIcon className="h-5 w-5" aria-hidden="true" />
          <span>Settings</span>
        </button>
      </div>
    </motion.nav>
  );
}
