import {
  EyeIcon,
  LightBulbIcon,
  MicrophoneIcon,
  PhotoIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline';
import { getHighlightSegments, type ModelSearchResult } from '@/lib/models/search';

/** The parts of `text` that match the query's words, underlined. */
export function HighlightedText({ text, words }: { text: string; words: string[] }) {
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

/** What a model can do, as a row of small icons; nothing when it has none of them. */
export function ModelCapabilities({ result }: { result?: ModelSearchResult }) {
  if (!result) return null;
  const { reasoning, vision, audio, image, zdr } = result.capabilities;
  if (!reasoning && !vision && !audio && !image && !zdr) return null;
  return (
    <span className="model-row__caps">
      {reasoning && <LightBulbIcon title="Reasoning" />}
      {vision && <EyeIcon title="Vision input" />}
      {audio && <MicrophoneIcon title="Audio input" />}
      {image && <PhotoIcon title="Image output" />}
      {zdr && <ShieldCheckIcon title="Zero data retention" />}
    </span>
  );
}

/**
 * A model row's meta line: provider, optionally the full id (highlighted
 * against the query), context length and price. Goes inside `.model-row__meta`,
 * which puts the separators between them.
 */
export function ModelRowFacts({
  result,
  words = [],
  showId = false,
}: {
  result: ModelSearchResult;
  words?: string[];
  showId?: boolean;
}) {
  return (
    <>
      <span>{result.providerLabel || result.provider}</span>
      {showId && (
        <span className="model-row__id">
          <HighlightedText text={result.fullId} words={words} />
        </span>
      )}
      {result.contextLength && (
        <span title="Context length">
          {Intl.NumberFormat().format(result.contextLength)} tokens
        </span>
      )}
      {result.price && <span>{result.price}</span>}
    </>
  );
}
