// Module: markdown/loadKatex
// Responsibility: Fetch KaTeX (the `katex` chunk: rehype-katex and its stylesheet)
// once per tab, from the first reply that holds maths, and hand it to renderers.
// Kept apart from the renderer so a reply can start the fetch before the
// renderer's own chunk has arrived.

import type { ComponentProps } from 'react';
import type ReactMarkdown from 'react-markdown';

export type RehypePlugin = NonNullable<
  ComponentProps<typeof ReactMarkdown>['rehypePlugins']
>[number];

let katexPlugin: { plugin: RehypePlugin } | null = null;
let katexPluginPromise: Promise<{ plugin: RehypePlugin }> | null = null;

/** The plugin, when it has arrived. */
export function loadedKatexPlugin(): { plugin: RehypePlugin } | null {
  return katexPlugin;
}

export function loadKatexPlugin(): Promise<{ plugin: RehypePlugin }> {
  if (!katexPluginPromise) {
    katexPluginPromise = import('@/components/markdown/katex').then(
      (mod) => {
        katexPlugin = { plugin: mod.rehypeKatex as RehypePlugin };
        return katexPlugin;
      },
      (error: unknown) => {
        // A failed fetch (a dropped connection) is not remembered: the next
        // reply with maths asks again instead of showing source for good.
        katexPluginPromise = null;
        throw error;
      },
    );
  }
  return katexPluginPromise;
}

/** Starts the fetch; a renderer that needs the plugin waits on `loadKatexPlugin` and says if it failed. */
export function preloadKatex() {
  loadKatexPlugin().catch(() => undefined);
}
