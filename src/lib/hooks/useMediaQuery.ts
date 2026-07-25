import { useEffect, useState } from 'react';

export function useMediaQuery(query: string): boolean {
  // No SSR: the query can be answered before the first paint, so the app never
  // renders a layout it is about to replace.
  const [matches, setMatches] = useState<boolean>(() => window.matchMedia(query).matches);

  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);

  return matches;
}
