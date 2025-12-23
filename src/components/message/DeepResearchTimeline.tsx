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

export type DeepResearchEvent = {
  type: 'search' | 'fetch' | 'time' | 'note' | 'thought';
  input?: any;
  output?: any;
};

type Props = {
  trace: DeepResearchEvent[];
};

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
      className="relative pl-4 space-y-8 my-6 text-fg before:absolute before:left-[19px] before:top-2 before:bottom-2 before:w-[2px] before:bg-gradient-to-b before:from-transparent before:via-border/60 before:to-transparent"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
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
        className="relative pl-10 group"
      >
        <div className="absolute left-0 top-1.5 w-10 h-10 flex items-center justify-center">
          <div className="w-3 h-3 rounded-full bg-surface border-2 border-primary/40 group-hover:border-primary group-hover:scale-125 transition-all duration-300 shadow-[0_0_0_4px_rgba(var(--surface-rgb),1)]" />
        </div>
        <div className="p-4 rounded-2xl bg-surface/40 border border-border/40 backdrop-blur-sm hover:bg-surface/60 hover:border-border/60 transition-colors">
          <div className="flex items-center gap-2 mb-2 text-xs font-bold uppercase tracking-wider text-primary/80">
            <SparklesIcon className="w-3.5 h-3.5" />
            <span>Thinking Process</span>
          </div>
          <div className="text-sm text-fg/90 leading-relaxed prose prose-sm dark:prose-invert max-w-none">
            <Markdown content={output || ''} />
          </div>
        </div>
      </motion.div>
    );
  }

  if (type === 'search') {
    const query = input?.query || 'Unknown query';
    const results = Array.isArray(output) ? output : [];
    const isError = !!output?.error;

    return (
      <motion.div
        variants={itemVariants}
        initial="hidden"
        animate="visible"
        className="relative pl-10"
      >
        <div className="absolute left-0 top-0 w-10 h-10 flex items-center justify-center z-10">
          <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20 shadow-sm ring-4 ring-surface">
            <MagnifyingGlassIcon className="w-4 h-4 text-blue-500" />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-blue-500 uppercase tracking-wider flex items-center gap-1.5">
              <GlobeAltIcon className="w-3.5 h-3.5" />
              Searching
            </span>
            <span className="px-3 py-1 rounded-full bg-surface border border-border/60 text-sm text-fg font-medium shadow-sm">
              {query}
            </span>
          </div>

          {isError && (
            <div className="text-xs text-red-500 flex items-center gap-2 bg-red-500/5 px-4 py-3 rounded-xl border border-red-500/10 w-fit">
              <ExclamationCircleIcon className="w-4 h-4" />
              <span>{output.error}</span>
            </div>
          )}

          {!isError && results.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-1">
              {results.slice(0, 4).map((res: any, i: number) => (
                <a
                  key={i}
                  href={res.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-3 p-3 rounded-xl bg-surface/50 hover:bg-surface border border-border/40 hover:border-blue-500/30 transition-all group hover:shadow-md hover:-translate-y-0.5 duration-300"
                >
                  <div className="w-5 h-5 rounded bg-surface border border-border flex items-center justify-center shrink-0 mt-0.5">
                    <img
                      src={`https://www.google.com/s2/favicons?domain=${new URL(res.url).hostname}&sz=32`}
                      alt=""
                      className="w-3.5 h-3.5 opacity-70 group-hover:opacity-100 transition-opacity"
                      onError={(e) => (e.currentTarget.style.display = 'none')}
                    />
                  </div>
                  <div className="flex flex-col min-w-0 gap-0.5">
                    <span className="text-xs font-semibold text-fg truncate w-full group-hover:text-blue-500 transition-colors">
                      {res.title || 'No title'}
                    </span>
                    <span className="text-[10px] text-fg-muted truncate w-full font-mono opacity-70">
                      {new URL(res.url).hostname}
                    </span>
                  </div>
                </a>
              ))}
              {results.length > 4 && (
                <div className="flex items-center justify-center px-3 py-2 rounded-xl bg-muted/30 border border-transparent text-xs text-fg-muted font-medium">
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
    const url = input?.url || '';
    const isError = !!output?.error;
    const hostname = tryGetHostname(url);

    return (
      <motion.div
        variants={itemVariants}
        initial="hidden"
        animate="visible"
        className="relative pl-10"
      >
        <div className="absolute left-0 top-0 w-10 h-10 flex items-center justify-center z-10">
          <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 shadow-sm ring-4 ring-surface">
            <DocumentTextIcon className="w-4 h-4 text-emerald-500" />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-emerald-500 uppercase tracking-wider flex items-center gap-1.5">
              <BeakerIcon className="w-3.5 h-3.5" />
              Analyzing
            </span>
          </div>

          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 p-3 rounded-xl bg-surface/50 hover:bg-surface border border-border/40 hover:border-emerald-500/30 transition-all group hover:shadow-sm max-w-md"
          >
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0 text-emerald-600">
              <DocumentTextIcon className="w-4 h-4" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium text-fg truncate group-hover:text-emerald-600 transition-colors">
                {hostname}
              </span>
              <span className="text-[10px] text-fg-muted truncate flex items-center gap-1">
                Source Content <ArrowTopRightOnSquareIcon className="w-2.5 h-2.5" />
              </span>
            </div>
          </a>

          {isError && (
            <span className="text-red-500 text-xs bg-red-500/5 px-3 py-2 rounded-lg border border-red-500/10 w-fit">
              {output.error}
            </span>
          )}
        </div>
      </motion.div>
    );
  }

  if (type === 'time') {
    return (
      <motion.div
        variants={itemVariants}
        initial="hidden"
        animate="visible"
        className="relative pl-10"
      >
        <div className="absolute left-0 top-0 w-10 h-10 flex items-center justify-center z-10">
          <div className="w-6 h-6 rounded-full bg-amber-500/10 flex items-center justify-center border border-amber-500/20 shadow-sm ring-4 ring-surface">
            <ClockIcon className="w-3 h-3 text-amber-500" />
          </div>
        </div>
        <div className="text-xs text-fg-muted flex items-center gap-2 py-1">
          <span className="font-bold text-amber-500/80 tracking-wider">TIME CHECK</span>
          <span className="font-mono opacity-70">
            {output?.iso ? new Date(output.iso).toLocaleTimeString() : ''}
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
