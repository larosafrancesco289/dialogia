import { useEffect, useRef, type RefObject } from 'react';
import { cancelFrame, frame, motion, useTransform, type MotionValue } from 'framer-motion';
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
  onClose,
  returnFocusRef,
}: {
  open: boolean;
  width: number;
  offset: MotionValue<number>;
  onOpenSettings: () => void;
  onClose: () => void;
  /** The button that opens the drawer, where focus goes when it is put away. */
  returnFocusRef: RefObject<HTMLElement | null>;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const x = useTransform(offset, (v) => v - width);
  // Fully shut, it is gone: nothing to tab into, nothing peeking at the edge.
  const visibility = useTransform(offset, (v) => (v > 0 ? 'visible' : 'hidden'));

  const wasOpenRef = useRef(open);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = open;
    if (open) {
      el.removeAttribute('inert');
      // Shut, it is hidden until the slide has moved it, and a hidden element
      // cannot take focus: focus it once it shows.
      const focusIn = () => el.focus({ preventScroll: true });
      if (visibility.get() === 'visible') {
        focusIn();
        return;
      }
      const stop = visibility.on('change', (value) => {
        if (value !== 'visible') return;
        stop();
        frame.postRender(focusIn);
      });
      return () => {
        stop();
        cancelFrame(focusIn);
      };
    }
    // However it was put away (Escape, a tap on the page, a chat picked),
    // focus inside goes back to the button that opens it.
    const active = document.activeElement;
    if (wasOpen && (active === document.body || el.contains(active))) {
      returnFocusRef.current?.focus({ preventScroll: true });
    }
    el.setAttribute('inert', '');
  }, [open, visibility, returnFocusRef]);

  return (
    <motion.nav
      ref={ref}
      className={styles.drawer}
      style={{ width, x, visibility }}
      aria-label="Chats"
      aria-hidden={!open}
      tabIndex={-1}
      onClick={(event) => {
        // A tap on a chat opens it; on the chat already open, that simply
        // means back to it. (A long press opens its sheet instead.)
        const row = (event.target as Element).closest('.chat-item');
        if (!row || row.matches('.folder-row, .is-editing')) return;
        if (document.querySelector('[aria-modal="true"]')) return;
        onClose();
      }}
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
