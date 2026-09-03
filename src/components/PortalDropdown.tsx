import { useEffect } from 'react';
import { createPortal } from 'react-dom';

export type PortalDropdownProps = {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  contentRef?: React.RefObject<HTMLElement>;
  ignoreOutsideRefs?: Array<React.RefObject<HTMLElement>>;
};

export function PortalDropdown({
  open,
  onClose,
  children,
  contentRef,
  ignoreOutsideRefs,
}: PortalDropdownProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (contentRef?.current && contentRef.current.contains(target)) return;
      if (ignoreOutsideRefs?.some((ref) => ref.current && ref.current.contains(target))) return;
      onClose();
    };
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [open, onClose, contentRef, ignoreOutsideRefs]);

  if (!open || typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}
