import styles from './IntroTour.module.css';

// Component: IntroArt
// Responsibility: The four line-art plates of the first-run tour. Strokes are
// tokenised through the CSS module; gold is one accent per plate and no more.

export type IntroPlate = 'flourish' | 'key' | 'machine' | 'ledger';

function Flourish() {
  return (
    <svg viewBox="0 0 280 88" role="presentation" focusable="false" className={styles.plate}>
      <g className={styles.stroke}>
        <path d="M18 44h96" />
        <path d="M166 44h96" />
        <path d="M18 38v12" />
        <path d="M262 38v12" />
        <path d="M124 44h4" />
        <path d="M152 44h4" />
      </g>
      <g className={styles.strokeAccent}>
        <path d="M140 31l11 13-11 13-11-13z" />
        <path d="M140 20v-6" />
        <path d="M140 68v6" />
      </g>
    </svg>
  );
}

function KeyFan() {
  return (
    <svg viewBox="0 0 280 88" role="presentation" focusable="false" className={styles.plate}>
      <g className={styles.stroke}>
        <circle cx="30" cy="44" r="10" />
        <path d="M40 44h38" />
        <path d="M64 44v8" />
        <path d="M72 44v6" />
        <path d="M78 44h44" />
        <path d="M158 44c22 0 26-26 48-26h20" />
        <path d="M158 44h68" />
        <path d="M158 44c22 0 26 26 48 26h20" />
        <circle cx="234" cy="18" r="5" />
        <circle cx="234" cy="44" r="5" />
        <circle cx="234" cy="70" r="5" />
      </g>
      <g className={styles.strokeAccent}>
        <circle cx="140" cy="44" r="17" />
        <circle cx="30" cy="44" r="3" />
      </g>
    </svg>
  );
}

function Machine() {
  return (
    <svg viewBox="0 0 280 88" role="presentation" focusable="false" className={styles.plate}>
      <g className={styles.stroke}>
        <rect x="80" y="10" width="120" height="60" rx="5" />
        <path d="M64 80h152" />
        <path d="M124 70l-4 10" />
        <path d="M156 70l4 10" />
      </g>
      <g className={styles.strokeAccent}>
        <path d="M120 30h30a10 10 0 0 1 0 20h-30" />
        <path d="M126 44l-6 6 6 6" />
      </g>
    </svg>
  );
}

function Ledger() {
  return (
    <svg viewBox="0 0 280 88" role="presentation" focusable="false" className={styles.plate}>
      <g className={styles.stroke}>
        <rect x="88" y="10" width="104" height="68" rx="4" />
        <path d="M102 10v68" />
        <path d="M186 20v48" />
        <path d="M110 28h64" />
        <path d="M110 44h48" />
        <path d="M110 60h56" />
      </g>
      <g className={styles.strokeAccent}>
        <path d="M192 36h14v16h-14" />
        <path d="M199 44h7" />
      </g>
    </svg>
  );
}

const PLATES: Record<IntroPlate, () => JSX.Element> = {
  flourish: Flourish,
  key: KeyFan,
  machine: Machine,
  ledger: Ledger,
};

export function IntroArt({ plate }: { plate: IntroPlate }) {
  const Plate = PLATES[plate];
  return <Plate />;
}
