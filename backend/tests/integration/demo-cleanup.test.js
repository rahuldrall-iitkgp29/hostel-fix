const { randomUUID } = require('node:crypto');
const { createDatabase } = require('../../src/config/database');
const { parseEnv } = require('../../src/config/env');
const { createModels } = require('../../src/models');
const { REGISTRY, PROJECT_ROOT } = require('../../src/models/demoOwnership');
const { runTransaction } = require('../../src/utils/transactions');
const { createRegistry, cleanupOwned } = require('../../seeds/ownership');
const { verifyLocalTestServer } = require('../helpers/database.helper');
const { testEnv } = require('../helpers/env.helper');
const { hashEnrollmentCode } = require('../../src/utils/hashUtils');

describe('demo cleanup ownership and preservation', () => {
  let config, database, models, owner, hostel, enrollmentCodeHash;
  const clean = () =>
    cleanupOwned({ config, database, models, owner, fixture: true });
  beforeAll(async () => {
    const uri = await verifyLocalTestServer();
    config = parseEnv(testEnv({ TEST_MONGODB_URI: uri }));
    database = createDatabase(config);
    await database.connect();
    models = createModels(database.connection, {
      collectionPrefix: `seed_${randomUUID().replaceAll('-', '')}_`,
    });
    owner = randomUUID();
    await createRegistry(database.connection, models, owner, 'cleanup-test');
    enrollmentCodeHash = await hashEnrollmentCode('Fixture-enrollment-only');
    hostel = new models.Hostel({
      name: 'Owned test hostel',
      code: 'OWNED',
      enrollmentCodeHash,
      demoSeedOwner: owner,
    });
    await runTransaction(database.connection, (session) =>
      hostel.save({ session })
    );
  });
  afterAll(async () => {
    if (!database) return;
    try {
      await clean();
      await database.connection.db
        .collection(REGISTRY)
        .deleteOne({ _id: owner, projectRoot: PROJECT_ROOT });
    } finally {
      await database.disconnect();
    }
  });
  test('rejects missing manifest without adopting marked records', async () => {
    const registry = database.connection.db.collection(REGISTRY);
    const manifest = await registry.findOne({ _id: owner });
    await registry.deleteOne({ _id: owner, projectRoot: PROJECT_ROOT });
    try {
      await expect(clean()).rejects.toThrow('manifest is missing');
      expect(await models.Hostel.countDocuments({ _id: hostel._id })).toBe(1);
    } finally {
      await registry.insertOne(manifest);
    }
  });
  test('rejects changed markers and unregistered IDs before any deletion', async () => {
    await models.Hostel.collection.updateOne(
      { _id: hostel._id, demoSeedOwner: owner },
      { $unset: { demoSeedOwner: '' } }
    );
    try {
      await expect(clean()).rejects.toThrow('unexpected marker');
    } finally {
      await models.Hostel.collection.updateOne(
        { _id: hostel._id },
        { $set: { demoSeedOwner: owner } }
      );
    }
    const registry = database.connection.db.collection(REGISTRY);
    await registry.updateOne({ _id: owner }, { $set: { 'ids.Hostel': [] } });
    try {
      await expect(clean()).rejects.toThrow('Unregistered');
      expect(await models.Hostel.countDocuments({ _id: hostel._id })).toBe(1);
    } finally {
      await registry.updateOne(
        { _id: owner },
        { $set: { 'ids.Hostel': [hostel._id] } }
      );
    }
  });
  test('rejects external references atomically and preserves unrelated records across repeated cleanup', async () => {
    const block = new models.Block({
      hostelId: hostel._id,
      name: 'External wing',
      code: 'EXTERNAL',
    });
    await block.save();
    try {
      await expect(clean()).rejects.toThrow('Non-demo Block');
      expect(await models.Hostel.countDocuments({ _id: hostel._id })).toBe(1);
    } finally {
      await models.Block.collection.deleteOne({
        _id: block._id,
        demoSeedOwner: { $exists: false },
      });
    }
    const sentinel = new models.Hostel({
      name: 'Unrelated hostel',
      code: 'KEEP',
      enrollmentCodeHash,
    });
    await sentinel.save();
    const before = await models.Hostel.collection.findOne({
      _id: sentinel._id,
    });
    try {
      expect(await clean()).toBe(1);
      expect(await clean()).toBe(0);
      expect(
        await models.Hostel.collection.findOne({ _id: sentinel._id })
      ).toEqual(before);
    } finally {
      await models.Hostel.collection.deleteOne({
        _id: sentinel._id,
        demoSeedOwner: { $exists: false },
      });
    }
  });
});
