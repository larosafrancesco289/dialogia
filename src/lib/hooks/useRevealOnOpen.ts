import { useEffect, useState } from 'react';

/**
 * Classes for a `.panel-reveal` body. It eases open only when the reader
 * opens it: a panel already open when it is first drawn (a chat's history,
 * a folder restored open) appears as it is, as history should.
 */
export function useRevealOnOpen(open: boolean): string {
  // Closed at least once since mounting: any later opening is the reader's.
  const [hasBeenClosed, setHasBeenClosed] = useState(!open);
  useEffect(() => {
    if (!open) setHasBeenClosed(true);
  }, [open]);
  return hasBeenClosed ? 'panel-reveal' : 'panel-reveal is-still';
}
