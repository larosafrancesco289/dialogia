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
