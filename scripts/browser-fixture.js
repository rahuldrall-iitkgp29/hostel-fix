const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const {
  openAuthDatabase,
  password,
} = require('../backend/tests/helpers/auth.helper');
const { startServer } = require('../backend/src/server');
const { createStorage } = require('../backend/src/config/storage');

async function main() {
  const fixture = await openAuthDatabase();
  const directory = path.resolve(
    __dirname,
    '../frontend/.local',
    `browser-${randomUUID()}`
  );
  await fs.mkdir(directory, { recursive: true });
  const student = await fixture.user({ name: 'Browser Student' });
  const staff = await fixture.user({
    role: 'STAFF',
    name: 'Browser Technician',
  });
  const admin = await fixture.user({ role: 'ADMIN', name: 'Browser Admin' });
  const other = await fixture.user({ name: 'Browser Other Student' });
  const config = {
    ...fixture.config,
    PORT: 5100,
    CORS_ORIGIN: 'http://localhost:3100',
    UPLOAD_DIR: directory,
    COOKIE_SECURE: false,
    LOG_LEVEL: 'silent',
  };
  const server = await startServer({
    config,
    database: fixture.database,
    storage: createStorage(config),
  });
  process.send?.({
    type: 'ready',
    data: {
      student: student.email,
      staff: staff.email,
      admin: admin.email,
      other: other.email,
      staffId: String(staff._id),
      categoryId: String(fixture.category._id),
      password,
    },
  });
  let stopping = false;
  async function stop() {
    if (stopping) return;
    stopping = true;
    try {
      await server.shutdown();
      // Reconnect for exact-ID cleanup after the HTTP server's shutdown.
      await fixture.database.connect();
      const owners = [student._id, staff._id, admin._id, other._id];
      const complaints = await fixture.models.Complaint.find({
        ownerId: { $in: owners },
      });
      const ids = complaints.map((doc) => doc._id);
      for (const doc of complaints)
        fixture.track(fixture.models.Complaint, { _id: doc._id });
      for (const name of ['Activity', 'Comment', 'Feedback']) {
        for (const doc of await fixture.models[name].find({
          complaintId: { $in: ids },
        }))
          fixture.track(fixture.models[name], { _id: doc._id });
      }
      for (const doc of await fixture.models.Attachment.find({
        ownerId: { $in: owners },
      }).select('+storageKey')) {
        fixture.track(fixture.models.Attachment, { _id: doc._id });
        await fs.unlink(path.join(directory, doc.storageKey)).catch(() => {});
      }
      await fixture.close();
      process.exit(0);
    } catch (error) {
      console.error(error.message);
      process.exit(1);
    }
  }
  process.on('message', (message) => {
    if (message === 'stop') void stop();
  });
  process.on('SIGTERM', () => {
    void stop();
  });
  process.on('SIGINT', () => {
    void stop();
  });
}
main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
