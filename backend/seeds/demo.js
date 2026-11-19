const { randomUUID, createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createModels, ensureIndexes } = require('../src/models');
const { hashPassword, hashEnrollmentCode } = require('../src/utils/hashUtils');
const { password } = require('../src/validators/common.validators');
const { register } = require('../src/validators/auth.validators');
const { runTransaction } = require('../src/utils/transactions');
const { REGISTRY, PROJECT_ROOT } = require('../src/models/demoOwnership');
const {
  createRegistry,
  verifyConnection,
  cleanupOwned,
} = require('./ownership');
const { makePlan, DOMAINS } = require('./demo-plan');
const DIRECTORY = path.join(PROJECT_ROOT, '.local/demo');

async function credentials(
  source = process.env,
  { create = true, persist = create } = {}
) {
  await fs.mkdir(DIRECTORY, { recursive: true });
  const file = path.join(DIRECTORY, 'credentials.json');
  let saved;
  try {
    saved = JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (!create)
      throw new Error(
        'Local demo credentials are missing. Reset the demo to generate valid new passwords.'
      );
    saved = {};
  }
  const result = {};
  for (const role of ['student', 'staff', 'admin', 'enrollment']) {
    if (!create && typeof saved[role] !== 'string')
      throw new Error(
        `Local demo credentials are missing the ${role} password. Reset the demo to generate valid credentials.`
      );
    const value =
      source[`HOSTELFIX_DEMO_${role.toUpperCase()}_PASSWORD`] ||
      saved[role] ||
      `Demo-${role}-${randomUUID()}`;
    if (
      typeof value !== 'string' ||
      value.length < 12 ||
      !(
        role === 'enrollment' ? register.shape.enrollmentCode : password
      ).safeParse(value).success
    )
      throw new Error(
        `HOSTELFIX_DEMO_${role.toUpperCase()}_PASSWORD must match the application's password/enrollment validation (minimum 12 characters).`
      );
    result[role] = value;
  }
  if (persist)
    await fs.writeFile(file, JSON.stringify(result, null, 2), { mode: 0o600 });
  return result;
}
async function localOwner(database, { create = true } = {}) {
  await fs.mkdir(DIRECTORY, { recursive: true });
  const file = path.join(DIRECTORY, 'owner.json');
  try {
    const record = JSON.parse(await fs.readFile(file, 'utf8'));
    if (
      record.projectRoot !== PROJECT_ROOT ||
      record.database !== database.connection.name ||
      record.port !== database.connection.getClient().options.hosts[0].port
    )
      throw new Error(
        'Local demo ownership does not match this checkout/database.'
      );
    return record.owner;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (!create)
      throw new Error(
        'Local demo ownership is missing; refusing to claim database records.'
      );
    if (
      await database.connection.db
        .collection(REGISTRY)
        .findOne({ projectRoot: PROJECT_ROOT, kind: 'demo-v2' })
    )
      throw new Error(
        'Database demo manifest exists but local ownership is missing. Refusing to claim it.'
      );
    const owner = randomUUID();
    await fs.writeFile(
      file,
      JSON.stringify(
        {
          owner,
          projectRoot: PROJECT_ROOT,
          database: database.connection.name,
          port: database.connection.getClient().options.hosts[0].port,
        },
        null,
        2
      ),
      { flag: 'wx', mode: 0o600 }
    );
    return owner;
  }
}
async function saveNew(Model, data, owner, session) {
  const existing = await Model.collection.findOne(
    { _id: data._id },
    { session }
  );
  if (existing) {
    if (existing.demoSeedOwner !== owner)
      throw new Error('A planned seed ID belongs to unrelated data.');
    return Model.findById(data._id).select('+demoSeedOwner').session(session);
  }
  const doc = new Model({ ...data, demoSeedOwner: owner });
  await doc.save({ session, timestamps: false });
  return doc;
}
async function seedComplaint(models, input, owner, session) {
  const existing = await models.Complaint.collection.findOne(
    { _id: input._id },
    { session }
  );
  if (existing) {
    if (existing.demoSeedOwner !== owner)
      throw new Error('Complaint ID belongs to unrelated data.');
    return;
  }
  const { targetStatus, staff, student, admin, index, ...data } = input;
  const doc = await saveNew(
    models.Complaint,
    { ...data, status: 'SUBMITTED' },
    owner,
    session
  );
  const activity = async (
    type,
    actor,
    time,
    previousStatus,
    newStatus,
    note,
    changes = null
  ) => {
    await new models.Activity({
      demoSeedOwner: owner,
      complaintId: doc._id,
      type,
      actorId: actor._id,
      actorName: actor.name,
      actorRole: actor.role,
      occurredAt: time,
      createdAt: time,
      updatedAt: time,
      previousStatus,
      newStatus,
      note,
      changes,
    }).save({ session, timestamps: false });
  };
  await activity('CREATED', student, doc.createdAt, null, 'SUBMITTED', null);
  const commentAt = new Date(+doc.createdAt + 15 * 60_000);
  await new models.Comment({
    demoSeedOwner: owner,
    complaintId: doc._id,
    authorId: student._id,
    authorName: student.name,
    authorRole: student.role,
    body: `The issue is affecting normal use of ${data.location.type === 'ROOM' ? 'our room' : 'the shared area'}. Please contact me before visiting.`,
    createdAt: commentAt,
    updatedAt: commentAt,
  }).save({ session, timestamps: false });
  doc.updatedAt = commentAt;
  await doc.save({ session, timestamps: false });
  await activity(
    'COMMENT_ADDED',
    student,
    commentAt,
    'SUBMITTED',
    'SUBMITTED',
    'Student supplied access details.'
  );
  if (targetStatus === 'SUBMITTED') return;
  const triagedAt = new Date(+doc.createdAt + 60 * 60_000);
  doc.status = 'TRIAGED';
  doc.firstRespondedAt = triagedAt;
  doc.updatedAt = triagedAt;
  await doc.save({ session, timestamps: false });
  await activity(
    'TRIAGED',
    admin,
    triagedAt,
    'SUBMITTED',
    'TRIAGED',
    'Hostel office verified the location and repair category.'
  );
  if (targetStatus === 'TRIAGED') return;
  const assignedAt = new Date(+doc.createdAt + 2 * 60 * 60_000);
  doc.status = 'ASSIGNED';
  doc.assigneeId = staff._id;
  doc.updatedAt = assignedAt;
  await doc.save({ session, timestamps: false });
  await activity(
    'ASSIGNED',
    admin,
    assignedAt,
    'TRIAGED',
    'ASSIGNED',
    `Assigned to ${staff.name} for ${staff.domain.toLowerCase()} work.`,
    { previousAssigneeId: null, assigneeId: String(staff._id) }
  );
  if (targetStatus === 'ASSIGNED') return;
  const startedAt = new Date(+doc.createdAt + 3 * 60 * 60_000);
  doc.status = 'IN_PROGRESS';
  doc.workStartedAt = startedAt;
  doc.updatedAt = startedAt;
  await doc.save({ session, timestamps: false });
  await activity(
    'WORK_STARTED',
    staff,
    startedAt,
    'ASSIGNED',
    'IN_PROGRESS',
    'Inspected the reported problem and began repair.'
  );
  if (targetStatus === 'IN_PROGRESS') return;
  const resolvedAt = new Date(
    +doc.createdAt + (5 + (index % 44)) * 60 * 60_000
  );
  doc.status = 'RESOLVED';
  doc.resolvedAt = resolvedAt;
  doc.resolverId = staff._id;
  doc.resolutionNote = `Completed ${staff.domain.toLowerCase()} maintenance for: ${doc.title}. Replaced or repaired the affected component, tested normal use and explained the result to the resident.`;
  doc.reopenUntil = new Date(+resolvedAt + 7 * 86_400_000);
  doc.updatedAt = resolvedAt;
  await doc.save({ session, timestamps: false });
  await activity(
    'RESOLVED',
    staff,
    resolvedAt,
    'IN_PROGRESS',
    'RESOLVED',
    doc.resolutionNote
  );
  if (targetStatus === 'RESOLVED') return;
  const closedAt = new Date(+resolvedAt + (6 + (index % 18)) * 60 * 60_000);
  doc.status = 'CLOSED';
  doc.closedAt = closedAt;
  doc.updatedAt = closedAt;
  await doc.save({ session, timestamps: false });
  await activity(
    'CLOSED',
    student,
    closedAt,
    'RESOLVED',
    'CLOSED',
    'Resident checked the repair and confirmed that the issue was fixed.'
  );
  const feedbackAt = new Date(+closedAt + 30 * 60_000);
  const rating = index % 4 === 0 ? 4 : 5;
  const comment =
    'Repair completed properly and the technician explained the work.';
  await new models.Feedback({
    demoSeedOwner: owner,
    complaintId: doc._id,
    authorId: student._id,
    rating,
    comment,
    cycleNumber: 1,
    isCurrent: true,
    createdAt: feedbackAt,
    updatedAt: feedbackAt,
  }).save({ session, timestamps: false });
  doc.updatedAt = feedbackAt;
  await doc.save({ session, timestamps: false });
  await activity(
    'FEEDBACK_SUBMITTED',
    student,
    feedbackAt,
    'CLOSED',
    'CLOSED',
    null,
    { rating, comment }
  );
}
async function summary(models, owner) {
  const result = { owner, counts: {}, statuses: {} };
  for (const [name, Model] of Object.entries(models))
    result.counts[name] = await Model.countDocuments({ demoSeedOwner: owner });
  for (const row of await models.Complaint.aggregate([
    { $match: { demoSeedOwner: owner } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]))
    result.statuses[row._id] = row.count;
  result.students = await models.User.countDocuments({
    demoSeedOwner: owner,
    role: 'STUDENT',
  });
  result.admins = await models.User.countDocuments({
    demoSeedOwner: owner,
    role: 'ADMIN',
  });
  result.staff = await models.User.countDocuments({
    demoSeedOwner: owner,
    role: 'STAFF',
  });
  result.finished =
    (result.statuses.RESOLVED ?? 0) + (result.statuses.CLOSED ?? 0);
  result.open = result.counts.Complaint - result.finished;
  return result;
}
async function writeDocumentation(plan, passwords, result) {
  const lines = [
    '# HostelFix local demo',
    '',
    '> Development only. These generated passwords are not production credentials.',
    '> This file is local-only and ignored by Git. Never deploy the demo accounts.',
    '',
    `Generated for ${plan.generatedAt.toISOString()}.`,
    '',
    '## Structure',
    '',
    '3 hostels, 4 wings each (12 wings), 7 students per wing (84 students), 48 rooms.',
    '2 administrators cover all 3 hostels. Each of 5 domains has 3 staff, one per hostel.',
    '',
    'Hostels: Tagore Residency, Sarojini Hall, Vivekananda House.',
    'Wings in each hostel: East, West, North, South.',
    '',
    '## Passwords and enrollment',
    '',
    `Student password: \`${passwords.student}\``,
    `Staff password: \`${passwords.staff}\``,
    `Administrator password: \`${passwords.admin}\``,
    `Demo enrollment code: \`${passwords.enrollment}\``,
    '',
    'Override before reset with HOSTELFIX_DEMO_STUDENT_PASSWORD, HOSTELFIX_DEMO_STAFF_PASSWORD, HOSTELFIX_DEMO_ADMIN_PASSWORD or HOSTELFIX_DEMO_ENROLLMENT_PASSWORD.',
    '',
    'Sign in at http://localhost:3000/login after npm run dev.',
    '',
    '## Administrators',
    '',
    '| Name | Email |',
    '| --- | --- |',
    ...plan.admins.map((user) => `| ${user.name} | ${user.email} |`),
    '',
    '## Staff by domain',
    '',
  ];
  for (const domain of DOMAINS)
    lines.push(
      `### ${domain.name}`,
      '',
      '| Name | Email | Hostel |',
      '| --- | --- | --- |',
      ...plan.staff
        .filter((user) => user.domain === domain.code)
        .map(
          (user) =>
            `| ${user.name} | ${user.email} | ${plan.hostels.find((hostel) => String(hostel._id) === String(user.hostelId)).name} |`
        ),
      ''
    );
  lines.push(
    '## Students',
    '',
    '| Name | Email | Hostel | Wing | Room |',
    '| --- | --- | --- | --- | --- |',
    ...plan.students.map(
      (user) =>
        `| ${user.name} | ${user.email} | ${plan.hostels.find((hostel) => String(hostel._id) === String(user.hostelId)).name} | ${plan.wings.find((wing) => String(wing._id) === String(user.blockId)).name} | ${plan.rooms.find((room) => String(room._id) === String(user.roomId)).label} |`
    ),
    '',
    '## Complaints',
    '',
    `Current owned complaints: ${result.counts.Complaint}; resolved/closed: ${result.finished}; unresolved: ${result.open}.`,
    'Initial distribution: 45 CLOSED, 22 RESOLVED, 8 ASSIGNED, 7 IN_PROGRESS, 1 TRIAGED, 1 SUBMITTED.',
    'Dates span roughly the past 84 days; open work is recent. Each staff member starts with one open job.',
    '',
    '## Commands',
    '',
    '- npm run dev: start the complete local application.',
    '- npm run seed: repeatable seed; existing ready demo data is preserved.',
    '- npm run demo:clean: remove only manifest-owned demo data.',
    '- npm run reset:demo: safe cleanup and regeneration with fresh relative dates.',
    '- npm run demo:verify: validate demo relationships, dates and counts.',
    '- npm run demo:logins: regenerate this local login document.',
    '',
    'Cleanup aborts if local/server/manifest ownership is missing, markers disagree, or unrelated records reference demo data. Unmarked legacy demo data is never adopted or deleted.',
    ''
  );
  await fs.writeFile(path.join(PROJECT_ROOT, 'DEMO.md'), lines.join('\n'), {
    mode: 0o600,
  });
  await fs.writeFile(
    path.join(DIRECTORY, 'summary.json'),
    JSON.stringify(result, null, 2)
  );
}
async function seedDemo({
  config,
  database,
  source = process.env,
  reset = false,
}) {
  await verifyConnection(config, database);
  const models = createModels(database.connection);
  const owner = await localOwner(database);
  let manifest = await createRegistry(
    database.connection,
    models,
    owner,
    'demo-v2'
  );
  const passwords = await credentials(source, { persist: false });
  const fingerprint = createHash('sha256')
    .update(JSON.stringify(passwords))
    .digest('hex');
  if (
    manifest.status === 'ready' &&
    !reset &&
    manifest.passwordFingerprint !== fingerprint
  )
    throw new Error(
      'Demo password configuration changed. Run reset:demo to apply it.'
    );
  if (reset) await cleanupOwned({ config, database, models, owner });
  manifest = await database.connection.db
    .collection(REGISTRY)
    .findOne({ _id: owner });
  const generatedAt =
    manifest.status === 'cleaned' || !manifest.generatedAt
      ? new Date()
      : manifest.generatedAt;
  const plan = makePlan(owner, generatedAt);
  await fs.writeFile(
    path.join(DIRECTORY, 'credentials.json'),
    JSON.stringify(passwords, null, 2),
    { mode: 0o600 }
  );
  if (manifest.status !== 'ready' || reset) {
    await ensureIndexes(models);
    await database.connection.db.collection(REGISTRY).updateOne(
      { _id: owner },
      {
        $set: {
          status: 'seeding',
          generatedAt,
          passwordFingerprint: fingerprint,
        },
      }
    );
    const referenceTime = new Date(+generatedAt - 91 * 86_400_000);
    const stamp = (data) => ({
      ...data,
      createdAt: referenceTime,
      updatedAt: referenceTime,
    });
    for (const hostel of plan.hostels) {
      const { key, ...data } = hostel;
      void key;
      const enrollmentCodeHash = await hashEnrollmentCode(passwords.enrollment);
      await runTransaction(database.connection, (session) =>
        saveNew(
          models.Hostel,
          stamp({ ...data, enrollmentCodeHash }),
          owner,
          session
        )
      );
    }
    for (const [name, inputs] of [
      ['Block', plan.wings],
      ['Room', plan.rooms],
      ['Category', plan.categories],
      ['HostelPolicy', plan.policies],
    ]) {
      for (const input of inputs)
        await runTransaction(database.connection, (session) =>
          saveNew(models[name], stamp(input), owner, session)
        );
    }
    for (const user of [...plan.students, ...plan.admins, ...plan.staff]) {
      const { domain, ...input } = user;
      void domain;
      const passwordHash = await hashPassword(
        passwords[user.role.toLowerCase()]
      );
      await runTransaction(database.connection, (session) =>
        saveNew(models.User, stamp({ ...input, passwordHash }), owner, session)
      );
    }
    for (const input of plan.complaints)
      await runTransaction(database.connection, (session) =>
        seedComplaint(models, input, owner, session)
      );
    await database.connection.db
      .collection(REGISTRY)
      .updateOne(
        { _id: owner },
        { $set: { status: 'ready', seededAt: new Date() } }
      );
  }
  const result = await summary(models, owner);
  await writeDocumentation(plan, passwords, result);
  return { plan, passwords, models, owner, result };
}
module.exports = {
  seedDemo,
  credentials,
  localOwner,
  summary,
  writeDocumentation,
  saveNew,
  seedComplaint,
  DIRECTORY,
};
