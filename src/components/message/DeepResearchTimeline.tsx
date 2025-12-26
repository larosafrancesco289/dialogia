'use client';

import { motion, type Variants } from 'framer-motion';
import {
  DocumentTextIcon,
  ClockIcon,
  MagnifyingGlassIcon,
  ArrowTopRightOnSquareIcon,
  SparklesIcon,
  GlobeAltIcon,
  BeakerIcon,
} from '@heroicons/react/24/outline';
import { ExclamationCircleIcon } from '@heroicons/react/24/solid';
import { Markdown } from '@/lib/markdown';
import type { DeepResearchEvent } from '@/lib/types/deepResearch';

type Props = {
  trace: DeepResearchEvent[];
};

type SearchResult = {
  title?: string;
  url: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function getSearchResults(output: unknown): SearchResult[] {
  if (!Array.isArray(output)) return [];
  return output
    .map((item) => {
      const record = asRecord(item);
      const url = getString(record?.url);
      if (!url) return null;
      const title = getString(record?.title);
      return { url, title } as SearchResult;
    })
    .filter((item): item is SearchResult => item !== null);
}

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      when: 'beforeChildren',
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, x: -10, y: 10 },
  visible: {
    opacity: 1,
    x: 0,
    y: 0,
    transition: { type: 'spring', stiffness: 500, damping: 30 },
  },
};

export function DeepResearchTimeline({ trace }: Props) {
  if (!trace || trace.length === 0) return null;

  return (
    <motion.div
      className="relative pl-6 space-y-6 my-4 text-[var(--color-fg)]"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Timeline line - accent colored like marginalia left border */}
      <div className="absolute left-[11px] top-2 bottom-2 w-[2px] bg-gradient-to-b from-transparent via-[var(--color-accent)]/40 to-transparent" />

      {trace.map((item, idx) => (
        <TimelineItem key={idx} item={item} />
      ))}
    </motion.div>
  );
}

