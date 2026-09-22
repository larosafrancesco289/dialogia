// "Two voices": an opening and a closing quotation mark facing each other.
// The opening mark takes the current text colour and the closing mark the
// accent, so the mark follows the theme. Source artwork: assets/brand/.
const QUOTE = 'M8 0 A8 8 0 1 0 1.5 7.9 C2 12 -1 17 -6 20 C3 18 8 10 8 0Z';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true" focusable="false">
      {/* Outer groups carry no transform, so CSS can animate each voice. */}
      <g className="logo-mark__voice logo-mark__voice--open">
        <g transform="translate(21 30) rotate(180) scale(1.25)">
          <path d={QUOTE} fill="currentColor" />
        </g>
      </g>
      <g className="logo-mark__voice logo-mark__voice--close">
        <g transform="translate(43 34) scale(1.25)">
          <path d={QUOTE} fill="var(--color-accent)" />
        </g>
      </g>
    </svg>
  );
}
