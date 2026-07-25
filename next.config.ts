import type { NextConfig } from 'next';
import { PHASE_PRODUCTION_BUILD } from 'next/constants';

process.env.BASELINE_BROWSER_MAPPING_IGNORE_OLD_DATA ??= 'true';
process.env.BROWSERSLIST_IGNORE_OLD_DATA ??= 'true';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  outputFileTracingRoot: process.cwd(),
  experimental: {
    optimizePackageImports: ['zustand', '@heroicons/react'],
  },
};

const suppressBaselineWarning = () => {
  const originalWarn = console.warn;
  console.warn = (...args) => {
    if (typeof args[0] === 'string' && args[0].startsWith('[baseline-browser-mapping]')) {
      return;
    }
    originalWarn(...args);
  };
};

export default (phase: string) => {
  if (phase === PHASE_PRODUCTION_BUILD) {
    suppressBaselineWarning();
  }
  return nextConfig;
};
