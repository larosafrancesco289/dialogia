'use client';
import { DocumentTextIcon, ClockIcon, MagnifyingGlassIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import { ExclamationCircleIcon } from '@heroicons/react/24/solid';
import { Markdown } from '@/lib/markdown';

export type DeepResearchEvent = {
  type: 'search' | 'fetch' | 'time' | 'note' | 'thought';
  input?: any;
  output?: any;
};

type Props = {
  trace: DeepResearchEvent[];
};

export function DeepResearchTimeline({ trace }: Props) {
  if (!trace || trace.length === 0) return null;

  return (
    <div className="relative ml-6 pl-6 border-l-2 border-border/40 space-y-8 my-5">
      {trace.map((item, idx) => (
        <TimelineItem key={idx} item={item} />
      ))}
    </div>
  );
}

function TimelineItem({ item }: { item: DeepResearchEvent }) {
  const { type, input, output } = item;

  if (type === 'thought') {
    return (
      <div className="relative group">
        <div className="absolute -left-[33px] top-1.5 w-4 h-4 rounded-full bg-surface border-2 border-border/60 group-hover:border-accent/50 transition-colors" />
        <div className="text-sm text-fg/90 leading-relaxed">
          <Markdown content={output || ''} />
        </div>
      </div>
    );
  }

  if (type === 'search') {
    const query = input?.query || 'Unknown query';
    const results = Array.isArray(output) ? output : [];
    const isError = !!output?.error;

    return (
      <div className="relative">
        <div className="absolute -left-[37px] top-0.5 w-6 h-6 rounded-full bg-surface flex items-center justify-center ring-4 ring-surface">
          <div className="w-6 h-6 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
            <MagnifyingGlassIcon className="w-3.5 h-3.5 text-blue-500" />
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-blue-500 uppercase tracking-wider">Searching</span>
            <span className="px-2.5 py-1 rounded-full bg-surface border border-border/60 text-sm text-fg shadow-sm">
              {query}
            </span>
          </div>

          {isError && (
            <div className="text-xs text-red-500 flex items-center gap-1.5 bg-red-500/5 px-3 py-2 rounded-lg border border-red-500/10 w-fit">
              <ExclamationCircleIcon className="w-4 h-4" />
              <span>{output.error}</span>
            </div>
          )}

          {!isError && results.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-0.5">
              {results.slice(0, 4).map((res: any, i: number) => (
                <a
                  key={i}
                  href={res.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-2.5 p-2.5 rounded-xl bg-surface hover:bg-muted/50 border border-border/50 hover:border-border transition-all group"
                >
                  <img
                    src={`https://www.google.com/s2/favicons?domain=${new URL(res.url).hostname}&sz=32`}
                    alt=""
                    className="w-4 h-4 rounded-sm opacity-70 mt-0.5 group-hover:opacity-100 transition-opacity"
                    onError={(e) => (e.currentTarget.style.display = 'none')}
                  />
                  <div className="flex flex-col min-w-0 gap-0.5">
                    <span className="text-xs font-medium text-fg truncate w-full group-hover:text-accent transition-colors">
                      {res.title || 'No title'}
                    </span>
                    <span className="text-[10px] text-fg-muted truncate w-full flex items-center gap-1">
                      {new URL(res.url).hostname}
                    </span>
                  </div>
                </a>
              ))}
              {results.length > 4 && (
                <div className="flex items-center justify-center px-3 py-2 rounded-xl bg-muted/30 border border-transparent text-xs text-fg-muted">
                  +{results.length - 4} more results
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (type === 'fetch') {
    const url = input?.url || '';
    const isError = !!output?.error;
    const hostname = tryGetHostname(url);

    return (
      <div className="relative">
        <div className="absolute -left-[37px] top-0.5 w-6 h-6 rounded-full bg-surface flex items-center justify-center ring-4 ring-surface">
          <div className="w-6 h-6 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
            <DocumentTextIcon className="w-3.5 h-3.5 text-emerald-500" />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-emerald-500 uppercase tracking-wider">Reading</span>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-fg hover:text-accent hover:underline truncate max-w-[300px] flex items-center gap-1"
            >
              {hostname}
              <ArrowTopRightOnSquareIcon className="w-3 h-3 opacity-50" />
            </a>
          </div>
          {isError && <span className="text-red-500 text-xs bg-red-500/5 px-2 py-1 rounded border border-red-500/10 w-fit">{output.error}</span>}
        </div>
      </div>
    );
  }

  if (type === 'time') {
    return (
      <div className="relative">
        <div className="absolute -left-[37px] top-0.5 w-6 h-6 rounded-full bg-surface flex items-center justify-center ring-4 ring-surface">
          <div className="w-6 h-6 rounded-full bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
            <ClockIcon className="w-3.5 h-3.5 text-amber-500" />
          </div>
        </div>
        <div className="text-xs text-fg-muted flex items-center gap-2">
          <span className="font-medium text-amber-500/80">TIME CHECK</span>
          <span>{output?.iso ? new Date(output.iso).toLocaleTimeString() : ''}</span>
        </div>
      </div>
    )
  }

  return null;
}

function tryGetHostname(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}