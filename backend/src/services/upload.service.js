const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { AppError, unavailable } = require('../utils/AppError');
const { validateImage } = require('../utils/imageValidation');
const { attachment: projectAttachment } = require('../models/projections');
const { authorizedTransaction } = require('../utils/authorizedTransaction');
const { removeTemporaryUpload } = require('../utils/temporaryUploads');

function createUploadService({ connection, models, config, sessions }) {
  async function createUpload({ file, user }) {
    let targetPath;
    let ownsTarget = false;
    let saved = false;
    try {
      if (user.role !== 'STUDENT')
        throw new AppError(
          403,
          'FORBIDDEN',
          'Only students can stage uploads.'
        );
      let buffer;
      try {
        buffer = await fs.readFile(file.filepath);
      } catch {
        throw unavailable();
      }
      const { mimeType, width, height, sizeBytes } = validateImage(buffer);
      let originalName = path
        .basename(file.originalFilename || 'upload.jpg')
        .replace(/[\x00-\x1f\x7f/\\<>:"|?*]/g, '_')
        .trim()
        .slice(0, 255);
      if (!originalName || /^\.+$/.test(originalName))
        originalName = 'upload.jpg';
      const ext =
        mimeType === 'image/png'
          ? '.png'
          : mimeType === 'image/webp'
            ? '.webp'
            : '.jpg';
      const storageKey = `${randomUUID()}${ext}`;
      targetPath = path.join(config.UPLOAD_DIR, storageKey);
      try {
        await fs.mkdir(config.UPLOAD_DIR, { recursive: true });
        const handle = await fs.open(targetPath, 'wx', 0o600);
        ownsTarget = true;
        try {
          await handle.writeFile(buffer);
        } finally {
          await handle.close();
        }
      } catch {
        throw unavailable();
      }
      const attachment = await authorizedTransaction(
        connection,
        sessions,
        user,
        async (session) => {
          const count = await models.Attachment.countDocuments({
            ownerId: user._id,
            complaintId: null,
          }).session(session);
          if (count >= 10)
            throw new AppError(
              409,
              'UPLOAD_QUOTA_EXCEEDED',
              'Upload quota exceeded (maximum 10 unattached uploads).'
            );
          const record = new models.Attachment({
            ownerId: user._id,
            originalName,
            mimeType,
            sizeBytes,
            width,
            height,
            storageKey,
          });
          await record.save({ session });
          return record;
        }
      );
      saved = true;
      return {
        attachment: projectAttachment(attachment),
        expiresAt: attachment.expiresAt.toISOString(),
      };
    } finally {
      await removeTemporaryUpload(file.filepath);
      if (ownsTarget && !saved) {
        // An unknown transaction commit outcome may have persisted the record.
        // Never delete content until the database proves it is unreferenced.
        try {
          if (
            !(await models.Attachment.exists({
              storageKey: path.basename(targetPath),
            }))
          )
            await fs.unlink(targetPath);
        } catch {
          /* The orphan cleanup worker retries after database recovery. */
        }
      }
    }
  }

  async function getContent(attachmentId, user) {
    const attachment =
      await models.Attachment.findById(attachmentId).select('+storageKey');
    if (!attachment) {
      throw new AppError(404, 'NOT_FOUND', 'Attachment not found.');
    }

    if (attachment.complaintId == null) {
      if (String(attachment.ownerId) !== String(user._id)) {
        throw new AppError(404, 'NOT_FOUND', 'Attachment not found.');
      }
      if (attachment.expiresAt && attachment.expiresAt < new Date()) {
        throw new AppError(404, 'NOT_FOUND', 'Attachment expired.');
      }
    } else {
      const complaint = await models.Complaint.findById(attachment.complaintId);
      if (!complaint) {
        throw new AppError(404, 'NOT_FOUND', 'Attachment not found.');
      }

      let authorized = false;
      if (user.role === 'STUDENT') {
        authorized = String(complaint.ownerId) === String(user._id);
      } else if (user.role === 'STAFF') {
        authorized =
          String(complaint.assigneeId) === String(user._id) &&
          String(complaint.hostelId) === String(user.hostelId);
      } else if (user.role === 'ADMIN') {
        const adminHostels = (user.adminHostelIds ?? []).map(String);
        authorized = adminHostels.includes(String(complaint.hostelId));
      }

      if (!authorized) {
        throw new AppError(404, 'NOT_FOUND', 'Attachment not found.');
      }
    }

    const filePath = path.join(config.UPLOAD_DIR, attachment.storageKey);
    try {
      const data = await fs.readFile(filePath);
      return { data, attachment };
    } catch {
      throw unavailable();
    }
  }

  async function deleteUpload(attachmentId, user) {
    if (user.role !== 'STUDENT') {
      throw new AppError(
        403,
        'FORBIDDEN',
        'Only students can manage staged uploads.'
      );
    }

    const attachment =
      await models.Attachment.findById(attachmentId).select('+storageKey');
    if (!attachment) {
      throw new AppError(404, 'NOT_FOUND', 'Attachment not found.');
    }

    if (String(attachment.ownerId) !== String(user._id)) {
      throw new AppError(404, 'NOT_FOUND', 'Attachment not found.');
    }

    if (attachment.complaintId != null) {
      throw new AppError(
        409,
        'ATTACHMENT_ALREADY_BOUND',
        'Bound attachments cannot be deleted.'
      );
    }

    await authorizedTransaction(connection, sessions, user, async (session) => {
      const current =
        await models.Attachment.findById(attachmentId).session(session);
      if (!current)
        throw new AppError(404, 'NOT_FOUND', 'Attachment not found.');
      if (current.complaintId)
        throw new AppError(
          409,
          'ATTACHMENT_ALREADY_BOUND',
          'Bound attachments cannot be deleted.'
        );
      await models.Attachment.deleteOne(
        { _id: current._id, complaintId: null },
        { session }
      );
    });

    const filePath = path.join(config.UPLOAD_DIR, attachment.storageKey);
    await fs.unlink(filePath).catch(() => {});
  }

  return {
    createUpload,
    getContent,
    deleteUpload,
  };
}

module.exports = { createUploadService };
