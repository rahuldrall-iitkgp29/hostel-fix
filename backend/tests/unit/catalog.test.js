const {
  hostelListQuery,
  hostelBlocksParams,
  roomsQuery,
  categoriesQuery,
  adminStaffQuery,
} = require('../../src/validators/catalog.validators');
const { guardResetTarget, LOCAL_DEV_URI } = require('../../seeds/reset');
const { LOCAL_TEST_URI } = require('../../src/config/testDatabase');

const validId = '670000000000000000000101';
const anotherId = '670000000000000000000201';

describe('catalog and admin staff validator unit tests', () => {
  test('hostelListQuery validates valid pagination and defaults', () => {
    const parsed = hostelListQuery.parse({});
    expect(parsed).toEqual({ page: 1, limit: 20 });

    const custom = hostelListQuery.parse({ page: '2', limit: '50' });
    expect(custom).toEqual({ page: 2, limit: 50 });

    expect(() => hostelListQuery.parse({ page: 0 })).toThrow();
    expect(() => hostelListQuery.parse({ limit: 101 })).toThrow();
    expect(() => hostelListQuery.parse({ unknown: 'key' })).toThrow();
  });

  test('hostelBlocksParams validates 24-hex ID', () => {
    const parsed = hostelBlocksParams.parse({ hostelId: validId });
    expect(parsed.hostelId).toBe(validId);

    expect(() =>
      hostelBlocksParams.parse({ hostelId: 'invalid-id' })
    ).toThrow();
    expect(() => hostelBlocksParams.parse({})).toThrow();
  });

  test('roomsQuery requires hostelId and blockId', () => {
    const parsed = roomsQuery.parse({ hostelId: validId, blockId: anotherId });
    expect(parsed).toEqual({
      hostelId: validId,
      blockId: anotherId,
      page: 1,
      limit: 20,
    });

    expect(() => roomsQuery.parse({ hostelId: validId })).toThrow();
    expect(() => roomsQuery.parse({ blockId: anotherId })).toThrow();
    expect(() =>
      roomsQuery.parse({ hostelId: validId, blockId: anotherId, extra: 1 })
    ).toThrow();
  });

  test('categoriesQuery parses includeInactive boolean and defaults to false', () => {
    const defaultParsed = categoriesQuery.parse({ hostelId: validId });
    expect(defaultParsed).toEqual({
      hostelId: validId,
      includeInactive: false,
      page: 1,
      limit: 20,
    });

    const trueParsed = categoriesQuery.parse({
      hostelId: validId,
      includeInactive: 'true',
    });
    expect(trueParsed.includeInactive).toBe(true);

    const falseParsed = categoriesQuery.parse({
      hostelId: validId,
      includeInactive: 'false',
    });
    expect(falseParsed.includeInactive).toBe(false);

    expect(() =>
      categoriesQuery.parse({ hostelId: validId, includeInactive: 'yes' })
    ).toThrow();
  });

  test('adminStaffQuery parses optional filters and rejects unknown keys', () => {
    const minimal = adminStaffQuery.parse({ hostelId: validId });
    expect(minimal).toEqual({ hostelId: validId, page: 1, limit: 20 });

    const full = adminStaffQuery.parse({
      hostelId: validId,
      categoryId: anotherId,
      status: 'ACTIVE',
      eligibleForComplaintId: '670000000000000000000501',
      page: 3,
      limit: 10,
    });
    expect(full.status).toBe('ACTIVE');
    expect(full.categoryId).toBe(anotherId);
    expect(full.eligibleForComplaintId).toBe('670000000000000000000501');

    expect(() =>
      adminStaffQuery.parse({ hostelId: validId, status: 'UNKNOWN' })
    ).toThrow();
    expect(() =>
      adminStaffQuery.parse({ hostelId: validId, unknown: true })
    ).toThrow();
  });
});

describe('seed reset safety guard unit tests', () => {
  test('rejects reset in production environment', () => {
    expect(() =>
      guardResetTarget({
        NODE_ENV: 'production',
        MONGODB_URI: LOCAL_DEV_URI,
      })
    ).toThrow(/strictly forbidden in production/);
  });

  test('rejects remote or non-local URIs', () => {
    expect(() =>
      guardResetTarget({
        NODE_ENV: 'development',
        MONGODB_URI: 'mongodb+srv://admin:pass@cluster.mongodb.net/hostelfix',
      })
    ).toThrow(/strictly restricted to local development or test/);

    expect(() =>
      guardResetTarget({
        NODE_ENV: 'test',
        TEST_MONGODB_URI:
          'mongodb://10.0.0.1:27017/hostelfix_test?replicaSet=rs0',
      })
    ).toThrow(/TEST_MONGODB_URI/);
  });

  test('accepts verified local test and dev URIs', () => {
    expect(
      guardResetTarget({
        NODE_ENV: 'test',
        TEST_MONGODB_URI: LOCAL_TEST_URI,
      })
    ).toBe(LOCAL_TEST_URI);

    expect(
      guardResetTarget({
        NODE_ENV: 'development',
        MONGODB_URI: LOCAL_DEV_URI,
      })
    ).toBe(LOCAL_DEV_URI);
  });
});
