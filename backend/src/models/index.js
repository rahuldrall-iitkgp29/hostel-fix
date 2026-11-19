const factories = Object.freeze({
  User: require('./User').userSchema,
  Session: require('./Session').sessionSchema,
  Hostel: require('./Hostel').hostelSchema,
  Block: require('./Block').blockSchema,
  Room: require('./Room').roomSchema,
  Category: require('./Category').categorySchema,
  Complaint: require('./Complaint').complaintSchema,
  Activity: require('./Activity').activitySchema,
  Comment: require('./Comment').commentSchema,
  Attachment: require('./Attachment').attachmentSchema,
  Feedback: require('./Feedback').feedbackSchema,
  HostelPolicy: require('./HostelPolicy').hostelPolicySchema,
});

// Registration is explicit and connection-local. Importing does not connect,
// create global Mongoose models, read configuration, or start index builds.
function createModels(connection, { collectionPrefix = '' } = {}) {
  if (collectionPrefix && !/^seed_[a-f\d]{32}_$/.test(collectionPrefix))
    throw new Error('Invalid isolated seed-test collection prefix.');
  return Object.fromEntries(
    Object.entries(factories).map(([name, factory]) => [
      name,
      connection.models[name] ??
        (() => {
          const schema = factory();
          if (collectionPrefix)
            schema.set(
              'collection',
              `${collectionPrefix}${require('mongoose').pluralize()(name)}`
            );
          return connection.model(name, schema);
        })(),
    ])
  );
}

async function ensureIndexes(models) {
  // Add declared indexes only. syncIndexes() can drop unrelated indexes.
  for (const model of Object.values(models)) await model.ensureIndexes();
}

async function verifyIndexes(models) {
  for (const model of Object.values(models)) {
    const actual = await model.collection.listIndexes().toArray();
    for (const [key, options] of model.schema.indexes()) {
      const matches = actual.some(
        (index) =>
          JSON.stringify(index.key) === JSON.stringify(key) &&
          Boolean(index.unique) === Boolean(options.unique) &&
          index.expireAfterSeconds === options.expireAfterSeconds &&
          JSON.stringify(index.partialFilterExpression) ===
            JSON.stringify(options.partialFilterExpression)
      );
      if (!matches)
        throw new Error(
          'Required database indexes are missing. Run db:ensure-indexes before startup.'
        );
    }
  }
}
module.exports = { createModels, ensureIndexes, verifyIndexes };
