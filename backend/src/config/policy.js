// Fixed P0 contracts from PRD §§9.1, 13.3–13.8, not environment overrides.
const POLICY = Object.freeze({
  jsonBytes: 32 * 1024,
  csrfHeader: 'X-CSRF-Protection',
  csrfValue: '1',
  cookieName: 'hf_refresh',
  upload: Object.freeze({ bytes: 5 * 1024 * 1024, pixels: 12_000_000, dimension: 6000, files: 1 }),
  rates: Object.freeze(Object.fromEntries(Object.entries({
    public: { windowMs: 900_000, limit: 30 },
    refresh: { windowMs: 900_000, limit: 20 },
    read: { windowMs: 60_000, limit: 120 },
    write: { windowMs: 60_000, limit: 30 },
    upload: { windowMs: 60_000, limit: 10 },
    health: { windowMs: 60_000, limit: 60 },
  }).map(([key, value]) => [key, Object.freeze(value)]))),
});

function refreshCookieOptions(config) {
  return {
    httpOnly: true, secure: config.COOKIE_SECURE, sameSite: 'strict',
    path: '/api/v1/auth', maxAge: config.REFRESH_TOKEN_EXPIRY * 1000,
    ...(config.COOKIE_DOMAIN ? { domain: config.COOKIE_DOMAIN } : {}),
  };
}

module.exports = { POLICY, refreshCookieOptions };
