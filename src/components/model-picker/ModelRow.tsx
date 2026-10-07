import {
  EyeIcon,
  LightBulbIcon,
  MicrophoneIcon,
  PhotoIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline';
import { getHighlightSegments, type ModelSearchResult } from '@/lib/models/search';
import { useT } from '@/lib/i18n';

/** The parts of `text` that match the query's words, underlined. */
function HighlightedText({ text, words }: { text: string; words: string[] }) {
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
function ModelCapabilities({ result }: { result?: ModelSearchResult }) {
  const t = useT();
  if (!result) return null;
  const { reasoning, vision, audio, image, zdr } = result.capabilities;
  if (!reasoning && !vision && !audio && !image && !zdr) return null;
  return (
    <span className="model-row__caps">
      {reasoning && <LightBulbIcon title={t('models.caps.reasoning')} />}
      {vision && <EyeIcon title={t('models.caps.vision')} />}
      {audio && <MicrophoneIcon title={t('models.caps.audio')} />}
      {image && <PhotoIcon title={t('models.caps.image')} />}
      {zdr && <ShieldCheckIcon title={t('models.caps.zdr')} />}
    </span>
  );
}

/**
 * A model row's meta line: provider, context length and price. Goes inside
 * `.model-row__meta`, which puts the separators between them.
 */
function ModelRowFacts({ result }: { result: ModelSearchResult }) {
  const t = useT();
  return (
    <>
      <span>{result.providerLabel || result.provider}</span>
      {result.contextLength && (
        <span title={t('models.contextHint')}>
          {t('models.contextTokens', { count: result.contextLength })}
        </span>
      )}
      {result.price && <span>{result.price}</span>}
    </>
  );
}

/**
 * What every model row shows, in the header picker and the settings searches
 * alike: the name with its matches underlined, one line of detail (a note when
 * there is one, else the facts) and the capability glyphs. The row element and
 * whatever trails it, a check or a remove button, belong to the caller.
 */
export function ModelRowContent({
  name,
  words = [],
  note,
  result,
}: {
  name: string;
  words?: string[];
  note?: string;
  result?: ModelSearchResult;
}) {
  return (
    <>
      <span className="model-row__main">
        <span className="model-row__name">
          <HighlightedText text={name} words={words} />
        </span>
        <span className="model-row__meta">
          {note ? (
            <span className="model-row__note">{note}</span>
          ) : (
            result && <ModelRowFacts result={result} />
          )}
        </span>
      </span>
      <ModelCapabilities result={result} />
    </>
  );
}
