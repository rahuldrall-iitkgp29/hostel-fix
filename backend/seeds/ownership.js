const { REGISTRY, PROJECT_ROOT, UUID } = require('../src/models/demoOwnership');
const { runTransaction } = require('../src/utils/transactions');
const { databaseUri } = require('../src/config/database');
const { TEST_PORT, LOCAL_TEST_URI } = require('../src/config/testDatabase');
const { verifyServer } = require('../../scripts/mongodb/safety');
const LOCAL_DEV_URI = `mongodb://127.0.0.1:${TEST_PORT}/hostelfix?replicaSet=rs0`;
const references = {
  User: ['hostelId', 'blockId', 'roomId', 'adminHostelIds', 'categoryIds'],
  Session: ['userId'],
  Hostel: [],
  Block: ['hostelId'],
  Room: ['hostelId', 'blockId'],
  Category: ['hostelId'],
  HostelPolicy: ['hostelId'],
  Complaint: [
    'ownerId',
    'hostelId',
    'categoryId',
    'assigneeId',
    'resolverId',
    'location.hostelId',
    'location.blockId',
    'location.roomId',
    'attachmentIds',
    'duplicateOfId',
    'priorCycles.assigneeId',
    'priorCycles.resolverId',
  ],
  Activity: ['complaintId', 'actorId'],
  Comment: ['complaintId', 'authorId'],
  Attachment: ['ownerId', 'complaintId'],
  Feedback: ['complaintId', 'authorId'],
};
function guardTarget(config, { fixture = false } = {}) {
  if (config.NODE_ENV === 'production')
    throw new Error('Demo cleanup is strictly forbidden in production.');
  const uri = databaseUri(config);
  if (
    !(fixture && config.NODE_ENV === 'test' && uri === LOCAL_TEST_URI) &&
    !(config.NODE_ENV === 'development' && uri === LOCAL_DEV_URI)
  )
    throw new Error(
      'Demo cleanup is strictly restricted to local development or test fixture databases.'
    );
  return uri;
}
async function verifyConnection(config, database, options) {
  guardTarget(config, options);
  const expected = config.NODE_ENV === 'test' ? 'hostelfix_test' : 'hostelfix';
  if (database.connection.name !== expected)
    throw new Error('Demo database name mismatch.');
  await verifyServer({ db: () => database.connection.db.admin() });
}
async function createRegistry(connection, models, owner, kind) {
  if (!UUID.test(owner)) throw new Error('Invalid demo owner ID.');
  const collection = connection.db.collection(REGISTRY);
  const current = await collection.findOne({ _id: owner });
  const collections = Object.fromEntries(
    Object.entries(models).map(([name, Model]) => [name, Model.collection.name])
  );
  if (current) {
    if (
      current.projectRoot !== PROJECT_ROOT ||
      JSON.stringify(current.collections) !== JSON.stringify(collections) ||
      current.kind !== kind
    )
      throw new Error(
        'Demo ownership registry does not belong to this checkout/schema.'
      );
    return current;
  }
  const record = {
    _id: owner,
    projectRoot: PROJECT_ROOT,
    kind,
    collections,
    ids: {},
    status: 'seeding',
    createdAt: new Date(),
  };
  await collection.insertOne(record);
  return record;
}
async function cleanupOwned({
  config,
  database,
  models,
  owner,
  fixture = false,
}) {
  await verifyConnection(config, database, { fixture });
  if (!UUID.test(owner))
    throw new Error('Demo ownership cannot be established.');
  const registry = database.connection.db.collection(REGISTRY);
  return runTransaction(database.connection, async (session) => {
    const manifest = await registry.findOne(
      { _id: owner, projectRoot: PROJECT_ROOT },
      { session }
    );
    if (!manifest)
      throw new Error(
        'Demo ownership manifest is missing; no cleanup performed.'
      );
    for (const [name, Model] of Object.entries(models)) {
      if (manifest.collections[name] !== Model.collection.name)
        throw new Error('Ownership collection mismatch.');
      const ids = manifest.ids[name] ?? [];
      const records = await Model.collection
        .find({ _id: { $in: ids } }, { session })
        .toArray();
      if (records.some((doc) => doc.demoSeedOwner !== owner))
        throw new Error(
          'An owned ID has an unexpected marker; aborting cleanup.'
        );
      const unknown = await Model.collection.findOne(
        { demoSeedOwner: owner, _id: { $nin: ids } },
        { session }
      );
      if (unknown)
        throw new Error('Unregistered demo records exist; aborting cleanup.');
    }
    const ids = Object.values(manifest.ids).flat();
    for (const [name, fields] of Object.entries(references)) {
      if (!fields.length || !ids.length) continue;
      const external = await models[name].collection.findOne(
        {
          demoSeedOwner: { $ne: owner },
          $or: fields.map((field) => ({ [field]: { $in: ids } })),
        },
        { session }
      );
      if (external)
        throw new Error(
          `Non-demo ${name} records reference this demo. Cleanup aborted without deleting records.`
        );
    }
    await registry.updateOne(
      { _id: owner },
      { $set: { status: 'cleaning' } },
      { session }
    );
    let removed = 0;
    // Narrow native deletes are the deliberate exception for demo audit history.
    // Each delete requires both an explicitly registered ID and matching owner.
    for (const name of [
      'Session',
      'Feedback',
      'Comment',
      'Activity',
      'Attachment',
      'Complaint',
      'User',
      'HostelPolicy',
      'Category',
      'Room',
      'Block',
      'Hostel',
    ]) {
      for (const id of manifest.ids[name] ?? [])
        removed += (
          await models[name].collection.deleteOne(
            { _id: id, demoSeedOwner: owner },
            { session }
          )
        ).deletedCount;
    }
    await registry.updateOne(
      { _id: owner },
      { $set: { status: 'cleaned', ids: {}, cleanedAt: new Date() } },
      { session }
    );
    return removed;
  });
}
module.exports = {
  guardTarget,
  verifyConnection,
  createRegistry,
  cleanupOwned,
  LOCAL_DEV_URI,
};
