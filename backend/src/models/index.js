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
function createModels(connection) {
  return Object.fromEntries(
    Object.entries(factories).map(([name, factory]) => [
      name,
      connection.models[name] ?? connection.model(name, factory()),
    ])
  );
}

async function ensureIndexes(models) {
  // Add declared indexes only. syncIndexes() can drop unrelated indexes.
  for (const model of Object.values(models)) await model.ensureIndexes();
}

module.exports = { createModels, ensureIndexes };
