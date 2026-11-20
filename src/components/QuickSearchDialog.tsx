import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { shallow } from 'zustand/shallow';
import {
  AcademicCapIcon,
  ChatBubbleLeftIcon,
  DocumentTextIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import { DialogOverlay, DialogPortal, DialogSurface } from '@/components/ui/Dialog';
import { useChatStore } from '@/lib/store';
import type { MessageSearchRecord } from '@/lib/db/repository';
import { repository } from '@/lib/db';
import { useBackToClose } from '@/lib/hooks/useBackToClose';
import { useModalFocus } from '@/lib/hooks/useModalFocus';
import { getHighlightSegments } from '@/lib/models/search';
import {
  buildMessageHits,
  searchChats,
  tokenizeQuery,
  type MessageSearchHit,
} from '@/lib/ui/chatSearch';
import { displayChatTitle } from '@/lib/ui/chatTitle';
import { focusComposer, indexForKey } from '@/lib/ui/focus';
import { shortDate } from '@/lib/ui/shortDate';
import { useT } from '@/lib/i18n';

// Minimum query length before scanning message bodies in IndexedDB.
const MIN_MESSAGE_QUERY = 2;
const SEARCH_DEBOUNCE_MS = 220;

type QuickSearchItem =
  | { kind: 'chat'; id: string; chatId: string; title: string; isTutor: boolean; updatedAt: number }
  | { kind: 'message'; id: string; hit: MessageSearchHit };

function Highlighted({ text, words }: { text: string; words: string[] }) {
  if (words.length === 0) return <>{text}</>;
  return (
    <>
      {getHighlightSegments(text, words).map((segment, index) =>
        segment.highlight ? (
          <mark key={index} className="model-row__match">
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}

/** In-memory messages matching `terms` (covers messages sent moments ago). */
function matchLoadedMessages(terms: string[]): MessageSearchRecord[] {
  if (terms.length === 0) return [];
  const { messagesById } = useChatStore.getState();
  const hits: MessageSearchRecord[] = [];
  for (const message of Object.values(messagesById)) {
    if (message.metadata?.hiddenFromUser || message.ledger) continue;
    const parts: string[] = [];
    if (message.content?.trim()) parts.push(message.content);
    for (const attachment of message.attachments ?? []) {
      if (attachment?.name) parts.push(attachment.name);
      if (attachment?.text) parts.push(attachment.text);
    }
    if (parts.length === 0) continue;
    const haystack = parts.join('\n').toLowerCase();
    if (!terms.every((term) => haystack.includes(term))) continue;
    const matchedPart =
      parts.find((part) => {
        const lower = part.toLowerCase();
        return terms.some((term) => lower.includes(term));
      }) ?? parts[0];
    hits.push({
      id: message.id,
      chatId: message.chatId,
      role: message.role,
      content: matchedPart || '',
      createdAt: message.createdAt,
    });
  }
  return hits;
}

export function QuickSearchDialog() {
  const t = useT();
  const { chats, selectedChatId, selectChat, setUI } = useChatStore(
    (s) => ({
      chats: s.chats,
      selectedChatId: s.selectedChatId,
      selectChat: s.selectChat,
      setUI: s.setUI,
    }),
    shallow,
  );

  const [query, setQuery] = useState('');
  const [messageHits, setMessageHits] = useState<MessageSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const surfaceRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const chatsRef = useRef(chats);
  chatsRef.current = chats;
  const listId = useId();
  const chatsHeadingId = useId();
  const messagesHeadingId = useId();
  const optionIdPrefix = useId();

  const close = useCallback(() => {
    setUI({ quickSearchOpen: false });
  }, [setUI]);

  useBackToClose(true, close);
  useModalFocus(true, surfaceRef, { initialFocus: inputRef, onEscape: close });

  const trimmed = query.trim();
  const terms = useMemo(() => tokenizeQuery(trimmed), [trimmed]);
  const chatMatches = useMemo(() => searchChats(chats, trimmed, 8), [chats, trimmed]);

  useEffect(() => {
    if (trimmed.length < MIN_MESSAGE_QUERY) {
      setMessageHits([]);
      setSearching(false);
      return;
    }

    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      Promise.resolve(
        repository.searchMessages(trimmed, { limit: 80, isCancelled: () => cancelled }),
      )
        .then((stored) => {
          if (cancelled) return;
          const combined = [...matchLoadedMessages(terms), ...stored];
          setMessageHits(buildMessageHits(combined, chatsRef.current, trimmed));
          setSearching(false);
        })
        .catch(() => {
          if (cancelled) return;
          setMessageHits(buildMessageHits(matchLoadedMessages(terms), chatsRef.current, trimmed));
          setSearching(false);
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [terms, trimmed]);

  const items = useMemo<QuickSearchItem[]>(() => {
    const chatItems: QuickSearchItem[] = chatMatches.map((chat) => ({
      kind: 'chat',
      id: `chat:${chat.id}`,
      chatId: chat.id,
      title: displayChatTitle(chat.title),
      isTutor: chat.settings.features.tutor?.enabled === true,
      updatedAt: chat.updatedAt ?? chat.createdAt,
    }));
    const messageItems: QuickSearchItem[] = messageHits.map((hit) => ({
      kind: 'message',
      id: `msg:${hit.messageId}`,
      hit,
    }));
    return [...chatItems, ...messageItems];
  }, [chatMatches, messageHits]);

  useEffect(() => {
    setActiveIndex(0);
  }, [trimmed]);

  const clampedActive = items.length > 0 ? Math.min(activeIndex, items.length - 1) : -1;

  useEffect(() => {
    if (clampedActive < 0) return;
    optionRefs.current[clampedActive]?.scrollIntoView({ block: 'nearest' });
  }, [clampedActive]);

  const choose = useCallback(
    (item: QuickSearchItem) => {
      if (item.kind === 'chat') {
        selectChat(item.chatId);
        setUI({ quickSearchOpen: false, showSettings: false, memoryOpen: false });
        requestAnimationFrame(() => focusComposer());
        return;
      }
      selectChat(item.hit.chatId);
      setUI({
        quickSearchOpen: false,
        showSettings: false,
        memoryOpen: false,
        jumpToMessage: {
          chatId: item.hit.chatId,
          messageId: item.hit.messageId,
          nonce: Date.now(),
        },
      });
    },
    [selectChat, setUI],
  );

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (query) {
        setQuery('');
        return;
      }
      close();
      return;
    }
    if (event.key === 'Enter' && clampedActive >= 0) {
      const target = items[clampedActive];
      if (!target) return;
      event.preventDefault();
      choose(target);
      return;
    }
    const next = indexForKey(event.key, clampedActive, items.length, 'vertical');
    if (next !== null) {
      event.preventDefault();
      setActiveIndex(next);
    }
  };

  const chatCount = chatMatches.length;
  const activeOptionId = clampedActive >= 0 ? `${optionIdPrefix}-${clampedActive}` : undefined;

  return (
    <DialogPortal>
      <DialogOverlay className="scrim z-[80]" onClose={close}>
        <div className="quick-search-scroller fixed inset-0 z-[85] flex items-start justify-center pointer-events-none">
          <DialogSurface
            className="dialog dialog--rise quick-search pointer-events-auto"
            ariaLabel={t('quickSearch.title')}
            surfaceRef={surfaceRef}
          >
            <div className="model-picker__search">
              <MagnifyingGlassIcon className="model-picker__search-icon" aria-hidden="true" />
              <input
                ref={inputRef}
                type="search"
                className="model-picker__input"
                value={query}
                placeholder={t('quickSearch.placeholder')}
                aria-label={t('quickSearch.placeholder')}
                role="combobox"
                aria-expanded={items.length > 0}
                aria-autocomplete="list"
                aria-controls={listId}
                aria-activedescendant={activeOptionId}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={onInputKeyDown}
              />
            </div>

            <div
              id={listId}
              className="model-picker__list quick-search__list"
              role="listbox"
              aria-label={t('quickSearch.results')}
            >
              {chatCount > 0 && (
                <div
                  className="model-picker__section"
                  role="group"
                  aria-labelledby={chatsHeadingId}
                >
                  <div id={chatsHeadingId} className="model-picker__heading">
                    {t(trimmed ? 'quickSearch.chats' : 'quickSearch.recent')}
                  </div>
                  {items.slice(0, chatCount).map((item, idx) => {
                    if (item.kind !== 'chat') return null;
                    const active = idx === clampedActive;
                    const selected = item.chatId === selectedChatId;
                    return (
                      <button
                        key={item.id}
                        id={`${optionIdPrefix}-${idx}`}
                        ref={(el) => {
                          optionRefs.current[idx] = el;
                        }}
                        type="button"
                        role="option"
                        tabIndex={-1}
                        aria-selected={active}
                        className={`model-row quick-search__row${active ? ' is-active' : ''}${selected ? ' is-selected' : ''}`}
                        onMouseEnter={() => setActiveIndex(idx)}
                        onClick={() => choose(item)}
                      >
                        {item.isTutor ? (
                          <AcademicCapIcon className="quick-search__icon" aria-hidden="true" />
                        ) : (
                          <ChatBubbleLeftIcon className="quick-search__icon" aria-hidden="true" />
                        )}
                        <span className="model-row__main">
                          <span className="model-row__name">
                            <Highlighted text={item.title} words={terms} />
                          </span>
                        </span>
                        <span className="quick-search__date">{shortDate(item.updatedAt)}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {trimmed.length >= MIN_MESSAGE_QUERY && (
                <div
                  className="model-picker__section"
                  role="group"
                  aria-labelledby={messagesHeadingId}
                >
                  <div id={messagesHeadingId} className="model-picker__heading">
                    {t('quickSearch.messages')}
                  </div>
                  {messageHits.length > 0 ? (
                    items.slice(chatCount).map((item, offset) => {
                      if (item.kind !== 'message') return null;
                      const idx = chatCount + offset;
                      const active = idx === clampedActive;
                      return (
                        <button
                          key={item.id}
                          id={`${optionIdPrefix}-${idx}`}
                          ref={(el) => {
                            optionRefs.current[idx] = el;
                          }}
                          type="button"
                          role="option"
                          tabIndex={-1}
                          aria-selected={active}
                          className={`model-row quick-search__row quick-search__row--message${active ? ' is-active' : ''}`}
                          onMouseEnter={() => setActiveIndex(idx)}
                          onClick={() => choose(item)}
                        >
                          <DocumentTextIcon className="quick-search__icon" aria-hidden="true" />
                          <span className="model-row__main">
                            <span className="quick-search__hit-head">
                              <span className="model-row__name">{item.hit.chatTitle}</span>
                              <span className="quick-search__date">
                                {shortDate(item.hit.createdAt)}
                              </span>
                            </span>
                            <span className="quick-search__excerpt">
                              <Highlighted text={item.hit.excerpt} words={terms} />
                            </span>
                          </span>
                        </button>
                      );
                    })
                  ) : searching ? (
                    <p className="model-picker__empty" role="status">
                      {t('quickSearch.searching')}
                    </p>
                  ) : null}
                </div>
              )}

              {items.length === 0 && !searching && (
                <p className="model-picker__empty" role="status">
                  {trimmed ? t('quickSearch.empty', { query: trimmed }) : t('quickSearch.noChats')}
                </p>
              )}
            </div>

            <div className="quick-search__footer" aria-hidden="true">
              <span>{t('quickSearch.hint')}</span>
            </div>
          </DialogSurface>
        </div>
      </DialogOverlay>
    </DialogPortal>
  );
}
