const request = require('supertest');
const { randomUUID } = require('node:crypto');
const { openAuthDatabase } = require('../helpers/auth.helper');
const {
  hostelInput,
  categoryInput,
  policyInput,
} = require('../helpers/models.helper');
const {
  runTransaction,
  updateWithVersion,
} = require('../../src/utils/transactions');

describe('Dashboard and SLA Integration Tests (Session 9: DB-T01 to DB-T04)', () => {
  let authDb;
  let app;
  let student1;
  let student1Token;
  let student2;
  let student2Token;
  let staff1;
  let staff1Token;
  let staff2;
  let staff2Token;
  let admin;
  let adminToken;
  let foreignHostel;
  let foreignCategory;
  let foreignStudent;
  let foreignStudentToken;
  let foreignAdmin;
  let foreignAdminToken;

  function mutationHeaders(token) {
    return {
      Authorization: `Bearer ${token}`,
      Origin: authDb.config.CORS_ORIGIN,
      'X-CSRF-Protection': '1',
    };
  }

  function readHeaders(token) {
    return {
      Authorization: `Bearer ${token}`,
    };
  }

  async function createComplaint(token, overrides = {}) {
    const payload = {
      clientRequestId: randomUUID(),
      title: overrides.title || 'Water tap leaking in washroom',
      description:
        overrides.description ||
        'Continuous dripping causing floor waterlogging and wastage',
      categoryId: overrides.categoryId
        ? String(overrides.categoryId)
        : String(authDb.category._id),
      location: overrides.location || {
        type: 'ROOM',
        hostelId: String(authDb.hostel._id),
        blockId: String(authDb.block._id),
        roomId: String(authDb.room._id),
      },
      indicators: {
        safetyRisk: false,
        essentialServiceOutage: false,
        affectsMultipleRooms: false,
        functionalityLoss: true,
        ...(overrides.indicators || {}),
      },
      attachmentIds: overrides.attachmentIds || [],
    };

    const res = await request(app)
      .post('/api/v1/complaints')
      .set(mutationHeaders(token))
      .send(payload);

    expect(res.status).toBe(201);
    return res.body.data.complaint;
  }

  beforeAll(async () => {
    authDb = await openAuthDatabase();
    app = authDb.app();

    // Ensure hostel policy exists for primary hostel
    await authDb.create(
      'HostelPolicy',
      policyInput({ hostelId: authDb.hostel._id })
    );

    // Primary student
    student1 = await authDb.user({ role: 'STUDENT' });
    const s1Login = await authDb.login(app, student1);
    student1Token = s1Login.token;

    // Second student in same hostel
    student2 = await authDb.user({ role: 'STUDENT' });
    const s2Login = await authDb.login(app, student2);
    student2Token = s2Login.token;

    // Staff member 1 with primary category
    staff1 = await authDb.user({
      role: 'STAFF',
      categoryIds: [authDb.category._id],
    });
    const st1Login = await authDb.login(app, staff1);
    staff1Token = st1Login.token;

    // Staff member 2 with primary category
    staff2 = await authDb.user({
      role: 'STAFF',
      categoryIds: [authDb.category._id],
    });
    const st2Login = await authDb.login(app, staff2);
    staff2Token = st2Login.token;

    // Admin scoped to primary hostel
    admin = await authDb.user({
      role: 'ADMIN',
      adminHostelIds: [authDb.hostel._id],
    });
    const aLogin = await authDb.login(app, admin);
    adminToken = aLogin.token;

    // Foreign hostel with admin and student
    foreignHostel = await authDb.create('Hostel', hostelInput());
    await authDb.create(
      'HostelPolicy',
      policyInput({ hostelId: foreignHostel._id })
    );
    foreignCategory = await authDb.create(
      'Category',
      categoryInput({ hostelId: foreignHostel._id })
    );

    foreignStudent = await authDb.user({
      role: 'STUDENT',
      hostelId: foreignHostel._id,
    });
    const fsLogin = await authDb.login(app, foreignStudent);
    foreignStudentToken = fsLogin.token;

    foreignAdmin = await authDb.user({
      role: 'ADMIN',
      adminHostelIds: [foreignHostel._id],
    });
    const faLogin = await authDb.login(app, foreignAdmin);
    foreignAdminToken = faLogin.token;
  });

  afterAll(async () => {
    await authDb?.close();
  });

  describe('Authorization and role gating', () => {
    test('unauthenticated requests return 401', async () => {
      const resStudent = await request(app).get('/api/v1/dashboard/student');
      expect(resStudent.status).toBe(401);

      const resStaff = await request(app).get('/api/v1/dashboard/staff');
      expect(resStaff.status).toBe(401);

      const resAdmin = await request(app).get('/api/v1/dashboard/admin');
      expect(resAdmin.status).toBe(401);
    });

    test('STUDENT cannot access staff or admin dashboard (403)', async () => {
      const resStaff = await request(app)
        .get('/api/v1/dashboard/staff')
        .set(readHeaders(student1Token));
      expect(resStaff.status).toBe(403);
      expect(resStaff.body.error.code).toBe('FORBIDDEN');

      const resAdmin = await request(app)
        .get('/api/v1/dashboard/admin')
        .set(readHeaders(student1Token));
      expect(resAdmin.status).toBe(403);
      expect(resAdmin.body.error.code).toBe('FORBIDDEN');
    });

    test('STAFF cannot access student or admin dashboard (403)', async () => {
      const resStudent = await request(app)
        .get('/api/v1/dashboard/student')
        .set(readHeaders(staff1Token));
      expect(resStudent.status).toBe(403);
      expect(resStudent.body.error.code).toBe('FORBIDDEN');

      const resAdmin = await request(app)
        .get('/api/v1/dashboard/admin')
        .set(readHeaders(staff1Token));
      expect(resAdmin.status).toBe(403);
      expect(resAdmin.body.error.code).toBe('FORBIDDEN');
    });

    test('ADMIN cannot access student or staff dashboard (403)', async () => {
      const resStudent = await request(app)
        .get('/api/v1/dashboard/student')
        .set(readHeaders(adminToken));
      expect(resStudent.status).toBe(403);
      expect(resStudent.body.error.code).toBe('FORBIDDEN');

      const resStaff = await request(app)
        .get('/api/v1/dashboard/staff')
        .set(readHeaders(adminToken));
      expect(resStaff.status).toBe(403);
      expect(resStaff.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('DB-T01: Student dashboard returns own status counts and recent activity', () => {
    test('returns own status counts, recent complaints, latest activity, and excludes other students', async () => {
      // Student 1 creates a complaint
      const c1 = await createComplaint(student1Token, {
        title: 'Student 1 fan not working',
      });

      // Student 2 creates a complaint
      const c2 = await createComplaint(student2Token, {
        title: 'Student 2 light broken',
      });

      // Student 1 fetches dashboard
      const res = await request(app)
        .get('/api/v1/dashboard/student')
        .set(readHeaders(student1Token));

      expect(res.status).toBe(200);
      const data = res.body.data;

      expect(data).toHaveProperty('asOf');
      expect(data).toHaveProperty('statusCounts');
      expect(data).toHaveProperty('total');
      expect(data).toHaveProperty('open');
      expect(data).toHaveProperty('resolved');
      expect(data).toHaveProperty('closed');
      expect(data).toHaveProperty('rejected');
      expect(data).toHaveProperty('recentComplaints');
      expect(data).toHaveProperty('latestActivity');

      // Invariant: total = open + resolved + closed + rejected
      expect(data.total).toBe(
        data.open + data.resolved + data.closed + data.rejected
      );

      // Student 1's complaint should be in recentComplaints
      const s1Ids = data.recentComplaints.map((c) => c.id);
      expect(s1Ids).toContain(c1.id);
      expect(s1Ids).not.toContain(c2.id); // Student 2's complaint must NOT appear

      // Recent complaints length <= 5
      expect(data.recentComplaints.length).toBeLessThanOrEqual(5);

      // Latest activity length <= 10
      expect(data.latestActivity.length).toBeLessThanOrEqual(10);
      for (const act of data.latestActivity) {
        expect(act.complaintId).toBe(c1.id); // Only student 1's complaint activity
      }
    });
  });

  describe('DB-T02: Staff dashboard returns assigned work queue sorted correctly', () => {
    test('returns assigned pending, in progress, overdue counts, and correctly sorted work queue', async () => {
      // Admin triages and assigns multiple complaints to staff1 with different priorities / deadlines
      const comp1 = await createComplaint(student1Token, {
        title: 'Normal priority complaint for staff1',
        indicators: {
          safetyRisk: false,
          essentialServiceOutage: false,
          affectsMultipleRooms: false,
          functionalityLoss: false,
        },
      });
      const comp2 = await createComplaint(student1Token, {
        title: 'High priority complaint for staff1',
        indicators: {
          safetyRisk: false,
          essentialServiceOutage: true,
          affectsMultipleRooms: false,
          functionalityLoss: true,
        },
      });

      // Triage comp1
      const tr1 = await request(app)
        .post(`/api/v1/complaints/${comp1.id}/transitions`)
        .set(mutationHeaders(adminToken))
        .send({
          toStatus: 'TRIAGED',
          expectedVersion: comp1.version,
          note: 'Triaged normal',
        });
      expect(tr1.status).toBe(200);

      // Assign comp1 to staff1
      const assignRes1 = await request(app)
        .post(`/api/v1/complaints/${comp1.id}/assignment`)
        .set(mutationHeaders(adminToken))
        .send({
          staffId: String(staff1._id),
          expectedVersion: comp1.version + 1,
          note: 'Assign to staff 1',
        });
      expect(assignRes1.status).toBe(200);

      // Triage comp2
      const tr2 = await request(app)
        .post(`/api/v1/complaints/${comp2.id}/transitions`)
        .set(mutationHeaders(adminToken))
        .send({
          toStatus: 'TRIAGED',
          expectedVersion: comp2.version,
          note: 'Triaged high',
        });
      expect(tr2.status).toBe(200);

      // Assign comp2 to staff1
      const assignRes2 = await request(app)
        .post(`/api/v1/complaints/${comp2.id}/assignment`)
        .set(mutationHeaders(adminToken))
        .send({
          staffId: String(staff1._id),
          expectedVersion: comp2.version + 1,
          note: 'Assign high to staff 1',
        });
      expect(assignRes2.status).toBe(200);

      // Staff1 fetches their dashboard
      const res = await request(app)
        .get('/api/v1/dashboard/staff')
        .set(readHeaders(staff1Token));

      expect(res.status).toBe(200);
      const data = res.body.data;

      expect(data).toHaveProperty('asOf');
      expect(data).toHaveProperty('statusCounts');
      expect(data).toHaveProperty('total');
      expect(data).toHaveProperty('assignedPending');
      expect(data).toHaveProperty('inProgress');
      expect(data).toHaveProperty('overdueResponse');
      expect(data).toHaveProperty('overdueResolution');
      expect(data).toHaveProperty('overdueAny');
      expect(data).toHaveProperty('queue');

      expect(data.assignedPending).toBeGreaterThanOrEqual(2);
      expect(data.queue.length).toBeLessThanOrEqual(10);

      // Verify queue contains assigned complaints
      const queueIds = data.queue.map((q) => q.id);
      expect(queueIds).toContain(comp1.id);
      expect(queueIds).toContain(comp2.id);

      // Verify work queue ordering (§15.4):
      // Higher priority (comp2) should appear before lower priority (comp1) when neither is overdue
      const idx1 = queueIds.indexOf(comp1.id);
      const idx2 = queueIds.indexOf(comp2.id);
      expect(idx2).toBeLessThan(idx1);
    });

    test('staff work queue places overdue complaints before non-overdue', async () => {
      // Create a complaint and artificially backdate its resolutionDueAt to make it overdue
      const overdueComp = await createComplaint(student1Token, {
        title: 'Overdue plumbing issue',
      });
      const tr = await request(app)
        .post(`/api/v1/complaints/${overdueComp.id}/transitions`)
        .set(mutationHeaders(adminToken))
        .send({
          toStatus: 'TRIAGED',
          expectedVersion: overdueComp.version,
          note: 'Triaged by admin helper.',
        });
      expect(tr.status).toBe(200);

      const asg = await request(app)
        .post(`/api/v1/complaints/${overdueComp.id}/assignment`)
        .set(mutationHeaders(adminToken))
        .send({
          staffId: String(staff1._id),
          expectedVersion: overdueComp.version + 1,
          note: 'Assigned to staff 1 for overdue testing.',
        });
      expect(asg.status).toBe(200);

      // Directly update the complaint in DB to simulate overdue SLA
      const mongoose = require('mongoose');
      const pastDate = new Date(Date.now() - 3600000); // 1 hour ago
      await authDb.connection
        .collection('complaints')
        .updateOne(
          { _id: new mongoose.Types.ObjectId(overdueComp.id) },
          { $set: { resolutionDueAt: pastDate } }
        );

      const res = await request(app)
        .get('/api/v1/dashboard/staff')
        .set(readHeaders(staff1Token));

      expect(res.status).toBe(200);
      const data = res.body.data;
      expect(data.overdueResolution).toBeGreaterThanOrEqual(1);
      expect(data.overdueAny).toBeGreaterThanOrEqual(1);

      // The overdue complaint should be at the very top of the queue
      expect(data.queue[0].id).toBe(overdueComp.id);
      expect(data.queue[0].isResolutionOverdue).toBe(true);
    });
  });

  describe('DB-T03: Admin dashboard returns scoped hostel counts and staff workload', () => {
    test('admin dashboard returns scoped counts and staff workload without foreign hostel leak', async () => {
      // Foreign student creates a complaint in foreign hostel
      const foreignComp = await createComplaint(foreignStudentToken, {
        title: 'Foreign hostel complaint',
        categoryId: foreignCategory._id,
        location: {
          type: 'HOSTEL_COMMON',
          hostelId: String(foreignHostel._id),
          areaLabel: 'Main lobby entrance',
        },
      });

      // Primary admin fetches dashboard
      const res = await request(app)
        .get('/api/v1/dashboard/admin')
        .set(readHeaders(adminToken));

      expect(res.status).toBe(200);
      const data = res.body.data;

      expect(data).toHaveProperty('asOf');
      expect(data).toHaveProperty('statusCounts');
      expect(data).toHaveProperty('total');
      expect(data).toHaveProperty('open');
      expect(data).toHaveProperty('resolved');
      expect(data).toHaveProperty('closed');
      expect(data).toHaveProperty('rejected');
      expect(data).toHaveProperty('unassigned');
      expect(data).toHaveProperty('overdueResponse');
      expect(data).toHaveProperty('overdueResolution');
      expect(data).toHaveProperty('overdueAny');
      expect(data).toHaveProperty('staffWorkload');
      expect(data).toHaveProperty('recentComplaints');

      // Invariant: total = open + resolved + closed + rejected
      expect(data.total).toBe(
        data.open + data.resolved + data.closed + data.rejected
      );

      // Foreign complaint must NOT appear in recentComplaints
      const recentIds = data.recentComplaints.map((c) => c.id);
      expect(recentIds).not.toContain(foreignComp.id);

      // Staff workload should include staff1 and staff2, with correct shape
      expect(Array.isArray(data.staffWorkload)).toBe(true);
      const staffIds = data.staffWorkload.map((s) => s.staffId);
      expect(staffIds).toContain(String(staff1._id));
      expect(staffIds).toContain(String(staff2._id));

      for (const entry of data.staffWorkload) {
        expect(entry).toHaveProperty('staffId');
        expect(entry).toHaveProperty('name');
        expect(entry).toHaveProperty('assignedPending');
        expect(entry).toHaveProperty('inProgress');
        expect(entry).toHaveProperty('openAssigned');
        expect(entry.openAssigned).toBe(
          entry.assignedPending + entry.inProgress
        );
      }
    });

    test('admin can filter by specific permitted hostelId', async () => {
      const res = await request(app)
        .get(`/api/v1/dashboard/admin?hostelId=${authDb.hostel._id}`)
        .set(readHeaders(adminToken));

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('total');
    });

    test('admin filtering by non-permitted hostelId returns 404', async () => {
      const res = await request(app)
        .get(`/api/v1/dashboard/admin?hostelId=${foreignHostel._id}`)
        .set(readHeaders(adminToken));

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('DB-T04: Dashboard with date filters and validation', () => {
    test('counts reflect filtered range with inclusive createdFrom and exclusive createdTo', async () => {
      const t0 = new Date();
      // Wait 50ms so timestamps are distinct
      await new Promise((r) => setTimeout(r, 50));

      const compInRange = await createComplaint(student1Token, {
        title: 'Complaint in time range',
      });

      await new Promise((r) => setTimeout(r, 50));
      const t1 = new Date();
      await new Promise((r) => setTimeout(r, 50));

      const compAfterRange = await createComplaint(student1Token, {
        title: 'Complaint after time range',
      });

      // Request student dashboard with createdFrom=t0 and createdTo=t1
      const res = await request(app)
        .get(
          `/api/v1/dashboard/student?createdFrom=${encodeURIComponent(t0.toISOString())}&createdTo=${encodeURIComponent(t1.toISOString())}`
        )
        .set(readHeaders(student1Token));

      expect(res.status).toBe(200);
      const data = res.body.data;
      const recentIds = data.recentComplaints.map((c) => c.id);
      expect(recentIds).toContain(compInRange.id);
      expect(recentIds).not.toContain(compAfterRange.id);
    });

    test('createdTo before createdFrom returns 422 VALIDATION_ERROR', async () => {
      const now = new Date();
      const past = new Date(Date.now() - 86400000);

      const res = await request(app)
        .get(
          `/api/v1/dashboard/student?createdFrom=${encodeURIComponent(now.toISOString())}&createdTo=${encodeURIComponent(past.toISOString())}`
        )
        .set(readHeaders(student1Token));

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('date range exceeding 366 days returns 422 VALIDATION_ERROR', async () => {
      const from = new Date('2024-01-01T00:00:00.000Z');
      const to = new Date('2025-02-05T00:00:00.000Z'); // > 366 days

      const res = await request(app)
        .get(
          `/api/v1/dashboard/admin?createdFrom=${encodeURIComponent(from.toISOString())}&createdTo=${encodeURIComponent(to.toISOString())}`
        )
        .set(readHeaders(adminToken));

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('category and priority filters correctly filter admin dashboard', async () => {
      const res = await request(app)
        .get(
          `/api/v1/dashboard/admin?categoryId=${authDb.category._id}&priority=HIGH`
        )
        .set(readHeaders(adminToken));

      expect(res.status).toBe(200);
      const data = res.body.data;
      expect(data).toHaveProperty('statusCounts');
      for (const comp of data.recentComplaints) {
        expect(comp.priority).toBe('HIGH');
      }
    });
  });
});
