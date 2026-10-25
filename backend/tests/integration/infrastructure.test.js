const express = require('express');
const request = require('supertest');
const { z } = require('zod');
const { createApp } = require('../../src/app');
const { requestId } = require('../../src/middleware/requestId');
const { errorHandler } = require('../../src/middleware/errorHandler');
const { validateBody } = require('../../src/middleware/validateBody');
const { sendData } = require('../../src/utils/response');
const { createLogger } = require('../../src/config/logger');
const { createIpLimiter } = require('../../src/middleware/rateLimiter');

const origin = 'http://localhost:3000';
const config = { CORS_ORIGIN: origin };
const ready = () => ({ check: vi.fn().mockResolvedValue(undefined) });

describe('CORS and mutation protection', () => {
  test('trusted preflight returns the exact PRD policy without auth/CSRF requirements', async () => {
    const res = await request(createApp({ config }))
      .options('/api/v1/auth/login')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'Content-Type,X-CSRF-Protection')
      .expect(204);
    expect(res.headers).toMatchObject({
      'access-control-allow-origin': origin,
      'access-control-allow-credentials': 'true',
      'access-control-allow-methods': 'GET,POST,PATCH,DELETE',
      'access-control-allow-headers':
        'Content-Type,Authorization,X-CSRF-Protection',
      'access-control-expose-headers': 'X-Request-Id,Retry-After',
      'access-control-max-age': '86400',
    });
    expect(res.headers.vary).toContain('Origin');
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  test.each([
    'https://evil.example',
    `${origin}.evil.example`,
    'null',
    `${origin}/`,
  ])('does not grant CORS access to %s', async (untrusted) => {
    const app = createApp({ config });
    const res = await request(app)
      .get('/api/v1/health')
      .set('Origin', untrusted)
      .expect(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    const preflight = await request(app)
      .options('/api/v1/auth/login')
      .set('Origin', untrusted)
      .expect(404);
    expect(preflight.headers['access-control-allow-origin']).toBeUndefined();
  });

  test.each(['post', 'put', 'patch', 'delete'])(
    'protects %s without a user-agent bypass',
    async (method) => {
      const app = createApp({ config });
      for (const headers of [
        {},
        { Origin: origin },
        { 'X-CSRF-Protection': '1' },
        { Origin: 'https://evil.example', 'X-CSRF-Protection': '1' },
        { Origin: origin, 'X-CSRF-Protection': 'true' },
        { Origin: origin, 'X-CSRF-Protection': '1, 1' },
      ]) {
        const res = await request(app)
          [method]('/api/v1/unknown')
          .set(headers)
          .set('User-Agent', 'test-client')
          .expect(403);
        expect(res.body.error.code).toBe('CSRF_INVALID');
        expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
      }
      await request(app)
        [method]('/api/v1/unknown')
        .set('Origin', origin)
        .set('X-CSRF-Protection', '1')
        .expect(404);
    }
  );

  test('checks JSON syntax/size after trusted mutation headers', async () => {
    const app = createApp({ config });
    for (const [body, status, code] of [
      ['{"secret":', 400, 'MALFORMED_JSON'],
      ['{"value":"' + 'x'.repeat(32768) + '"}', 413, 'PAYLOAD_TOO_LARGE'],
    ]) {
      const res = await request(app)
        .post('/api/v1/unknown')
        .set('Origin', origin)
        .set('X-CSRF-Protection', '1')
        .set('Content-Type', 'application/json')
        .send(body)
        .expect(status);
      expect(res.body.error.code).toBe(code);
      expect(res.headers['access-control-allow-origin']).toBe(origin);
    }
  });
});

describe('readiness', () => {
  test('requires both dependencies and returns the shared envelope', async () => {
    const database = ready();
    const storage = ready();
    const res = await request(createApp({ database, storage }))
      .get('/api/v1/health/ready')
      .expect(200);
    expect(res.body).toEqual({
      data: { status: 'ready' },
      meta: { requestId: res.headers['x-request-id'] },
    });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(database.check).toHaveBeenCalledOnce();
    expect(storage.check).toHaveBeenCalledOnce();
  });

  test.each(['database', 'storage'])(
    'reports unavailable %s without exposing internals',
    async (dependency) => {
      const deps = { database: ready(), storage: ready() };
      deps[dependency].check.mockRejectedValue(
        new Error('mongodb://secret@private-host/internal-path')
      );
      const app = createApp(deps);
      const res = await request(app).get('/api/v1/health/ready').expect(503);
      expect(res.body.error).toEqual({
        code: 'SERVICE_UNAVAILABLE',
        message: 'Service is temporarily unavailable.',
        requestId: res.headers['x-request-id'],
      });
      await request(app).get('/api/v1/health').expect(200);
      deps[dependency].check.mockResolvedValue(undefined);
      await request(app).get('/api/v1/health/ready').expect(200);
    }
  );

  test('unconfigured app remains live but not ready', async () => {
    const app = createApp();
    await request(app).get('/api/v1/health').expect(200);
    await request(app).get('/api/v1/health/ready').expect(503);
  });

  test('rejects query/body input before checking dependencies', async () => {
    const database = ready();
    const storage = ready();
    const app = createApp({ database, storage });
    await request(app).get('/api/v1/health/ready?filter[$ne]=null').expect(422);
    await request(app).get('/api/v1/health/ready').send({}).expect(422);
    expect(database.check).not.toHaveBeenCalled();
  });

  test('bounds hung checks to one second and does not cache readiness forever', async () => {
    const database = { check: () => new Promise(() => {}) };
    const start = Date.now();
    await request(createApp({ database, storage: ready() }))
      .get('/api/v1/health/ready')
      .expect(503);
    expect(Date.now() - start).toBeLessThan(2500);
  });

  test('returns unavailable during shutdown and shares the health rate limit', async () => {
    const database = ready();
    const app = createApp({
      database,
      storage: ready(),
      isShuttingDown: () => true,
    });
    await request(app).get('/api/v1/health/ready').expect(503);
    expect(database.check).not.toHaveBeenCalled();
    for (let i = 0; i < 59; i++)
      await request(app).get('/api/v1/health').expect(200);
    await request(app)
      .get('/api/v1/health/ready')
      .expect(429)
      .expect('Retry-After', /\d+/);
  });
});

describe('common responses and logs', () => {
  test('rejects unsupported JSON encoding without leaking parser internals', async () => {
    const response = await request(createApp())
      .get('/api/v1/health')
      .set('Content-Type', 'application/json; charset=iso-8859-1')
      .send('{}')
      .expect(415);
    expect(response.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    expect(response.body.error).not.toHaveProperty('stack');
  });

  test('strict Zod validation and async errors use safe envelopes', async () => {
    const app = express();
    app.use(requestId, express.json());
    app.post(
      '/validated',
      validateBody(z.strictObject({ name: z.string().min(2) })),
      (req, res) => sendData(req, res, req.body, { status: 201 })
    );
    app.get('/error', async () => {
      throw new Error('private password stack database path');
    });
    app.delete('/empty', (req, res) =>
      sendData(req, res, { private: 'ignored' }, { status: 204 })
    );
    app.use(errorHandler);
    const valid = await request(app)
      .post('/validated')
      .send({ name: 'valid' })
      .expect(201);
    expect(valid.body.data).toEqual({ name: 'valid' });
    const invalid = await request(app)
      .post('/validated')
      .send({ name: 1, password: 'private' })
      .expect(422);
    expect(invalid.body.error.fields).toContainEqual({
      path: 'name',
      message: 'Invalid value.',
    });
    expect(JSON.stringify(invalid.body)).not.toContain('private');
    const failed = await request(app).get('/error').expect(503);
    expect(failed.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(failed.body.error).not.toHaveProperty('fields');
    expect(JSON.stringify(failed.body)).not.toContain('private');
    expect((await request(app).delete('/empty').expect(204)).text).toBe('');
  });

  test('Pino request/error logs contain correlation/status but no request secrets or driver errors', async () => {
    let output = '';
    const logger = createLogger(
      { LOG_LEVEL: 'info' },
      {
        write: (text) => {
          output += text;
        },
      }
    );
    const database = {
      check: async () => {
        throw new Error('PRIVATE_DRIVER_ERROR');
      },
    };
    const app = createApp({ config, logger, database, storage: ready() });
    const res = await request(app)
      .get('/api/v1/health/ready')
      .set('Cookie', 'PRIVATE_COOKIE')
      .set('Authorization', 'Bearer PRIVATE_TOKEN')
      .set('X-Request-Id', 'PRIVATE_ID')
      .expect(503);
    await request(app)
      .post('/PRIVATE_PATH?token=PRIVATE_QUERY')
      .send({ password: 'PRIVATE_BODY' })
      .expect(403);
    expect(output).not.toContain('PRIVATE_');
    const lines = output.trim().split('\n').map(JSON.parse);
    expect(lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          requestId: res.headers['x-request-id'],
          statusCode: 503,
          durationMs: expect.any(Number),
        }),
        expect.objectContaining({
          requestId: res.headers['x-request-id'],
          code: 'SERVICE_UNAVAILABLE',
        }),
      ])
    );
  });

  test.each([
    ['public', 30],
    ['refresh', 20],
  ])('%s IP policy counts failed attempts', async (scope, max) => {
    const app = express();
    app.use(
      requestId,
      createIpLimiter(scope),
      (req, res) => res.sendStatus(401),
      errorHandler
    );
    for (let i = 0; i < max; i++) await request(app).get('/').expect(401);
    const res = await request(app).get('/').expect(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
    expect(Number(res.headers['retry-after'])).toBeLessThanOrEqual(900);
  });
});
