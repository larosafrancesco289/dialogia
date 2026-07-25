// Module: markdown/katex
// Responsibility: Bundle rehype-katex together with its stylesheet so both land in
// one async chunk that is only fetched when rendered content actually contains math.

import 'katex/dist/katex.min.css';

export { default as rehypeKatex } from 'rehype-katex';
