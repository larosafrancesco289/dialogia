import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  CheckIcon,
  ChevronDownIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { formatModelLabel } from '@/lib/models';
import { useAvailableModels, useCuratedModels } from '@/lib/hooks/useModelCatalog';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { MEDIA_QUERIES } from '@/lib/ui/breakpoints';
import { isBuiltInEndpointId } from '@/lib/transport/endpoints';
import {
  buildModelSearchResult,
  buildModelSearchResults,
  normalizeModelQuery,
  splitModelQuery,
  type ModelSearchResult,
} from '@/lib/models/search';
import { PortalDropdown } from '@/components/PortalDropdown';
import {
  HighlightedText,
  ModelCapabilities,
  ModelRowFacts,
} from '@/components/model-picker/ModelRow';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useModelPickerController } from '@/components/model-picker/useModelPickerController';
import { useReturnFocus } from '@/lib/hooks/useModalFocus';
import { tabbableIn, trapTarget } from '@/lib/ui/focus';

export type ModelPickerVariant = 'auto' | 'sheet';

export type ModelPickerTriggerProps = {
  label: string;
  tooltip: string;
  isOpen: boolean;
  onClick: () => void;
};

/** One row of the picker: what it shows, and whether it can be removed from favorites. */
type PickerRow = {
  id: string;
  name: string;
  note?: string;
  result?: ModelSearchResult;
  removable?: boolean;
};

type PickerSection = { title: string; rows: PickerRow[] };

const POPOVER_WIDTH = 440;

/**
 * The model picker: a popover under the model's name (a sheet on phones).
 * Recommended picks and favorites sit as quiet rows; typing searches the
 * whole catalogue in place. Choosing a model the list does not hold yet also
 * adds it to the favorites, so it is there next time.
 */
