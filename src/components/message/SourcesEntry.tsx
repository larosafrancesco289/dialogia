import {
  ArrowTopRightOnSquareIcon,
  ChevronDownIcon,
  GlobeAltIcon,
} from '@heroicons/react/24/outline';
import { hostname, titleForSource, type SearchSourcesData } from '@/lib/ui/responseActivity';

/**
 * The ledger's search sources: a line saying what the search is doing or
 * found, which opens onto the numbered list of sources once there are some.
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
  const hasSearchError = sources?.status === 'error';
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
          : hasSearchError
            ? sources?.error || 'Search could not return sources.'
            : `Consulted ${sourceItems.length} source${sourceItems.length === 1 ? '' : 's'}`}
        {hasSources && (
          <ChevronDownIcon className={`response-ledger__chevron${open ? ' is-open' : ''}`} />
        )}
      </button>
      {open && hasSources && (
        <div className="panel-reveal response-ledger__sources-reveal">
          <ol className="response-ledger__sources">
            {sourceItems.map((source, index) => (
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
                {source.url && (
                  <span className="response-ledger__source-host">{hostname(source.url)}</span>
                )}
                <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5 shrink-0 text-[var(--color-fg-muted)]" />
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
