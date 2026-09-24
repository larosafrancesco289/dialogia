/**
 * Inline script used before hydration to ensure the correct theme class is
 * present on the root element. The logic mirrors useThemeMode's runtime apply,
 * but lives here so it can run before paint (no theme flash).
 */
export function injectThemeClass(): string {
  return `(() => {
  try {
    const mode = localStorage.getItem('theme') || 'auto';
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const shouldUseDark = mode === 'dark' || (mode === 'auto' && prefersDark);
    document.documentElement.classList.toggle('dark', shouldUseDark);
  } catch (_) {
    // no-op: theme will fall back to default styles
  }
})();`;
}
