// Module: speech/tex
// Responsibility: A formula said in words, for reading a reply aloud. A modest
// pass over the forms replies use most (fractions, powers, roots, relations,
// Greek letters); whatever it does not know loses its backslashes and braces
// and is read as it stands.

/** The words a formula is said with, in the language it is read in. */
export type MathWords = {
  over: string;
  squared: string;
  cubed: string;
  toThePowerOf: string;
  squareRootOf: string;
  cubeRootOf: string;
  /** Has `{index}`: "{index}th root of". */
  nthRootOf: string;
  times: string;
  dividedBy: string;
  plus: string;
  minus: string;
  plusOrMinus: string;
  equals: string;
  notEqual: string;
  lessThan: string;
  greaterThan: string;
  lessOrEqual: string;
  greaterOrEqual: string;
  approximately: string;
  infinity: string;
  degrees: string;
};

/**
 * Greek letters by name, or as the letters themselves: a Greek voice says
 * "π" as its own name, where "pi" would be read as two Latin letters.
 */
export type GreekLetters = 'names' | 'letters';

const GREEK: Record<string, [name: string, letter: string]> = {
  alpha: ['alpha', 'α'],
  beta: ['beta', 'β'],
  gamma: ['gamma', 'γ'],
  delta: ['delta', 'δ'],
  epsilon: ['epsilon', 'ε'],
  varepsilon: ['epsilon', 'ε'],
  zeta: ['zeta', 'ζ'],
  eta: ['eta', 'η'],
  theta: ['theta', 'θ'],
  vartheta: ['theta', 'θ'],
  iota: ['iota', 'ι'],
  kappa: ['kappa', 'κ'],
  lambda: ['lambda', 'λ'],
  mu: ['mu', 'μ'],
  nu: ['nu', 'ν'],
  xi: ['xi', 'ξ'],
  pi: ['pi', 'π'],
  rho: ['rho', 'ρ'],
  sigma: ['sigma', 'σ'],
  tau: ['tau', 'τ'],
  upsilon: ['upsilon', 'υ'],
  phi: ['phi', 'φ'],
  varphi: ['phi', 'φ'],
  chi: ['chi', 'χ'],
  psi: ['psi', 'ψ'],
  omega: ['omega', 'ω'],
  Gamma: ['gamma', 'Γ'],
  Delta: ['delta', 'Δ'],
  Theta: ['theta', 'Θ'],
  Lambda: ['lambda', 'Λ'],
  Xi: ['xi', 'Ξ'],
  Pi: ['pi', 'Π'],
  Sigma: ['sigma', 'Σ'],
  Phi: ['phi', 'Φ'],
  Psi: ['psi', 'Ψ'],
  Omega: ['omega', 'Ω'],
};

/** Commands whose argument is read as it is written. */
const TEXT_COMMANDS = new Set(['text', 'textrm', 'textbf', 'textit', 'mbox', 'operatorname']);
/** Commands that only style their argument. */
const STYLE_COMMANDS = new Set([
  'mathrm',
  'mathbf',
  'mathit',
  'mathsf',
  'mathtt',
  'mathcal',
  'mathbb',
  'boldsymbol',
  'bm',
  'displaystyle',
  'textstyle',
  'left',
  'right',
  'big',
  'Big',
  'bigg',
  'Bigg',
  'limits',
  'nolimits',
]);
const SPACE_COMMANDS = new Set(['quad', 'qquad', 'space', 'enspace']);
const FRACTIONS = new Set(['frac', 'dfrac', 'tfrac', 'cfrac']);

type Operator = keyof MathWords;
const SYMBOLS: Record<string, Operator> = {
  '=': 'equals',
  '+': 'plus',
  '-': 'minus',
  '−': 'minus',
  '<': 'lessThan',
  '>': 'greaterThan',
  '*': 'times',
  '×': 'times',
  '·': 'times',
  '÷': 'dividedBy',
  '/': 'over',
  '±': 'plusOrMinus',
  '≤': 'lessOrEqual',
  '≥': 'greaterOrEqual',
  '≠': 'notEqual',
  '≈': 'approximately',
  '∞': 'infinity',
};
const COMMANDS: Record<string, Operator> = {
  times: 'times',
  cdot: 'times',
  ast: 'times',
  div: 'dividedBy',
  pm: 'plusOrMinus',
  le: 'lessOrEqual',
  leq: 'lessOrEqual',
  leqslant: 'lessOrEqual',
  ge: 'greaterOrEqual',
  geq: 'greaterOrEqual',
  geqslant: 'greaterOrEqual',
  ne: 'notEqual',
  neq: 'notEqual',
  lt: 'lessThan',
  gt: 'greaterThan',
  approx: 'approximately',
  simeq: 'approximately',
  infty: 'infinity',
  circ: 'degrees',
};

/** The end of a `{…}` group opened at `start`, or the text's end when it never closes. */
function groupEnd(tex: string, start: number): number {
  let depth = 0;
  for (let i = start; i < tex.length; i++) {
    if (tex[i] === '\\') {
      i++;
      continue;
    }
    if (tex[i] === '{') depth++;
    else if (tex[i] === '}' && --depth === 0) return i;
  }
  return tex.length;
}

