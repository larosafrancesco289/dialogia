import { motionTransition } from '@/lib/ui/motion';
import { useRef } from 'react';
import { motion } from 'framer-motion';
import { DialogOverlay, DialogPortal } from '@/components/ui/Dialog';
import { ConnectForm } from '@/components/connect/ConnectForm';
import { useChatStore } from '@/lib/store';
import { useBackToClose } from '@/lib/hooks/useBackToClose';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { useModalFocus } from '@/lib/hooks/useModalFocus';
import { MEDIA_QUERIES } from '@/lib/ui/breakpoints';

// Component: SetupSheet
// Responsibility: Connecting a provider when asked for (Connect a model, a send
// with no key). With nothing connected the welcome page asks instead, in the
// composer's place, with the same form.

export function SetupSheet() {
  const setUI = useChatStore((s) => s.setUI);
  const reason = useChatStore((s) => s.ui.setupReason);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  // A touch screen starts on the dialog itself: focusing the field would
  // raise the keyboard over a dialog not yet read.
  const isTouch = useMediaQuery(MEDIA_QUERIES.touch);

  const close = () => setUI({ setupOpen: false, setupReason: undefined });

  useBackToClose(true, close);
  useModalFocus(true, surfaceRef, {
    initialFocus: isTouch ? undefined : fieldRef,
    onEscape: close,
  });

  return (
    // Above the settings drawer (z-[80]): the sheet is reachable from inside it.
    <DialogPortal>
      <DialogOverlay className="scrim z-[90]" onClose={close}>
        {/* At a fixed height, not centred: a fold opening, or another way to
            connect, never moves the title. */}
        <div className="fixed inset-0 z-[95] flex items-start justify-center overflow-y-auto p-4 pt-[12vh]">
          <motion.div
            ref={surfaceRef}
            className="dialog max-w-md"
            role="dialog"
            aria-modal="true"
            aria-labelledby="setup-title"
            // A click on its text keeps focus in the dialog instead of dropping it.
            tabIndex={-1}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={motionTransition.quick}
          >
            <ConnectForm
              id="setup"
              title="Connect a model"
              lead={reason}
              variant="dialog"
              inputRef={fieldRef}
              onConnected={close}
            />
            <div className="dialog__actions">
              <button className="btn-ghost btn-sm" onClick={close}>
                Not now
              </button>
            </div>
          </motion.div>
        </div>
      </DialogOverlay>
    </DialogPortal>
  );
}
