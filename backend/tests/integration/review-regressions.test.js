const request = require('supertest');
const { randomUUID } = require('node:crypto');
const { openAuthDatabase } = require('../helpers/auth.helper');
const {
  createComplaintService,
} = require('../../src/services/complaint.service');
const { createSessionService } = require('../../src/services/session.service');
const { verifyAccessToken } = require('../../src/utils/tokens');

describe('review regressions against owned MongoDB', () => {
  let fixture;
  let app;
  let student;
  let token;
  let payload;
  beforeAll(async () => {
    fixture = await openAuthDatabase();
    app = fixture.app();
    student = await fixture.user();
    ({ token } = await fixture.login(app, student));
    payload = {
      title: 'Broken ceiling fan switch',
      description:
        'The ceiling fan switch no longer works and needs replacement.',
      categoryId: String(fixture.category._id),
      location: {
        type: 'ROOM',
        hostelId: String(fixture.hostel._id),
        blockId: String(fixture.block._id),
        roomId: String(fixture.room._id),
      },
      indicators: {
        safetyRisk: false,
        essentialServiceOutage: false,
        affectsMultipleRooms: false,
        functionalityLoss: true,
      },
      attachmentIds: [],
      clientRequestId: randomUUID(),
    };
  });
  afterAll(async () => {
    await fixture?.close();
  });
  const create = (body) =>
    fixture
      .post(app, '/api/v1/complaints')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  test.each([1, 2, 3, 4, 5])(
    'concurrent duplicate submissions return one complaint and an idempotent replay (run %s)',
    async () => {
      const body = { ...payload, clientRequestId: randomUUID() };
      const responses = await Promise.all([create(body), create(body)]);
      expect(responses.map((res) => res.status).sort()).toEqual([200, 201]);
      expect(responses[0].body.data.complaint.id).toBe(
        responses[1].body.data.complaint.id
      );
      const documents = await fixture.models.Complaint.find({
        ownerId: student._id,
        clientRequestId: body.clientRequestId,
      });
      expect(documents).toHaveLength(1);
      for (const doc of documents)
        fixture.track(fixture.models.Complaint, { _id: doc._id });
      const activities = await fixture.models.Activity.find({
        complaintId: documents[0]._id,
      });
      for (const doc of activities)
        fixture.track(fixture.models.Activity, { _id: doc._id });
      expect(activities).toHaveLength(1);
    }
  );
  test('revocation after middleware authorization prevents a complaint mutation', async () => {
    const stale = await fixture.models.User.findById(student._id);
    stale.$locals.authClaims = verifyAccessToken(token, fixture.config);
    const sessions = createSessionService({
      models: fixture.models,
      connection: fixture.connection,
    });
    await sessions.logout({ claims: stale.$locals.authClaims });
    const service = createComplaintService({
      models: fixture.models,
      connection: fixture.connection,
      sessions,
    });
    const body = { ...payload, clientRequestId: randomUUID() };
    await expect(service.createComplaint(stale, body)).rejects.toMatchObject({
      status: 401,
    });
    expect(
      await fixture.models.Complaint.countDocuments({
        clientRequestId: body.clientRequestId,
      })
    ).toBe(0);
    await request(app)
      .get('/api/v1/complaints')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });
});
