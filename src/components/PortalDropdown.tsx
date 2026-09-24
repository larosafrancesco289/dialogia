import { createPortal } from 'react-dom';
import { useDismissOnOutside } from '@/lib/hooks/useDismissOnOutside';

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
  useDismissOnOutside({
    open,
    insideRefs: [...(contentRef ? [contentRef] : []), ...(ignoreOutsideRefs ?? [])],
    onOutsidePress: onClose,
    onEscape: onClose,
  });

  if (!open || typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}