export function ModelPicker({
  className = '',
  renderTrigger,
}: {
  variant?: ModelPickerVariant;
  className?: string;
  /** Custom trigger renderer. If not provided, uses default button. */
  renderTrigger?: (props: ModelPickerTriggerProps) => React.ReactNode;
}) {
  const {
    current,
    selectedIds,
    setModels,
    toggleFavoriteModel,
    favoriteModelIds,
    modelMap,
    zdrModelIds,
    zdrProviderIds,
  } = useModelPickerController();
  const curatedModels = useCuratedModels();
  const availableModels = useAvailableModels();
  const isMobile = useMediaQuery(MEDIA_QUERIES.mobile);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const zdrOpts = useMemo(() => ({ zdrModelIds, zdrProviderIds }), [zdrModelIds, zdrProviderIds]);
  const selectedId = selectedIds[0];

  const describe = useCallback(
    (id: string, name?: string): PickerRow => {
      const meta = modelMap.get(id);
      return {
        id,
        name: formatModelLabel({ model: meta, fallbackId: id, fallbackName: name }),
        result: meta ? buildModelSearchResult(meta, zdrOpts) : undefined,
      };
    },
    [modelMap, zdrOpts],
  );

  const queryWords = useMemo(() => splitModelQuery(normalizeModelQuery(query)), [query]);

  const sections = useMemo<PickerSection[]>(() => {
    if (queryWords.length) {
      const results = buildModelSearchResults(availableModels, queryWords, {
        maxResults: 60,
        ...zdrOpts,
      });
      return [
        {
          title: 'Results',
          rows: results.map((result) => ({ id: result.id, name: result.displayName, result })),
        },
      ];
    }
    const curatedIds = new Set(curatedModels.map((m) => m.id));
    const recommended = curatedModels.map((model) => ({
      ...describe(model.id, model.name),
      name: model.name,
      note: model.description,
    }));
    const favorites = favoriteModelIds
      .filter((id) => !curatedIds.has(id))
      .map((id) => ({ ...describe(id), removable: true }));
    const shown = new Set([...curatedIds, ...favoriteModelIds]);
    // Models from the user's own servers are few and chosen on purpose: list
    // them outright instead of making the user search for them.
    const ownServer = availableModels
      .filter((model) => model.endpointId && !isBuiltInEndpointId(model.endpointId))
      .filter((model) => !shown.has(model.id))
      .map((model) => ({
        id: model.id,
        name: formatModelLabel({ model, fallbackId: model.id }),
        note: model.providerDisplay,
        result: buildModelSearchResult(model, zdrOpts),
      }));
    return [
      { title: 'Recommended', rows: recommended },
      { title: 'Your favorites', rows: favorites },
      { title: 'Your servers', rows: ownServer },
    ].filter((section) => section.rows.length > 0);
  }, [queryWords, availableModels, zdrOpts, curatedModels, favoriteModelIds, describe]);

  const flatRows = useMemo(() => sections.flatMap((section) => section.rows), [sections]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);

  // Closing (Escape, a pick, a click away) hands focus back to the trigger
  // when it was in the popover. On phones the sheet does this itself.
  const returnFocus = useReturnFocus(open && !isMobile, {
    containerRef: panelRef,
    fallback: () => wrapRef.current?.querySelector('button'),
  });

  const choose = useCallback(
    (row: PickerRow) => {
      const known = favoriteModelIds.includes(row.id) || curatedModels.some((m) => m.id === row.id);
      if (!known) toggleFavoriteModel(row.id);
      setModels([row.id]);
      close();
    },
    [favoriteModelIds, curatedModels, toggleFavoriteModel, setModels, close],
  );

  // Anchor the popover under the trigger; phones get a bottom sheet instead.
  useLayoutEffect(() => {
    if (!open || isMobile) return;
    const place = () => {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      const left = Math.max(12, Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 12));
      setAnchor({ left, top: rect.bottom + 6 });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open, isMobile]);

  useEffect(() => {
    if (!open) return;
    setActiveIndex(
      Math.max(
        0,
        flatRows.findIndex((row) => row.id === selectedId),
      ),
    );
    // On a phone the keyboard would cover half the list before you have seen
    // it; the search is a tap away instead.
    if (isMobile) return;
    const tid = window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 30);
    return () => window.clearTimeout(tid);
    // Only when opening: typing moves the highlight to the first result below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    node?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    // Tabbing out of the popover closes it, as it would leave it stranded
    // over the page; from the trigger, the browser's Tab carries on.
    if (event.key === 'Tab' && !isMobile && panelRef.current) {
      const panel = panelRef.current;
      const active = document.activeElement as HTMLElement | null;
      if (trapTarget(tabbableIn(panel), active, event.shiftKey, true) !== null) {
        returnFocus();
        close();
      }
      return;
    }
    if (!flatRows.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % flatRows.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => (i - 1 + flatRows.length) % flatRows.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const row = flatRows[activeIndex];
      if (row) choose(row);
    }
  };

  const label = current
    ? formatModelLabel({
        model: modelMap.get(current.id),
        fallbackId: current.id,
        fallbackName: current.name,
      })
    : 'Pick model';

  const triggerProps: ModelPickerTriggerProps = {
    label,
    tooltip: label,
    isOpen: open,
    onClick: () => (open ? close() : setOpen(true)),
  };

  let index = -1;
  const panel = (
    <div
      ref={panelRef}
      className={isMobile ? 'model-picker model-picker--sheet' : 'model-picker popover'}
      style={isMobile || !anchor ? undefined : { left: anchor.left, top: anchor.top }}
      role={isMobile ? undefined : 'dialog'}
      aria-label={isMobile ? undefined : 'Choose a model'}
      onKeyDown={onKeyDown}
    >
      <div className="model-picker__search">
        <MagnifyingGlassIcon className="model-picker__search-icon" />
        <input
          ref={inputRef}
          className="model-picker__input"
          placeholder="Search every model"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search models"
          aria-controls="model-picker-list"
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <div ref={listRef} id="model-picker-list" className="model-picker__list" role="listbox">
        {!sections.some((section) => section.rows.length > 0) && (
          <p className="model-picker__empty">
            {queryWords.length ? 'No model matches that.' : 'No models loaded yet.'}
          </p>
        )}
        {sections
          .filter((section) => section.rows.length > 0)
          .map((section) => (
            <div key={section.title} className="model-picker__section">
              <div className="model-picker__heading">{section.title}</div>
              {section.rows.map((row) => {
                index += 1;
                const rowIndex = index;
                const isSelected = row.id === selectedId;
                return (
                  <div
                    key={row.id}
                    data-index={rowIndex}
                    role="option"
                    aria-selected={isSelected}
                    className={`model-row${rowIndex === activeIndex ? ' is-active' : ''}${isSelected ? ' is-selected' : ''}`}
                    onClick={() => choose(row)}
                    onMouseMove={() => setActiveIndex(rowIndex)}
                  >
                    <span className="model-row__main">
                      <span className="model-row__name">
                        <HighlightedText text={row.name} words={queryWords} />
                      </span>
                      <span className="model-row__meta">
                        {row.note ? (
                          <span className="model-row__note">{row.note}</span>
                        ) : (
                          row.result && <ModelRowFacts result={row.result} />
                        )}
                      </span>
                    </span>
                    <ModelCapabilities result={row.result} />
                    {isSelected ? (
                      <CheckIcon className="model-row__check" aria-label="Selected" />
                    ) : row.removable ? (
                      <button
                        type="button"
                        className="icon-button icon-button--sm model-row__remove"
                        title="Remove from favorites"
                        aria-label={`Remove ${row.name} from favorites`}
                        onClick={(event) => {
                          event.stopPropagation();
                          // The button goes with its row; keep focus in the picker.
                          const surface = isMobile
                            ? panelRef.current?.closest<HTMLElement>('[role="dialog"]')
                            : inputRef.current;
                          surface?.focus({ preventScroll: true });
                          toggleFavoriteModel(row.id);
                        }}
                      >
                        <XMarkIcon />
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
      </div>
    </div>
  );

  return (
    <div ref={wrapRef} className={`relative min-w-0 ${className}`.trim()}>
      {renderTrigger ? (
        renderTrigger(triggerProps)
      ) : (
        <button
          type="button"
          className="model-picker-trigger"
          aria-haspopup="dialog"
          aria-expanded={open}
          title={label}
          onClick={triggerProps.onClick}
        >
          <span className="model-picker-trigger__name truncate">{label}</span>
          <ChevronDownIcon className="model-picker-trigger__chevron h-4 w-4 shrink-0" />
        </button>
      )}

      {isMobile ? (
        <BottomSheet open={open} label="Choose a model" onClose={close}>
          {panel}
        </BottomSheet>
      ) : (
        <PortalDropdown
          open={open}
          onClose={close}
          contentRef={panelRef}
          ignoreOutsideRefs={[wrapRef]}
        >
          <div className="fixed inset-0 z-[90] pointer-events-none">
            <div className="pointer-events-auto">{panel}</div>
          </div>
        </PortalDropdown>
      )}
    </div>
  );
}
