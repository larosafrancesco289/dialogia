import type { SVGProps } from 'react';

// Glyphs Heroicons does not draw, drawn the way it does: a 24-unit grid,
// round caps and joins, and `data-slot="icon"`, so the global icon pen
// (styles/foundations.css) sets their weight like every other icon's.

/** A window with its side panel ruled off: shows or hides the sidebar. */
export function SidebarIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden="true"
      data-slot="icon"
      {...props}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 6.75A2.25 2.25 0 0 1 6 4.5h12a2.25 2.25 0 0 1 2.25 2.25v10.5A2.25 2.25 0 0 1 18 19.5H6a2.25 2.25 0 0 1-2.25-2.25V6.75ZM9 4.5v15"
      />
    </svg>
  );
}

/**
 * Reasoning effort as a level meter: one bar per level the model offers
 * above Off, rising left to right, the first `filled` in ink and the rest
 * faint. (A column of dots read as the "more" icon at the top level.)
 */
export function EffortMeterIcon({
  levels,
  filled,
  ...props
}: SVGProps<SVGSVGElement> & { levels: number; filled: number }) {
  const count = Math.max(1, levels);
  const gap = 1.4;
  const width = Math.min(2.6, (15 - gap * (count - 1)) / count);
  const start = 12 - (count * width + (count - 1) * gap) / 2;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      data-slot="icon"
      {...props}
    >
      {Array.from({ length: count }, (_, bar) => {
        const height = count === 1 ? 14 : 5 + (11 * bar) / (count - 1);
        return (
          <rect
            key={bar}
            x={start + bar * (width + gap)}
            y={19.5 - height}
            width={width}
            height={height}
            rx={width / 2}
            opacity={bar < filled ? 1 : 0.28}
          />
        );
      })}
    </svg>
  );
}
