const { createHash } = require('node:crypto');
const { hashPassword, hashEnrollmentCode } = require('../src/utils/hashUtils');
const { runTransaction } = require('../src/utils/transactions');
const { createModels, ensureIndexes } = require('../src/models');
const { createDatabase, databaseUri } = require('../src/config/database');
const { loadEnv } = require('../src/config/env');

const DEFAULT_POLICY = Object.freeze({
  slaTargets: {
    CRITICAL: { responseMinutes: 120, resolutionMinutes: 480 },
    HIGH: { responseMinutes: 240, resolutionMinutes: 1440 },
    MEDIUM: { responseMinutes: 480, resolutionMinutes: 2880 },
    LOW: { responseMinutes: 1440, resolutionMinutes: 4320 },
  },
  priorityWeights: {
    safetyRisk: 40,
    essentialServiceOutage: 30,
    affectsMultipleRooms: 20,
    functionalityLoss: 10,
  },
  priorityThresholds: {
    CRITICAL: 70,
    HIGH: 40,
    MEDIUM: 10,
  },
  escalationConfig: {
    level1FractionOfResolution: 0.75,
    level2Minutes: 120,
    autoEscalate: false,
  },
});

async function seedDatabase({ config, database, models: providedModels }) {
  const connection = database.connection;
  const models = providedModels ?? createModels(connection);
  await ensureIndexes(models);

  // 1. Hostel A
  let hostelA = await models.Hostel.findOne({ code: 'HOSTEL-A' });
  if (!hostelA) {
    hostelA = new models.Hostel({
      name: 'Hostel A',
      code: 'HOSTEL-A',
      enrollmentCodeHash: await hashEnrollmentCode('ENROLL-HOSTEL-A-2026'),
      isActive: true,
    });
    await hostelA.save();
  }

  // 2. Blocks
  let blockAlpha = await models.Block.findOne({ hostelId: hostelA._id, code: 'ALPHA' });
  if (!blockAlpha) {
    blockAlpha = new models.Block({
      hostelId: hostelA._id,
      name: 'Block Alpha',
      code: 'ALPHA',
      isActive: true,
    });
    await blockAlpha.save();
  }

  let blockBeta = await models.Block.findOne({ hostelId: hostelA._id, code: 'BETA' });
  if (!blockBeta) {
    blockBeta = new models.Block({
      hostelId: hostelA._id,
      name: 'Block Beta',
      code: 'BETA',
      isActive: true,
    });
    await blockBeta.save();
  }

  // 3. Rooms
  const roomsToSeed = [
    { block: blockAlpha, label: 'A-101' },
    { block: blockAlpha, label: 'A-102' },
    { block: blockAlpha, label: 'A-103' },
    { block: blockBeta, label: 'B-201' },
    { block: blockBeta, label: 'B-202' },
  ];
  const roomMap = {};
  for (const { block, label } of roomsToSeed) {
    let room = await models.Room.findOne({ hostelId: hostelA._id, blockId: block._id, label });
    if (!room) {
      room = new models.Room({
        hostelId: hostelA._id,
        blockId: block._id,
        label,
        isActive: true,
      });
      await room.save();
    }
    roomMap[label] = room;
  }

  // 4. Categories
  const categoriesToSeed = [
    { code: 'ELECTRICAL', name: 'Electrical', description: 'Fans, lights, switches, wiring' },
    { code: 'PLUMBING', name: 'Plumbing', description: 'Water supply, drainage, leaks' },
    { code: 'FURNITURE', name: 'Furniture', description: 'Beds, desks, chairs, wardrobes' },
    { code: 'CIVIL', name: 'Civil & Structural', description: 'Walls, floors, ceilings, doors, windows' },
    { code: 'CLEANING', name: 'Cleaning & Hygiene', description: 'Room/corridor cleaning, pest control' },
  ];
  const categoryMap = {};
  for (const item of categoriesToSeed) {
    let cat = await models.Category.findOne({ hostelId: hostelA._id, code: item.code });
    if (!cat) {
      cat = new models.Category({
        hostelId: hostelA._id,
        code: item.code,
        name: item.name,
        description: item.description,
        isActive: true,
      });
      await cat.save();
    }
    categoryMap[item.code] = cat;
  }

  // 5. HostelPolicy
  let policy = await models.HostelPolicy.findOne({ hostelId: hostelA._id });
  if (!policy) {
    policy = new models.HostelPolicy({
      hostelId: hostelA._id,
      slaTargets: DEFAULT_POLICY.slaTargets,
      priorityWeights: DEFAULT_POLICY.priorityWeights,
      priorityThresholds: DEFAULT_POLICY.priorityThresholds,
      escalationConfig: DEFAULT_POLICY.escalationConfig,
      policyVersion: 1,
    });
    await policy.save();
  }

  // 6. Users (Student, Staff, Admin)
  let asha = await models.User.findOne({ email: 'student.a@hostelfix.demo' });
  if (!asha) {
    asha = new models.User({
      name: 'Asha Student',
      email: 'student.a@hostelfix.demo',
      passwordHash: await hashPassword('DemoStudent@2026'),
      role: 'STUDENT',
      status: 'ACTIVE',
      mustChangePassword: false,
      hostelId: hostelA._id,
      blockId: blockAlpha._id,
      roomId: roomMap['A-101']._id,
    });
    await asha.save();
  }

  let ravi = await models.User.findOne({ email: 'staff.r@hostelfix.demo' });
  if (!ravi) {
    ravi = new models.User({
      name: 'Ravi Technician',
      email: 'staff.r@hostelfix.demo',
      passwordHash: await hashPassword('DemoStaff@2026!'),
      role: 'STAFF',
      status: 'ACTIVE',
      mustChangePassword: true,
      hostelId: hostelA._id,
      categoryIds: [categoryMap.ELECTRICAL._id, categoryMap.PLUMBING._id],
    });
    await ravi.save();
  }

  let priya = await models.User.findOne({ email: 'admin.p@hostelfix.demo' });
  if (!priya) {
    priya = new models.User({
      name: 'Priya Warden',
      email: 'admin.p@hostelfix.demo',
      passwordHash: await hashPassword('DemoAdmin@2026!'),
      role: 'ADMIN',
      status: 'ACTIVE',
      mustChangePassword: false,
      adminHostelIds: [hostelA._id],
    });
    await priya.save();
  }

  // 7. Seed Sample Complaints & Activities (using transactions)
  // Complaint 1: Broken ceiling fan (ASSIGNED, MEDIUM, Ravi)
  const c1Ref = 'HFX-2026-FAN0000001';
  let complaint1 = await models.Complaint.findOne({ reference: c1Ref });
  if (!complaint1) {
    await runTransaction(connection, async (session) => {
      complaint1 = new models.Complaint({
        reference: c1Ref,
        ownerId: asha._id,
        hostelId: hostelA._id,
        title: 'Broken ceiling fan in A-101',
        description: 'The ceiling fan in room A-101 is not spinning and makes a humming noise when turned on.',
        categoryId: categoryMap.ELECTRICAL._id,
        location: { type: 'ROOM', hostelId: hostelA._id, blockId: blockAlpha._id, roomId: roomMap['A-101']._id },
        indicators: { safetyRisk: false, essentialServiceOutage: false, affectsMultipleRooms: false, functionalityLoss: true },
        status: 'ASSIGNED',
        priority: 'MEDIUM',
        suggestedPriority: 'MEDIUM',
        prioritySource: 'RULE',
        priorityExplanation: 'Loss of functionality was reported.',
        assigneeId: ravi._id,
        clientRequestId: '11111111-1111-4111-8111-111111111111',
        clientRequestHash: createHash('sha256').update('seed-complaint-1').digest('hex'),
        cycleNumber: 1,
        reopenCount: 0,
        createdAt: new Date(Date.now() - 15 * 60000),
        slaPolicy: DEFAULT_POLICY.slaTargets,
        responseDueAt: new Date(Date.now() + 8 * 3600000),
        resolutionDueAt: new Date(Date.now() + 48 * 3600000),
        firstRespondedAt: new Date(Date.now() - 5 * 60000),
      });
      await complaint1.save({ session });

      const act1 = new models.Activity({
        complaintId: complaint1._id,
        type: 'CREATED',
        actorId: asha._id,
        actorName: asha.name,
        actorRole: asha.role,
        occurredAt: new Date(Date.now() - 15 * 60000),
      });
      await act1.save({ session });

      const act2 = new models.Activity({
        complaintId: complaint1._id,
        type: 'TRIAGED',
        actorId: priya._id,
        actorName: priya.name,
        actorRole: priya.role,
        occurredAt: new Date(Date.now() - 10 * 60000),
        previousStatus: 'SUBMITTED',
        newStatus: 'TRIAGED',
        note: 'Valid electrical issue, routing to technician.',
      });
      await act2.save({ session });

      const act3 = new models.Activity({
        complaintId: complaint1._id,
        type: 'ASSIGNED',
        actorId: priya._id,
        actorName: priya.name,
        actorRole: priya.role,
        occurredAt: new Date(Date.now() - 5 * 60000),
        previousStatus: 'TRIAGED',
        newStatus: 'ASSIGNED',
        note: 'Electrical team to inspect the fan capacitor.',
        changes: { previousAssigneeId: null, assigneeId: String(ravi._id) },
      });
      await act3.save({ session });
    });
  }

  // Complaint 2: Water leak (SUBMITTED, HIGH, unassigned)
  const c2Ref = 'HFX-2026-LEAK000002';
  let complaint2 = await models.Complaint.findOne({ reference: c2Ref });
  if (!complaint2) {
    await runTransaction(connection, async (session) => {
      complaint2 = new models.Complaint({
        reference: c2Ref,
        ownerId: asha._id,
        hostelId: hostelA._id,
        title: 'Water leak under bathroom sink',
        description: 'Water is dripping steadily from the pipe beneath the bathroom sink in A-101.',
        categoryId: categoryMap.PLUMBING._id,
        location: { type: 'ROOM', hostelId: hostelA._id, blockId: blockAlpha._id, roomId: roomMap['A-101']._id },
        indicators: { safetyRisk: false, essentialServiceOutage: true, affectsMultipleRooms: false, functionalityLoss: true },
        status: 'SUBMITTED',
        priority: 'HIGH',
        suggestedPriority: 'HIGH',
        prioritySource: 'RULE',
        priorityExplanation: 'Essential service outage reported.',
        assigneeId: null,
        clientRequestId: '22222222-2222-4222-8222-222222222222',
        clientRequestHash: createHash('sha256').update('seed-complaint-2').digest('hex'),
        cycleNumber: 1,
        reopenCount: 0,
        createdAt: new Date(Date.now() - 20 * 60000),
        slaPolicy: DEFAULT_POLICY.slaTargets,
        responseDueAt: new Date(Date.now() + 4 * 3600000),
        resolutionDueAt: new Date(Date.now() + 24 * 3600000),
      });
      await complaint2.save({ session });

      const act1 = new models.Activity({
        complaintId: complaint2._id,
        type: 'CREATED',
        actorId: asha._id,
        actorName: asha.name,
        actorRole: asha.role,
        occurredAt: new Date(Date.now() - 20 * 60000),
      });
      await act1.save({ session });
    });
  }

  // Complaint 3: Desk drawer handle (CLOSED, LOW, Ravi, with Feedback)
  const c3Ref = 'HFX-2026-DESK000003';
  let complaint3 = await models.Complaint.findOne({ reference: c3Ref });
  if (!complaint3) {
    await runTransaction(connection, async (session) => {
      const past = (hoursAgo) => new Date(Date.now() - hoursAgo * 3600000);
      const c3CreatedAt = past(50);
      const c3ResolvedAt = past(25);
      const c3ReopenUntil = new Date(c3ResolvedAt.getTime() + 7 * 24 * 60 * 60 * 1000);
      complaint3 = new models.Complaint({
        reference: c3Ref,
        ownerId: asha._id,
        hostelId: hostelA._id,
        title: 'Desk drawer handle broken',
        description: 'The right side handle of the study desk drawer has detached from the wooden frame.',
        categoryId: categoryMap.FURNITURE._id,
        location: { type: 'ROOM', hostelId: hostelA._id, blockId: blockAlpha._id, roomId: roomMap['A-101']._id },
        indicators: { safetyRisk: false, essentialServiceOutage: false, affectsMultipleRooms: false, functionalityLoss: false },
        status: 'CLOSED',
        priority: 'LOW',
        suggestedPriority: 'LOW',
        prioritySource: 'RULE',
        priorityExplanation: 'General maintenance issue without immediate risk or outage.',
        assigneeId: ravi._id,
        clientRequestId: '33333333-3333-4333-8333-333333333333',
        clientRequestHash: createHash('sha256').update('seed-complaint-3').digest('hex'),
        cycleNumber: 1,
        reopenCount: 0,
        createdAt: c3CreatedAt,
        slaPolicy: DEFAULT_POLICY.slaTargets,
        responseDueAt: past(48),
        resolutionDueAt: past(24),
        firstRespondedAt: past(47),
        resolvedAt: c3ResolvedAt,
        closedAt: past(20),
        reopenUntil: c3ReopenUntil,
        resolutionNote: 'Replaced broken drawer handle and aligned tracks.',
        resolverId: ravi._id,
        workStartedAt: past(30),
      });
      await complaint3.save({ session });

      const acts = [
        { type: 'CREATED', actor: asha, time: past(50) },
        { type: 'TRIAGED', actor: priya, time: past(47), note: 'Routine furniture repair scheduled.' },
        { type: 'ASSIGNED', actor: priya, time: past(46), note: 'Assigned to carpentry technician.', changes: { previousAssigneeId: null, assigneeId: String(ravi._id) } },
        { type: 'WORK_STARTED', actor: ravi, time: past(30), note: 'Inspecting drawer handle and fitting replacement screws.' },
        { type: 'RESOLVED', actor: ravi, time: past(25), note: 'Replaced broken drawer handle and aligned tracks.' },
        { type: 'CLOSED', actor: asha, time: past(20), note: 'Fixed properly, drawer closes smoothly.' },
      ];

      let prev = null;
      for (const a of acts) {
        const nextStatus = a.type === 'CREATED' ? 'SUBMITTED'
          : a.type === 'TRIAGED' ? 'TRIAGED'
          : a.type === 'ASSIGNED' ? 'ASSIGNED'
          : a.type === 'WORK_STARTED' ? 'IN_PROGRESS'
          : a.type === 'RESOLVED' ? 'RESOLVED'
          : 'CLOSED';
        const doc = new models.Activity({
          complaintId: complaint3._id,
          type: a.type,
          actorId: a.actor._id,
          actorName: a.actor.name,
          actorRole: a.actor.role,
          occurredAt: a.time,
          previousStatus: prev,
          newStatus: nextStatus,
          note: a.note ?? null,
          changes: a.changes ?? null,
        });
        await doc.save({ session });
        prev = nextStatus;
      }

      const fb = new models.Feedback({
        complaintId: complaint3._id,
        authorId: asha._id,
        rating: 5,
        comment: 'Quick fix!',
        cycleNumber: 1,
        isCurrent: true,
      });
      await fb.save({ session });
    });
  }

  return {
    hostel: hostelA,
    blocks: [blockAlpha, blockBeta],
    rooms: Object.values(roomMap),
    categories: Object.values(categoryMap),
    policy,
    users: { asha, ravi, priya },
    complaints: [complaint1, complaint2, complaint3],
  };
}

async function main() {
  const config = loadEnv();
  const database = createDatabase(config);
  try {
    await database.connect();
    await seedDatabase({ config, database });
    process.stdout.write('Database seeded successfully.\n');
  } catch (error) {
    process.stderr.write(`Seeding failed: ${error.message}\n`);
    process.exitCode = 1;
  } finally {
    await database.disconnect();
  }
}

if (require.main === module) void main();
module.exports = { seedDatabase, DEFAULT_POLICY };
