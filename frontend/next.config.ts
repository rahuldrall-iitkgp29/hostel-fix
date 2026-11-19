import type { NextConfig } from 'next';
import path from 'node:path';
import { PHASE_PRODUCTION_BUILD } from 'next/constants';
import { getConfiguredApiBaseUrl } from './src/lib/api/url';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // The parent package owns a separate backend workspace and lockfile.
  turbopack: { root: path.resolve(import.meta.dirname) },
  outputFileTracingRoot: path.resolve(import.meta.dirname),
};

export default function configure(phase: string): NextConfig {
  if (phase === PHASE_PRODUCTION_BUILD)
    getConfiguredApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL, 'production');
  return nextConfig;
}
