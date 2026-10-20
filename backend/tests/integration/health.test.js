const request = require('supertest');
const { createApp } = require('../../src/app');

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('GET /api/v1/health', () => {
  test('responds without authentication, configuration, or a database connection', async () => {
    const response = await request(createApp()).get('/api/v1/health').expect(200).expect('Content-Type', /json/);
    expect(response.body).toEqual({ data: { status: 'ok' }, meta: { requestId: expect.stringMatching(uuid) } });
    expect(response.headers['x-request-id']).toBe(response.body.meta.requestId);
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers.etag).toBeUndefined();
  });

  test('generates independent request IDs instead of trusting a supplied ID', async () => {
    const app = createApp();
    const first = await request(app).get('/api/v1/health').set('X-Request-Id', 'untrusted');
    const second = await request(app).get('/api/v1/health');
    expect(first.headers['x-request-id']).toMatch(uuid);
    expect(first.headers['x-request-id']).not.toBe(second.headers['x-request-id']);
  });

  test.each(['/api/v1/health?extra=1', '/api/v1/health?filter[$ne]=null'])(
    'rejects query input: %s', async (url) => {
      const response = await request(createApp()).get(url).expect(422);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.requestId).toBe(response.headers['x-request-id']);
    },
  );

  test.each(['application/json', 'text/plain'])('rejects bodies of type %s', async (type) => {
    const response = await request(createApp()).get('/api/v1/health').set('Content-Type', type).send('{}').expect(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('returns a safe error for malformed JSON without reflecting input', async () => {
    const response = await request(createApp()).get('/api/v1/health').set('Content-Type', 'application/json').send('{"private":').expect(400);
    expect(response.body.error.code).toBe('MALFORMED_JSON');
    expect(JSON.stringify(response.body)).not.toContain('private');
  });

  test('bounds JSON input to 32 KiB', async () => {
    const response = await request(createApp()).get('/api/v1/health').send({ text: 'a'.repeat(32 * 1024) }).expect(413);
    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  test.each(['/health', '/api/v1/health/', '/api/v1/unimplemented', '/api/v1/HEALTH'])(
    'does not expose an unimplemented path or alias: %s', async (url) => {
      const response = await request(createApp()).get(url).expect(404);
      expect(response.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Resource not found.', requestId: expect.stringMatching(uuid) } });
    },
  );

  test('limits health probes to 60 per IP per minute with Retry-After', async () => {
    const app = createApp();
    for (let index = 0; index < 60; index += 1) await request(app).get('/api/v1/health').expect(200);
    const response = await request(app).get('/api/v1/health').expect(429);
    expect(response.body.error.code).toBe('RATE_LIMITED');
    expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(response.headers['retry-after'])).toBeLessThanOrEqual(60);
    await request(createApp()).get('/api/v1/health').expect(200);
  });
});
