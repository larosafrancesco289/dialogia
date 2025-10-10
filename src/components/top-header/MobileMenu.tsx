'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { EllipsisVerticalIcon } from '@heroicons/react/24/outline';
import { ThemeToggle } from '@/components/ThemeToggle';

export type TopHeaderMobileMenuProps = {
  hasChat: boolean;
  collapsed: boolean;
  onNewChat: () => void;
  onRenameChat?: () => void;
  onOpenCompare: () => void;
  onOpenSettings: () => void;
  onToggleSidebar: () => void;
};

export function TopHeaderMobileMenu({
  hasChat,
  collapsed,
  onNewChat,
  onRenameChat,
  onOpenCompare,
  onOpenSettings,
  onToggleSidebar,
}: TopHeaderMobileMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuTop, setMenuTop] = useState<number | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    const updatePosition = () => {
      if (!buttonRef.current) return;
      const rect = buttonRef.current.getBoundingClientRect();
      const scrollY = typeof window !== 'undefined' ? window.scrollY : 0;
      setMenuTop(rect.bottom + 12 + scrollY);
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('resize', updatePosition);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      const menu = menuRef.current;
      const trigger = buttonRef.current;
      const inMenu = !!(menu && menu.contains(target));
      const inTrigger = !!(trigger && trigger.contains(target));
      if (!inMenu && !inTrigger) setIsOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [isOpen]);

  const resolvedMenuTop = useMemo(() => {
    if (menuTop == null) return undefined;
    if (typeof window === 'undefined') return menuTop;
    const viewportOffset = window.visualViewport?.offsetTop ?? 0;
    const scrollY = window.scrollY || 0;
    return Math.max(menuTop - scrollY, viewportOffset + 16);
  }, [menuTop]);

  const toggleMenu = () => {
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const scrollY = typeof window !== 'undefined' ? window.scrollY : 0;
      setMenuTop(rect.bottom + 12 + scrollY);
    }
    setIsOpen((value) => !value);
  };

  return (
    <div className="sm:hidden">
      <button
        ref={buttonRef}
        className="btn btn-ghost"
        aria-label="More actions"
        aria-expanded={isOpen}
        onClick={toggleMenu}
      >
        <EllipsisVerticalIcon className="h-5 w-5" />
      </button>

      {isOpen && (
        <>
          <button
            className="fixed inset-0 z-[90] cursor-default"
            aria-label="Close menu"
            type="button"
            onClick={() => setIsOpen(false)}
          />
          <div
            ref={menuRef}
            className="fixed right-3 z-[95] card p-1 popover min-w-[220px]"
            style={{ top: resolvedMenuTop }}
            role="menu"
          >
            <button
              className="menu-item w-full text-left text-sm"
              type="button"
              onClick={() => {
                onNewChat();
                setIsOpen(false);
              }}
            >
              New chat
            </button>
            {hasChat && onRenameChat && (
              <button
                className="menu-item w-full text-left text-sm"
                type="button"
                onClick={() => {
                  onRenameChat();
                  setIsOpen(false);
                }}
              >
                Rename chat
              </button>
            )}
            <button
              className="menu-item w-full text-left text-sm"
              type="button"
              onClick={() => {
                onOpenCompare();
                setIsOpen(false);
              }}
            >
              Compare models
            </button>
            <ThemeToggle variant="menu" onToggle={() => setIsOpen(false)} className="text-sm" />
            <button
              className="menu-item w-full text-left text-sm"
              type="button"
              onClick={() => {
                onOpenSettings();
                setIsOpen(false);
              }}
            >
              Settings
            </button>
            <button
              className="menu-item w-full text-left text-sm"
              type="button"
              onClick={() => {
                onToggleSidebar();
                setIsOpen(false);
              }}
            >
              {collapsed ? 'Show sidebar' : 'Hide sidebar'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
