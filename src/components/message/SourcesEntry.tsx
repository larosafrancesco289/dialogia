import { useId, useState } from 'react';
import { ArrowUpRightIcon, ChevronDownIcon, GlobeAltIcon } from '@heroicons/react/24/outline';
import { hostname, titleForSource, type MarkdownCitationSource } from '@/lib/markdown/citations';
import type { SearchSourcesData } from '@/lib/ui/responseActivity';

// What the search returned; the model may have read fewer of them.
const sourcesFound = (count: number) => `${count} source${count === 1 ? '' : 's'} found`;

/** The sources, numbered as the reply's citations cite them. */
function SourcesList({ sources }: { sources: MarkdownCitationSource[] }) {
  return (
    <ol className="response-ledger__sources">
      {sources.map((source, index) => (
        <li
          key={`${source.url || source.title || 'source'}-${index}`}
          className="response-ledger__source"
        >
          <span className="response-ledger__source-index">{index + 1}</span>
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="response-ledger__source-link"
            title={source.description || titleForSource(source)}
          >
            {titleForSource(source)}
          </a>
          {/* The host, unless the title already is it. */}
          {source.url && hostname(source.url) !== titleForSource(source).toLowerCase() && (
            <span className="response-ledger__source-host">{hostname(source.url)}</span>
          )}
          <ArrowUpRightIcon className="h-3.5 w-3.5 shrink-0 text-[var(--color-fg-muted)]" />
        </li>
      ))}
    </ol>
  );
}

/**
 * The reply's sources in its footer, so they are a click away with Thought
 * closed: a quiet line that opens onto the same numbered list.
 */
export function ReplySources({ sources }: { sources: MarkdownCitationSource[] }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  return (
    <>
      <button
        type="button"
        className="message-sources__toggle"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
      >
        {sourcesFound(sources.length)}
        <ChevronDownIcon className={`response-ledger__chevron${open ? ' is-open' : ''}`} />
      </button>
      {open && (
        <div id={listId} className="panel-reveal message-sources__list">
          <SourcesList sources={sources} />
        </div>
      )}
    </>
  );
}

/**
 * The ledger's search sources: a line saying what the search is doing or
 * found, which opens onto the numbered list of sources once there are some.
 * A failed search says why on its own entry, not here.
 */
export function SourcesEntry({
  sources,
  open,
  onToggle,
}: {
  sources?: SearchSourcesData;
  open: boolean;
  onToggle: () => void;
}) {
  const sourceItems = sources?.results ?? [];
  const hasSources = sourceItems.length > 0;
  const isSearching = sources?.status === 'loading';
  return (
    <div className="response-ledger__entry">
      <span className="response-ledger__entry-glyph" aria-hidden="true">
        <GlobeAltIcon className="h-full w-full" />
      </span>
      <button
        type="button"
        className="response-ledger__sources-toggle"
        aria-expanded={open}
        onClick={onToggle}
      >
        {isSearching
          ? `Looking for sources${sources?.query ? `: ${sources.query}` : ''}…`
          : sourcesFound(sourceItems.length)}
        {hasSources && (
          <ChevronDownIcon className={`response-ledger__chevron${open ? ' is-open' : ''}`} />
        )}
      </button>
      {open && hasSources && (
        <div className="panel-reveal response-ledger__sources-reveal">
          <SourcesList sources={sourceItems} />
        </div>
      )}
    </div>
  );
}
