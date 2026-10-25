const assert = require('node:assert/strict');
const { createDatabase } = require('../../src/config/database');
const { parseEnv } = require('../../src/config/env');
const { createModels, ensureIndexes } = require('../../src/models');
const { runTransaction } = require('../../src/utils/transactions');
const { verifyLocalTestServer } = require('./database.helper');
const { testEnv } = require('./env.helper');

async function openModelDatabase() {
  const uri = await verifyLocalTestServer();
  const config = parseEnv(testEnv({ TEST_MONGODB_URI: uri }));
  const database = createDatabase(config);
  const ownedIds = new Map();
  try {
    await database.connect();
    assert.equal(database.connection.name, 'hostelfix_test');
    const models = createModels(database.connection);
    await ensureIndexes(models);

    function track(Model, input) {
      const doc = new Model(input);
      const ids = ownedIds.get(Model.collection.name) ?? new Map();
      ids.set(String(doc._id), doc._id);
      ownedIds.set(Model.collection.name, ids);
      return doc;
    }
    async function save(Model, input, session) {
      const doc = track(Model, input);
      await doc.save({ session });
      return doc;
    }
    async function create(Model, input) {
      // Construct a fresh document on a transient retry, never reuse an aborted
      // Mongoose document whose in-memory save state may have advanced.
      return runTransaction(database.connection, (session) =>
        save(Model, input, session)
      );
    }
    async function close() {
      try {
        await verifyLocalTestServer();
        assert.equal(database.connection.name, 'hostelfix_test');
        for (const [name, values] of ownedIds) {
          const ids = [...values.values()];
          if (!ids.length) continue;
          // Only this test run's exact IDs. Raw collection access is confined to
          // this guarded cleanup because audit models rightly prohibit deletes.
          const collection = database.connection.db.collection(name);
          await collection.deleteMany({ _id: { $in: ids } });
          assert.equal(
            await collection.countDocuments({ _id: { $in: ids } }),
            0
          );
        }
      } finally {
        await database.disconnect();
      }
    }
    return {
      config,
      database,
      connection: database.connection,
      models,
      track,
      save,
      create,
      close,
    };
  } catch (error) {
    await database.disconnect();
    throw error;
  }
}

module.exports = { openModelDatabase };
