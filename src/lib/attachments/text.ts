// Module: attachments/text
// Responsibility: Recognise plain-text and source-code files and read them as UTF-8.

const TEXT_MIMES = new Set([
  'application/json',
  'application/ld+json',
  'application/xml',
  'application/javascript',
  'application/x-javascript',
  'application/typescript',
  'application/x-yaml',
  'application/yaml',
  'application/toml',
  'application/sql',
  'application/x-sh',
  'application/x-httpd-php',
]);

const TEXT_EXTENSIONS = new Set([
  'txt',
  'md',
  'markdown',
  'mdx',
  'json',
  'jsonl',
  'csv',
  'tsv',
  'yaml',
  'yml',
  'toml',
  'ini',
  'cfg',
  'conf',
  'env',
  'log',
  'xml',
  'js',
  'mjs',
  'cjs',
  'ts',
  'mts',
  'cts',
  'jsx',
  'tsx',
  'py',
  'rb',
  'go',
  'rs',
  'java',
  'kt',
  'kts',
  'swift',
  'c',
  'h',
  'cc',
  'cpp',
  'hpp',
  'cs',
  'php',
  'sh',
  'bash',
  'zsh',
  'fish',
  'ps1',
  'sql',
  'html',
  'htm',
  'css',
  'scss',
  'less',
  'vue',
  'svelte',
  'astro',
  'graphql',
  'gql',
  'proto',
  'tf',
  'hcl',
  'dockerfile',
  'tex',
  'bib',
  'r',
  'lua',
  'ex',
  'exs',
  'erl',
  'hs',
  'ml',
  'clj',
  'scala',
  'zig',
  'nim',
  'dart',
  'diff',
  'patch',
  'gitignore',
  'editorconfig',
]);

const TEXT_BASENAMES = new Set([
  'makefile',
  'dockerfile',
  'readme',
  'license',
  'gemfile',
  'procfile',
  'justfile',
]);

export const TEXT_FILE_ACCEPT = [
  'text/*',
  'application/json',
  'application/xml',
  '.md',
  '.markdown',
  '.txt',
  '.csv',
  '.tsv',
  '.json',
  '.jsonl',
  '.yaml',
  '.yml',
  '.toml',
  '.log',
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.py',
  '.rb',
  '.go',
  '.rs',
  '.java',
  '.c',
  '.cpp',
  '.h',
  '.cs',
  '.php',
  '.sh',
  '.sql',
  '.html',
  '.css',
  '.scss',
  '.xml',
  '.diff',
  '.patch',
].join(',');

/** Whether a picked or dropped file is plain text or source code. */
export function isTextFile(file: { name?: string; type?: string }): boolean {
  const mime = (file.type || '').split(';')[0]?.trim().toLowerCase() ?? '';
  if (mime.startsWith('text/') || TEXT_MIMES.has(mime)) return true;
  // Never claim an image, audio or PDF by extension alone.
  if (mime.startsWith('image/') || mime.startsWith('audio/') || mime === 'application/pdf') {
    return false;
  }
  const base = (file.name || '').trim().toLowerCase().split(/[\\/]/).pop() ?? '';
  if (!base) return false;
  if (TEXT_BASENAMES.has(base)) return true;
  const dot = base.lastIndexOf('.');
  if (dot === -1) return false;
  return TEXT_EXTENSIONS.has(base.slice(dot + 1));
}

/** A NUL byte means binary data wearing a text name. */
export function looksBinary(text: string): boolean {
  return text.includes('\u0000');
}

/** How many lines a text file holds, for its chip. */
export function countLines(text: string): number {
  if (!text) return 0;
  const normalized = text.replace(/\r\n?/g, '\n');
  const trimmed = normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized;
  return trimmed ? trimmed.split('\n').length : 0;
}

export async function readTextFile(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
