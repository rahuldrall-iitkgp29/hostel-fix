import { describe, expect, it } from 'vitest';
import {
  ApiError,
  getApiErrorMessage,
  normalizeApiError,
} from '../src/lib/api/errors';

describe('request error messages', () => {
  it('preserves a structured rate-limit message instead of blaming connectivity', () => {
    const error = normalizeApiError(
      {
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Try again later.',
          requestId: 'a0e228df-bcec-4adb-985f-b48c0d7a597b',
        },
      },
      new Response(null, { status: 429 })
    );
    expect(getApiErrorMessage(error, 'Check your connection.')).toBe(
      'Too many requests. Try again later.'
    );
    expect(
      getApiErrorMessage(
        new ApiError('The request took too long.', 'REQUEST_TIMEOUT'),
        'Check your connection.'
      )
    ).toBe('The request took too long.');
  });
  it('keeps arbitrary exceptions and malformed server responses out of the UI', () => {
    expect(
      getApiErrorMessage(
        new Error('internal database password'),
        'Unable to load data.'
      )
    ).toBe('Unable to load data.');
    const error = normalizeApiError(
      '<html>private diagnostics</html>',
      new Response(null, { status: 500 })
    );
    expect(getApiErrorMessage(error, 'Unable to load data.')).toBe(
      'We couldn’t complete the request. Please try again.'
    );
  });
});
