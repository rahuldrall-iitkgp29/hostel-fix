const request = require('supertest');
const { randomUUID } = require('node:crypto');
const { openAuthDatabase } = require('../helpers/auth.helper');
const {
  runTransaction,
  updateWithVersion,
} = require('../../src/utils/transactions');
const {
  hostelInput,
  blockInput,
  roomInput,
  categoryInput,
  attachmentInput,
  policyInput,
  objectId,
} = require('../helpers/models.helper');

describe('complaint creation, idempotency, scoped queries, edits, comments and activity integration tests', () => {
  let authDb;
  let app;
  let student;
  let studentToken;
  let otherStudent;
  let otherStudentToken;
  let staff;
  let staffToken;
  let admin;
  let adminToken;
  let foreignHostel;
  let foreignStudent;
  let foreignStudentToken;

  beforeAll(async () => {
    authDb = await openAuthDatabase();
    app = authDb.app();

    // Ensure hostel policy exists for primary hostel
    await authDb.create(
      'HostelPolicy',
      policyInput({ hostelId: authDb.hostel._id })
    );

    // Create student
    student = await authDb.user({ role: 'STUDENT' });
    const sLogin = await authDb.login(app, student);
    studentToken = sLogin.token;

    // Create second student in same hostel
    otherStudent = await authDb.user({ role: 'STUDENT' });
    const oLogin = await authDb.login(app, otherStudent);
    otherStudentToken = oLogin.token;

    // Create staff in same hostel
    staff = await authDb.user({ role: 'STAFF' });
    const stLogin = await authDb.login(app, staff);
    staffToken = stLogin.token;

    // Create admin scoped to primary hostel
    admin = await authDb.user({
      role: 'ADMIN',
      adminHostelIds: [authDb.hostel._id],
    });
    const aLogin = await authDb.login(app, admin);
    adminToken = aLogin.token;

    // Create foreign hostel and a foreign student
    foreignHostel = await authDb.create('Hostel', hostelInput());
    const foreignBlock = await authDb.create(
      'Block',
      blockInput({ hostelId: foreignHostel._id })
    );
    const foreignRoom = await authDb.create(
      'Room',
      roomInput({ hostelId: foreignHostel._id, blockId: foreignBlock._id })
    );
    await authDb.create(
      'HostelPolicy',
      policyInput({ hostelId: foreignHostel._id })
    );
    foreignStudent = await authDb.user({
      role: 'STUDENT',
      hostelId: foreignHostel._id,
      blockId: foreignBlock._id,
      roomId: foreignRoom._id,
    });
    const fLogin = await authDb.login(app, foreignStudent);
    foreignStudentToken = fLogin.token;
  });

  afterAll(async () => {
    if (authDb) await authDb.close();
  });

  const validPayload = (overrides = {}) => ({
    clientRequestId: randomUUID(),
    title: 'Ceiling fan is vibrating loudly',
    description:
      'The ceiling fan makes an unbearable rattling noise on settings 3 to 5.',
    categoryId: String(authDb.category._id),
    location: {
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
    },
    attachmentIds: [],
    ...overrides,
  });

  test('CMP-T01: create complaint with valid data returns 201 with computed priority and SLA deadlines', async () => {
    const payload = validPayload();
    const res = await request(app)
      .post('/api/v1/complaints')
      .set('Authorization', `Bearer ${studentToken}`)
      .set('Origin', authDb.config.CORS_ORIGIN)
      .set('X-CSRF-Protection', '1')
      .send(payload)
      .expect(201);

    expect(res.body.data.complaint).toMatchObject({
      id: expect.any(String),
      reference: expect.stringMatching(/^HFX-\d{4}-[A-Z0-9]{10}$/),
      title: payload.title,
      status: 'SUBMITTED',
      priority: 'MEDIUM',
      suggestedPriority: 'MEDIUM',
      prioritySource: 'RULE',
      priorityExplanation: 'Loss of functionality was reported.',
      cycleNumber: 1,
      version: 1,
      responseDueAt: expect.any(String),
      resolutionDueAt: expect.any(String),
      isResponseOverdue: false,
      isResolutionOverdue: false,
      allowedActions: expect.arrayContaining(['EDIT', 'COMMENT']),
    });

    // Verify CREATED activity was written
    const act = await authDb.models.Activity.findOne({
      complaintId: res.body.data.complaint.id,
    });
    expect(act).not.toBeNull();
    expect(act.type).toBe('CREATED');
    expect(String(act.actorId)).toBe(String(student._id));
  });

  test('CMP-T02: create with same clientRequestId + same payload returns 200 idempotent replay', async () => {
    const payload = validPayload();

    const first = await request(app)
      .post('/api/v1/complaints')
      .set('Authorization', `Bearer ${studentToken}`)
      .set('Origin', authDb.config.CORS_ORIGIN)
      .set('X-CSRF-Protection', '1')
      .send(payload)
      .expect(201);

    const replay = await request(app)
      .post('/api/v1/complaints')
      .set('Authorization', `Bearer ${studentToken}`)
      .set('Origin', authDb.config.CORS_ORIGIN)
      .set('X-CSRF-Protection', '1')
      .send(payload)
      .expect(200);

    expect(replay.body.data.complaint.id).toBe(first.body.data.complaint.id);
    expect(replay.body.meta.idempotentReplay).toBe(true);
  });

  test('CMP-T03: create with same clientRequestId + different payload returns 409 IDEMPOTENCY_CONFLICT', async () => {
    const clientRequestId = randomUUID();
    const payload1 = validPayload({
      clientRequestId,
      title: 'First complaint title here',
    });
    const payload2 = validPayload({
      clientRequestId,
      title: 'Second completely different title',
    });

    await request(app)
      .post('/api/v1/complaints')
      .set('Authorization', `Bearer ${studentToken}`)
      .set('Origin', authDb.config.CORS_ORIGIN)
      .set('X-CSRF-Protection', '1')
      .send(payload1)
      .expect(201);

    const res = await request(app)
      .post('/api/v1/complaints')
      .set('Authorization', `Bearer ${studentToken}`)
      .set('Origin', authDb.config.CORS_ORIGIN)
      .set('X-CSRF-Protection', '1')
      .send(payload2)
      .expect(409);

    expect(res.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  test('CMP-T04: create with inactive category returns 409 REFERENCE_INACTIVE', async () => {
    const inactiveCategory = await authDb.create(
      'Category',
      categoryInput({
        hostelId: authDb.hostel._id,
        isActive: false,
        code: 'INACTIVE_PLUMBING',
      })
    );

    const res = await request(app)
      .post('/api/v1/complaints')
      .set('Authorization', `Bearer ${studentToken}`)
      .set('Origin', authDb.config.CORS_ORIGIN)
      .set('X-CSRF-Protection', '1')
      .send(validPayload({ categoryId: String(inactiveCategory._id) }))
      .expect(409);

    expect(res.body.error.code).toBe('REFERENCE_INACTIVE');
  });

  test('CMP-T05: create with unauthorized location (wrong hostel) returns 422 INVALID_REFERENCE', async () => {
    const res = await request(app)
      .post('/api/v1/complaints')
      .set('Authorization', `Bearer ${studentToken}`)
      .set('Origin', authDb.config.CORS_ORIGIN)
      .set('X-CSRF-Protection', '1')
      .send(
        validPayload({
          location: {
            type: 'ROOM',
            hostelId: String(foreignHostel._id),
            blockId: String(authDb.block._id),
            roomId: String(authDb.room._id),
          },
        })
      )
      .expect(422);

    expect(res.body.error.code).toBe('INVALID_REFERENCE');
  });

  test('CMP-T06: create with > 3 attachments returns 422 validation error', async () => {
    const res = await request(app)
      .post('/api/v1/complaints')
      .set('Authorization', `Bearer ${studentToken}`)
      .set('Origin', authDb.config.CORS_ORIGIN)
      .set('X-CSRF-Protection', '1')
      .send(
        validPayload({
          attachmentIds: [
            String(objectId()),
            String(objectId()),
            String(objectId()),
            String(objectId()),
          ],
        })
      )
      .expect(422);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('CMP-T07: create with already-bound attachment returns 409 ATTACHMENT_ALREADY_BOUND', async () => {
    const boundAttachment = await authDb.create(
      'Attachment',
      attachmentInput({
        ownerId: student._id,
        complaintId: objectId(),
        expiresAt: null,
      })
    );

    const res = await request(app)
      .post('/api/v1/complaints')
      .set('Authorization', `Bearer ${studentToken}`)
      .set('Origin', authDb.config.CORS_ORIGIN)
      .set('X-CSRF-Protection', '1')
      .send(validPayload({ attachmentIds: [String(boundAttachment._id)] }))
      .expect(409);

    expect(res.body.error.code).toBe('ATTACHMENT_ALREADY_BOUND');
  });

  test('CMP-T08: student edits own SUBMITTED complaint increments version and writes CONTENT_UPDATED activity', async () => {
    const createRes = await request(app)
      .post('/api/v1/complaints')
      .set('Authorization', `Bearer ${studentToken}`)
      .set('Origin', authDb.config.CORS_ORIGIN)
      .set('X-CSRF-Protection', '1')
      .send(validPayload())
      .expect(201);

    const complaintId = createRes.body.data.complaint.id;

    const editRes = await request(app)
      .patch(`/api/v1/complaints/${complaintId}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .set('Origin', authDb.config.CORS_ORIGIN)
      .set('X-CSRF-Protection', '1')
      .send({
        expectedVersion: 1,
        title: 'Updated title: Fan is definitely broken',
        indicators: {
          safetyRisk: true,
          essentialServiceOutage: false,
          affectsMultipleRooms: false,
          functionalityLoss: true,
        },
      })
      .expect(200);

    expect(editRes.body.data.complaint.version).toBe(2);
    expect(editRes.body.data.complaint.title).toBe(
      'Updated title: Fan is definitely broken'
    );
    expect(editRes.body.data.complaint.priority).toBe('HIGH');
    expect(editRes.body.data.activity.type).toBe('CONTENT_UPDATED');
  });

  test('CMP-T09: student cannot edit complaint with stale version (VERSION_CONFLICT) or when not in SUBMITTED (EDIT_WINDOW_CLOSED)', async () => {
    const createRes = await request(app)
      .post('/api/v1/complaints')
      .set('Authorization', `Bearer ${studentToken}`)
      .set('Origin', authDb.config.CORS_ORIGIN)
      .set('X-CSRF-Protection', '1')
      .send(validPayload())
      .expect(201);

    const complaintId = createRes.body.data.complaint.id;

    // Stale version (expectedVersion 99 vs actual 1)
    await request(app)
      .patch(`/api/v1/complaints/${complaintId}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .set('Origin', authDb.config.CORS_ORIGIN)
      .set('X-CSRF-Protection', '1')
      .send({
        expectedVersion: 99,
        title: 'New title with stale version',
      })
      .expect(409);

    // Transition complaint status to TRIAGED in DB
    await runTransaction(authDb.connection, async (session) => {
      await updateWithVersion(authDb.models.Complaint, {
        filter: { _id: complaintId },
        expectedVersion: 1,
        session,
        mutate: (doc) => {
          doc.status = 'TRIAGED';
        },
      });
    });

    // Now edit attempt must return 409 EDIT_WINDOW_CLOSED
    const res = await request(app)
      .patch(`/api/v1/complaints/${complaintId}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .set('Origin', authDb.config.CORS_ORIGIN)
      .set('X-CSRF-Protection', '1')
      .send({
        expectedVersion: 1,
        title: 'New title when already triaged',
      })
      .expect(409);

    expect(res.body.error.code).toBe('EDIT_WINDOW_CLOSED');
  });

  test('CMP-T10 - CMP-T14: list complaints with pagination, status filter, date range, reference search and title substring', async () => {
    const uniqueTitle = `Unique title test ${randomUUID()}`;
    const createRes = await request(app)
      .post('/api/v1/complaints')
      .set('Authorization', `Bearer ${studentToken}`)
      .set('Origin', authDb.config.CORS_ORIGIN)
      .set('X-CSRF-Protection', '1')
      .send(validPayload({ title: uniqueTitle }))
      .expect(201);

    const createdRef = createRes.body.data.complaint.reference;

    // Pagination test (CMP-T10)
    const listRes = await request(app)
      .get('/api/v1/complaints?page=1&limit=5')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);

    expect(listRes.body.data).toBeInstanceOf(Array);
    expect(listRes.body.meta).toMatchObject({
      page: 1,
      limit: 5,
      total: expect.any(Number),
      totalPages: expect.any(Number),
    });

    // Status filter test (CMP-T11)
    const statusRes = await request(app)
      .get('/api/v1/complaints?status=SUBMITTED')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);

    for (const item of statusRes.body.data) {
      expect(item.status).toBe('SUBMITTED');
    }

    // Exact reference search test (CMP-T13)
    const refRes = await request(app)
      .get(`/api/v1/complaints?q=${createdRef}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);

    expect(refRes.body.data.length).toBe(1);
    expect(refRes.body.data[0].reference).toBe(createdRef);

    // Title substring search test (CMP-T14)
    const titleRes = await request(app)
      .get(
        `/api/v1/complaints?q=${encodeURIComponent(uniqueTitle.slice(5, 20))}`
      )
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);

    expect(titleRes.body.data.length).toBeGreaterThanOrEqual(1);
    expect(titleRes.body.data.some((c) => c.title === uniqueTitle)).toBe(true);
  });

  test('CMP-T15: detail shows full projection including allowedActions and currentCycle', async () => {
    const createRes = await request(app)
      .post('/api/v1/complaints')
      .set('Authorization', `Bearer ${studentToken}`)
      .set('Origin', authDb.config.CORS_ORIGIN)
      .set('X-CSRF-Protection', '1')
      .send(validPayload())
      .expect(201);

    const complaintId = createRes.body.data.complaint.id;

    const detailRes = await request(app)
      .get(`/api/v1/complaints/${complaintId}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);

    expect(detailRes.body.data.complaint).toMatchObject({
      id: complaintId,
      description: expect.any(String),
      indicators: expect.any(Object),
      priorityExplanation: expect.any(String),
      currentCycle: expect.objectContaining({
        cycleNumber: 1,
        startedAt: expect.any(String),
      }),
      allowedActions: expect.arrayContaining(['EDIT', 'COMMENT']),
    });
  });

  describe('authorization and scoping tests (AZ-T01 through AZ-T12)', () => {
    let testComplaint;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/v1/complaints')
        .set('Authorization', `Bearer ${studentToken}`)
        .set('Origin', authDb.config.CORS_ORIGIN)
        .set('X-CSRF-Protection', '1')
        .send(validPayload())
        .expect(201);
      testComplaint = res.body.data.complaint;
    });

    test('AZ-T01: student reads own complaint (200)', async () => {
      await request(app)
        .get(`/api/v1/complaints/${testComplaint.id}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);
    });

    test("AZ-T02: student reads other student's complaint returns 404 (not 403)", async () => {
      await request(app)
        .get(`/api/v1/complaints/${testComplaint.id}`)
        .set('Authorization', `Bearer ${otherStudentToken}`)
        .expect(404);
    });

    test('AZ-T04: staff reads unassigned complaint in same hostel returns 404', async () => {
      await request(app)
        .get(`/api/v1/complaints/${testComplaint.id}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(404);
    });

    test('AZ-T03: staff reads assigned complaint returns 200', async () => {
      // Assign staff in DB
      await runTransaction(authDb.connection, async (session) => {
        await updateWithVersion(authDb.models.Complaint, {
          filter: { _id: testComplaint.id },
          expectedVersion: testComplaint.version,
          session,
          mutate: (doc) => {
            doc.assigneeId = staff._id;
            doc.status = 'ASSIGNED';
          },
        });
      });

      await request(app)
        .get(`/api/v1/complaints/${testComplaint.id}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);
    });

    test('AZ-T05: admin reads complaint in scoped hostel returns 200', async () => {
      await request(app)
        .get(`/api/v1/complaints/${testComplaint.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    test('AZ-T06: admin reads complaint in non-scoped hostel returns 404', async () => {
      // Foreign student creates complaint in foreign hostel
      const foreignCategory = await authDb.create(
        'Category',
        categoryInput({ hostelId: foreignHostel._id, code: 'FOREIGN_ELEC' })
      );

      const fRes = await request(app)
        .post('/api/v1/complaints')
        .set('Authorization', `Bearer ${foreignStudentToken}`)
        .set('Origin', authDb.config.CORS_ORIGIN)
        .set('X-CSRF-Protection', '1')
        .send(
          validPayload({
            categoryId: String(foreignCategory._id),
            location: {
              type: 'ROOM',
              hostelId: String(foreignHostel._id),
              blockId: String(foreignStudent.blockId),
              roomId: String(foreignStudent.roomId),
            },
          })
        )
        .expect(201);

      await request(app)
        .get(`/api/v1/complaints/${fRes.body.data.complaint.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    test('AZ-T12: student attempts staff-only filter (assigneeId) returns 422', async () => {
      await request(app)
        .get(`/api/v1/complaints?assigneeId=${staff._id}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(422);
    });
  });

  describe('comments and activity timeline tests', () => {
    let commentComplaint;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/v1/complaints')
        .set('Authorization', `Bearer ${studentToken}`)
        .set('Origin', authDb.config.CORS_ORIGIN)
        .set('X-CSRF-Protection', '1')
        .send(validPayload())
        .expect(201);
      commentComplaint = res.body.data.complaint;
    });

    test('post comment adds comment, increments version, and writes COMMENT_ADDED activity', async () => {
      const res = await request(app)
        .post(`/api/v1/complaints/${commentComplaint.id}/comments`)
        .set('Authorization', `Bearer ${studentToken}`)
        .set('Origin', authDb.config.CORS_ORIGIN)
        .set('X-CSRF-Protection', '1')
        .send({
          expectedVersion: 1,
          body: 'The noise has gotten louder this morning.',
        })
        .expect(201);

      expect(res.body.data.complaint.version).toBe(2);
      expect(res.body.data.comment.body).toBe(
        'The noise has gotten louder this morning.'
      );
      expect(res.body.data.activity.type).toBe('COMMENT_ADDED');
    });

    test('post comment with stale version returns 409 VERSION_CONFLICT', async () => {
      await request(app)
        .post(`/api/v1/complaints/${commentComplaint.id}/comments`)
        .set('Authorization', `Bearer ${studentToken}`)
        .set('Origin', authDb.config.CORS_ORIGIN)
        .set('X-CSRF-Protection', '1')
        .send({
          expectedVersion: 1, // Now at version 2
          body: 'Another comment with old version',
        })
        .expect(409);
    });

    test('get comments returns paginated comments ordered by createdAt', async () => {
      const res = await request(app)
        .get(
          `/api/v1/complaints/${commentComplaint.id}/comments?page=1&limit=10`
        )
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0]).toMatchObject({
        id: expect.any(String),
        body: expect.any(String),
        author: expect.objectContaining({
          id: String(student._id),
          role: 'STUDENT',
        }),
      });
    });

    test('get activity returns paginated timeline ordered by occurredAt', async () => {
      const res = await request(app)
        .get(
          `/api/v1/complaints/${commentComplaint.id}/activity?page=1&limit=10`
        )
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
      expect(res.body.data[0].type).toBe('CREATED');
      expect(res.body.data[1].type).toBe('COMMENT_ADDED');
    });
  });
});
