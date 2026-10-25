const request = require('supertest');
const { openAuthDatabase } = require('../helpers/auth.helper');
const {
  hostelInput,
  blockInput,
  roomInput,
  categoryInput,
} = require('../helpers/models.helper');

describe('catalog and admin staff integration tests', () => {
  let authDb;
  let app;

  beforeAll(async () => {
    authDb = await openAuthDatabase();
    app = authDb.app();
  });

  afterAll(async () => {
    if (authDb) await authDb.close();
  });

  describe('public catalog endpoints', () => {
    test('GET /api/v1/catalog/hostels lists active hostels with pagination', async () => {
      const res = await request(app)
        .get('/api/v1/catalog/hostels?page=1&limit=10')
        .expect(200);

      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.meta).toMatchObject({
        page: 1,
        limit: 10,
        total: expect.any(Number),
        totalPages: expect.any(Number),
        requestId: expect.any(String),
      });

      for (const item of res.body.data) {
        expect(item).toHaveProperty('id');
        expect(item).toHaveProperty('name');
        expect(item).toHaveProperty('code');
        expect(item).not.toHaveProperty('enrollmentCodeHash');
      }
    });

    test('GET /api/v1/catalog/hostels/:hostelId/blocks returns embedded active blocks', async () => {
      const res = await request(app)
        .get(`/api/v1/catalog/hostels/${authDb.hostel._id}/blocks`)
        .expect(200);

      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0]).toMatchObject({
        id: String(authDb.block._id),
        name: expect.any(String),
        code: expect.any(String),
      });

      // 404 for unknown hostel
      await request(app)
        .get('/api/v1/catalog/hostels/670000000000000000000999/blocks')
        .expect(404);
    });

    test('GET /api/v1/catalog/rooms lists rooms for matching active parent references', async () => {
      const res = await request(app)
        .get(
          `/api/v1/catalog/rooms?hostelId=${authDb.hostel._id}&blockId=${authDb.block._id}`
        )
        .expect(200);

      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data[0]).toMatchObject({
        id: String(authDb.room._id),
        hostelId: String(authDb.hostel._id),
        blockId: String(authDb.block._id),
        label: expect.any(String),
      });
      // No occupants or occupancy data exposed
      expect(res.body.data[0]).not.toHaveProperty('occupants');
      expect(res.body.data[0]).not.toHaveProperty('studentId');

      // 404 for mismatched or missing parent block
      await request(app)
        .get(
          `/api/v1/catalog/rooms?hostelId=${authDb.hostel._id}&blockId=670000000000000000000999`
        )
        .expect(404);
    });
  });

  describe('authenticated category endpoints', () => {
    test('GET /api/v1/categories requires authentication', async () => {
      await request(app)
        .get(`/api/v1/categories?hostelId=${authDb.hostel._id}`)
        .expect(401);
    });

    test('student and staff can read categories in their own hostel only', async () => {
      const student = await authDb.user({ role: 'STUDENT' });
      const { token: studentToken } = await authDb.login(app, student);

      const res = await request(app)
        .get(`/api/v1/categories?hostelId=${authDb.hostel._id}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect(res.body.data).toBeInstanceOf(Array);
      expect(
        res.body.data.some((c) => c.id === String(authDb.category._id))
      ).toBe(true);

      // Student reading another hostel gets 404
      await request(app)
        .get('/api/v1/categories?hostelId=670000000000000000000888')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(404);
    });

    test('non-admin cannot request includeInactive=true', async () => {
      const student = await authDb.user({ role: 'STUDENT' });
      const { token } = await authDb.login(app, student);

      await request(app)
        .get(
          `/api/v1/categories?hostelId=${authDb.hostel._id}&includeInactive=true`
        )
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    test('admin can read categories in scoped hostel and include inactive categories', async () => {
      const admin = await authDb.user({
        role: 'ADMIN',
        adminHostelIds: [authDb.hostel._id],
      });
      const { token: adminToken } = await authDb.login(app, admin);

      const res = await request(app)
        .get(
          `/api/v1/categories?hostelId=${authDb.hostel._id}&includeInactive=true`
        )
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data).toBeInstanceOf(Array);

      // Admin reading non-scoped hostel gets 404
      await request(app)
        .get('/api/v1/categories?hostelId=670000000000000000000777')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  describe('admin staff picker endpoints (P0 §9.6)', () => {
    test('GET /api/v1/admin/staff is forbidden for student and staff', async () => {
      const student = await authDb.user({ role: 'STUDENT' });
      const { token: studentToken } = await authDb.login(app, student);

      await request(app)
        .get(`/api/v1/admin/staff?hostelId=${authDb.hostel._id}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(403);

      const staff = await authDb.user({ role: 'STAFF' });
      const { token: staffToken } = await authDb.login(app, staff);

      await request(app)
        .get(`/api/v1/admin/staff?hostelId=${authDb.hostel._id}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(403);
    });

    test('admin lists staff in scoped hostel with openAssignedCount and email', async () => {
      const admin = await authDb.user({
        role: 'ADMIN',
        adminHostelIds: [authDb.hostel._id],
      });
      const staffUser = await authDb.user({
        role: 'STAFF',
        categoryIds: [authDb.category._id],
      });
      const { token } = await authDb.login(app, admin);

      const res = await request(app)
        .get(`/api/v1/admin/staff?hostelId=${authDb.hostel._id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data).toBeInstanceOf(Array);
      const found = res.body.data.find((s) => s.id === String(staffUser._id));
      expect(found).toBeDefined();
      expect(found).toMatchObject({
        id: String(staffUser._id),
        name: staffUser.name,
        email: staffUser.email,
        hostelId: String(authDb.hostel._id),
        status: 'ACTIVE',
        openAssignedCount: expect.any(Number),
      });

      // Out of scope hostel returns 404
      await request(app)
        .get('/api/v1/admin/staff?hostelId=670000000000000000000666')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });
});
