// Module: csp
// Responsibility: the production build's Content Security Policy and security headers.
//
// Model output is untrusted, and the user's keys live in this origin. The
// policy is the backstop for what the renderer already refuses: no script but
// the app's own (and the theme's inline one, by hash), no image from anywhere
// but the page itself, so a reply cannot load a URL that carries the
// conversation out, and no framing. Requests stay open (`connect-src *`)
// because a person's own server can be any address.

const DIRECTIVES = (scriptHashes: string[]): Array<[string, string[]]> => [
  ['default-src', ["'self'"]],
  ['script-src', ["'self'", "'wasm-unsafe-eval'", ...scriptHashes.map((h) => `'sha256-${h}'`)]],
  // React, KaTeX and Mermaid set inline styles.
  ['style-src', ["'self'", "'unsafe-inline'"]],
  ['img-src', ["'self'", 'data:', 'blob:']],
  ['media-src', ["'self'", 'data:', 'blob:']],
  ['font-src', ["'self'", 'data:']],
  ['connect-src', ['*', 'data:', 'blob:']],
  // PDF text extraction runs in a worker.
  ['worker-src', ["'self'", 'blob:']],
  ['manifest-src', ["'self'"]],
  ['object-src', ["'none'"]],
  ['base-uri', ["'none'"]],
  ['form-action', ["'none'"]],
];

/** The policy for a page whose inline scripts hash (base64 SHA-256) to `scriptHashes`. */
export function contentSecurityPolicy(scriptHashes: string[], opts: { meta?: boolean } = {}) {
  const directives = DIRECTIVES(scriptHashes);
  // A <meta> policy ignores frame-ancestors; the header carries it.
  if (!opts.meta) directives.push(['frame-ancestors', ["'none'"]]);
  return directives.map(([name, values]) => `${name} ${values.join(' ')}`).join('; ');
}

/** Cloudflare's `_headers` file for the built site. */
export function headersFile(scriptHashes: string[]): string {
  return [
    '/*',
    `  Content-Security-Policy: ${contentSecurityPolicy(scriptHashes)}`,
    '  X-Content-Type-Options: nosniff',
    '  X-Frame-Options: DENY',
    '  Referrer-Policy: no-referrer',
    '  Permissions-Policy: camera=(), geolocation=(), payment=()',
    '',
  ].join('\n');
}

/** The bodies of a page's inline scripts (those with no `src`). */
export function inlineScripts(html: string): string[] {
  const scripts: string[] = [];
  const pattern = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(pattern)) {
    if (match[1].trim()) scripts.push(match[1]);
  }
  return scripts;
}
