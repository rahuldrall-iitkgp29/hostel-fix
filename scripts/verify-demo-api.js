const assert = require('node:assert/strict');
const request = require('supertest');
const { randomUUID } = require('node:crypto');
const { configuration } = require('./project-config');
async function main() {
  const settings = configuration();
  if (settings.production)
    throw new Error('Demo API verification refuses production.');
  const { loadEnv } = require('../backend/src/config/env');
  const { createDatabase } = require('../backend/src/config/database');
  const { createModels } = require('../backend/src/models');
  const { createApp } = require('../backend/src/app');
  const { localOwner, credentials } = require('../backend/seeds/demo');
  const {
    cleanupOwned,
    verifyConnection,
  } = require('../backend/seeds/ownership');
  const {
    hashPassword,
    hashEnrollmentCode,
  } = require('../backend/src/utils/hashUtils');
  const config = loadEnv({ source: settings.childEnv });
  const database = createDatabase(config);
  const temporary = [];
  try {
    await database.connect();
    await verifyConnection(config, database);
    const models = createModels(database.connection);
    const owner = await localOwner(database, { create: false });
    const passwords = await credentials({}, { create: false });
    const app = createApp({ config, database });
    const mutation = (method, path, token) =>
      request(app)
        [method](`/api/v1${path}`)
        .set('Origin', config.CORS_ORIGIN)
        .set('X-CSRF-Protection', '1')
        .set('Authorization', token ? `Bearer ${token}` : '');
    const read = (path, token) =>
      request(app)
        .get(`/api/v1${path}`)
        .set('Authorization', `Bearer ${token}`);
    const users = await models.User.find({ demoSeedOwner: owner }).lean();
    const students = users
      .filter((user) => user.role === 'STUDENT')
      .sort((a, b) => a.email.localeCompare(b.email));
    const staff = users.filter((user) => user.role === 'STAFF');
    const admins = users.filter((user) => user.role === 'ADMIN');
    const tokens = new Map();
    const samples = [
      ...students.filter((_user, index) => index % 7 === 0),
      ...staff,
      ...admins,
    ];
    for (const user of samples) {
      const login = await mutation('post', '/auth/login')
        .send({
          email: user.email,
          password: passwords[user.role.toLowerCase()],
        })
        .expect(200);
      assert.equal(login.body.data.user.role, user.role);
      assert.equal(login.body.data.user.mustChangePassword, false);
      tokens.set(String(user._id), login.body.data.accessToken);
      if (user.role === 'STUDENT') {
        const dashboard = await read(
          '/dashboard/student',
          login.body.data.accessToken
        ).expect(200);
        assert.equal(
          dashboard.body.data.total,
          await models.Complaint.countDocuments({ ownerId: user._id })
        );
        assert.ok(dashboard.body.data.latestActivity.length > 0);
      } else if (user.role === 'STAFF') {
        const data = (
          await read('/dashboard/staff', login.body.data.accessToken).expect(
            200
          )
        ).body.data;
        assert.equal(
          data.total,
          await models.Complaint.countDocuments({
            assigneeId: user._id,
            hostelId: user.hostelId,
          })
        );
        assert.equal(data.queue.length, 1);
        assert.ok(data.resolutionHistory.length > 0);
        assert.ok(data.latestActivity.length > 0);
      } else {
        const data = (
          await read('/dashboard/admin', login.body.data.accessToken).expect(
            200
          )
        ).body.data;
        assert.equal(data.total, 84);
        assert.equal(data.open, 17);
        assert.equal(data.hostelBreakdown.length, 3);
        assert.equal(
          Object.values(data.priorityCounts).reduce(
            (sum, value) => sum + value,
            0
          ),
          84
        );
        assert.equal(
          data.hostelBreakdown.reduce((sum, entry) => sum + entry.total, 0),
          84
        );
        assert.ok(data.recentActivity.length > 0);
        for (const entry of data.staffWorkload) {
          assert.equal(
            entry.openAssigned,
            await models.Complaint.countDocuments({
              assigneeId: entry.staffId,
              status: { $in: ['ASSIGNED', 'IN_PROGRESS'] },
            })
          );
        }
        for (const hostel of data.hostelBreakdown)
          assert.equal(
            hostel.total,
            await models.Complaint.countDocuments({ hostelId: hostel.hostelId })
          );
      }
    }
    let complaint = await models.Complaint.findOne({
      demoSeedOwner: owner,
      status: 'SUBMITTED',
    }).lean();
    const adminToken = tokens.get(String(admins[0]._id));
    const eligible = (
      await read(
        `/admin/staff?hostelId=${complaint.hostelId}&eligibleForComplaintId=${complaint._id}`,
        adminToken
      ).expect(200)
    ).body.data;
    assert.equal(eligible.length, 1);
    const staffToken = tokens.get(eligible[0].id);
    const foreignStaff = staff.find(
      (user) => String(user.hostelId) !== String(complaint.hostelId)
    );
    await read(
      `/complaints/${complaint._id}`,
      tokens.get(String(foreignStaff._id))
    ).expect(404);
    const originalVersion = complaint.version;
    const action = async (path, data, token) => {
      complaint = (
        await mutation(
          'post',
          `/complaints/${complaint._id || complaint.id}/${path}`,
          token
        )
          .send({ expectedVersion: complaint.version, ...data })
          .expect(200)
      ).body.data.complaint;
    };
    await action(
      'priority',
      {
        priority: 'HIGH',
        reason: 'Administrator confirmed urgent demo maintenance.',
      },
      adminToken
    );
    await action(
      'transitions',
      {
        toStatus: 'TRIAGED',
        note: 'Verified the location and approved the repair request.',
      },
      adminToken
    );
    await mutation('post', `/complaints/${complaint.id}/assignment`, adminToken)
      .send({
        expectedVersion: originalVersion,
        staffId: eligible[0].id,
        note: 'Stale assignment must be rejected.',
      })
      .expect(409);
    await action(
      'assignment',
      {
        staffId: eligible[0].id,
        note: 'Assigned to the eligible specialist in this hostel.',
      },
      adminToken
    );
    await action(
      'transitions',
      {
        toStatus: 'IN_PROGRESS',
        note: 'Technician inspected the issue and began repairs.',
      },
      staffToken
    );
    await action(
      'transitions',
      {
        toStatus: 'RESOLVED',
        resolutionNote:
          'Replaced the faulty fitting and confirmed normal operation with the resident.',
      },
      staffToken
    );
    const studentToken = tokens.get(String(complaint.owner.id));
    assert.ok(studentToken);
    await action(
      'transitions',
      {
        toStatus: 'CLOSED',
        note: 'Resident confirmed that the repair works correctly.',
      },
      studentToken
    );
    await mutation('post', `/complaints/${complaint.id}/feedback`, studentToken)
      .send({
        expectedVersion: complaint.version,
        rating: 5,
        comment: 'Prompt and effective repair.',
      })
      .expect(201);
    const own = (await read('/dashboard/admin', adminToken).expect(200)).body
      .data;
    assert.equal(own.open, 16);
    assert.equal(own.closed, 46);

    // An unmarked admin referencing a demo hostel must block cleanup atomically.
    const blocker = new models.User({
      name: 'External scope sentinel',
      email: `scope-${randomUUID()}@example.test`,
      passwordHash: await hashPassword(randomUUID()),
      role: 'ADMIN',
      adminHostelIds: [users.find((user) => user.role === 'STUDENT').hostelId],
    });
    await blocker.save();
    temporary.push([models.User, blocker._id]);
    await assert.rejects(
      () => cleanupOwned({ config, database, models, owner }),
      /Non-demo User/
    );
    assert.equal(
      await models.Complaint.countDocuments({ demoSeedOwner: owner }),
      84
    );
    await models.User.collection.deleteOne({
      _id: blocker._id,
      demoSeedOwner: { $exists: false },
    });
    temporary.pop();

    const hostel = new models.Hostel({
      name: 'Preservation sentinel',
      code: `KEEP-${randomUUID().replaceAll('-', '').slice(0, 12)}`,
      enrollmentCodeHash: await hashEnrollmentCode(randomUUID()),
    });
    await hostel.save();
    temporary.push([models.Hostel, hostel._id]);
    const before = await models.Hostel.collection.findOne({ _id: hostel._id });
    const removed = await cleanupOwned({ config, database, models, owner });
    assert.ok(removed > 900);
    assert.equal(await cleanupOwned({ config, database, models, owner }), 0);
    assert.deepEqual(
      await models.Hostel.collection.findOne({ _id: hostel._id }),
      before
    );
    await models.Hostel.collection.deleteOne({
      _id: hostel._id,
      demoSeedOwner: { $exists: false },
    });
    temporary.pop();
    console.log(
      'PASS: 12 student, 15 staff and both admin logins; scoped dashboards match database counts; real priority/triage/assignment/resolution/closure/feedback APIs; cleanup rejects external references, preserves unrelated records and is idempotent.'
    );
    console.log(
      'Demo was safely cleaned for this verification. Run npm run seed to restore the initial distribution.'
    );
  } finally {
    for (const [Model, id] of temporary)
      await Model.collection.deleteOne({
        _id: id,
        demoSeedOwner: { $exists: false },
      });
    await database.disconnect();
  }
}
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
module.exports = { main };
