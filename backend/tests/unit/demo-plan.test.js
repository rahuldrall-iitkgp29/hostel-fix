const { randomUUID } = require('node:crypto');
const { makePlan, DOMAINS } = require('../../seeds/demo-plan');
const { guardTarget } = require('../../seeds/ownership');
const { LOCAL_DEV_URI } = require('../../seeds/ownership');
test('demo plan fulfills the required allocation and history distribution', () => {
  const now = new Date('2026-11-19T12:00:00Z');
  const plan = makePlan(randomUUID(), now);
  expect(plan.hostels).toHaveLength(3);
  expect(plan.wings).toHaveLength(12);
  expect(plan.students).toHaveLength(84);
  expect(plan.admins).toHaveLength(2);
  expect(plan.staff).toHaveLength(15);
  for (const wing of plan.wings)
    expect(
      plan.students.filter((user) => String(user.blockId) === String(wing._id))
    ).toHaveLength(7);
  for (const domain of DOMAINS)
    expect(
      plan.staff.filter((user) => user.domain === domain.code)
    ).toHaveLength(3);
  expect(new Set(plan.students.map((user) => user.email)).size).toBe(84);
  expect(new Set(plan.complaints.map((doc) => doc.title)).size).toBe(84);
  expect(
    plan.complaints.filter((doc) =>
      ['RESOLVED', 'CLOSED'].includes(doc.targetStatus)
    )
  ).toHaveLength(67);
  expect(
    plan.complaints.every(
      (doc) => +doc.createdAt <= +now && +doc.createdAt >= +now - 90 * 86400000
    )
  ).toBe(true);
  expect(
    new Set(
      plan.complaints
        .filter((doc) => ['ASSIGNED', 'IN_PROGRESS'].includes(doc.targetStatus))
        .map((doc) => String(doc.staff._id))
    ).size
  ).toBe(15);
});
test('demo target guard rejects production, remote databases and alternate database names', () => {
  expect(() =>
    guardTarget({ NODE_ENV: 'production', MONGODB_URI: LOCAL_DEV_URI })
  ).toThrow('production');
  for (const uri of [
    'mongodb+srv://remote.invalid/hostelfix',
    'mongodb://127.0.0.1:27017/user_data?replicaSet=rs0',
  ])
    expect(() =>
      guardTarget({ NODE_ENV: 'development', MONGODB_URI: uri })
    ).toThrow('restricted');
  expect(
    guardTarget({ NODE_ENV: 'development', MONGODB_URI: LOCAL_DEV_URI })
  ).toBe(LOCAL_DEV_URI);
});
