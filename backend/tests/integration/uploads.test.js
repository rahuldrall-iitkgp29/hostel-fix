const request = require('supertest');
const { openAuthDatabase } = require('../helpers/auth.helper');
const { attachmentInput, objectId } = require('../helpers/models.helper');

const validPng = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082', 'hex');
const validJpeg = Buffer.from('ffd8ffe000104a46494600010101004800480000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffc0000b080001000101011100ffc4001f0000010501010101010100000000000000000102030405060708090a0bffda0008010100003f007f00ffd9', 'hex');

describe('uploads and attachment authorization integration tests', () => {
  let authDb;
  let app;
  let student;
  let studentToken;
  let otherStudent;
  let otherToken;
  let staff;
  let staffToken;

  beforeAll(async () => {
    authDb = await openAuthDatabase();
    app = authDb.app();

    student = await authDb.user({ role: 'STUDENT' });
    const sLogin = await authDb.login(app, student);
    studentToken = sLogin.token;

    otherStudent = await authDb.user({ role: 'STUDENT' });
    const oLogin = await authDb.login(app, otherStudent);
    otherToken = oLogin.token;

    staff = await authDb.user({ role: 'STAFF' });
    const staffLogin = await authDb.login(app, staff);
    staffToken = staffLogin.token;
  });

  afterAll(async () => {
    if (authDb) await authDb.close();
  });

  test('UP-T01: student uploads valid PNG ≤ 5 MiB', async () => {
    const res = await request(app)
      .post('/api/v1/uploads')
      .set('Authorization', `Bearer ${studentToken}`)
      .set('Origin', authDb.config.CORS_ORIGIN)
      .set('X-CSRF-Protection', '1')
      .attach('file', validPng, 'broken-fan.png')
      .expect(201);

    expect(res.body.data).toMatchObject({
      attachment: {
        id: expect.stringMatching(/^[a-f\d]{24}$/),
        originalName: 'broken-fan.png',
        mimeType: 'image/png',
        sizeBytes: validPng.length,
        width: 1,
        height: 1,
        url: expect.stringMatching(/^\/api\/v1\/uploads\/[a-f\d]{24}\/content$/),
      },
      expiresAt: expect.any(String),
    });

    const attachmentId = res.body.data.attachment.id;

    // UP-T05: stream attachment content as authorized owner
    const streamRes = await request(app)
      .get(`/api/v1/uploads/${attachmentId}/content`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);

    expect(streamRes.headers['content-type']).toBe('image/png');
    expect(streamRes.headers['cache-control']).toBe('private, no-store');
    expect(streamRes.headers['x-content-type-options']).toBe('nosniff');
    expect(streamRes.body).toEqual(validPng);

    // UP-T06: stream attachment as unauthorized user returns 404
    await request(app)
      .get(`/api/v1/uploads/${attachmentId}/content`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404);

    // UP-T07: delete unattached upload by owner
    await request(app)
      .delete(`/api/v1/uploads/${attachmentId}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .set('Origin', authDb.config.CORS_ORIGIN)
      .set('X-CSRF-Protection', '1')
      .expect(204);

    // Subsequent retrieval is 404
    await request(app)
      .get(`/api/v1/uploads/${attachmentId}/content`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(404);
  });

  test('UP-T02: upload non-image file with fake MIME returns 415', async () => {
    const fakeFile = Buffer.from('Just plain text inside');
    const res = await request(app)
      .post('/api/v1/uploads')
      .set('Authorization', `Bearer ${studentToken}`)
      .set('Origin', authDb.config.CORS_ORIGIN)
      .set('X-CSRF-Protection', '1')
      .attach('file', fakeFile, { filename: 'test.jpg', contentType: 'image/jpeg' })
      .expect(415);

    expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  test('UP-T03: upload oversized file returns 413', async () => {
    const bigFile = Buffer.alloc(5 * 1024 * 1024 + 1024);
    const res = await request(app)
      .post('/api/v1/uploads')
      .set('Authorization', `Bearer ${studentToken}`)
      .set('Origin', authDb.config.CORS_ORIGIN)
      .set('X-CSRF-Protection', '1')
      .attach('file', bigFile, 'huge.jpg')
      .expect(413);

    expect(res.body.error.code).toBe('FILE_TOO_LARGE');
  });

  test('non-student (staff) cannot stage uploads', async () => {
    await request(app)
      .post('/api/v1/uploads')
      .set('Authorization', `Bearer ${staffToken}`)
      .set('Origin', authDb.config.CORS_ORIGIN)
      .set('X-CSRF-Protection', '1')
      .attach('file', validJpeg, 'photo.jpg')
      .expect(403);
  });

  test('UP-T04: student cannot exceed quota of 10 unattached uploads', async () => {
    const quotaStudent = await authDb.user({ role: 'STUDENT' });
    const { token: quotaToken } = await authDb.login(app, quotaStudent);

    // Seed 10 unattached attachments directly into database
    for (let i = 0; i < 10; i++) {
      await authDb.create('Attachment', attachmentInput({ ownerId: quotaStudent._id, complaintId: null }));
    }

    // 11th upload attempt via HTTP must fail with 409 UPLOAD_QUOTA_EXCEEDED
    const quotaRes = await request(app)
      .post('/api/v1/uploads')
      .set('Authorization', `Bearer ${quotaToken}`)
      .set('Origin', authDb.config.CORS_ORIGIN)
      .set('X-CSRF-Protection', '1')
      .attach('file', validPng, 'excess.png')
      .expect(409);

    expect(quotaRes.body.error.code).toBe('UPLOAD_QUOTA_EXCEEDED');
  });

  test('UP-T08: deleting a bound upload returns 409 ATTACHMENT_ALREADY_BOUND', async () => {
    const boundStudent = await authDb.user({ role: 'STUDENT' });
    const { token: boundToken } = await authDb.login(app, boundStudent);
    const fakeComplaintId = objectId();

    const boundAttachment = await authDb.create('Attachment', attachmentInput({
      ownerId: boundStudent._id,
      complaintId: fakeComplaintId,
      expiresAt: null,
    }));

    const res = await request(app)
      .delete(`/api/v1/uploads/${boundAttachment._id}`)
      .set('Authorization', `Bearer ${boundToken}`)
      .set('Origin', authDb.config.CORS_ORIGIN)
      .set('X-CSRF-Protection', '1')
      .expect(409);

    expect(res.body.error.code).toBe('ATTACHMENT_ALREADY_BOUND');
  });
});
