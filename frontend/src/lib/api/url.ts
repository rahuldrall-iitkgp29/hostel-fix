import { ApiError } from './errors';

export type Query = Record<
  string,
  string | number | boolean | null | undefined
>;

export function validateApiBaseUrl(value: string | undefined): string {
  try {
    if (!value) throw new Error();
    const url = new URL(value);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname.replace(/\/$/, '') !== '/api/v1'
    )
      throw new Error();
    return url.href.replace(/\/$/, '');
  } catch {
    throw new ApiError(
      'Set NEXT_PUBLIC_API_BASE_URL to the backend URL ending in /api/v1.',
      'CONFIGURATION_ERROR'
    );
  }
}

export function getConfiguredApiBaseUrl(
  value = process.env.NEXT_PUBLIC_API_BASE_URL,
  environment = process.env.NODE_ENV
): string {
  const base = validateApiBaseUrl(
    value ||
      (environment === 'production'
        ? undefined
        : 'http://localhost:5000/api/v1')
  );
  if (environment === 'production' && new URL(base).protocol !== 'https:')
    throw new ApiError(
      'Production API configuration requires HTTPS.',
      'CONFIGURATION_ERROR'
    );
  return base;
}

export function buildApiUrl(
  baseUrl: string,
  path: string,
  query?: Query
): string {
  // Paths are relative to the configured namespace; never forward credentials
  // to arbitrary URLs, redirects, or a normalized ../ path outside /api/v1.
  if (!/^\/(?:[A-Za-z0-9_-]+\/?)+$/.test(path)) {
    throw new ApiError('Invalid API resource path.', 'INVALID_REQUEST');
  }
  const url = new URL(`${validateApiBaseUrl(baseUrl)}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null)
      url.searchParams.set(key, String(value));
  }
  return url.href;
}
