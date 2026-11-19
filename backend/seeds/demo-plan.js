const { createHash } = require('node:crypto');
const { Types } = require('mongoose');
const { DEFAULT_POLICY } = require('./index');
const { computePriority } = require('../src/services/priority.service');
const { computeDeadlines } = require('../src/services/sla.service');
const {
  computeCanonicalPayloadHash,
} = require('../src/services/complaint.service');
const HOSTELS = [
  { key: 'tagore', name: 'Tagore Residency', code: 'DEMO-TAGORE' },
  { key: 'sarojini', name: 'Sarojini Hall', code: 'DEMO-SAROJINI' },
  { key: 'vivekananda', name: 'Vivekananda House', code: 'DEMO-VIVEKANANDA' },
];
const WINGS = ['East Wing', 'West Wing', 'North Wing', 'South Wing'];
const DOMAINS = [
  {
    code: 'ELECTRICAL',
    name: 'Electrical',
    issues: [
      'Ceiling fan does not start',
      'Ceiling fan makes grinding noise',
      'Study light flickers continuously',
      'Wall socket sparks when switched on',
      'Bathroom light does not work',
      'Fan speed regulator is stuck',
    ],
  },
  {
    code: 'PLUMBING',
    name: 'Plumbing',
    issues: [
      'Water leaks below the washbasin',
      'Bathroom tap handle is damaged',
      'Shower drain is blocked',
      'Toilet cistern fills continuously',
      'Bathroom pipe joint is leaking',
      'Shower has very low water pressure',
    ],
  },
  {
    code: 'FURNITURE',
    name: 'Furniture',
    issues: [
      'Study chair has a loose backrest',
      'Desk drawer handle has broken',
      'Wardrobe hinge needs replacement',
      'Bed frame creaks and moves',
      'Study table leg is unstable',
      'Cupboard lock does not close',
    ],
  },
  {
    code: 'CIVIL',
    name: 'Civil & Structural',
    issues: [
      'Window latch no longer closes',
      'Door frame has a widening crack',
      'Bathroom floor tile is loose',
      'Rainwater enters through the window',
      'Wall plaster is peeling near the bed',
      'Room door scrapes the floor',
    ],
  },
  {
    code: 'CLEANING',
    name: 'Cleaning & Hygiene',
    issues: [
      'Scheduled bathroom cleaning was missed',
      'Dust has collected under room furniture',
      'Corridor waste bin needs cleaning',
      'Cobwebs remain around the ceiling',
      'Washroom floor needs deep cleaning',
      'Cleaning supplies spill needs removal',
    ],
  },
];
const FIRST = [
  'Aarav',
  'Asha',
  'Ananya',
  'Arjun',
  'Diya',
  'Ishaan',
  'Kavya',
  'Meera',
  'Neel',
  'Priya',
  'Rohan',
  'Sana',
  'Vikram',
  'Zoya',
];
const LAST = ['Sharma', 'Das', 'Rao', 'Patel', 'Sen', 'Nair'];
const DAY = 86_400_000;
function makePlan(owner, generatedAt = new Date()) {
  const id = (key) =>
    new Types.ObjectId(
      createHash('sha256').update(`${owner}:${key}`).digest('hex').slice(0, 24)
    );
  const plan = {
    owner,
    generatedAt,
    hostels: [],
    wings: [],
    rooms: [],
    categories: [],
    policies: [],
    students: [],
    admins: [],
    staff: [],
    complaints: [],
  };
  for (const [h, hostel] of HOSTELS.entries()) {
    const hostelId = id(`hostel:${h}`);
    plan.hostels.push({ _id: hostelId, ...hostel, isActive: true });
    plan.policies.push({
      _id: id(`policy:${h}`),
      hostelId,
      ...DEFAULT_POLICY,
      policyVersion: 1,
    });
    for (const [d, domain] of DOMAINS.entries()) {
      const categoryId = id(`category:${h}:${d}`);
      plan.categories.push({
        _id: categoryId,
        hostelId,
        code: domain.code,
        name: domain.name,
        description: `${domain.name} repairs and service requests.`,
        isActive: true,
      });
      plan.staff.push({
        _id: id(`staff:${h}:${d}`),
        name: `${FIRST[(h * 5 + d) % FIRST.length]} ${LAST[h]} Technician`,
        email: `staff.${domain.code.toLowerCase()}.${hostel.key}@demo.hostelfix.test`,
        phone: `+91920000${String(h * 5 + d).padStart(4, '0')}`,
        role: 'STAFF',
        status: 'ACTIVE',
        mustChangePassword: false,
        hostelId,
        blockId: null,
        roomId: null,
        categoryIds: [categoryId],
        adminHostelIds: [],
        domain: domain.code,
      });
    }
    for (let w = 0; w < 4; w += 1) {
      const blockId = id(`wing:${h}:${w}`);
      plan.wings.push({
        _id: blockId,
        hostelId,
        name: WINGS[w],
        code: `WING-${'ABCD'[w]}`,
        isActive: true,
      });
      const rooms = Array.from({ length: 4 }, (_, r) => ({
        _id: id(`room:${h}:${w}:${r}`),
        hostelId,
        blockId,
        label: `${'TSV'[h]}-${'ABCD'[w]}-${101 + r}`,
        isActive: true,
      }));
      plan.rooms.push(...rooms);
      for (let s = 0; s < 7; s += 1) {
        const n = h * 28 + w * 7 + s;
        plan.students.push({
          _id: id(`student:${n}`),
          name: `${FIRST[n % FIRST.length]} ${LAST[Math.floor(n / FIRST.length)]}`,
          email: `student.${hostel.key}.${'abcd'[w]}${String(s + 1).padStart(2, '0')}@demo.hostelfix.test`,
          phone: `+91910000${String(n).padStart(4, '0')}`,
          role: 'STUDENT',
          status: 'ACTIVE',
          mustChangePassword: false,
          hostelId,
          blockId,
          roomId: rooms[Math.floor(s / 2)]._id,
          categoryIds: [],
          adminHostelIds: [],
        });
      }
    }
  }
  for (const [i, name] of ['Priya Operations', 'Aditya Warden'].entries())
    plan.admins.push({
      _id: id(`admin:${i}`),
      name,
      email: `admin.${i === 0 ? 'operations' : 'warden'}@demo.hostelfix.test`,
      role: 'ADMIN',
      status: 'ACTIVE',
      mustChangePassword: false,
      hostelId: null,
      blockId: null,
      roomId: null,
      categoryIds: [],
      adminHostelIds: plan.hostels.map((hostel) => hostel._id),
      phone: `+91930000000${i}`,
    });
  let closed = 0;
  for (const [n, student] of plan.students.entries()) {
    const h = Math.floor(n / 28);
    const local = n % 28;
    const assignedOpen = local < 5;
    const submitted = h === 1 && local === 7;
    const triaged = h === 2 && local === 14;
    const open = assignedOpen || submitted || triaged;
    const domainIndex = assignedOpen ? local : n % DOMAINS.length;
    const category = plan.categories[h * 5 + domainIndex];
    const staff = plan.staff[h * 5 + domainIndex];
    const status = submitted
      ? 'SUBMITTED'
      : triaged
        ? 'TRIAGED'
        : assignedOpen
          ? (h * 5 + local) % 2 === 0
            ? 'ASSIGNED'
            : 'IN_PROGRESS'
          : closed++ < 45
            ? 'CLOSED'
            : 'RESOLVED';
    const createdAt = new Date(
      +generatedAt -
        (submitted
          ? 2 / 24
          : triaged
            ? 4 / 24
            : open
              ? 1 + (n % 4)
              : 8 + ((n * 7) % 77)) *
          DAY -
        (n % 5) * 60_000
    );
    const indicators = {
      safetyRisk: domainIndex === 0 && n % 3 === 0,
      essentialServiceOutage: domainIndex < 2 && n % 4 === 0,
      affectsMultipleRooms: n % 9 === 0,
      functionalityLoss: domainIndex !== 4 && n % 5 !== 0,
    };
    const { suggestedPriority, priorityExplanation } = computePriority(
      indicators,
      DEFAULT_POLICY
    );
    const room = plan.rooms.find(
      (entry) => String(entry._id) === String(student.roomId)
    );
    const issue = DOMAINS[domainIndex].issues[Math.floor(n / 5) % 6];
    const input = {
      title: `${issue} in ${room.label} (bed ${(local % 2) + 1})`,
      description: `${issue}. ${student.name} noticed the problem during routine use in ${WINGS[Math.floor(local / 7)]}. Please inspect the affected fitting, complete the repair, and check it before leaving. Access is available after afternoon classes.`,
      categoryId: category._id,
      location: {
        type: 'ROOM',
        hostelId: student.hostelId,
        blockId: student.blockId,
        roomId: student.roomId,
      },
      indicators,
      attachmentIds: [],
    };
    plan.complaints.push({
      _id: id(`complaint:${n}`),
      reference: `HFX-${createdAt.getFullYear()}-D${String(n + 1).padStart(9, '0')}`,
      ownerId: student._id,
      hostelId: student.hostelId,
      ...input,
      clientRequestId: `${createHash('sha256').update(`${owner}:request:${n}`).digest('hex').slice(0, 8)}-0000-4000-8000-${String(n + 1).padStart(12, '0')}`,
      clientRequestHash: computeCanonicalPayloadHash(input),
      priority: suggestedPriority,
      suggestedPriority,
      prioritySource: 'RULE',
      priorityExplanation,
      slaPolicy: DEFAULT_POLICY.slaTargets,
      ...computeDeadlines({
        cycleStart: createdAt,
        priority: suggestedPriority,
        slaTargets: DEFAULT_POLICY.slaTargets,
      }),
      createdAt,
      updatedAt: createdAt,
      targetStatus: status,
      staff,
      student,
      admin: plan.admins[h % 2],
      index: n,
    });
  }
  return plan;
}
module.exports = { makePlan, HOSTELS, WINGS, DOMAINS, DAY };