function TimelineItem({ item }: { item: DeepResearchEvent }) {
  const { type, input, output } = item;

  if (type === 'thought') {
    return (
      <motion.div
        variants={itemVariants}
        initial="hidden"
        animate="visible"
        className="relative pl-8 group"
      >
        <div className="absolute left-0 top-1 flex items-center justify-center">
          <div className="w-6 h-6 rounded-full bg-[var(--color-accent)]/10 flex items-center justify-center border border-[var(--color-accent)]/20 group-hover:bg-[var(--color-accent)]/20 transition-colors">
            <SparklesIcon className="w-3 h-3 text-[var(--color-accent)]" />
          </div>
        </div>
        <div className="rounded-[var(--radius-editorial)] border border-[var(--color-border)]/60 bg-[var(--color-muted)]/20 p-4 hover:bg-[var(--color-muted)]/40 transition-colors">
          <div className="flex items-center gap-2 mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-accent)]/80">
            <span>Thinking Process</span>
          </div>
          <div className="text-sm text-[var(--color-fg)]/90 leading-relaxed prose prose-sm dark:prose-invert max-w-none font-[var(--font-sans)]">
            <Markdown content={typeof output === 'string' ? output : ''} />
          </div>
        </div>
      </motion.div>
    );
  }

  if (type === 'search') {
    const inputRecord = asRecord(input);
    const query = getString(inputRecord?.query) || 'Unknown query';
    const results = getSearchResults(output);
    const outputRecord = asRecord(output);
    const errorMessage = getString(outputRecord?.error);
    const isError = Boolean(errorMessage);

    return (
      <motion.div
        variants={itemVariants}
        initial="hidden"
        animate="visible"
        className="relative pl-8"
      >
        <div className="absolute left-0 top-0 flex items-center justify-center z-10">
          <div className="w-6 h-6 rounded-full bg-[var(--color-accent-2)]/10 flex items-center justify-center border border-[var(--color-accent-2)]/20">
            <MagnifyingGlassIcon className="w-3 h-3 text-[var(--color-accent-2)]" />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-[var(--color-accent-2)] uppercase tracking-wider flex items-center gap-1.5">
              <GlobeAltIcon className="w-3.5 h-3.5" />
              Searching
            </span>
            <span className="px-3 py-1 rounded-full bg-[var(--color-muted)] border border-[var(--color-border)]/60 text-sm text-[var(--color-fg)] font-medium">
              {query}
            </span>
          </div>

          {isError && (
            <div className="text-xs text-[var(--color-danger)] flex items-center gap-2 bg-[var(--color-danger)]/10 px-4 py-3 rounded-[var(--radius-editorial)] border border-[var(--color-danger)]/20 w-fit">
              <ExclamationCircleIcon className="w-4 h-4" />
              <span>{errorMessage}</span>
            </div>
          )}

          {!isError && results.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-1">
              {results.slice(0, 4).map((res, i) => (
                <a
                  key={i}
                  href={res.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-3 p-3 rounded-[var(--radius-editorial)] bg-[var(--color-muted)]/30 hover:bg-[var(--color-muted)]/60 border border-[var(--color-border)]/40 hover:border-[var(--color-accent-2)]/30 transition-all group hover:-translate-y-0.5 duration-300"
                >
                  <div className="w-5 h-5 rounded bg-[var(--color-muted)] border border-[var(--color-border)] flex items-center justify-center shrink-0 mt-0.5">
                    <img
                      src={`https://www.google.com/s2/favicons?domain=${new URL(res.url).hostname}&sz=32`}
                      alt=""
                      className="w-3.5 h-3.5 opacity-70 group-hover:opacity-100 transition-opacity"
                      onError={(e) => (e.currentTarget.style.display = 'none')}
                    />
                  </div>
                  <div className="flex flex-col min-w-0 gap-0.5">
                    <span className="text-xs font-semibold text-[var(--color-fg)] truncate w-full group-hover:text-[var(--color-accent-2)] transition-colors">
                      {res.title || 'No title'}
                    </span>
                    <span className="text-[10px] text-[var(--color-fg-muted)] truncate w-full font-mono opacity-70">
                      {new URL(res.url).hostname}
                    </span>
                  </div>
                </a>
              ))}
              {results.length > 4 && (
                <div className="flex items-center justify-center px-3 py-2 rounded-[var(--radius-editorial)] bg-[var(--color-muted)]/30 border border-transparent text-xs text-[var(--color-fg-muted)] font-medium">
                  +{results.length - 4} more results
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    );
  }

  if (type === 'fetch') {
    const inputRecord = asRecord(input);
    const url = getString(inputRecord?.url) || '';
    const outputRecord = asRecord(output);
    const errorMessage = getString(outputRecord?.error);
    const isError = Boolean(errorMessage);
    const hostname = tryGetHostname(url);

    return (
      <motion.div
        variants={itemVariants}
        initial="hidden"
        animate="visible"
        className="relative pl-8"
      >
        <div className="absolute left-0 top-0 flex items-center justify-center z-10">
          <div className="w-6 h-6 rounded-full bg-[var(--color-success)]/10 flex items-center justify-center border border-[var(--color-success)]/20">
            <DocumentTextIcon className="w-3 h-3 text-[var(--color-success)]" />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[var(--color-success)] uppercase tracking-wider flex items-center gap-1.5">
              <BeakerIcon className="w-3.5 h-3.5" />
              Analyzing
            </span>
          </div>

          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 p-3 rounded-[var(--radius-editorial)] bg-[var(--color-muted)]/30 hover:bg-[var(--color-muted)]/60 border border-[var(--color-border)]/40 hover:border-[var(--color-success)]/30 transition-all group max-w-md"
          >
            <div className="w-8 h-8 rounded-lg bg-[var(--color-success)]/10 flex items-center justify-center shrink-0 text-[var(--color-success)]">
              <DocumentTextIcon className="w-4 h-4" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium text-[var(--color-fg)] truncate group-hover:text-[var(--color-success)] transition-colors">
                {hostname}
              </span>
              <span className="text-[10px] text-[var(--color-fg-muted)] truncate flex items-center gap-1">
                Source Content <ArrowTopRightOnSquareIcon className="w-2.5 h-2.5" />
              </span>
            </div>
          </a>

          {isError && (
            <span className="text-[var(--color-danger)] text-xs bg-[var(--color-danger)]/10 px-3 py-2 rounded-[var(--radius-editorial)] border border-[var(--color-danger)]/20 w-fit">
              {errorMessage}
            </span>
          )}
        </div>
      </motion.div>
    );
  }

  if (type === 'time') {
    const outputRecord = asRecord(output);
    const isoValue = getString(outputRecord?.iso);
    return (
      <motion.div
        variants={itemVariants}
        initial="hidden"
        animate="visible"
        className="relative pl-8"
      >
        <div className="absolute left-0 top-0 flex items-center justify-center z-10">
          <div className="w-5 h-5 rounded-full bg-[var(--color-accent)]/10 flex items-center justify-center border border-[var(--color-accent)]/20">
            <ClockIcon className="w-2.5 h-2.5 text-[var(--color-accent)]" />
          </div>
        </div>
        <div className="text-xs text-[var(--color-fg-muted)] flex items-center gap-2 py-1">
          <span className="font-semibold text-[var(--color-accent)]/80 tracking-wider uppercase">Time Check</span>
          <span className="font-mono opacity-70">
            {isoValue ? new Date(isoValue).toLocaleTimeString() : ''}
          </span>
        </div>
      </motion.div>
    );
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
