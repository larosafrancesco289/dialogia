import { createPortal } from 'react-dom';
import type {
  ComponentPropsWithoutRef,
  ElementType,
  KeyboardEventHandler,
  MouseEvent,
  ReactNode,
  Ref,
} from 'react';

export function DialogPortal({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}

type DialogOverlayProps<T extends ElementType> = {
  as?: T;
  onClose?: () => void;
  onClick?: ComponentPropsWithoutRef<T>['onClick'];
  closeOnOverlayClick?: boolean;
  children?: ReactNode;
} & Omit<ComponentPropsWithoutRef<T>, 'as' | 'onClick'>;

export function DialogOverlay<T extends ElementType = 'div'>({
  as,
  onClose,
  onClick,
  closeOnOverlayClick = true,
  children,
  ...rest
}: DialogOverlayProps<T>) {
  const Component = (as ?? 'div') as ElementType;
  const { ['aria-hidden']: ariaHidden, ...restProps } = rest as {
    'aria-hidden'?: boolean;
  } & Omit<ComponentPropsWithoutRef<T>, 'as' | 'onClick'>;
  return (
    <Component
      {...restProps}
      aria-hidden={ariaHidden}
      onClick={(event: MouseEvent) => {
        onClick?.(event);
        if (!closeOnOverlayClick || !onClose) return;
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {children}
    </Component>
  );
}

type DialogSurfaceProps = {
  className?: string;
  role?: string;
  ariaLabel?: string;
  ariaModal?: boolean;
  surfaceRef?: Ref<HTMLDivElement>;
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
  children: ReactNode;
};

export function DialogSurface({
  className,
  role = 'dialog',
  ariaLabel,
  ariaModal = true,
  surfaceRef,
  onKeyDown,
  children,
}: DialogSurfaceProps) {
  return (
    <div
      ref={surfaceRef}
      className={className}
      role={role}
      aria-modal={ariaModal}
      aria-label={ariaLabel}
      // A click on its text keeps focus in the dialog instead of dropping it.
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  );
}
