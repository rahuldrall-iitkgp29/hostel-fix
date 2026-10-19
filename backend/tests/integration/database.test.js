const path = require('node:path');
const fs = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
const request = require('supertest');
const { startServer } = require('../../src/server');
const { createApp } = require('../../src/app');
const { parseEnv } = require('../../src/config/env');
const { createDatabase } = require('../../src/config/database');
const { createStorage } = require('../../src/config/storage');
const { testEnv } = require('../helpers/env.helper');
const { verifyLocalTestServer } = require('../helpers/database.helper');

test('real local rs0: lifecycle, readiness, transaction isolation/commit/rollback, record-only cleanup', async () => {
  const uri = await verifyLocalTestServer();
  const root = path.resolve(__dirname, '../../.local');
  await fs.mkdir(root, { recursive: true });
  const uploadDir = await fs.mkdtemp(path.join(root, 'database-test-'));
  const config = { ...parseEnv(testEnv({ TEST_MONGODB_URI: uri, UPLOAD_DIR: uploadDir, LOG_LEVEL: 'silent' })), PORT: 0 };
  const database = createDatabase(config);
  const storage = createStorage(config);
  const app = createApp({ config, database, storage });
  let server; let session; let collection; let inserted = false;
  const id = randomUUID();
  try {
    await request(app).get('/api/v1/health/ready').expect(503);
    server = await startServer({ config, host: '127.0.0.1', database, storage });
    expect(database.connection.name).toBe('hostelfix_test');
    const hello = await database.connection.db.admin().command({ hello: 1 });
    expect(hello.setName).toBe('rs0');
    expect(hello.isWritablePrimary).toBe(true);
    await request(server).get('/api/v1/health/ready').expect(200);
    collection = database.connection.collection('hostelfix_infrastructure_test');
    await collection.insertOne({ _id: id, value: 'initial' });
    inserted = true;
    session = await database.connection.startSession();
    session.startTransaction();
    await collection.updateOne({ _id: id }, { $set: { value: 'committed' } }, { session });
    expect((await collection.findOne({ _id: id })).value).toBe('initial');
    expect((await collection.findOne({ _id: id }, { session })).value).toBe('committed');
    await session.commitTransaction();
    expect((await collection.findOne({ _id: id })).value).toBe('committed');
    session.startTransaction();
    await collection.updateOne({ _id: id }, { $set: { value: 'rolled-back' } }, { session });
    await session.abortTransaction();
    expect((await collection.findOne({ _id: id })).value).toBe('committed');
    // Real missing storage changes readiness while liveness remains independent.
    expect(await fs.readdir(uploadDir)).toEqual([]);
    await fs.rmdir(uploadDir);
    await request(server).get('/api/v1/health/ready').expect(503);
    await request(server).get('/api/v1/health').expect(200);
    await fs.mkdir(uploadDir);
    await request(server).get('/api/v1/health/ready').expect(200);
  } finally {
    try {
      if (session?.inTransaction()) await session.abortTransaction();
      await session?.endSession();
      if (inserted) {
        await verifyLocalTestServer();
        expect((await collection.deleteOne({ _id: id })).deletedCount).toBe(1);
        expect(await collection.findOne({ _id: id })).toBeNull();
      }
    } finally {
      if (server) await server.shutdown(); else await database.disconnect();
      await fs.rmdir(uploadDir).catch((error) => { if (error.code !== 'ENOENT') throw error; });
    }
  }
  expect(database.connection.readyState).toBe(0);
  await request(app).get('/api/v1/health/ready').expect(503);
  await request(app).get('/api/v1/health').expect(200);
}, 15000);
