import assert from 'node:assert/strict';

const baseUrl = process.env.API_BASE_URL || 'http://localhost:5000/api/v1';

console.log('=== HostelFix P0 Full Lifecycle Live Integration Test ===');
console.log(`Connecting to backend at: ${baseUrl}`);

async function api(path, { method = 'GET', token, body } = {}) {
  const headers = {
    Origin: 'http://localhost:3000',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (method !== 'GET') {
    headers['Content-Type'] = 'application/json';
    headers['X-CSRF-Protection'] = '1';
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      `API Error ${res.status} on ${method} ${path}: ${JSON.stringify(json)}`
    );
  }
  return json;
}

async function runTest() {
  // 1. Student login
  console.log('\n[1] Student Login & Dashboard Check');
  const studentLogin = await api('/auth/login', {
    method: 'POST',
    body: { email: 'student.a@hostelfix.demo', password: 'DemoStudent@2026' },
  });
  assert.equal(
    studentLogin.data.user.role,
    'STUDENT',
    'Student user role must be STUDENT'
  );
  const studentToken = studentLogin.data.accessToken;
  const studentUser = studentLogin.data.user;
  console.log(
    `✓ Student authenticated: ${studentUser.name} (${studentUser.id})`
  );

  // Student dashboard
  const studentDashboard = await api('/dashboard/student', {
    token: studentToken,
  });
  assert.ok(
    typeof studentDashboard.data.open === 'number',
    'Student dashboard must have open count'
  );
  console.log(
    `✓ Student dashboard loaded: ${studentDashboard.data.open} open complaints`
  );

  // Fetch categories
  const categoriesRes = await api(
    `/categories?hostelId=${studentUser.hostelId}`,
    { token: studentToken }
  );
  const categories = categoriesRes.data;
  const plumbing = categories.find(
    (c) => c.code === 'PLUMBING' || c.name === 'Plumbing'
  );
  assert.ok(plumbing, 'Plumbing category must exist');
  console.log(
    `✓ Categories loaded (${categories.length} active), found ${plumbing.name}`
  );

  // 2. Student Create Complaint
  console.log('\n[2] Student Report Complaint with Rule-Based Priority');
  const clientRequestId = crypto.randomUUID();
  const createPayload = {
    title: 'Main bathroom shower head leaking heavily',
    description:
      'The shower head in our room bathroom is cracked and spraying water continuously over the floor.',
    categoryId: plumbing.id,
    location: {
      type: 'ROOM',
      hostelId: studentUser.hostelId,
      blockId: studentUser.blockId,
      roomId: studentUser.roomId,
    },
    indicators: {
      safetyRisk: true,
      essentialServiceOutage: false,
      affectsMultipleRooms: false,
      functionalityLoss: true,
    },
    attachmentIds: [],
    clientRequestId,
  };

  const createdRes = await api('/complaints', {
    method: 'POST',
    token: studentToken,
    body: createPayload,
  });
  const complaint = createdRes.data.complaint;
  assert.ok(complaint.id, 'Created complaint must have ID');
  assert.equal(
    complaint.status,
    'SUBMITTED',
    'Initial status must be SUBMITTED'
  );
  assert.equal(
    complaint.priority,
    'HIGH',
    'Safety risk + functionality loss must calculate HIGH priority'
  );
  assert.equal(complaint.version, 1, 'Initial version must be 1');
  console.log(
    `✓ Complaint created: #${complaint.reference} (ID: ${complaint.id}, Priority: ${complaint.priority})`
  );

  // 3. Admin Triage
  console.log('\n[3] Admin Login, Triage, and Eligible Staff Assignment');
  const adminLogin = await api('/auth/login', {
    method: 'POST',
    body: { email: 'admin.p@hostelfix.demo', password: 'DemoAdmin@2026!' },
  });
  assert.equal(
    adminLogin.data.user.role,
    'ADMIN',
    'Admin user role must be ADMIN'
  );
  const adminToken = adminLogin.data.accessToken;
  console.log(`✓ Admin authenticated: ${adminLogin.data.user.name}`);

  // Admin dashboard
  const adminDashboard = await api('/dashboard/admin', { token: adminToken });
  assert.ok(
    adminDashboard.data.statusCounts.SUBMITTED >= 1,
    'Submitted count must include new complaint'
  );
  console.log(
    `✓ Admin dashboard loaded: ${adminDashboard.data.statusCounts.SUBMITTED} need triage`
  );

  // Triage the complaint
  const triagedRes = await api(`/complaints/${complaint.id}/transitions`, {
    method: 'POST',
    token: adminToken,
    body: {
      expectedVersion: complaint.version,
      toStatus: 'TRIAGED',
      note: 'Urgent plumbing issue verified on 1st floor.',
    },
  });
  const triaged = triagedRes.data.complaint;
  assert.equal(triaged.status, 'TRIAGED', 'Status must update to TRIAGED');
  assert.equal(triaged.version, 2, 'Version must increment to 2');
  console.log(`✓ Complaint triaged by admin: status is now ${triaged.status}`);

  // Fetch eligible staff
  const staffRes = await api(
    `/admin/staff?hostelId=${studentUser.hostelId}&eligibleForComplaintId=${complaint.id}`,
    {
      token: adminToken,
    }
  );
  const staffList = staffRes.data;
  assert.ok(
    staffList.length > 0,
    'There must be eligible staff for Plumbing in Hostel A'
  );
  const ravi = staffList.find(
    (s) => s.email === 'staff.r@hostelfix.demo' || s.name.includes('Ravi')
  );
  assert.ok(ravi, 'Ravi Technician must be in eligible staff list');
  console.log(
    `✓ Eligible staff retrieved: found ${ravi.name} (Assigned open: ${ravi.openAssignedCount})`
  );

  // Assign complaint to Ravi
  const assignedRes = await api(`/complaints/${complaint.id}/assignment`, {
    method: 'POST',
    token: adminToken,
    body: {
      expectedVersion: triaged.version,
      staffId: ravi.id,
      note: 'Assigned to Ravi Technician for immediate shower head replacement.',
    },
  });
  const assigned = assignedRes.data.complaint;
  assert.equal(assigned.status, 'ASSIGNED', 'Status must update to ASSIGNED');
  assert.equal(assigned.assignee.id, ravi.id, 'Assignee must be Ravi');
  assert.equal(assigned.version, 3, 'Version must increment to 3');
  console.log(
    `✓ Complaint assigned to ${assigned.assignee.name}: status is ${assigned.status}`
  );

  // 4. Staff Work and Resolution
  console.log('\n[4] Staff Login, Work In-Progress, and Resolution');
  // Staff login - handle password change if required
  let staffLogin = await api('/auth/login', {
    method: 'POST',
    body: { email: 'staff.r@hostelfix.demo', password: 'DemoStaff@2026!' },
  }).catch(async () => {
    // If password was already updated in a previous run
    return api('/auth/login', {
      method: 'POST',
      body: { email: 'staff.r@hostelfix.demo', password: 'DemoStaff@2026New!' },
    });
  });

  let staffToken = staffLogin.data.accessToken;
  if (staffLogin.data.user.mustChangePassword) {
    console.log(
      '  Notice: Staff must change password on initial login. Testing password change flow...'
    );
    await api('/users/me/password', {
      method: 'POST',
      token: staffToken,
      body: {
        currentPassword: 'DemoStaff@2026!',
        newPassword: 'DemoStaff@2026New!',
      },
    });
    // Re-login with new password
    staffLogin = await api('/auth/login', {
      method: 'POST',
      body: { email: 'staff.r@hostelfix.demo', password: 'DemoStaff@2026New!' },
    });
    staffToken = staffLogin.data.accessToken;
    assert.equal(
      staffLogin.data.user.mustChangePassword,
      false,
      'mustChangePassword must be false after change'
    );
    console.log('✓ Password successfully changed for staff');
  }

  // Staff queue check
  const staffDashboard = await api('/dashboard/staff', { token: staffToken });
  assert.ok(
    staffDashboard.data.assignedPending >= 1,
    'Staff assigned count must be at least 1'
  );
  console.log(
    `✓ Staff dashboard loaded: ${staffDashboard.data.assignedPending} assigned jobs`
  );

  // Staff starts work
  const startWorkRes = await api(`/complaints/${complaint.id}/transitions`, {
    method: 'POST',
    token: staffToken,
    body: {
      expectedVersion: assigned.version,
      toStatus: 'IN_PROGRESS',
      note: 'On-site with new shower fixture and tools.',
    },
  });
  const inProgress = startWorkRes.data.complaint;
  assert.equal(
    inProgress.status,
    'IN_PROGRESS',
    'Status must update to IN_PROGRESS'
  );
  assert.equal(inProgress.version, 4, 'Version must increment to 4');
  console.log(`✓ Staff started work: status is now ${inProgress.status}`);

  // Staff posts a public progress comment
  const commentRes = await api(`/complaints/${complaint.id}/comments`, {
    method: 'POST',
    token: staffToken,
    body: {
      expectedVersion: inProgress.version,
      body: 'Removed old cracked fixture. Installing new high-pressure shower head.',
    },
  });
  assert.ok(commentRes.data.comment.id, 'Comment must have ID');
  console.log(`✓ Staff posted comment: "${commentRes.data.comment.body}"`);

  // Staff resolves complaint
  const resolveRes = await api(`/complaints/${complaint.id}/transitions`, {
    method: 'POST',
    token: staffToken,
    body: {
      expectedVersion: commentRes.data.complaint.version,
      toStatus: 'RESOLVED',
      resolutionNote:
        'Replaced cracked shower head fitting and tested water pressure. Everything working without leaks.',
    },
  });
  const resolved = resolveRes.data.complaint;
  assert.equal(resolved.status, 'RESOLVED', 'Status must update to RESOLVED');
  assert.ok(resolved.resolvedAt, 'resolvedAt must be recorded');
  console.log(`✓ Staff marked resolved: status is ${resolved.status}`);

  // 5. Student Confirmation and 5-Star Feedback
  console.log('\n[5] Student Closure with 5-Star Rating and Feedback');
  const feedbackRes = await api(`/complaints/${complaint.id}/feedback`, {
    method: 'POST',
    token: studentToken,
    body: {
      expectedVersion: resolved.version,
      rating: 5,
      comment: 'Prompt repair, thank you! Shower works great now.',
    },
  });
  const feedbackData = feedbackRes.data;
  assert.equal(feedbackData.feedback.rating, 5, 'Feedback rating must be 5');
  console.log(`✓ Student submitted 5-star feedback!`);

  // Student confirms closure
  const closeRes = await api(`/complaints/${complaint.id}/transitions`, {
    method: 'POST',
    token: studentToken,
    body: {
      expectedVersion: feedbackData.complaint.version,
      toStatus: 'CLOSED',
      note: 'Confirmed shower fix in room bathroom. Closing ticket.',
    },
  });
  const closed = closeRes.data.complaint;
  assert.equal(closed.status, 'CLOSED', 'Status must update to CLOSED');
  console.log(`✓ Student confirmed closure: final status is ${closed.status}`);

  // 6. Audit Trail Verification
  console.log('\n[6] Audit Activity Trail Verification');
  const activitiesRes = await api(`/complaints/${complaint.id}/activity`, {
    token: studentToken,
  });
  const activities = activitiesRes.data;
  const types = activities.map((a) => a.type);
  console.log(`✓ Recorded activity trail: ${types.join(' -> ')}`);
  assert.ok(types.includes('CREATED'), 'Must have CREATED activity');
  assert.ok(types.includes('TRIAGED'), 'Must have TRIAGED activity');
  assert.ok(types.includes('ASSIGNED'), 'Must have ASSIGNED activity');
  assert.ok(types.includes('WORK_STARTED'), 'Must have WORK_STARTED activity');
  assert.ok(types.includes('RESOLVED'), 'Must have RESOLVED activity');
  assert.ok(types.includes('CLOSED'), 'Must have CLOSED activity');
  assert.ok(
    types.includes('FEEDBACK_SUBMITTED'),
    'Must have FEEDBACK_SUBMITTED activity'
  );

  console.log('\n========================================================');
  console.log('🎉 ALL P0 LIFECYCLE REQUIREMENTS VERIFIED AND PASSING!');
  console.log('========================================================\n');
}

runTest().catch((err) => {
  console.error('\n❌ E2E Test Failed:\n', err);
  process.exit(1);
});
