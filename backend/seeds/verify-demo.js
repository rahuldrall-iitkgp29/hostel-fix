const { summary } = require('./demo');
const { DOMAINS } = require('./demo-plan');
const { REGISTRY, PROJECT_ROOT } = require('../src/models/demoOwnership');
async function verifyDemo({ database, models, owner }) {
  const manifest = await database.connection.db.collection(REGISTRY).findOne({
    _id: owner,
    projectRoot: PROJECT_ROOT,
    kind: 'demo-v2',
    status: 'ready',
  });
  if (!manifest) throw new Error('Ready demo ownership manifest is missing.');
  const data = {};
  for (const [name, Model] of Object.entries(models))
    data[name] = await Model.find({ demoSeedOwner: owner })
      .select('+demoSeedOwner')
      .lean();
  const users = new Map(data.User.map((user) => [String(user._id), user]));
  const hostels = new Set(data.Hostel.map((doc) => String(doc._id)));
  const blocks = new Map(data.Block.map((doc) => [String(doc._id), doc]));
  const rooms = new Map(data.Room.map((doc) => [String(doc._id), doc]));
  const categories = new Map(
    data.Category.map((doc) => [String(doc._id), doc])
  );
  const check = (condition, message) => {
    if (!condition) throw new Error(`Demo validation failed: ${message}`);
  };
  check(
    data.Hostel.length === 3 && data.Block.length === 12,
    'expected 3 hostels and 12 wings'
  );
  const students = data.User.filter((user) => user.role === 'STUDENT');
  const staff = data.User.filter((user) => user.role === 'STAFF');
  const admins = data.User.filter((user) => user.role === 'ADMIN');
  check(
    students.length === 84 && admins.length === 2 && staff.length === 15,
    'account counts'
  );
  for (const hostel of data.Hostel)
    check(
      data.Block.filter(
        (block) => String(block.hostelId) === String(hostel._id)
      ).length === 4,
      'four wings per hostel'
    );
  for (const block of data.Block)
    check(
      students.filter((user) => String(user.blockId) === String(block._id))
        .length === 7,
      'seven students per wing'
    );
  for (const domain of DOMAINS)
    check(
      staff.filter((user) =>
        user.categoryIds.some(
          (id) => categories.get(String(id))?.code === domain.code
        )
      ).length === 3,
      'three staff per domain'
    );
  for (const user of students)
    check(
      hostels.has(String(user.hostelId)) &&
        String(blocks.get(String(user.blockId))?.hostelId) ===
          String(user.hostelId) &&
        String(rooms.get(String(user.roomId))?.blockId) ===
          String(user.blockId),
      'student allocation'
    );
  for (const admin of admins)
    check(
      admin.status === 'ACTIVE' &&
        !admin.mustChangePassword &&
        [...hostels].every((id) =>
          admin.adminHostelIds.map(String).includes(id)
        ),
      'administrator scope/login'
    );
  check(data.Complaint.length === 84, '84 initial complaints');
  check(
    new Set(data.Complaint.map((doc) => String(doc.ownerId))).size === 84,
    'distinct complainants'
  );
  for (const doc of data.Complaint) {
    const user = users.get(String(doc.ownerId));
    const category = categories.get(String(doc.categoryId));
    check(
      user?.role === 'STUDENT' &&
        String(user.hostelId) === String(doc.hostelId) &&
        String(user.blockId) === String(doc.location.blockId) &&
        String(user.roomId) === String(doc.location.roomId),
      'complaint location/owner'
    );
    check(
      String(category?.hostelId) === String(doc.hostelId),
      'category scope'
    );
    check(
      +doc.createdAt <= Date.now() && +doc.updatedAt >= +doc.createdAt,
      'creation/update timestamps'
    );
    const events = data.Activity.filter(
      (event) => String(event.complaintId) === String(doc._id)
    ).sort((a, b) => +a.occurredAt - +b.occurredAt);
    check(
      events[0]?.type === 'CREATED' &&
        +events[0].occurredAt === +doc.createdAt &&
        events.length === doc.version,
      'versioned audit sequence'
    );
    check(
      events.every(
        (event) =>
          +event.occurredAt >= +doc.createdAt &&
          +event.occurredAt <= Date.now() &&
          users.has(String(event.actorId))
      ),
      'activity actors/dates'
    );
    check(
      events.at(-1).newStatus === doc.status &&
        +events.at(-1).occurredAt === +doc.updatedAt,
      'latest activity state'
    );
    if (doc.assigneeId) {
      const assignee = users.get(String(doc.assigneeId));
      check(
        assignee?.role === 'STAFF' &&
          String(assignee.hostelId) === String(doc.hostelId) &&
          assignee.categoryIds.map(String).includes(String(doc.categoryId)),
        'eligible staff assignment'
      );
    }
    if (['RESOLVED', 'CLOSED'].includes(doc.status)) {
      const assigned = events.find((event) => event.type === 'ASSIGNED');
      check(
        doc.resolvedAt &&
          +doc.resolvedAt >= +assigned.occurredAt &&
          String(doc.resolverId) === String(doc.assigneeId) &&
          doc.resolutionNote.length >= 20,
        'resolution fields'
      );
      if (doc.status === 'CLOSED')
        check(
          doc.closedAt &&
            +doc.closedAt >= +doc.resolvedAt &&
            data.Feedback.some(
              (feedback) => String(feedback.complaintId) === String(doc._id)
            ),
          'closure/feedback'
        );
    } else
      check(
        doc.resolvedAt == null &&
          doc.closedAt == null &&
          doc.resolverId == null,
        'unresolved fields'
      );
  }
  const result = await summary(models, owner);
  check(
    result.finished / 84 >= 0.75 && result.finished / 84 <= 0.85,
    'approximately 80% finished'
  );
  return { ...result, valid: true, staffPerDomain: 3, studentsPerWing: 7 };
}
module.exports = { verifyDemo };
