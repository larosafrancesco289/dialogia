import { useEffect, useState } from 'react';

export function useMediaQuery(query: string): boolean {
  // Always start with false to match server render and avoid hydration mismatch.
  const [matches, setMatches] = useState<boolean>(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);

  return matches;
}
