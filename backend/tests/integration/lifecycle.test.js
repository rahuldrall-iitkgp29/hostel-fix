const request = require('supertest');
const { randomUUID } = require('node:crypto');
const { openAuthDatabase } = require('../helpers/auth.helper');
const { policyInput } = require('../helpers/models.helper');

describe('Full P0 Lifecycle Integration Journey (Session 11)', () => {
  let authDb;
  let app;
  let student;
  let studentToken;
  let staff;
  let staffToken;
  let admin;
  let adminToken;

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

  beforeAll(async () => {
    authDb = await openAuthDatabase();
    app = authDb.app();

    // Ensure hostel policy exists for primary hostel
    await authDb.create('HostelPolicy', policyInput({ hostelId: authDb.hostel._id }));

    // Create student
    student = await authDb.user({ role: 'STUDENT' });
    const sLogin = await authDb.login(app, student);
    studentToken = sLogin.token;

    // Create staff member with matching category
    staff = await authDb.user({ role: 'STAFF', categoryIds: [authDb.category._id] });
    const stLogin = await authDb.login(app, staff);
    staffToken = stLogin.token;

    // Create admin scoped to hostel
    admin = await authDb.user({ role: 'ADMIN', adminHostelIds: [authDb.hostel._id] });
    const aLogin = await authDb.login(app, admin);
    adminToken = aLogin.token;
  });

  afterAll(async () => {
    await authDb?.close();
  });

  test('End-to-End P0 Lifecycle: report -> triage -> assign -> progress -> resolve -> reopen -> re-resolve -> close -> feedback', async () => {
    // 1. Student creates a complaint
    const createRes = await request(app)
      .post('/api/v1/complaints')
      .set(mutationHeaders(studentToken))
      .send({
        clientRequestId: randomUUID(),
        title: 'Broken electrical switch sparking intermittently',
        description: 'Room 101 switchboard sparks when turning on the ceiling fan. Potential fire hazard.',
        categoryId: String(authDb.category._id),
        location: {
          type: 'ROOM',
          hostelId: String(authDb.hostel._id),
          blockId: String(authDb.block._id),
          roomId: String(authDb.room._id),
        },
        indicators: {
          safetyRisk: true,
          essentialServiceOutage: false,
          affectsMultipleRooms: false,
          functionalityLoss: true,
        },
        attachmentIds: [],
      });

    expect(createRes.status).toBe(201);
    const complaintId = createRes.body.data.complaint.id;
    let version = createRes.body.data.complaint.version;
    expect(createRes.body.data.complaint.status).toBe('SUBMITTED');
    expect(createRes.body.data.complaint.priority).toBe('HIGH'); // safetyRisk + functionalityLoss triggers HIGH

    // 2. Student checks student dashboard: see 1 submitted, 1 open, 0 resolved
    const sDash1 = await request(app)
      .get('/api/v1/dashboard/student')
      .set(readHeaders(studentToken));
    expect(sDash1.status).toBe(200);
    expect(sDash1.body.data.statusCounts.SUBMITTED).toBeGreaterThanOrEqual(1);
    expect(sDash1.body.data.recentComplaints.some((c) => c.id === complaintId)).toBe(true);

    // 3. Admin checks admin dashboard: sees unassigned count >= 1
    const aDash1 = await request(app)
      .get('/api/v1/dashboard/admin')
      .set(readHeaders(adminToken));
    expect(aDash1.status).toBe(200);
    expect(aDash1.body.data.unassigned).toBeGreaterThanOrEqual(1);

    // 4. Admin queries eligible staff for this complaint
    const staffQueryRes = await request(app)
      .get(`/api/v1/admin/staff?hostelId=${authDb.hostel._id}&eligibleForComplaintId=${complaintId}`)
      .set(readHeaders(adminToken));
    expect(staffQueryRes.status).toBe(200);
    expect(staffQueryRes.body.data.some((s) => s.id === String(staff._id))).toBe(true);

    // 5. Admin triages the complaint
    const triageRes = await request(app)
      .post(`/api/v1/complaints/${complaintId}/transitions`)
      .set(mutationHeaders(adminToken))
      .send({
        toStatus: 'TRIAGED',
        expectedVersion: version,
        note: 'Triaged by hostel warden. Electrical hazard confirmed.',
      });
    expect(triageRes.status).toBe(200);
    version = triageRes.body.data.complaint.version;
    expect(triageRes.body.data.complaint.status).toBe('TRIAGED');

    // 6. Admin assigns complaint to eligible staff
    const assignRes = await request(app)
      .post(`/api/v1/complaints/${complaintId}/assignment`)
      .set(mutationHeaders(adminToken))
      .send({
        staffId: String(staff._id),
        expectedVersion: version,
        note: 'Assigned to qualified electrician on duty.',
      });
    expect(assignRes.status).toBe(200);
    version = assignRes.body.data.complaint.version;
    expect(assignRes.body.data.complaint.status).toBe('ASSIGNED');
    expect(assignRes.body.data.complaint.assignee.id).toBe(String(staff._id));

    // 7. Staff checks staff dashboard: see complaint in work queue
    const stDash1 = await request(app)
      .get('/api/v1/dashboard/staff')
      .set(readHeaders(staffToken));
    expect(stDash1.status).toBe(200);
    expect(stDash1.body.data.assignedPending).toBeGreaterThanOrEqual(1);
    expect(stDash1.body.data.queue.some((c) => c.id === complaintId)).toBe(true);

    // 8. Staff adds a comment
    const commentRes = await request(app)
      .post(`/api/v1/complaints/${complaintId}/comments`)
      .set(mutationHeaders(staffToken))
      .send({
        expectedVersion: version,
        body: 'Arriving at Block A with replacement switchboard assembly in 15 minutes.',
      });
    expect(commentRes.status).toBe(201);
    version = commentRes.body.data.complaint.version;

    // 9. Staff begins work (IN_PROGRESS)
    const startRes = await request(app)
      .post(`/api/v1/complaints/${complaintId}/transitions`)
      .set(mutationHeaders(staffToken))
      .send({
        toStatus: 'IN_PROGRESS',
        expectedVersion: version,
        note: 'Turned off main room circuit breaker and dismantling broken switch.',
      });
    expect(startRes.status).toBe(200);
    version = startRes.body.data.complaint.version;
    expect(startRes.body.data.complaint.status).toBe('IN_PROGRESS');

    // 10. Staff resolves work (RESOLVED)
    const resolveRes = await request(app)
      .post(`/api/v1/complaints/${complaintId}/transitions`)
      .set(mutationHeaders(staffToken))
      .send({
        toStatus: 'RESOLVED',
        expectedVersion: version,
        resolutionNote: 'Replaced scorched modular switch with new 16A Schneider switch. Tested with fan on full load.',
      });
    expect(resolveRes.status).toBe(200);
    version = resolveRes.body.data.complaint.version;
    expect(resolveRes.body.data.complaint.status).toBe('RESOLVED');
    expect(resolveRes.body.data.complaint.resolvedAt).toBeTruthy();
    expect(resolveRes.body.data.complaint.reopenUntil).toBeTruthy();

    // 11. Student fetches complaint detail: sees resolution note, 7-day reopen window, allowedActions
    const detailRes1 = await request(app)
      .get(`/api/v1/complaints/${complaintId}`)
      .set(readHeaders(studentToken));
    expect(detailRes1.status).toBe(200);
    const detail1 = detailRes1.body.data.complaint;
    expect(detail1.status).toBe('RESOLVED');
    expect(detail1.allowedActions).toContain('REOPEN');
    expect(detail1.allowedActions).toContain('CLOSE');
    expect(detail1.allowedActions).toContain('FEEDBACK');

    // 12. Student rates initial resolution 3 stars
    const feedbackRes1 = await request(app)
      .post(`/api/v1/complaints/${complaintId}/feedback`)
      .set(mutationHeaders(studentToken))
      .send({
        expectedVersion: version,
        rating: 3,
        comment: 'Fan works now but socket plate is loose.',
      });
    expect(feedbackRes1.status).toBe(201);
    version = feedbackRes1.body.data.complaint.version;
    expect(feedbackRes1.body.data.feedback.rating).toBe(3);

    // 13. Student reopens the complaint within window
    const reopenRes = await request(app)
      .post(`/api/v1/complaints/${complaintId}/reopen`)
      .set(mutationHeaders(studentToken))
      .send({
        expectedVersion: version,
        reason: 'Switch works but the mounting screws are stripped and the entire plate came off the wall.',
      });
    expect(reopenRes.status).toBe(200);
    version = reopenRes.body.data.complaint.version;
    expect(reopenRes.body.data.complaint.status).toBe('REOPENED');
    expect(reopenRes.body.data.complaint.assignee).toBeNull(); // assignee cleared
    expect(reopenRes.body.data.complaint.cycleNumber).toBe(2);
    expect(reopenRes.body.data.complaint.reopenCount).toBe(1);
    expect(reopenRes.body.data.complaint.priorCycles.length).toBe(1);

    // 14. Admin reassigns staff member for cycle 2
    const reassignRes = await request(app)
      .post(`/api/v1/complaints/${complaintId}/assignment`)
      .set(mutationHeaders(adminToken))
      .send({
        staffId: String(staff._id),
        expectedVersion: version,
        note: 'Reassigned to fix loose faceplate screws.',
      });
    expect(reassignRes.status).toBe(200);
    version = reassignRes.body.data.complaint.version;
    expect(reassignRes.body.data.complaint.status).toBe('ASSIGNED');

    // 15. Staff begins work on cycle 2
    const start2Res = await request(app)
      .post(`/api/v1/complaints/${complaintId}/transitions`)
      .set(mutationHeaders(staffToken))
      .send({
        toStatus: 'IN_PROGRESS',
        expectedVersion: version,
        note: 'Installed new wall anchors and secured mounting plate securely.',
      });
    expect(start2Res.status).toBe(200);
    version = start2Res.body.data.complaint.version;

    // 16. Staff resolves cycle 2
    const resolve2Res = await request(app)
      .post(`/api/v1/complaints/${complaintId}/transitions`)
      .set(mutationHeaders(staffToken))
      .send({
        toStatus: 'RESOLVED',
        expectedVersion: version,
        resolutionNote: 'Fitted metal rawlplugs into concrete backbox. Plate is completely rigid and safe.',
      });
    expect(resolve2Res.status).toBe(200);
    version = resolve2Res.body.data.complaint.version;
    expect(resolve2Res.body.data.complaint.status).toBe('RESOLVED');

    // 17. Student confirms and closes the complaint
    const closeRes = await request(app)
      .post(`/api/v1/complaints/${complaintId}/transitions`)
      .set(mutationHeaders(studentToken))
      .send({
        toStatus: 'CLOSED',
        expectedVersion: version,
        note: 'Faceplate is rock solid and switch works perfectly. Thank you!',
      });
    expect(closeRes.status).toBe(200);
    version = closeRes.body.data.complaint.version;
    expect(closeRes.body.data.complaint.status).toBe('CLOSED');

    // 18. Student updates feedback to 5 stars for cycle 2
    const feedbackRes2 = await request(app)
      .post(`/api/v1/complaints/${complaintId}/feedback`)
      .set(mutationHeaders(studentToken))
      .send({
        expectedVersion: version,
        rating: 5,
        comment: 'Outstanding repair on follow up! Very responsive.',
      });
    expect(feedbackRes2.status).toBe(201);
    version = feedbackRes2.body.data.complaint.version;
    expect(feedbackRes2.body.data.feedback.rating).toBe(5);
    expect(feedbackRes2.body.data.feedback.cycleNumber).toBe(2);
    expect(feedbackRes2.body.data.feedback.isCurrent).toBe(true);

    // 19. Verify full chronological activity stream
    const actRes = await request(app)
      .get(`/api/v1/complaints/${complaintId}/activity`)
      .set(readHeaders(studentToken));
    expect(actRes.status).toBe(200);
    const activityTypes = actRes.body.data.map((a) => a.type);

    expect(activityTypes).toContain('CREATED');
    expect(activityTypes).toContain('TRIAGED');
    expect(activityTypes).toContain('ASSIGNED');
    expect(activityTypes).toContain('COMMENT_ADDED');
    expect(activityTypes).toContain('WORK_STARTED');
    expect(activityTypes).toContain('RESOLVED');
    expect(activityTypes).toContain('FEEDBACK_SUBMITTED');
    expect(activityTypes).toContain('REOPENED');
    expect(activityTypes).toContain('CLOSED');

    // 20. Verify final detail projection
    const finalDetailRes = await request(app)
      .get(`/api/v1/complaints/${complaintId}`)
      .set(readHeaders(studentToken));
    expect(finalDetailRes.status).toBe(200);
    const finalComplaint = finalDetailRes.body.data.complaint;
    expect(finalComplaint.status).toBe('CLOSED');
    expect(finalComplaint.reopenCount).toBe(1);
    expect(finalComplaint.cycleNumber).toBe(2);
    expect(finalComplaint.priorCycles.length).toBe(1);
    expect(finalComplaint.feedback.rating).toBe(5);
    expect(finalComplaint.feedback.isCurrent).toBe(true);
  });
});
