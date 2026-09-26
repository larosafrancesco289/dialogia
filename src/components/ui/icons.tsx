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
 * Reasoning effort as a level meter: four bars rising left to right, the
 * first `filled` in ink and the rest faint. (A column of dots, like the
 * effort menu's own scale, read as the "more" icon at Max.)
 */
export function EffortMeterIcon({
  filled,
  ...props
}: SVGProps<SVGSVGElement> & { filled: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      data-slot="icon"
      {...props}
    >
      {[0, 1, 2, 3].map((bar) => {
        const height = 5 + bar * 4;
        return (
          <rect
            key={bar}
            x={4.25 + bar * 4.5}
            y={20 - height}
            width={2.5}
            height={height}
            rx={1.25}
            opacity={bar < filled ? 1 : 0.28}
          />
        );
      })}
    </svg>
  );
}
