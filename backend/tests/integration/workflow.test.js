const request = require('supertest');
const { randomUUID } = require('node:crypto');
const { openAuthDatabase } = require('../helpers/auth.helper');
const {
  hostelInput,
  categoryInput,
  policyInput,
} = require('../helpers/models.helper');

describe('complaint workflow transitions, assignments, priority overrides, reopen, and feedback integration tests', () => {
  let authDb;
  let app;
  let student;
  let studentToken;
  let otherStudent;
  let otherStudentToken;
  let staff;
  let staffToken;
  let secondStaff;
  let secondStaffToken;
  let admin;
  let adminToken;
  let foreignHostel;
  let foreignAdmin;
  let foreignAdminToken;

  beforeAll(async () => {
    authDb = await openAuthDatabase();
    app = authDb.app();

    // Ensure hostel policy exists for primary hostel
    await authDb.create('HostelPolicy', policyInput({ hostelId: authDb.hostel._id }));

    // Primary student
    student = await authDb.user({ role: 'STUDENT' });
    const sLogin = await authDb.login(app, student);
    studentToken = sLogin.token;

    // Second student in same hostel
    otherStudent = await authDb.user({ role: 'STUDENT' });
    const oLogin = await authDb.login(app, otherStudent);
    otherStudentToken = oLogin.token;

    // Staff member 1 with primary category
    staff = await authDb.user({ role: 'STAFF', categoryIds: [authDb.category._id] });
    const stLogin = await authDb.login(app, staff);
    staffToken = stLogin.token;

    // Staff member 2 with primary category
    secondStaff = await authDb.user({ role: 'STAFF', categoryIds: [authDb.category._id] });
    const st2Login = await authDb.login(app, secondStaff);
    secondStaffToken = st2Login.token;

    // Admin scoped to primary hostel
    admin = await authDb.user({ role: 'ADMIN', adminHostelIds: [authDb.hostel._id] });
    const aLogin = await authDb.login(app, admin);
    adminToken = aLogin.token;

    // Foreign hostel with admin
    foreignHostel = await authDb.create('Hostel', hostelInput());
    await authDb.create('HostelPolicy', policyInput({ hostelId: foreignHostel._id }));
    foreignAdmin = await authDb.user({ role: 'ADMIN', adminHostelIds: [foreignHostel._id] });
    const faLogin = await authDb.login(app, foreignAdmin);
    foreignAdminToken = faLogin.token;
  });

  afterAll(async () => {
    if (authDb) await authDb.close();
  });

  const authPost = (url, token) =>
    request(app)
      .post(url)
      .set('Authorization', `Bearer ${token}`)
      .set('Origin', authDb.config.CORS_ORIGIN)
      .set('X-CSRF-Protection', '1');

  const createComplaintFixture = async (token = studentToken, overrides = {}) => {
    const payload = {
      clientRequestId: randomUUID(),
      title: 'Water pipe leaking under washbasin',
      description: 'Continuous dripping from the pipe connection under the bathroom sink.',
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
    };

    const res = await authPost('/api/v1/complaints', token).send(payload);
    expect(res.status).toBe(201);
    return res.body.data.complaint;
  };

  const resolveComplaintHelper = async (complaint) => {
    const resTriage = await authPost(`/api/v1/complaints/${complaint.id}/transitions`, adminToken).send({
      expectedVersion: complaint.version,
      toStatus: 'TRIAGED',
      note: 'Triaged by admin helper.',
    });
    expect(resTriage.status).toBe(200);

    const resAssign = await authPost(`/api/v1/complaints/${complaint.id}/assignment`, adminToken).send({
      expectedVersion: resTriage.body.data.complaint.version,
      staffId: String(staff._id),
      note: 'Assigned by admin helper.',
    });
    expect(resAssign.status).toBe(200);

    const resStart = await authPost(`/api/v1/complaints/${complaint.id}/transitions`, staffToken).send({
      expectedVersion: resAssign.body.data.complaint.version,
      toStatus: 'IN_PROGRESS',
      note: 'Starting work by staff helper.',
    });
    expect(resStart.status).toBe(200);

    const resResolve = await authPost(`/api/v1/complaints/${complaint.id}/transitions`, staffToken).send({
      expectedVersion: resStart.body.data.complaint.version,
      toStatus: 'RESOLVED',
      resolutionNote: 'Resolved by staff helper with comprehensive repairs.',
    });
    expect(resResolve.status).toBe(200);

    return resResolve.body.data.complaint;
  };

  test('WF-T01: Admin triages a submitted complaint successfully', async () => {
    const complaint = await createComplaintFixture();

    const res = await authPost(`/api/v1/complaints/${complaint.id}/transitions`, adminToken).send({
      expectedVersion: complaint.version,
      toStatus: 'TRIAGED',
      note: 'Reviewing plumbing issue and preparing assignment.',
    });

    expect(res.status).toBe(200);
    expect(res.body.data.complaint.status).toBe('TRIAGED');
    expect(res.body.data.complaint.version).toBe(complaint.version + 1);
    expect(res.body.data.activity.type).toBe('TRIAGED');
    expect(res.body.data.activity.previousStatus).toBe('SUBMITTED');
    expect(res.body.data.activity.newStatus).toBe('TRIAGED');
  });

  test('WF-T02: Student or staff cannot triage a complaint (403)', async () => {
    const complaint = await createComplaintFixture();

    const resStudent = await authPost(`/api/v1/complaints/${complaint.id}/transitions`, studentToken).send({
      expectedVersion: complaint.version,
      toStatus: 'TRIAGED',
      note: 'Trying to self-triage this complaint.',
    });
    expect(resStudent.status).toBe(403);

    const resStaff = await authPost(`/api/v1/complaints/${complaint.id}/transitions`, staffToken).send({
      expectedVersion: complaint.version,
      toStatus: 'TRIAGED',
      note: 'Staff trying to triage this complaint.',
    });
    expect(resStaff.status).toBe(404); // Staff cannot see unassigned complaint
  });

  test('WF-T03: Admin rejects a complaint from SUBMITTED or TRIAGED', async () => {
    const complaint = await createComplaintFixture();

    const res = await authPost(`/api/v1/complaints/${complaint.id}/transitions`, adminToken).send({
      expectedVersion: complaint.version,
      toStatus: 'REJECTED',
      rejectionCode: 'OUT_OF_SCOPE',
      note: 'This facility is managed by external municipality maintenance.',
    });

    expect(res.status).toBe(200);
    expect(res.body.data.complaint.status).toBe('REJECTED');
    expect(res.body.data.activity.type).toBe('REJECTED');

    // Terminal state: cannot transition out of REJECTED
    const resFollowUp = await authPost(`/api/v1/complaints/${complaint.id}/transitions`, adminToken).send({
      expectedVersion: res.body.data.complaint.version,
      toStatus: 'TRIAGED',
      note: 'Trying to reopen rejected complaint.',
    });
    expect(resFollowUp.status).toBe(409);
    expect(resFollowUp.body.error.code).toBe('INVALID_TRANSITION');
  });

  test('WF-T04: Admin assigns complaint to eligible staff member', async () => {
    const complaint = await createComplaintFixture();

    // 1. Triage first
    await authPost(`/api/v1/complaints/${complaint.id}/transitions`, adminToken).send({
      expectedVersion: complaint.version,
      toStatus: 'TRIAGED',
      note: 'Triaged and ready for assignment.',
    });

    // 2. Assign to staff
    const resAssign = await authPost(`/api/v1/complaints/${complaint.id}/assignment`, adminToken).send({
      expectedVersion: complaint.version + 1,
      staffId: String(staff._id),
      note: 'Assigned to primary plumbing technician.',
    });

    expect(resAssign.status).toBe(200);
    expect(resAssign.body.data.complaint.status).toBe('ASSIGNED');
    expect(resAssign.body.data.complaint.assignee.id).toBe(String(staff._id));
    expect(resAssign.body.data.activity.type).toBe('ASSIGNED');

    // 3. Assigning to same staff returns 409 ALREADY_ASSIGNED
    const resSame = await authPost(`/api/v1/complaints/${complaint.id}/assignment`, adminToken).send({
      expectedVersion: resAssign.body.data.complaint.version,
      staffId: String(staff._id),
      note: 'Re-assigning to the very same person.',
    });
    expect(resSame.status).toBe(409);
    expect(resSame.body.error.code).toBe('ALREADY_ASSIGNED');

    // 4. Reassigning to second staff succeeds with REASSIGNED activity
    const resReassign = await authPost(`/api/v1/complaints/${complaint.id}/assignment`, adminToken).send({
      expectedVersion: resAssign.body.data.complaint.version,
      staffId: String(secondStaff._id),
      note: 'Reassigning to backup technician.',
    });
    expect(resReassign.status).toBe(200);
    expect(resReassign.body.data.complaint.assignee.id).toBe(String(secondStaff._id));
    expect(resReassign.body.data.activity.type).toBe('REASSIGNED');
  });

  test('WF-T05: Assignment fails when staff member is outside hostel or ineligible', async () => {
    const complaint = await createComplaintFixture();

    // Triage first
    const resTriage = await authPost(`/api/v1/complaints/${complaint.id}/transitions`, adminToken).send({
      expectedVersion: complaint.version,
      toStatus: 'TRIAGED',
      note: 'Triaged before mismatch assignment test.',
    });
    expect(resTriage.status).toBe(200);

    // Create staff in foreign hostel
    const foreignStaff = await authDb.user({
      role: 'STAFF',
      hostelId: foreignHostel._id,
      categoryIds: [authDb.category._id],
    });

    const resForeign = await authPost(`/api/v1/complaints/${complaint.id}/assignment`, adminToken).send({
      expectedVersion: resTriage.body.data.complaint.version,
      staffId: String(foreignStaff._id),
      note: 'Attempting cross-hostel staff assignment.',
    });
    expect(resForeign.status).toBe(404);

    // Create staff in same hostel but with different category
    const otherCategory = await authDb.create(
      'Category',
      categoryInput({ hostelId: authDb.hostel._id, code: 'CARPENTRY', name: 'Carpentry Works' })
    );
    const mismatchStaff = await authDb.user({
      role: 'STAFF',
      hostelId: authDb.hostel._id,
      categoryIds: [otherCategory._id],
    });

    const resMismatch = await authPost(`/api/v1/complaints/${complaint.id}/assignment`, adminToken).send({
      expectedVersion: resTriage.body.data.complaint.version,
      staffId: String(mismatchStaff._id),
      note: 'Staff does not have plumbing category.',
    });
    expect(resMismatch.status).toBe(409);
    expect(resMismatch.body.error.code).toBe('STAFF_INELIGIBLE');
  });

  test('WF-T06: Assigned staff starts work (IN_PROGRESS) and resolves the complaint', async () => {
    const complaint = await createComplaintFixture();

    // Triage
    await authPost(`/api/v1/complaints/${complaint.id}/transitions`, adminToken).send({
      expectedVersion: complaint.version,
      toStatus: 'TRIAGED',
      note: 'Triage complete.',
    });

    // Assign to staff
    const resAssign = await authPost(`/api/v1/complaints/${complaint.id}/assignment`, adminToken).send({
      expectedVersion: complaint.version + 1,
      staffId: String(staff._id),
      note: 'Assigned to plumbing staff.',
    });

    const vAssigned = resAssign.body.data.complaint.version;

    // Other staff member cannot start work
    const resOtherStaff = await authPost(`/api/v1/complaints/${complaint.id}/transitions`, secondStaffToken).send({
      expectedVersion: vAssigned,
      toStatus: 'IN_PROGRESS',
      note: 'Unassigned staff trying to start work.',
    });
    expect(resOtherStaff.status).toBe(404); // Scoped to assigned staff

    // Assigned staff starts work
    const resStart = await authPost(`/api/v1/complaints/${complaint.id}/transitions`, staffToken).send({
      expectedVersion: vAssigned,
      toStatus: 'IN_PROGRESS',
      note: 'On site inspecting pipe joints.',
    });

    expect(resStart.status).toBe(200);
    expect(resStart.body.data.complaint.status).toBe('IN_PROGRESS');
    expect(resStart.body.data.activity.type).toBe('WORK_STARTED');

    const vProgress = resStart.body.data.complaint.version;

    // Assigned staff resolves
    const resResolve = await authPost(`/api/v1/complaints/${complaint.id}/transitions`, staffToken).send({
      expectedVersion: vProgress,
      toStatus: 'RESOLVED',
      resolutionNote: 'Replaced Teflon tape and tightened pipe connector. Leak completely stopped.',
    });

    expect(resResolve.status).toBe(200);
    expect(resResolve.body.data.complaint.status).toBe('RESOLVED');
    expect(resResolve.body.data.complaint.resolvedAt).toBeDefined();
    expect(resResolve.body.data.complaint.reopenUntil).toBeDefined();
    expect(resResolve.body.data.activity.type).toBe('RESOLVED');
  });

  test('WF-T07: Student closes resolved complaint', async () => {
    const complaint = await createComplaintFixture();
    const resolved = await resolveComplaintHelper(complaint);

    // Another student cannot close
    const resOtherClose = await authPost(`/api/v1/complaints/${complaint.id}/transitions`, otherStudentToken).send({
      expectedVersion: resolved.version,
      toStatus: 'CLOSED',
      note: 'Confirmed repair.',
    });
    expect(resOtherClose.status).toBe(404);

    // Owning student confirms closure
    const resClose = await authPost(`/api/v1/complaints/${complaint.id}/transitions`, studentToken).send({
      expectedVersion: resolved.version,
      toStatus: 'CLOSED',
      note: 'All good, sink is working perfectly!',
    });

    expect(resClose.status).toBe(200);
    expect(resClose.body.data.complaint.status).toBe('CLOSED');
    expect(resClose.body.data.activity.type).toBe('CLOSED');
  });

  test('WF-T08: Admin cannot close resolved complaint before 7-day window elapses (409)', async () => {
    const complaint = await createComplaintFixture();
    const resolved = await resolveComplaintHelper(complaint);

    // Admin tries to close immediately -> 409 CLOSE_WINDOW_NOT_ELAPSED
    const resAdminClose = await authPost(`/api/v1/complaints/${complaint.id}/transitions`, adminToken).send({
      expectedVersion: resolved.version,
      toStatus: 'CLOSED',
      note: 'Admin closing immediately before 7 days.',
    });

    expect(resAdminClose.status).toBe(409);
    expect(resAdminClose.body.error.code).toBe('CLOSE_WINDOW_NOT_ELAPSED');
  });

  test('WF-T09: Admin overrides priority with tightened deadlines', async () => {
    const complaint = await createComplaintFixture();

    const resOverride = await authPost(`/api/v1/complaints/${complaint.id}/priority`, adminToken).send({
      expectedVersion: complaint.version,
      priority: 'CRITICAL',
      reason: 'Water has reached the electrical switchboard near the sink.',
    });

    expect(resOverride.status).toBe(200);
    expect(resOverride.body.data.complaint.priority).toBe('CRITICAL');
    expect(resOverride.body.data.complaint.prioritySource).toBe('ADMIN');
    expect(resOverride.body.data.activity.type).toBe('PRIORITY_CHANGED');

    // Setting same priority returns 409 PRIORITY_UNCHANGED
    const resSame = await authPost(`/api/v1/complaints/${complaint.id}/priority`, adminToken).send({
      expectedVersion: resOverride.body.data.complaint.version,
      priority: 'CRITICAL',
      reason: 'Trying to set critical again.',
    });

    expect(resSame.status).toBe(409);
    expect(resSame.body.error.code).toBe('PRIORITY_UNCHANGED');
  });

  test('WF-T10: Student reopens resolved complaint within 7-day window up to 2 times', async () => {
    const complaint = await createComplaintFixture();
    const resolved = await resolveComplaintHelper(complaint);

    let version = resolved.version;

    // Reopen 1
    const resReopen1 = await authPost(`/api/v1/complaints/${complaint.id}/reopen`, studentToken).send({
      expectedVersion: version,
      reason: 'The pipe started leaking again as soon as full water pressure resumed.',
    });

    expect(resReopen1.status).toBe(200);
    expect(resReopen1.body.data.complaint.status).toBe('REOPENED');
    expect(resReopen1.body.data.complaint.cycleNumber).toBe(2);
    expect(resReopen1.body.data.complaint.reopenCount).toBe(1);
    expect(resReopen1.body.data.complaint.assignee).toBeNull();
    expect(resReopen1.body.data.complaint.priorCycles).toHaveLength(1);
    expect(resReopen1.body.data.activity.type).toBe('REOPENED');

    version = resReopen1.body.data.complaint.version;

    // Cycle 2: assign, start, resolve
    const resAssign2 = await authPost(`/api/v1/complaints/${complaint.id}/assignment`, adminToken).send({
      expectedVersion: version,
      staffId: String(staff._id),
      note: 'Reassigned for cycle 2.',
    });
    expect(resAssign2.status).toBe(200);

    const resStart2 = await authPost(`/api/v1/complaints/${complaint.id}/transitions`, staffToken).send({
      expectedVersion: resAssign2.body.data.complaint.version,
      toStatus: 'IN_PROGRESS',
      note: 'Replacing entire pipe section.',
    });
    expect(resStart2.status).toBe(200);

    const resResolve2 = await authPost(`/api/v1/complaints/${complaint.id}/transitions`, staffToken).send({
      expectedVersion: resStart2.body.data.complaint.version,
      toStatus: 'RESOLVED',
      resolutionNote: 'Installed entirely new PVC pipe assembly and reinforced joints.',
    });
    expect(resResolve2.status).toBe(200);

    version = resResolve2.body.data.complaint.version;

    // Reopen 2
    const resReopen2 = await authPost(`/api/v1/complaints/${complaint.id}/reopen`, studentToken).send({
      expectedVersion: version,
      reason: 'Water is now seeping through the new PVC joint on the wall side.',
    });

    expect(resReopen2.status).toBe(200);
    expect(resReopen2.body.data.complaint.status).toBe('REOPENED');
    expect(resReopen2.body.data.complaint.cycleNumber).toBe(3);
    expect(resReopen2.body.data.complaint.reopenCount).toBe(2);
    expect(resReopen2.body.data.complaint.priorCycles).toHaveLength(2);

    version = resReopen2.body.data.complaint.version;

    // Cycle 3: assign, start, resolve
    const resAssign3 = await authPost(`/api/v1/complaints/${complaint.id}/assignment`, adminToken).send({
      expectedVersion: version,
      staffId: String(staff._id),
      note: 'Reassigned for cycle 3.',
    });
    expect(resAssign3.status).toBe(200);

    const resStart3 = await authPost(`/api/v1/complaints/${complaint.id}/transitions`, staffToken).send({
      expectedVersion: resAssign3.body.data.complaint.version,
      toStatus: 'IN_PROGRESS',
      note: 'Final seal and wall fixture repair.',
    });
    expect(resStart3.status).toBe(200);

    const resResolve3 = await authPost(`/api/v1/complaints/${complaint.id}/transitions`, staffToken).send({
      expectedVersion: resStart3.body.data.complaint.version,
      toStatus: 'RESOLVED',
      resolutionNote: 'Sealed with heavy-duty plumbing cement and replaced wall coupling.',
    });
    expect(resResolve3.status).toBe(200);

    version = resResolve3.body.data.complaint.version;

    // Reopen 3 -> 409 REOPEN_LIMIT_REACHED
    const resReopen3 = await authPost(`/api/v1/complaints/${complaint.id}/reopen`, studentToken).send({
      expectedVersion: version,
      reason: 'Attempting a third reopen when limit of 2 is already reached.',
    });

    expect(resReopen3.status).toBe(409);
    expect(resReopen3.body.error.code).toBe('REOPEN_LIMIT_REACHED');
  });

  test('WF-T11: Student feedback submission on resolved and closed complaint', async () => {
    const complaint = await createComplaintFixture();

    // Feedback on SUBMITTED -> 409 FEEDBACK_NOT_ALLOWED
    const resEarly = await authPost(`/api/v1/complaints/${complaint.id}/feedback`, studentToken).send({
      expectedVersion: complaint.version,
      rating: 5,
      comment: 'Too early.',
    });
    expect(resEarly.status).toBe(409);
    expect(resEarly.body.error.code).toBe('FEEDBACK_NOT_ALLOWED');

    const resolved = await resolveComplaintHelper(complaint);
    let version = resolved.version;

    // Submit feedback
    const resFeedback = await authPost(`/api/v1/complaints/${complaint.id}/feedback`, studentToken).send({
      expectedVersion: version,
      rating: 5,
      comment: 'Technician was prompt, polite, and fixed it completely.',
    });

    expect(resFeedback.status).toBe(201);
    expect(resFeedback.body.data.feedback.rating).toBe(5);
    expect(resFeedback.body.data.feedback.isCurrent).toBe(true);
    expect(resFeedback.body.data.activity.type).toBe('FEEDBACK_SUBMITTED');

    version = resFeedback.body.data.complaint.version;

    // Submitting duplicate feedback in same cycle -> 409 FEEDBACK_EXISTS
    const resDup = await authPost(`/api/v1/complaints/${complaint.id}/feedback`, studentToken).send({
      expectedVersion: version,
      rating: 4,
      comment: 'Trying to submit again in same cycle.',
    });
    expect(resDup.status).toBe(409);
    expect(resDup.body.error.code).toBe('FEEDBACK_EXISTS');
  });

  test('CC-T01: Stale version conflict (409 VERSION_CONFLICT) on transitions and assignments', async () => {
    const complaint = await createComplaintFixture();

    // Advance version from 1 to 2
    const resAdvance = await authPost(`/api/v1/complaints/${complaint.id}/transitions`, adminToken).send({
      expectedVersion: complaint.version,
      toStatus: 'TRIAGED',
      note: 'Initial triage to advance version from 1 to 2.',
    });
    expect(resAdvance.status).toBe(200);

    const staleVersion = complaint.version; // 1, while complaint is now at version 2

    // Stale reject attempt
    const resStaleTriage = await authPost(`/api/v1/complaints/${complaint.id}/transitions`, adminToken).send({
      expectedVersion: staleVersion,
      toStatus: 'REJECTED',
      rejectionCode: 'OUT_OF_SCOPE',
      note: 'Stale reject attempt with version 1.',
    });
    expect(resStaleTriage.status).toBe(409);
    expect(resStaleTriage.body.error.code).toBe('VERSION_CONFLICT');

    // Stale assignment attempt
    const resStaleAssign = await authPost(`/api/v1/complaints/${complaint.id}/assignment`, adminToken).send({
      expectedVersion: staleVersion,
      staffId: String(staff._id),
      note: 'Stale assignment attempt with version 1.',
    });
    expect(resStaleAssign.status).toBe(409);
    expect(resStaleAssign.body.error.code).toBe('VERSION_CONFLICT');

    // Stale priority override attempt
    const resStalePriority = await authPost(`/api/v1/complaints/${complaint.id}/priority`, adminToken).send({
      expectedVersion: staleVersion,
      priority: 'HIGH',
      reason: 'Stale priority attempt with version 1.',
    });
    expect(resStalePriority.status).toBe(409);
    expect(resStalePriority.body.error.code).toBe('VERSION_CONFLICT');
  });
});
