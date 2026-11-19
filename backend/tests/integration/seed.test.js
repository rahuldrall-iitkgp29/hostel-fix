const { seedDatabase } = require('../../seeds/index');
const { randomUUID } = require('node:crypto');
const { resetDatabase } = require('../../seeds/reset');
const { createDatabase } = require('../../src/config/database');
const { parseEnv } = require('../../src/config/env');
const { createModels } = require('../../src/models');
const {
  verifyPassword,
  verifyEnrollmentCode,
} = require('../../src/utils/hashUtils');
const { verifyLocalTestServer } = require('../helpers/database.helper');
const { testEnv } = require('../helpers/env.helper');

describe('seed and reset integration tests', () => {
  let config;
  let database;
  let models;

  beforeAll(async () => {
    const uri = await verifyLocalTestServer();
    config = parseEnv(testEnv({ TEST_MONGODB_URI: uri }));
    database = createDatabase(config);
    await database.connect();
    models = createModels(database.connection, {
      collectionPrefix: `seed_${randomUUID().replaceAll('-', '')}_`,
    });
  });

  afterAll(async () => {
    if (database) {
      await verifyLocalTestServer();
      if (database.connection.$legacySeedOwner) {
        await require('../../seeds/ownership').cleanupOwned({
          config,
          database,
          models,
          owner: database.connection.$legacySeedOwner,
          fixture: true,
        });
        await database.connection.db
          .collection(require('../../src/models/demoOwnership').REGISTRY)
          .deleteOne({ _id: database.connection.$legacySeedOwner });
      }
      await database.disconnect();
    }
  });

  test('seedDatabase creates all PRD Â§18 reference data, accounts and sample complaints', async () => {
    const result = await seedDatabase({ config, database, models });

    expect(result.hostel.code).toBe('HOSTEL-A');
    expect(result.hostel.name).toBe('Hostel A');
    const hostelDoc = await models.Hostel.findOne({ code: 'HOSTEL-A' }).select(
      '+enrollmentCodeHash'
    );
    expect(
      await verifyEnrollmentCode(
        'ENROLL-HOSTEL-A-2026',
        hostelDoc.enrollmentCodeHash
      )
    ).toBe(true);

    // Blocks
    expect(result.blocks).toHaveLength(2);
    expect(result.blocks.map((b) => b.code).sort()).toEqual(['ALPHA', 'BETA']);

    // Rooms
    expect(result.rooms).toHaveLength(5);
    const roomLabels = result.rooms.map((r) => r.label).sort();
    expect(roomLabels).toEqual(['A-101', 'A-102', 'A-103', 'B-201', 'B-202']);

    // Categories
    expect(result.categories).toHaveLength(5);
    const catCodes = result.categories.map((c) => c.code).sort();
    expect(catCodes).toEqual([
      'CIVIL',
      'CLEANING',
      'ELECTRICAL',
      'FURNITURE',
      'PLUMBING',
    ]);

    // Policy
    expect(result.policy.policyVersion).toBe(1);
    expect(result.policy.slaTargets.CRITICAL.responseMinutes).toBe(120);

    // Accounts
    const ashaDoc = await models.User.findOne({
      email: 'student.a@hostelfix.demo',
    }).select('+passwordHash');
    expect(ashaDoc.role).toBe('STUDENT');
    expect(ashaDoc.mustChangePassword).toBe(false);
    expect(await verifyPassword('DemoStudent@2026', ashaDoc.passwordHash)).toBe(
      true
    );

    const raviDoc = await models.User.findOne({
      email: 'staff.r@hostelfix.demo',
    }).select('+passwordHash');
    expect(raviDoc.role).toBe('STAFF');
    expect(raviDoc.mustChangePassword).toBe(true);
    expect(await verifyPassword('DemoStaff@2026!', raviDoc.passwordHash)).toBe(
      true
    );

    const priyaDoc = await models.User.findOne({
      email: 'admin.p@hostelfix.demo',
    }).select('+passwordHash');
    expect(priyaDoc.role).toBe('ADMIN');
    expect(priyaDoc.mustChangePassword).toBe(false);
    expect(await verifyPassword('DemoAdmin@2026!', priyaDoc.passwordHash)).toBe(
      true
    );

    // Sample complaints
    expect(result.complaints).toHaveLength(3);
    const c1 = await models.Complaint.findOne({
      reference: 'HFX-2026-FAN0000001',
    });
    expect(c1.status).toBe('ASSIGNED');
    expect(c1.priority).toBe('MEDIUM');
    const c1Activities = await models.Activity.find({
      complaintId: c1._id,
    }).sort({ occurredAt: 1 });
    expect(c1Activities.map((a) => a.type)).toEqual([
      'CREATED',
      'TRIAGED',
      'ASSIGNED',
    ]);

    const c2 = await models.Complaint.findOne({
      reference: 'HFX-2026-LEAK000002',
    });
    expect(c2.status).toBe('SUBMITTED');
    expect(c2.priority).toBe('HIGH');

    const c3 = await models.Complaint.findOne({
      reference: 'HFX-2026-DESK000003',
    });
    expect(c3.status).toBe('CLOSED');
    expect(c3.priority).toBe('LOW');
    const fb = await models.Feedback.findOne({ complaintId: c3._id });
    expect(fb.rating).toBe(5);
    expect(fb.comment).toBe('Quick fix!');
  });

  test('seedDatabase is idempotent when run repeatedly', async () => {
    // Running second time should not throw or duplicate
    await expect(
      seedDatabase({ config, database, models })
    ).resolves.toBeDefined();

    const hostelCount = await models.Hostel.countDocuments({
      code: 'HOSTEL-A',
    });
    expect(hostelCount).toBe(1);

    const userCount = await models.User.countDocuments({
      email: 'student.a@hostelfix.demo',
    });
    expect(userCount).toBe(1);
  });

  test('resetDatabase removes only manifest-owned fixture records and re-seeds cleanly', async () => {
    const result = await resetDatabase({ config, database });
    expect(result.hostel.code).toBe('HOSTEL-A');
    expect(result.complaints).toHaveLength(3);

    const count = await models.Hostel.countDocuments();
    expect(count).toBe(1);
  });
});
