import { useEffect, useState } from 'react';

export function useIsMobile(breakpoint = 640): boolean {
  const getMatch = () => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < breakpoint;
  };

  const [isMobile, setIsMobile] = useState<boolean>(getMatch);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia(`(max-width: ${Math.max(breakpoint - 1, 0)}px)`);
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [breakpoint]);

  return isMobile;
}