/** One argument at `start`: a `{…}` group, a command, or one character. */
function readArgument(tex: string, start: number): { body: string; end: number } {
  let at = start;
  while (tex[at] === ' ') at++;
  if (tex[at] === '{') {
    const close = groupEnd(tex, at);
    return { body: tex.slice(at + 1, close), end: close + 1 };
  }
  if (tex[at] === '\\') {
    const name = /^\\([a-zA-Z]+|.)/.exec(tex.slice(at));
    const length = name ? name[0].length : 1;
    return { body: tex.slice(at, at + length), end: at + length };
  }
  return { body: tex[at] ?? '', end: at + 1 };
}

/** `[…]` at `start`, as `\sqrt[3]{x}` gives its index. */
function readOptional(tex: string, start: number): { body: string; end: number } | null {
  let at = start;
  while (tex[at] === ' ') at++;
  if (tex[at] !== '[') return null;
  const close = tex.indexOf(']', at);
  if (close < 0) return null;
  return { body: tex.slice(at + 1, close), end: close + 1 };
}

/** "x squared", "x to the power of n plus 1", "90 degrees". */
function power(exponent: string, words: MathWords, greek: GreekLetters): string[] {
  const plain = exponent.replace(/\s+/g, '');
  if (plain === '2') return [words.squared];
  if (plain === '3') return [words.cubed];
  if (plain === '\\circ') return [words.degrees];
  return [words.toThePowerOf, texToWords(exponent, words, greek)];
}

/**
 * A TeX formula as words: `\frac{a}{b}` is "a over b", `x^2` "x squared",
 * `\sqrt{x}` "square root of x", `\alpha` "alpha". The connectives come from
 * `words`, so the formula is said in the language around it.
 */
export function texToWords(
  tex: string,
  words: MathWords,
  greek: GreekLetters = 'names',
): string {
  const out: string[] = [];
  let i = 0;
  while (i < tex.length) {
    const char = tex[i];
    if (char === '\\') {
      const match = /^\\([a-zA-Z]+)\*?/.exec(tex.slice(i));
      if (!match) {
        // `\,` `\;` `\!` `\ ` are spacing, `\\` a line break, `\{` a brace.
        const next = tex[i + 1] ?? '';
        if (next === '{' || next === '}' || next === '|') out.push('');
        else if (next === '%' || next === '$' || next === '&' || next === '#') out.push(next);
        else out.push(' ');
        i += 2;
        continue;
      }
      const name = match[1];
      i += match[0].length;
      if (FRACTIONS.has(name)) {
        const top = readArgument(tex, i);
        const bottom = readArgument(tex, top.end);
        out.push(texToWords(top.body, words, greek), words.over);
        out.push(texToWords(bottom.body, words, greek));
        i = bottom.end;
      } else if (name === 'sqrt') {
        const index = readOptional(tex, i);
        const value = readArgument(tex, index?.end ?? i);
        const order = index?.body.trim();
        if (!order || order === '2') out.push(words.squareRootOf);
        else if (order === '3') out.push(words.cubeRootOf);
        else
          out.push(words.nthRootOf.replace('{index}', texToWords(order, words, greek)));
        out.push(texToWords(value.body, words, greek));
        i = value.end;
      } else if (TEXT_COMMANDS.has(name)) {
        const argument = readArgument(tex, i);
        out.push(argument.body.replace(/[{}\\]/g, ''));
        i = argument.end;
      } else if (name in GREEK) {
        out.push(GREEK[name][greek === 'names' ? 0 : 1]);
      } else if (name in COMMANDS) {
        out.push(words[COMMANDS[name]]);
      } else if (SPACE_COMMANDS.has(name) || STYLE_COMMANDS.has(name)) {
        out.push(' ');
      } else if (name === 'begin' || name === 'end') {
        // An environment's name (`\begin{aligned}`) is not said.
        i = readArgument(tex, i).end;
      } else {
        // `\sin`, `\log`, `\sum`: the name is the word.
        out.push(name);
      }
      continue;
    }
    if (char === '^') {
      const exponent = readArgument(tex, i + 1);
      out.push(...power(exponent.body, words, greek));
      i = exponent.end;
      continue;
    }
    if (char === '_') {
      const subscript = readArgument(tex, i + 1);
      out.push(texToWords(subscript.body, words, greek));
      i = subscript.end;
      continue;
    }
    if (char === '{') {
      const close = groupEnd(tex, i);
      out.push(texToWords(tex.slice(i + 1, close), words, greek));
      i = close + 1;
      continue;
    }
    if (char in SYMBOLS) {
      out.push(words[SYMBOLS[char]]);
      i++;
      continue;
    }
    if (char === '}' || char === '&' || char === '|' || char === '~') {
      out.push(' ');
      i++;
      continue;
    }
    // A number or a name is one word; anything else stands alone.
    const run = /^(?:\d+(?:[.,]\d+)*|\p{L}+)/u.exec(tex.slice(i));
    const piece = run ? run[0] : char;
    out.push(piece);
    i += piece.length;
  }
  return out
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?)\]])/g, '$1')
    .replace(/([([])\s+/g, '$1')
    .trim();
}
