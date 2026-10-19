const crypto = require('node:crypto');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { MongoClient, MongoNetworkError } = require('mongodb');
const { SetupError, ensure, projectRoot, expectedUris, member, loadLocalUris, validateReplicaConfig, verifyServer } = require('./safety');

const options = { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000, socketTimeoutMS: 10000 };
const action = process.argv[2];

async function verifyDatabases() {
  // Validate both targets BEFORE opening either connection. No URI is printed.
  const uris = loadLocalUris();
  const development = new MongoClient(uris.MONGODB_URI, options);
  const test = new MongoClient(uris.TEST_MONGODB_URI, options);
  let session;
  let collection;
  const probeId = crypto.randomUUID();
  const collectionName = `hostelfix_setup_${probeId.replaceAll('-', '')}`;
  try {
    await development.connect();
    await verifyServer(development);
    ensure((await development.db('hostelfix').command({ ping: 1 })).ok === 1, 'Development database ping failed.');
    console.log('PASS: connected to hostelfix using MONGODB_URI (ping only; no development writes).');
    await test.connect();
    await verifyServer(test);
    ensure(test.db().databaseName === 'hostelfix_test', 'Test connection is not using hostelfix_test.');
    ensure((await test.db().command({ ping: 1 })).ok === 1, 'Test database ping failed.');
    console.log('PASS: connected to hostelfix_test using TEST_MONGODB_URI with replicaSet=rs0.');

    // Leave the empty temporary collection; remove only this run's UUID record.
    collection = await test.db().createCollection(collectionName);
    await collection.insertOne({ _id: probeId, phase: 'round-trip' });
    ensure((await collection.findOne({ _id: probeId }))?.phase === 'round-trip', 'Test record read did not match its write.');
    ensure((await collection.deleteOne({ _id: probeId })).deletedCount === 1, 'Test record deletion failed.');
    ensure(await collection.findOne({ _id: probeId }) === null, 'Round-trip record remains after deletion.');
    console.log('PASS: harmless insert/read/delete round trip in the test database only.');

    session = test.startSession();
    session.startTransaction({ readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
    await collection.insertOne({ _id: probeId, phase: 'committed' }, { session });
    ensure((await collection.findOne({ _id: probeId }, { session }))?.phase === 'committed', 'Transaction could not read its own write.');
    ensure(await collection.findOne({ _id: probeId }) === null, 'Uncommitted test record was visible outside the transaction.');
    await session.commitTransaction();
    ensure((await collection.findOne({ _id: probeId }))?.phase === 'committed', 'Committed test record is missing.');

    session.startTransaction();
    await collection.updateOne({ _id: probeId }, { $set: { phase: 'must-rollback' } }, { session });
    await session.abortTransaction();
    ensure((await collection.findOne({ _id: probeId }))?.phase === 'committed', 'Aborted transaction did not roll back.');
    console.log('PASS: real session transaction isolation, commit, and abort/rollback on rs0.');

    const { loadEnv } = require(path.join(projectRoot, 'backend/src/config/env'));
    const applicationConfig = loadEnv({ source: {} });
    ensure(applicationConfig.MONGODB_URI === expectedUris.MONGODB_URI, 'Application configuration did not read the local development URI.');
    console.log('PASS: existing application loadEnv reads the local development URI without exposing configuration values.');
  } finally {
    try {
      if (session?.inTransaction()) await session.abortTransaction();
      if (session) await session.endSession();
      if (collection) {
        await verifyServer(test);
        await collection.deleteOne({ _id: probeId });
        ensure(await collection.findOne({ _id: probeId }) === null, 'Temporary verification record cleanup failed.');
        console.log(`PASS: temporary UUID record removed; empty test collection retained: ${collectionName}`);
      }
    } finally {
      await Promise.all([development.close(), test.close()]);
    }
  }
}

async function main() {
  ensure(['init', 'status', 'stop', 'verify'].includes(action), 'Use the documented PowerShell management scripts.');
  // Direct connection is essential before rs0 exists; the address is fixed and local.
  const client = new MongoClient(`mongodb://${member}/admin?directConnection=true`, options);
  try {
    await client.connect();
    const admin = client.db('admin');
    await verifyServer(client, { primary: false });
    if (action === 'init') {
      try {
        const { config } = await admin.command({ replSetGetConfig: 1 });
        validateReplicaConfig(config);
        console.log('Existing single-member rs0 configuration retained.');
      } catch (error) {
        if (error.code !== 94) throw error; // Only NotYetInitialized permits initiation.
        await admin.command({ replSetInitiate: { _id: 'rs0', members: [{ _id: 0, host: member }] } });
        console.log('Initialized single-member replica set rs0.');
      }
      const deadline = Date.now() + 45000;
      while (!(await admin.command({ hello: 1 })).isWritablePrimary) {
        ensure(Date.now() < deadline, 'PRIMARY election timed out. Inspect local logs; data and configuration were retained.');
        await delay(500);
      }
    }
    if (action === 'stop') {
      try { await admin.command({ shutdown: 1, timeoutSecs: 10 }); }
      catch (error) { if (!(error instanceof MongoNetworkError)) throw error; }
      console.log('Graceful shutdown requested for the verified project MongoDB instance.');
      return;
    }
    const { serverStatus } = await verifyServer(client);
    // replSetGetStatus is the server command executed by mongosh rs.status().
    const status = await admin.command({ replSetGetStatus: 1 });
    ensure(status.ok === 1 && status.set === 'rs0' && status.members.length === 1 && status.members[0].stateStr === 'PRIMARY', 'rs.status did not report the expected single rs0 PRIMARY.');
    console.log(JSON.stringify({ version: serverStatus.version, pid: serverStatus.pid, replicaSet: status.set, state: status.members[0].stateStr, member: status.members[0].name, statusOk: status.ok }));
    if (action === 'verify') await verifyDatabases();
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  const message = error instanceof SetupError ? error.message : 'Operation failed. Confirm the local server is running and inspect .local/mongodb-logs/mongod.log; no reset was attempted.';
  console.error(`Local MongoDB ${action || 'command'}: ${message}`);
  process.exitCode = 1;
});
