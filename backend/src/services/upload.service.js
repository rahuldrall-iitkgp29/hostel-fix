const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { AppError, unavailable } = require('../utils/AppError');
const { validateImage } = require('../utils/imageValidation');
const { attachment: projectAttachment } = require('../models/projections');
const { runTransaction } = require('../utils/transactions');

function createUploadService({ connection, models, config }) {
  async function createUpload({ file, user }) {
    if (user.role !== 'STUDENT') {
      throw new AppError(403, 'FORBIDDEN', 'Only students can stage uploads.');
    }

    const unattachedCount = await models.Attachment.countDocuments({
      ownerId: user._id,
      complaintId: null,
    });
    if (unattachedCount >= 10) {
      throw new AppError(409, 'UPLOAD_QUOTA_EXCEEDED', 'Upload quota exceeded (maximum 10 unattached uploads).');
    }

    let buffer;
    try {
      buffer = await fs.readFile(file.filepath);
    } catch {
      throw unavailable();
    }

    const { mimeType, width, height, sizeBytes } = validateImage(buffer);

    let originalName = path.basename(file.originalFilename || 'upload.jpg')
      .replace(/[\x00-\x1f\x7f/\\<>:"|?*]/g, '_')
      .trim();
    if (!originalName || /^\.+$/.test(originalName)) {
      originalName = 'upload.jpg';
    }

    const ext = mimeType === 'image/png' ? '.png' : (mimeType === 'image/webp' ? '.webp' : '.jpg');
    const storageKey = `${randomUUID()}${ext}`;
    const targetPath = path.join(config.UPLOAD_DIR, storageKey);

    try {
      await fs.mkdir(config.UPLOAD_DIR, { recursive: true });
      await fs.writeFile(targetPath, buffer, { flag: 'wx', mode: 0o600 });
    } catch {
      throw unavailable();
    } finally {
      await fs.unlink(file.filepath).catch(() => {});
    }

    let attachment;
    try {
      attachment = new models.Attachment({
        ownerId: user._id,
        originalName,
        mimeType,
        sizeBytes,
        width,
        height,
        storageKey,
      });
      await attachment.save();
    } catch (error) {
      await fs.unlink(targetPath).catch(() => {});
      throw error;
    }

    return {
      attachment: projectAttachment(attachment),
      expiresAt: attachment.expiresAt.toISOString(),
    };
  }

  async function getContent(attachmentId, user) {
    const attachment = await models.Attachment.findById(attachmentId).select('+storageKey');
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
        authorized = String(complaint.assigneeId) === String(user._id)
          && String(complaint.hostelId) === String(user.hostelId);
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
      throw new AppError(403, 'FORBIDDEN', 'Only students can manage staged uploads.');
    }

    const attachment = await models.Attachment.findById(attachmentId).select('+storageKey');
    if (!attachment) {
      throw new AppError(404, 'NOT_FOUND', 'Attachment not found.');
    }

    if (String(attachment.ownerId) !== String(user._id)) {
      throw new AppError(404, 'NOT_FOUND', 'Attachment not found.');
    }

    if (attachment.complaintId != null) {
      throw new AppError(409, 'ATTACHMENT_ALREADY_BOUND', 'Bound attachments cannot be deleted.');
    }

    await runTransaction(connection, async (session) => {
      await models.Attachment.deleteOne({ _id: attachment._id }, { session });
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
