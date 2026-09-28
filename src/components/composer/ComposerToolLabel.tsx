import { useState } from 'react';

/**
 * The word beside a composer tool that is on. It opens and closes in width
 * instead of popping in, so the tools after it slide rather than jump; while
 * it closes it keeps the last word it showed.
 */
export function ComposerToolLabel({ text }: { text: string | null }) {
  const [shown, setShown] = useState(text ?? '');
  if (text !== null && text !== shown) setShown(text);
  return (
    <span className="composer-tool-label" data-open={text !== null} aria-hidden="true">
      <span className="composer-tool-label__text">{shown}</span>
    </span>
  );
}
