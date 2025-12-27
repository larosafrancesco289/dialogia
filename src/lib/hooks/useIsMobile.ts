import { useEffect, useState } from 'react';

export function useIsMobile(breakpoint = 640): boolean {
  // Always start with false to match server render and avoid hydration mismatch
  const [isMobile, setIsMobile] = useState<boolean>(false);

  useEffect(() => {
    const media = window.matchMedia(`(max-width: ${Math.max(breakpoint - 1, 0)}px)`);
    const update = () => setIsMobile(media.matches);
    update(); // Set actual value after mount
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [breakpoint]);

  return isMobile;
}
