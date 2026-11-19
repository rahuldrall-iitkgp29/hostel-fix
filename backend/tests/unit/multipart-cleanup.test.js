const express = require('express');
const request = require('supertest');
const fs = require('node:fs/promises');
const { uploadMultipart } = require('../../src/middleware/uploadMultipart');
const { errorHandler } = require('../../src/middleware/errorHandler');
const { requestId } = require('../../src/middleware/requestId');

test.each(['wrong-field', 'oversized', 'accepted'])(
  'multipart temporary files are removed for %s requests',
  async (scenario) => {
    const deleted = [];
    const original = fs.unlink;
    vi.spyOn(fs, 'unlink').mockImplementation(async (filepath) => {
      deleted.push(filepath);
      return original(filepath);
    });
    const app = express();
    app.use(requestId);
    app.post('/upload', uploadMultipart, (_req, res) => res.sendStatus(200));
    app.use(errorHandler);
    const response = await request(app)
      .post('/upload')
      .attach(
        scenario === 'wrong-field' ? 'unexpected' : 'file',
        Buffer.alloc(scenario === 'oversized' ? 5 * 1024 * 1024 + 1 : 5),
        'photo.png'
      );
    expect(response.status).toBe(
      scenario === 'oversized' ? 413 : scenario === 'wrong-field' ? 422 : 200
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(deleted.length).toBeGreaterThan(0);
    for (const filepath of new Set(deleted))
      await expect(fs.access(filepath)).rejects.toMatchObject({
        code: 'ENOENT',
      });
  }
);
