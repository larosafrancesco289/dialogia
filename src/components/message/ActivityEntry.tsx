import {
  GlobeAltIcon,
  MagnifyingGlassIcon,
  WrenchScrewdriverIcon,
} from '@heroicons/react/24/outline';
import type { MessageActivityItem } from '@/lib/types';
import {
  compactText,
  toolAnnotation,
  toolDisplayName,
  toolObject,
  type ToolActivityItem,
} from '@/lib/ui/responseActivity';

/** Reasoning set as prose: paragraphs, titled sections, bold kept as bold. */
function ThoughtText({ text }: { text: string }) {
  const blocks = text
    .trim()
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  return (
    <div className="response-ledger__thought">
      {blocks.map((block, index) => {
        const heading = block.match(/^\*\*([^*\n]+)\*\*$/);
        if (heading) {
          return (
            <p key={index} className="response-ledger__thought-head">
              {heading[1]}
            </p>
          );
        }
        return (
          <p key={index}>
            {block
              .split(/\*\*([^*]+)\*\*/)
              .map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part))}
          </p>
        );
      })}
    </div>
  );
}

function entryGlyph(item: ToolActivityItem) {
  if (item.name === 'web_search') return <MagnifyingGlassIcon className="h-full w-full" />;
  if (item.name.includes('fetch') || typeof item.input?.url === 'string') {
    return <GlobeAltIcon className="h-full w-full" />;
  }
  return <WrenchScrewdriverIcon className="h-full w-full" />;
}

/** One step on the reasoning ledger's timeline: a thought, a note, or a tool call. */
export function ActivityEntry({ item }: { item: MessageActivityItem }) {
  if (item.type === 'reasoning') {
    return (
      <div className="response-ledger__entry">
        <span className="response-ledger__entry-bead" aria-hidden="true" />
        <ThoughtText text={item.text} />
      </div>
    );
  }
  if (item.type === 'text') {
    return (
      <div className="response-ledger__entry">
        <span className="response-ledger__entry-bead" aria-hidden="true" />
        <p className="response-ledger__thought">{compactText(item.text, 180)}</p>
      </div>
    );
  }
  const annotation = toolAnnotation(item);
  const object = toolObject(item);
  return (
    <div className="response-ledger__entry response-ledger__entry--tool">
      <span className="response-ledger__entry-glyph" aria-hidden="true">
        {entryGlyph(item)}
      </span>
      <span className="response-ledger__tool-line">
        <span className="response-ledger__tool-name">{toolDisplayName(item.name)}</span>
        {object && <span className="response-ledger__tool-object">{object}</span>}
      </span>
      <span className={`response-ledger__annotation${annotation.error ? ' is-error' : ''}`}>
        {annotation.live && <span className="response-ledger__pulse" aria-hidden="true" />}
        {annotation.text}
      </span>
    </div>
  );
}
