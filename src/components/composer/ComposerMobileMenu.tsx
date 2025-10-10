'use client';
import { useEffect } from 'react';
import { EllipsisVerticalIcon } from '@heroicons/react/24/outline';

export type Effort = 'none' | 'low' | 'medium' | 'high';

export type ComposerMobileMenuProps = {
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  buttonRef: React.MutableRefObject<HTMLButtonElement | null>;
  onAttachClick: () => void;
  searchEnabled: boolean;
  searchProvider: 'brave' | 'openrouter';
  toggleSearch: () => void;
  showReasoningMenu: boolean;
  currentEffort?: Effort;
  onSelectEffort: (effort: Effort) => void;
};

export function ComposerMobileMenu({
  isOpen,
  onToggle,
  onClose,
  buttonRef,
  onAttachClick,
  searchEnabled,
  searchProvider,
  toggleSearch,
  showReasoningMenu,
  currentEffort,
  onSelectEffort,
}: ComposerMobileMenuProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const menu = document.getElementById('composer-mobile-menu');
      const trigger = buttonRef.current;
      const target = event.target as Node | null;
      const inMenu = !!(menu && target && menu.contains(target));
      const inTrigger = !!(trigger && target && trigger.contains(target));
      if (!inMenu && !inTrigger) onClose();
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [isOpen, onClose, buttonRef]);

  return (
    <div className="flex sm:hidden items-center gap-2 relative">
      <button
        ref={(node) => {
          buttonRef.current = node;
        }}
        className="btn btn-outline self-center"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="More actions"
        onClick={onToggle}
      >
        <EllipsisVerticalIcon className="h-4 w-4" />
      </button>
      {isOpen && (
        <div
          id="composer-mobile-menu"
          role="menu"
          className="absolute bottom-full mb-2 right-0 z-40 card p-1 popover min-w-[220px] max-w-[80vw]"
        >
          <div className="menu-item text-sm" role="menuitem" onClick={onAttachClick}>
            Attach files
          </div>
          <div
            className="menu-item text-sm"
            role="menuitemcheckbox"
            aria-checked={!!searchEnabled}
            onClick={() => {
              toggleSearch();
              onClose();
            }}
          >
            {`${searchProvider === 'openrouter' ? 'OpenRouter' : 'Brave'} Search: ${searchEnabled ? 'On' : 'Off'}`}
          </div>
          {showReasoningMenu && (
            <>
              <div className="text-xs text-muted-foreground px-2 pt-1">Reasoning</div>
              {(['none', 'low', 'medium', 'high'] as Effort[]).map((effort) => (
                <div
                  key={effort}
                  className={`menu-item text-sm ${currentEffort === effort ? 'font-semibold' : ''}`}
                  role="menuitemradio"
                  aria-checked={currentEffort === effort}
                  onClick={() => {
                    onSelectEffort(effort);
                    onClose();
                  }}
                >
                  {effort[0].toUpperCase() + effort.slice(1)}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
