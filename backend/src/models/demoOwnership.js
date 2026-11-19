const path = require('node:path');
const REGISTRY = 'hostelfix_demo_ownership';
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const UUID =
  /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const parents = {
  Session: ['User', 'userId'],
  Complaint: ['User', 'ownerId'],
  Attachment: ['User', 'ownerId'],
  Activity: ['Complaint', 'complaintId'],
  Comment: ['Complaint', 'complaintId'],
  Feedback: ['Complaint', 'complaintId'],
};

function addDemoOwnership(schema) {
  schema.add({
    demoSeedOwner: {
      type: String,
      select: false,
      immutable: true,
      match: UUID,
    },
  });
  schema.pre('validate', async function () {
    if (!this.isNew || this.demoSeedOwner) return;
    const connection = this.constructor.db;
    if (connection?.$demoSeedOwner)
      this.demoSeedOwner = connection.$demoSeedOwner;
    else {
      const parent = parents[this.constructor.modelName];
      if (parent && this[parent[1]] && connection?.readyState === 1) {
        const doc = await connection.models[parent[0]]
          .findById(this[parent[1]])
          .select('+demoSeedOwner')
          .session(this.$session() ?? null)
          .lean();
        if (doc?.demoSeedOwner) this.demoSeedOwner = doc.demoSeedOwner;
      }
    }
  });
  schema.pre('save', function () {
    if (this.demoSeedOwner && !this.$session()?.inTransaction())
      throw new Error('Demo-owned writes require a transaction.');
  });
  schema.post('save', async function (doc) {
    if (!doc.demoSeedOwner) return;
    const Model = doc.constructor;
    const result = await Model.db.db.collection(REGISTRY).updateOne(
      {
        _id: doc.demoSeedOwner,
        projectRoot: PROJECT_ROOT,
        status: { $in: ['seeding', 'ready'] },
        [`collections.${Model.modelName}`]: Model.collection.name,
      },
      { $addToSet: { [`ids.${Model.modelName}`]: doc._id } },
      { session: doc.$session() }
    );
    if (!result.matchedCount)
      throw new Error('Demo ownership registry is missing or locked.');
  });
}
module.exports = { addDemoOwnership, REGISTRY, PROJECT_ROOT, UUID };
