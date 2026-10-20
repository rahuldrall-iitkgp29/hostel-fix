const crypto = require('node:crypto');
const { AppError } = require('../utils/AppError');
const { runTransaction, updateWithVersion } = require('../utils/transactions');
const { generateReference } = require('../utils/referenceGenerator');
const { computePriority } = require('./priority.service');
const { computeDeadlines, tightenDeadlines, DEFAULT_SLA_TARGETS } = require('./sla.service');
const { complaintSummary, complaintDetail, activity, comment, feedback } = require('../models/projections');
const { OPEN_STATUSES } = require('../models/enums');

function computeCanonicalPayloadHash({ title, description, categoryId, location, indicators, attachmentIds }) {
  const canonicalObj = {
    title: title.trim(),
    description: description.trim(),
    categoryId: String(categoryId).toLowerCase(),
    location: {
      type: location.type,
      hostelId: String(location.hostelId).toLowerCase(),
      blockId: location.blockId ? String(location.blockId).toLowerCase() : null,
      roomId: location.roomId ? String(location.roomId).toLowerCase() : null,
      areaLabel: location.areaLabel ? location.areaLabel.trim() : null,
    },
    indicators: {
      safetyRisk: Boolean(indicators?.safetyRisk),
      essentialServiceOutage: Boolean(indicators?.essentialServiceOutage),
      affectsMultipleRooms: Boolean(indicators?.affectsMultipleRooms),
      functionalityLoss: Boolean(indicators?.functionalityLoss),
    },
    attachmentIds: (attachmentIds || []).map((id) => String(id).toLowerCase()).sort(),
  };

  return crypto.createHash('sha256').update(JSON.stringify(canonicalObj)).digest('hex');
}

function getAllowedActions(complaint, user, now = new Date()) {
  const actions = [];
  const status = complaint.status;
  const ownerId = complaint.ownerId?._id || complaint.ownerId;
  const isOwner = user.role === 'STUDENT' && String(ownerId) === String(user._id);
  const assigneeId = complaint.assigneeId?._id || complaint.assigneeId;
  const isAssigned = user.role === 'STAFF' && String(assigneeId) === String(user._id);
  const isAdmin = user.role === 'ADMIN' && (user.adminHostelIds || []).map(String).includes(String(complaint.hostelId));

  const nonTerminal = ['SUBMITTED', 'TRIAGED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'REOPENED'].includes(status);

  if (isOwner) {
    if (status === 'SUBMITTED') {
      actions.push('EDIT');
    }
    if (nonTerminal) {
      actions.push('COMMENT');
    }
    if (status === 'RESOLVED') {
      actions.push('CLOSE');
      if (complaint.reopenUntil && now <= new Date(complaint.reopenUntil) && (complaint.reopenCount ?? 0) < 2) {
        actions.push('REOPEN');
      }
      actions.push('FEEDBACK');
    } else if (status === 'CLOSED') {
      actions.push('FEEDBACK');
    }
  } else if (isAssigned) {
    if (status === 'ASSIGNED') {
      actions.push('START_WORK');
    } else if (status === 'IN_PROGRESS') {
      actions.push('RESOLVE');
    }
    if (nonTerminal) {
      actions.push('COMMENT');
    }
  } else if (isAdmin) {
    if (status === 'SUBMITTED') {
      actions.push('TRIAGE', 'REJECT', 'CHANGE_PRIORITY');
    } else if (status === 'TRIAGED') {
      actions.push('ASSIGN', 'REJECT', 'CHANGE_PRIORITY');
    } else if (['ASSIGNED', 'IN_PROGRESS'].includes(status)) {
      actions.push('REASSIGN', 'CHANGE_PRIORITY');
    } else if (status === 'REOPENED') {
      actions.push('ASSIGN', 'CHANGE_PRIORITY');
    } else if (status === 'RESOLVED') {
      if (complaint.reopenUntil && now > new Date(complaint.reopenUntil)) {
        actions.push('CLOSE');
      }
    }
    if (nonTerminal) {
      actions.push('COMMENT');
    }
  }

  return actions;
}

function verifyComplaintScope(complaint, user) {
  if (user.role === 'STUDENT') {
    const ownerId = complaint.ownerId?._id || complaint.ownerId;
    if (String(ownerId) !== String(user._id)) {
      throw new AppError(404, 'NOT_FOUND', 'Complaint not found.');
    }
  } else if (user.role === 'STAFF') {
    const assigneeId = complaint.assigneeId?._id || complaint.assigneeId;
    if (!assigneeId || String(assigneeId) !== String(user._id) || String(complaint.hostelId) !== String(user.hostelId)) {
      throw new AppError(404, 'NOT_FOUND', 'Complaint not found.');
    }
  } else if (user.role === 'ADMIN') {
    const adminHostelIds = (user.adminHostelIds || []).map(String);
    if (!adminHostelIds.includes(String(complaint.hostelId))) {
      throw new AppError(404, 'NOT_FOUND', 'Complaint not found.');
    }
  }
}

function createComplaintService(context) {
  const { connection, models } = context;

  const loadDetail = async (complaintId, user, now = new Date()) => {
    const complaint = await models.Complaint.findById(complaintId)
      .populate('categoryId', 'name')
      .populate('assigneeId', 'name')
      .populate('ownerId', 'name')
      .populate('location.hostelId', 'name')
      .populate('location.blockId', 'name')
      .populate('location.roomId', 'label');

    if (!complaint) {
      throw new AppError(404, 'NOT_FOUND', 'Complaint not found.');
    }

    verifyComplaintScope(complaint, user);

    const attachments = await models.Attachment.find({ _id: { $in: complaint.attachmentIds } });
    const currentFeedback = await models.Feedback.findOne({ complaintId: complaint._id, isCurrent: true });
    const allowedActions = getAllowedActions(complaint, user, now);

    return complaintDetail(complaint, {
      now,
      attachments,
      currentFeedback,
      allowedActions,
    });
  };

  return {
    getComplaintDetail: async (user, complaintId) => loadDetail(complaintId, user),
    createComplaint: async (user, data) => {
      if (user.role !== 'STUDENT') {
        throw new AppError(403, 'FORBIDDEN', 'Only students can submit complaints.');
      }

      const clientRequestHash = computeCanonicalPayloadHash(data);

      // 1. Idempotency check before attachment state check
      const existing = await models.Complaint.findOne({
        ownerId: user._id,
        clientRequestId: data.clientRequestId,
      })
        .select('+clientRequestHash')
        .populate('categoryId', 'name')
        .populate('assigneeId', 'name')
        .populate('ownerId', 'name')
        .populate('location.hostelId', 'name')
        .populate('location.blockId', 'name')
        .populate('location.roomId', 'label');

      if (existing) {
        if (existing.clientRequestHash === clientRequestHash) {
          const attachments = await models.Attachment.find({ _id: { $in: existing.attachmentIds } });
          const currentFeedback = await models.Feedback.findOne({ complaintId: existing._id, isCurrent: true });
          const allowedActions = getAllowedActions(existing, user);
          return {
            complaint: complaintDetail(existing, {
              now: new Date(),
              attachments,
              currentFeedback,
              allowedActions,
            }),
            idempotentReplay: true,
          };
        }
        throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'A complaint was already created with this client request ID but different details.');
      }

      // 2. Validate location authorization and references
      if (String(data.location.hostelId) !== String(user.hostelId)) {
        throw new AppError(422, 'INVALID_REFERENCE', 'Location must belong to your assigned hostel.');
      }

      const hostel = await models.Hostel.findOne({ _id: data.location.hostelId, isActive: { $ne: false } });
      if (!hostel) {
        throw new AppError(422, 'INVALID_REFERENCE', 'Hostel not found or inactive.');
      }

      if (data.location.type === 'ROOM') {
        if (String(data.location.blockId) !== String(user.blockId) || String(data.location.roomId) !== String(user.roomId)) {
          throw new AppError(422, 'INVALID_REFERENCE', 'Room reports must match your assigned room and block.');
        }
        const block = await models.Block.findOne({ _id: data.location.blockId, hostelId: user.hostelId, isActive: { $ne: false } });
        if (!block) {
          throw new AppError(422, 'INVALID_REFERENCE', 'Block not found or inactive.');
        }
        const room = await models.Room.findOne({ _id: data.location.roomId, blockId: data.location.blockId, hostelId: user.hostelId, isActive: { $ne: false } });
        if (!room) {
          throw new AppError(422, 'INVALID_REFERENCE', 'Room not found or inactive.');
        }
      } else if (data.location.type === 'BLOCK_COMMON') {
        if (String(data.location.blockId) !== String(user.blockId)) {
          throw new AppError(422, 'INVALID_REFERENCE', 'Block common area reports must match your assigned block.');
        }
        const block = await models.Block.findOne({ _id: data.location.blockId, hostelId: user.hostelId, isActive: { $ne: false } });
        if (!block) {
          throw new AppError(422, 'INVALID_REFERENCE', 'Block not found or inactive.');
        }
      }

      // 3. Category validation
      const categoryDoc = await models.Category.findOne({ _id: data.categoryId, hostelId: user.hostelId });
      if (!categoryDoc) {
        throw new AppError(422, 'INVALID_REFERENCE', 'Category not found or does not belong to your hostel.');
      }
      if (categoryDoc.isActive === false) {
        throw new AppError(409, 'REFERENCE_INACTIVE', 'The selected category is inactive.');
      }

      // 4. Attachments validation
      const attachmentIds = data.attachmentIds || [];
      let stagedAttachments = [];
      if (attachmentIds.length > 0) {
        stagedAttachments = await models.Attachment.find({ _id: { $in: attachmentIds } });
        if (stagedAttachments.length !== attachmentIds.length) {
          throw new AppError(422, 'ATTACHMENT_INVALID', 'One or more attachments not found.');
        }
        for (const att of stagedAttachments) {
          if (String(att.ownerId) !== String(user._id)) {
            throw new AppError(404, 'NOT_FOUND', 'Attachment not found.');
          }
          if (att.complaintId != null) {
            throw new AppError(409, 'ATTACHMENT_ALREADY_BOUND', 'Attachment is already bound to a complaint.');
          }
          if (att.expiresAt && att.expiresAt < new Date()) {
            throw new AppError(422, 'ATTACHMENT_INVALID', 'Attachment has expired.');
          }
        }
      }

      // 5. Compute priority and SLA targets
      const policyDoc = await models.HostelPolicy.findOne({ hostelId: user.hostelId });
      const policy = policyDoc?.policy || {};
      const { score, suggestedPriority, priorityExplanation } = computePriority(data.indicators, policy);
      const priority = suggestedPriority;
      const prioritySource = 'RULE';
      const slaTargets = policy.slaTargets || DEFAULT_SLA_TARGETS;

      const now = new Date();
      const { responseDueAt, resolutionDueAt } = computeDeadlines({ cycleStart: now, priority, slaTargets });
      const reference = generateReference(now.getFullYear());

      // 6. Execute in transaction
      const createdComplaint = await runTransaction(connection, async (session) => {
        const [complaint] = await models.Complaint.create(
          [
            {
              reference,
              ownerId: user._id,
              hostelId: user.hostelId,
              title: data.title,
              description: data.description,
              categoryId: data.categoryId,
              location: data.location,
              indicators: data.indicators,
              status: 'SUBMITTED',
              priority,
              suggestedPriority,
              prioritySource,
              priorityExplanation,
              clientRequestId: data.clientRequestId,
              clientRequestHash,
              attachmentIds,
              cycleNumber: 1,
              reopenCount: 0,
              slaPolicy: slaTargets,
              responseDueAt,
              resolutionDueAt,
              version: 1,
              createdAt: now,
            },
          ],
          { session }
        );

        for (const staged of stagedAttachments) {
          await updateWithVersion(models.Attachment, {
            filter: { _id: staged._id },
            expectedVersion: staged.version,
            session,
            mutate: (doc) => {
              doc.complaintId = complaint._id;
              doc.expiresAt = null;
            },
          });
        }

        await models.Activity.create(
          [
            {
              complaintId: complaint._id,
              type: 'CREATED',
              actorId: user._id,
              actorName: user.name,
              actorRole: user.role,
              occurredAt: now,
              previousStatus: null,
              newStatus: 'SUBMITTED',
              note: null,
              changes: null,
            },
          ],
          { session }
        );

        return complaint;
      });

      const populated = await models.Complaint.findById(createdComplaint._id)
        .populate('categoryId', 'name')
        .populate('assigneeId', 'name')
        .populate('ownerId', 'name')
        .populate('location.hostelId', 'name')
        .populate('location.blockId', 'name')
        .populate('location.roomId', 'label');

      const boundAttachments = await models.Attachment.find({ _id: { $in: attachmentIds } });

      return {
        complaint: complaintDetail(populated, {
          now,
          attachments: boundAttachments,
          currentFeedback: null,
          allowedActions: ['EDIT', 'COMMENT'],
        }),
        idempotentReplay: false,
      };
    },

    listComplaints: async (user, filters) => {
      const predicate = {};

      if (user.role === 'STUDENT') {
        if (filters.assigneeId || filters.unassigned !== undefined) {
          throw new AppError(422, 'VALIDATION_ERROR', 'Filter field not permitted for students.');
        }
        if (filters.hostelId && String(filters.hostelId) !== String(user.hostelId)) {
          throw new AppError(404, 'NOT_FOUND', 'Hostel out of scope.');
        }
        predicate.ownerId = user._id;
      } else if (user.role === 'STAFF') {
        if (filters.assigneeId && String(filters.assigneeId) !== String(user._id)) {
          throw new AppError(404, 'NOT_FOUND', 'Assignee out of scope.');
        }
        if (filters.hostelId && String(filters.hostelId) !== String(user.hostelId)) {
          throw new AppError(404, 'NOT_FOUND', 'Hostel out of scope.');
        }
        if (filters.unassigned !== undefined) {
          throw new AppError(422, 'VALIDATION_ERROR', 'Staff cannot query unassigned complaints.');
        }
        predicate.assigneeId = user._id;
        predicate.hostelId = user.hostelId;
      } else if (user.role === 'ADMIN') {
        const adminHostelIds = (user.adminHostelIds || []).map(String);
        if (filters.hostelId) {
          if (!adminHostelIds.includes(String(filters.hostelId))) {
            throw new AppError(404, 'NOT_FOUND', 'Hostel out of admin scope.');
          }
          predicate.hostelId = filters.hostelId;
        } else {
          predicate.hostelId = { $in: user.adminHostelIds };
        }
        if (filters.assigneeId) {
          predicate.assigneeId = filters.assigneeId;
        }
        if (filters.unassigned === 'true') {
          predicate.assigneeId = null;
          predicate.status = { $in: ['SUBMITTED', 'TRIAGED', 'REOPENED'] };
        }
      }

      if (filters.status) {
        const statuses = filters.status.split(',').map((s) => s.trim());
        if (predicate.status && predicate.status.$in) {
          const intersected = statuses.filter((s) => predicate.status.$in.includes(s));
          predicate.status = { $in: intersected };
        } else {
          predicate.status = { $in: statuses };
        }
      }

      if (filters.categoryId) {
        predicate.categoryId = filters.categoryId;
      }
      if (filters.priority) {
        predicate.priority = filters.priority;
      }
      if (filters.blockId) {
        predicate['location.blockId'] = filters.blockId;
      }
      if (filters.roomId) {
        predicate['location.roomId'] = filters.roomId;
      }

      if (filters.q) {
        const query = filters.q.trim();
        if (/^HFX-\d{4}-[A-Z0-9]{10}$/i.test(query)) {
          predicate.reference = query.toUpperCase();
        } else {
          const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          predicate.title = { $regex: escaped, $options: 'i' };
        }
      }

      if (filters.createdFrom || filters.createdTo) {
        predicate.createdAt = {};
        if (filters.createdFrom) predicate.createdAt.$gte = new Date(filters.createdFrom);
        if (filters.createdTo) predicate.createdAt.$lt = new Date(filters.createdTo);
      }

      const now = new Date();
      const openStatuses = ['SUBMITTED', 'TRIAGED', 'ASSIGNED', 'IN_PROGRESS', 'REOPENED'];

      if (filters.overdue) {
        const applyStatusIntersect = () => {
          if (predicate.status && predicate.status.$in) {
            predicate.status = { $in: predicate.status.$in.filter((s) => openStatuses.includes(s)) };
          } else {
            predicate.status = { $in: openStatuses };
          }
        };

        if (filters.overdue === 'response') {
          applyStatusIntersect();
          predicate.firstRespondedAt = null;
          predicate.responseDueAt = { $lt: now };
        } else if (filters.overdue === 'resolution') {
          applyStatusIntersect();
          predicate.resolvedAt = null;
          predicate.resolutionDueAt = { $lt: now };
        } else if (filters.overdue === 'any') {
          applyStatusIntersect();
          predicate.$or = [
            { firstRespondedAt: null, responseDueAt: { $lt: now } },
            { resolvedAt: null, resolutionDueAt: { $lt: now } },
          ];
        }
      }

      let sortObj = { createdAt: -1, _id: -1 };
      if (filters.sort === 'createdAt:asc') {
        sortObj = { createdAt: 1, _id: 1 };
      } else if (filters.sort === 'updatedAt:desc') {
        sortObj = { updatedAt: -1, _id: -1 };
      } else if (filters.sort === 'resolutionDueAt:asc') {
        sortObj = { resolutionDueAt: 1, _id: 1 };
      } else if (filters.sort === 'priority:desc') {
        sortObj = { priority: -1, createdAt: -1, _id: -1 };
      } else if (filters.sort === 'workQueue') {
        sortObj = { resolutionDueAt: 1, priority: -1, createdAt: 1, _id: 1 };
      }

      const pageNum = Number(filters.page) || 1;
      const limitNum = Number(filters.limit) || 20;

      const total = await models.Complaint.countDocuments(predicate);
      const totalPages = total === 0 ? 0 : Math.ceil(total / limitNum);
      const docs = await models.Complaint.find(predicate)
        .sort(sortObj)
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .populate('categoryId', 'name')
        .populate('assigneeId', 'name')
        .populate('location.hostelId', 'name')
        .populate('location.blockId', 'name')
        .populate('location.roomId', 'label');

      const items = docs.map((doc) => complaintSummary(doc, { now }));

      return {
        items,
        total,
        totalPages,
        page: pageNum,
        limit: limitNum,
      };
    },

    editComplaint: async (user, complaintId, data) => {
      if (user.role !== 'STUDENT') {
        throw new AppError(403, 'FORBIDDEN', 'Only the owning student can edit report content.');
      }

      const complaint = await models.Complaint.findById(complaintId);
      if (!complaint || String(complaint.ownerId) !== String(user._id)) {
        throw new AppError(404, 'NOT_FOUND', 'Complaint not found.');
      }

      if (complaint.status !== 'SUBMITTED') {
        throw new AppError(409, 'EDIT_WINDOW_CLOSED', 'Complaints can only be edited while in SUBMITTED status.');
      }

      if (complaint.version !== data.expectedVersion) {
        throw new AppError(409, 'VERSION_CONFLICT', 'This complaint changed. Refresh it before retrying.');
      }

      // Validate changed category
      if (data.categoryId && String(data.categoryId) !== String(complaint.categoryId)) {
        const categoryDoc = await models.Category.findOne({ _id: data.categoryId, hostelId: user.hostelId });
        if (!categoryDoc) {
          throw new AppError(422, 'INVALID_REFERENCE', 'Category not found or does not belong to your hostel.');
        }
        if (categoryDoc.isActive === false) {
          throw new AppError(409, 'REFERENCE_INACTIVE', 'The selected category is inactive.');
        }
      }

      // Validate changed location
      if (data.location) {
        if (String(data.location.hostelId) !== String(user.hostelId)) {
          throw new AppError(422, 'INVALID_REFERENCE', 'Location must belong to your assigned hostel.');
        }
        if (data.location.type === 'ROOM') {
          if (String(data.location.blockId) !== String(user.blockId) || String(data.location.roomId) !== String(user.roomId)) {
            throw new AppError(422, 'INVALID_REFERENCE', 'Room reports must match your assigned room and block.');
          }
        } else if (data.location.type === 'BLOCK_COMMON') {
          if (String(data.location.blockId) !== String(user.blockId)) {
            throw new AppError(422, 'INVALID_REFERENCE', 'Block common area reports must match your assigned block.');
          }
        }
      }

      const indicatorsToUse = data.indicators || complaint.indicators;
      const policyDoc = await models.HostelPolicy.findOne({ hostelId: complaint.hostelId });
      const policy = policyDoc?.policy || {};
      const { suggestedPriority, priorityExplanation } = computePriority(indicatorsToUse, policy);

      let newPriority = complaint.priority;
      if (complaint.prioritySource === 'RULE') {
        newPriority = suggestedPriority;
      }

      const { responseDueAt: newResponseDueAt, resolutionDueAt: newResolutionDueAt } = tightenDeadlines({
        existingResponseDueAt: complaint.responseDueAt,
        existingResolutionDueAt: complaint.resolutionDueAt,
        cycleStart: complaint.createdAt,
        newPriority,
        slaTargets: policy.slaTargets || DEFAULT_SLA_TARGETS,
      });

      const previousPriority = complaint.priority;
      const previousResponseDueAt = complaint.responseDueAt;
      const previousResolutionDueAt = complaint.resolutionDueAt;

      const now = new Date();

      const { updated, activityDoc } = await runTransaction(connection, async (session) => {
        const updatedDoc = await updateWithVersion(models.Complaint, {
          filter: { _id: complaint._id },
          expectedVersion: data.expectedVersion,
          session,
          mutate: (doc) => {
            if (data.title) doc.title = data.title;
            if (data.description) doc.description = data.description;
            if (data.categoryId) doc.categoryId = data.categoryId;
            if (data.location) doc.location = data.location;
            if (data.indicators) {
              doc.indicators = data.indicators;
              doc.suggestedPriority = suggestedPriority;
              doc.priority = newPriority;
              doc.priorityExplanation = priorityExplanation;
              doc.responseDueAt = newResponseDueAt;
              doc.resolutionDueAt = newResolutionDueAt;
            }
          },
        });

        const changes = {};
        if (data.title) changes.title = data.title;
        if (data.description) changes.description = data.description;
        if (data.categoryId) changes.categoryId = String(data.categoryId);
        if (data.location) changes.location = data.location;
        if (data.indicators) {
          changes.indicators = data.indicators;
          changes.suggestedPriority = suggestedPriority;
          if (previousPriority !== newPriority) {
            changes.previousPriority = previousPriority;
            changes.newPriority = newPriority;
          }
          if (previousResponseDueAt.getTime() !== newResponseDueAt.getTime()) {
            changes.previousResponseDueAt = previousResponseDueAt.toISOString();
            changes.responseDueAt = newResponseDueAt.toISOString();
          }
          if (previousResolutionDueAt.getTime() !== newResolutionDueAt.getTime()) {
            changes.previousResolutionDueAt = previousResolutionDueAt.toISOString();
            changes.resolutionDueAt = newResolutionDueAt.toISOString();
          }
        }

        const [act] = await models.Activity.create(
          [
            {
              complaintId: complaint._id,
              type: 'CONTENT_UPDATED',
              actorId: user._id,
              actorName: user.name,
              actorRole: user.role,
              occurredAt: now,
              previousStatus: 'SUBMITTED',
              newStatus: 'SUBMITTED',
              note: null,
              changes: Object.keys(changes).length > 0 ? changes : null,
            },
          ],
          { session }
        );

        return { updated: updatedDoc, activityDoc: act };
      });

      const populated = await models.Complaint.findById(updated._id)
        .populate('categoryId', 'name')
        .populate('assigneeId', 'name')
        .populate('ownerId', 'name')
        .populate('location.hostelId', 'name')
        .populate('location.blockId', 'name')
        .populate('location.roomId', 'label');

      const attachments = await models.Attachment.find({ _id: { $in: populated.attachmentIds } });
      const allowedActions = getAllowedActions(populated, user, now);

      return {
        complaint: complaintDetail(populated, {
          now,
          attachments,
          currentFeedback: null,
          allowedActions,
        }),
        activity: activity(activityDoc),
      };
    },

    listComments: async (user, complaintId, { page = 1, limit = 20 }) => {
      const complaint = await models.Complaint.findById(complaintId);
      if (!complaint) {
        throw new AppError(404, 'NOT_FOUND', 'Complaint not found.');
      }
      verifyComplaintScope(complaint, user);

      const pageNum = Number(page) || 1;
      const limitNum = Number(limit) || 20;

      const total = await models.Comment.countDocuments({ complaintId });
      const totalPages = total === 0 ? 0 : Math.ceil(total / limitNum);
      const docs = await models.Comment.find({ complaintId })
        .sort({ createdAt: 1, _id: 1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum);

      return {
        items: docs.map(comment),
        total,
        totalPages,
        page: pageNum,
        limit: limitNum,
      };
    },

    createComment: async (user, complaintId, data) => {
      const complaint = await models.Complaint.findById(complaintId);
      if (!complaint) {
        throw new AppError(404, 'NOT_FOUND', 'Complaint not found.');
      }
      verifyComplaintScope(complaint, user);

      if (['CLOSED', 'REJECTED'].includes(complaint.status)) {
        throw new AppError(409, 'COMPLAINT_READ_ONLY', 'Comments cannot be added to closed or rejected complaints.');
      }

      if (complaint.version !== data.expectedVersion) {
        throw new AppError(409, 'VERSION_CONFLICT', 'This complaint changed. Refresh it before retrying.');
      }

      const now = new Date();

      const { updated, commentDoc, activityDoc } = await runTransaction(connection, async (session) => {
        const updatedDoc = await updateWithVersion(models.Complaint, {
          filter: { _id: complaint._id },
          expectedVersion: data.expectedVersion,
          session,
          mutate: () => {
            // Version will be incremented automatically by updateWithVersion
          },
        });

        const [comm] = await models.Comment.create(
          [
            {
              complaintId: complaint._id,
              authorId: user._id,
              authorName: user.name,
              authorRole: user.role,
              body: data.body.trim(),
              createdAt: now,
            },
          ],
          { session }
        );

        const [act] = await models.Activity.create(
          [
            {
              complaintId: complaint._id,
              type: 'COMMENT_ADDED',
              actorId: user._id,
              actorName: user.name,
              actorRole: user.role,
              occurredAt: now,
              previousStatus: complaint.status,
              newStatus: complaint.status,
              note: null,
              changes: null,
            },
          ],
          { session }
        );

        return { updated: updatedDoc, commentDoc: comm, activityDoc: act };
      });

      const populated = await models.Complaint.findById(updated._id)
        .populate('categoryId', 'name')
        .populate('assigneeId', 'name')
        .populate('ownerId', 'name')
        .populate('location.hostelId', 'name')
        .populate('location.blockId', 'name')
        .populate('location.roomId', 'label');

      const attachments = await models.Attachment.find({ _id: { $in: populated.attachmentIds } });
      const currentFeedback = await models.Feedback.findOne({ complaintId: populated._id, isCurrent: true });
      const allowedActions = getAllowedActions(populated, user, now);

      return {
        complaint: complaintDetail(populated, {
          now,
          attachments,
          currentFeedback,
          allowedActions,
        }),
        activity: activity(activityDoc),
        comment: comment(commentDoc),
      };
    },

    listActivities: async (user, complaintId, { page = 1, limit = 20 }) => {
      const complaint = await models.Complaint.findById(complaintId);
      if (!complaint) {
        throw new AppError(404, 'NOT_FOUND', 'Complaint not found.');
      }
      verifyComplaintScope(complaint, user);

      const pageNum = Number(page) || 1;
      const limitNum = Number(limit) || 20;

      const total = await models.Activity.countDocuments({ complaintId });
      const totalPages = total === 0 ? 0 : Math.ceil(total / limitNum);
      const docs = await models.Activity.find({ complaintId })
        .sort({ occurredAt: 1, _id: 1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum);

      return {
        items: docs.map(activity),
        total,
        totalPages,
        page: pageNum,
        limit: limitNum,
      };
    },

    transitionComplaint: async (user, complaintId, data) => {
      const complaint = await models.Complaint.findById(complaintId);
      if (!complaint) {
        throw new AppError(404, 'NOT_FOUND', 'Complaint not found.');
      }
      verifyComplaintScope(complaint, user);

      if (complaint.version !== data.expectedVersion) {
        throw new AppError(409, 'VERSION_CONFLICT', 'This complaint changed. Refresh it before retrying.');
      }

      const { toStatus } = data;
      const now = new Date();

      if (toStatus === 'TRIAGED') {
        if (user.role !== 'ADMIN') {
          throw new AppError(403, 'FORBIDDEN', 'Only administrators can triage complaints.');
        }
        if (complaint.status !== 'SUBMITTED') {
          throw new AppError(409, 'INVALID_TRANSITION', 'Complaint can only be triaged from SUBMITTED state.');
        }

        const { updated, activityDoc } = await runTransaction(connection, async (session) => {
          const updatedDoc = await updateWithVersion(models.Complaint, {
            filter: { _id: complaint._id },
            expectedVersion: data.expectedVersion,
            session,
            mutate: (doc) => {
              doc.status = 'TRIAGED';
              if (!doc.firstRespondedAt) {
                doc.firstRespondedAt = now;
              }
            },
          });

          const [act] = await models.Activity.create(
            [
              {
                complaintId: complaint._id,
                type: 'TRIAGED',
                actorId: user._id,
                actorName: user.name,
                actorRole: user.role,
                occurredAt: now,
                previousStatus: 'SUBMITTED',
                newStatus: 'TRIAGED',
                note: data.note,
                changes: null,
              },
            ],
            { session }
          );

          return { updated: updatedDoc, activityDoc: act };
        });

        const detail = await loadDetail(updated._id, user, now);
        return { complaint: detail, activity: activity(activityDoc) };
      }

      if (toStatus === 'REJECTED') {
        if (user.role !== 'ADMIN') {
          throw new AppError(403, 'FORBIDDEN', 'Only administrators can reject complaints.');
        }
        if (!['SUBMITTED', 'TRIAGED'].includes(complaint.status)) {
          throw new AppError(409, 'INVALID_TRANSITION', 'Complaint can only be rejected from SUBMITTED or TRIAGED state.');
        }

        const previousStatus = complaint.status;
        const { updated, activityDoc } = await runTransaction(connection, async (session) => {
          const updatedDoc = await updateWithVersion(models.Complaint, {
            filter: { _id: complaint._id },
            expectedVersion: data.expectedVersion,
            session,
            mutate: (doc) => {
              doc.status = 'REJECTED';
              doc.rejectedAt = now;
              doc.rejectionCode = data.rejectionCode;
            },
          });

          const [act] = await models.Activity.create(
            [
              {
                complaintId: complaint._id,
                type: 'REJECTED',
                actorId: user._id,
                actorName: user.name,
                actorRole: user.role,
                occurredAt: now,
                previousStatus,
                newStatus: 'REJECTED',
                note: data.note,
                changes: null,
              },
            ],
            { session }
          );

          return { updated: updatedDoc, activityDoc: act };
        });

        const detail = await loadDetail(updated._id, user, now);
        return { complaint: detail, activity: activity(activityDoc) };
      }

      if (toStatus === 'IN_PROGRESS') {
        const assigneeId = complaint.assigneeId?._id || complaint.assigneeId;
        if (user.role !== 'STAFF' || !assigneeId || String(assigneeId) !== String(user._id)) {
          throw new AppError(403, 'FORBIDDEN', 'Only the assigned staff member can begin work.');
        }
        if (complaint.status !== 'ASSIGNED') {
          throw new AppError(409, 'INVALID_TRANSITION', 'Work can only begin from ASSIGNED state.');
        }

        const { updated, activityDoc } = await runTransaction(connection, async (session) => {
          const updatedDoc = await updateWithVersion(models.Complaint, {
            filter: { _id: complaint._id },
            expectedVersion: data.expectedVersion,
            session,
            mutate: (doc) => {
              doc.status = 'IN_PROGRESS';
              doc.workStartedAt = now;
            },
          });

          const [act] = await models.Activity.create(
            [
              {
                complaintId: complaint._id,
                type: 'WORK_STARTED',
                actorId: user._id,
                actorName: user.name,
                actorRole: user.role,
                occurredAt: now,
                previousStatus: 'ASSIGNED',
                newStatus: 'IN_PROGRESS',
                note: data.note,
                changes: null,
              },
            ],
            { session }
          );

          return { updated: updatedDoc, activityDoc: act };
        });

        const detail = await loadDetail(updated._id, user, now);
        return { complaint: detail, activity: activity(activityDoc) };
      }

      if (toStatus === 'RESOLVED') {
        const assigneeId = complaint.assigneeId?._id || complaint.assigneeId;
        if (user.role !== 'STAFF' || !assigneeId || String(assigneeId) !== String(user._id)) {
          throw new AppError(403, 'FORBIDDEN', 'Only the assigned staff member can resolve this complaint.');
        }
        if (complaint.status !== 'IN_PROGRESS') {
          throw new AppError(409, 'INVALID_TRANSITION', 'Complaint can only be resolved from IN_PROGRESS state.');
        }

        const reopenUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const { updated, activityDoc } = await runTransaction(connection, async (session) => {
          const updatedDoc = await updateWithVersion(models.Complaint, {
            filter: { _id: complaint._id },
            expectedVersion: data.expectedVersion,
            session,
            mutate: (doc) => {
              doc.status = 'RESOLVED';
              doc.resolvedAt = now;
              doc.resolverId = user._id;
              doc.resolutionNote = data.resolutionNote;
              doc.reopenUntil = reopenUntil;
            },
          });

          const [act] = await models.Activity.create(
            [
              {
                complaintId: complaint._id,
                type: 'RESOLVED',
                actorId: user._id,
                actorName: user.name,
                actorRole: user.role,
                occurredAt: now,
                previousStatus: 'IN_PROGRESS',
                newStatus: 'RESOLVED',
                note: data.resolutionNote,
                changes: null,
              },
            ],
            { session }
          );

          return { updated: updatedDoc, activityDoc: act };
        });

        const detail = await loadDetail(updated._id, user, now);
        return { complaint: detail, activity: activity(activityDoc) };
      }

      if (toStatus === 'CLOSED') {
        if (complaint.status !== 'RESOLVED') {
          throw new AppError(409, 'INVALID_TRANSITION', 'Complaint can only be closed from RESOLVED state.');
        }

        if (user.role === 'STUDENT') {
          const ownerId = complaint.ownerId?._id || complaint.ownerId;
          if (String(ownerId) !== String(user._id)) {
            throw new AppError(403, 'FORBIDDEN', 'Only the owner student can close this complaint.');
          }
        } else if (user.role === 'ADMIN') {
          if (complaint.reopenUntil && now <= new Date(complaint.reopenUntil)) {
            throw new AppError(409, 'CLOSE_WINDOW_NOT_ELAPSED', 'Administrative closure is only permitted after the 7-day student confirmation window has elapsed.');
          }
          if (data.note.length < 10) {
            throw new AppError(422, 'VALIDATION_ERROR', 'Administrative close requires a note of at least 10 characters.');
          }
        } else {
          throw new AppError(403, 'FORBIDDEN', 'Staff members cannot close complaints.');
        }

        const { updated, activityDoc } = await runTransaction(connection, async (session) => {
          const updatedDoc = await updateWithVersion(models.Complaint, {
            filter: { _id: complaint._id },
            expectedVersion: data.expectedVersion,
            session,
            mutate: (doc) => {
              doc.status = 'CLOSED';
              doc.closedAt = now;
            },
          });

          const [act] = await models.Activity.create(
            [
              {
                complaintId: complaint._id,
                type: 'CLOSED',
                actorId: user._id,
                actorName: user.name,
                actorRole: user.role,
                occurredAt: now,
                previousStatus: 'RESOLVED',
                newStatus: 'CLOSED',
                note: data.note,
                changes: null,
              },
            ],
            { session }
          );

          return { updated: updatedDoc, activityDoc: act };
        });

        const detail = await loadDetail(updated._id, user, now);
        return { complaint: detail, activity: activity(activityDoc) };
      }

      throw new AppError(409, 'INVALID_TRANSITION', 'Invalid transition target.');
    },

    assignComplaint: async (user, complaintId, data) => {
      if (user.role !== 'ADMIN') {
        throw new AppError(403, 'FORBIDDEN', 'Only administrators can assign complaints.');
      }
      const complaint = await models.Complaint.findById(complaintId);
      if (!complaint) {
        throw new AppError(404, 'NOT_FOUND', 'Complaint not found.');
      }
      verifyComplaintScope(complaint, user);

      if (complaint.version !== data.expectedVersion) {
        throw new AppError(409, 'VERSION_CONFLICT', 'This complaint changed. Refresh it before retrying.');
      }

      const assignableStatuses = ['TRIAGED', 'REOPENED', 'ASSIGNED', 'IN_PROGRESS'];
      if (!assignableStatuses.includes(complaint.status)) {
        throw new AppError(409, 'INVALID_TRANSITION', `Complaint cannot be assigned from ${complaint.status} state.`);
      }

      if (complaint.assigneeId && String(complaint.assigneeId) === String(data.staffId)) {
        throw new AppError(409, 'ALREADY_ASSIGNED', 'Complaint is already assigned to this staff member.');
      }

      const staff = await models.User.findById(data.staffId);
      if (!staff || staff.role !== 'STAFF' || String(staff.hostelId) !== String(complaint.hostelId)) {
        throw new AppError(404, 'NOT_FOUND', 'Staff member not found or outside hostel scope.');
      }
      if (staff.status !== 'ACTIVE') {
        throw new AppError(409, 'STAFF_INELIGIBLE', 'Staff member is inactive.');
      }
      const eligibleCategories = (staff.categoryIds || []).map(String);
      if (!eligibleCategories.includes(String(complaint.categoryId))) {
        throw new AppError(409, 'STAFF_INELIGIBLE', 'Staff member is not eligible for this complaint category.');
      }

      const previousAssigneeId = complaint.assigneeId;
      const previousStatus = complaint.status;
      const isReassignment = ['ASSIGNED', 'IN_PROGRESS'].includes(previousStatus);
      const activityType = isReassignment ? 'REASSIGNED' : 'ASSIGNED';
      const now = new Date();

      const { updated, activityDoc } = await runTransaction(connection, async (session) => {
        // Version guard on staff User to prevent race with staff deactivation
        await updateWithVersion(models.User, {
          filter: { _id: staff._id },
          expectedVersion: staff.version,
          session,
          mutate: () => {},
        });

        const updatedDoc = await updateWithVersion(models.Complaint, {
          filter: { _id: complaint._id },
          expectedVersion: data.expectedVersion,
          session,
          mutate: (doc) => {
            doc.status = 'ASSIGNED';
            doc.assigneeId = staff._id;
            doc.workStartedAt = null;
            if (!doc.firstRespondedAt) {
              doc.firstRespondedAt = now;
            }
          },
        });

        const [act] = await models.Activity.create(
          [
            {
              complaintId: complaint._id,
              type: activityType,
              actorId: user._id,
              actorName: user.name,
              actorRole: user.role,
              occurredAt: now,
              previousStatus,
              newStatus: 'ASSIGNED',
              note: data.note,
              changes: {
                previousAssigneeId: previousAssigneeId ? previousAssigneeId : null,
                assigneeId: staff._id,
              },
            },
          ],
          { session }
        );

        return { updated: updatedDoc, activityDoc: act };
      });

      const detail = await loadDetail(updated._id, user, now);
      return { complaint: detail, activity: activity(activityDoc) };
    },

    overridePriority: async (user, complaintId, data) => {
      if (user.role !== 'ADMIN') {
        throw new AppError(403, 'FORBIDDEN', 'Only administrators can change complaint priority.');
      }
      const complaint = await models.Complaint.findById(complaintId);
      if (!complaint) {
        throw new AppError(404, 'NOT_FOUND', 'Complaint not found.');
      }
      verifyComplaintScope(complaint, user);

      if (complaint.version !== data.expectedVersion) {
        throw new AppError(409, 'VERSION_CONFLICT', 'This complaint changed. Refresh it before retrying.');
      }

      if (!OPEN_STATUSES.includes(complaint.status)) {
        throw new AppError(409, 'COMPLAINT_READ_ONLY', 'Priority can only be changed on open complaints.');
      }

      if (complaint.priority === data.priority) {
        throw new AppError(409, 'PRIORITY_UNCHANGED', 'Priority is already set to this level.');
      }

      const cycleStart = complaint.cycleNumber === 1 ? complaint.createdAt : complaint.reopenedAt;
      const tightened = tightenDeadlines({
        existingResponseDueAt: complaint.responseDueAt,
        existingResolutionDueAt: complaint.resolutionDueAt,
        cycleStart,
        newPriority: data.priority,
        slaTargets: complaint.slaPolicy,
      });

      const previousPriority = complaint.priority;
      const previousResponseDueAt = complaint.responseDueAt;
      const previousResolutionDueAt = complaint.resolutionDueAt;
      const now = new Date();

      const { updated, activityDoc } = await runTransaction(connection, async (session) => {
        const updatedDoc = await updateWithVersion(models.Complaint, {
          filter: { _id: complaint._id },
          expectedVersion: data.expectedVersion,
          session,
          mutate: (doc) => {
            doc.priority = data.priority;
            doc.prioritySource = 'ADMIN';
            doc.responseDueAt = tightened.responseDueAt;
            doc.resolutionDueAt = tightened.resolutionDueAt;
          },
        });

        const [act] = await models.Activity.create(
          [
            {
              complaintId: complaint._id,
              type: 'PRIORITY_CHANGED',
              actorId: user._id,
              actorName: user.name,
              actorRole: user.role,
              occurredAt: now,
              previousStatus: complaint.status,
              newStatus: complaint.status,
              note: data.reason,
              changes: {
                previousPriority,
                newPriority: data.priority,
                previousResponseDueAt: previousResponseDueAt.toISOString(),
                responseDueAt: tightened.responseDueAt.toISOString(),
                previousResolutionDueAt: previousResolutionDueAt.toISOString(),
                resolutionDueAt: tightened.resolutionDueAt.toISOString(),
              },
            },
          ],
          { session }
        );

        return { updated: updatedDoc, activityDoc: act };
      });

      const detail = await loadDetail(updated._id, user, now);
      return { complaint: detail, activity: activity(activityDoc) };
    },

    reopenComplaint: async (user, complaintId, data) => {
      if (user.role !== 'STUDENT') {
        throw new AppError(403, 'FORBIDDEN', 'Only students can reopen complaints.');
      }
      const complaint = await models.Complaint.findById(complaintId);
      if (!complaint) {
        throw new AppError(404, 'NOT_FOUND', 'Complaint not found.');
      }
      const ownerId = complaint.ownerId?._id || complaint.ownerId;
      if (String(ownerId) !== String(user._id)) {
        throw new AppError(403, 'FORBIDDEN', 'You can only reopen your own complaints.');
      }

      if (complaint.version !== data.expectedVersion) {
        throw new AppError(409, 'VERSION_CONFLICT', 'This complaint changed. Refresh it before retrying.');
      }

      if (complaint.status !== 'RESOLVED') {
        throw new AppError(409, 'INVALID_TRANSITION', 'Only RESOLVED complaints can be reopened.');
      }

      const now = new Date();
      if (!complaint.reopenUntil || now > new Date(complaint.reopenUntil)) {
        throw new AppError(409, 'REOPEN_WINDOW_EXPIRED', 'The 7-day window to reopen this complaint has expired.');
      }
      if ((complaint.reopenCount ?? 0) >= 2) {
        throw new AppError(409, 'REOPEN_LIMIT_REACHED', 'This complaint has reached the maximum number of reopens (2).');
      }

      const cycleStart = complaint.cycleNumber === 1 ? complaint.createdAt : complaint.reopenedAt;
      const resolutionDurationMinutes = (complaint.resolvedAt.getTime() - cycleStart.getTime()) / 60000;
      const priorCycle = {
        cycleNumber: complaint.cycleNumber,
        startedAt: cycleStart,
        assigneeId: complaint.assigneeId,
        slaPolicy: complaint.slaPolicy,
        responseDueAt: complaint.responseDueAt,
        resolutionDueAt: complaint.resolutionDueAt,
        firstRespondedAt: complaint.firstRespondedAt,
        resolvedAt: complaint.resolvedAt,
        resolutionNote: complaint.resolutionNote,
        resolverId: complaint.resolverId,
        resolutionDurationMinutes,
        reopenedAt: now,
        reopenReason: data.reason,
      };

      const policyDoc = await models.HostelPolicy.findOne({ hostelId: complaint.hostelId });
      const policy = policyDoc?.policy || {};
      const slaTargets = policy.slaTargets || complaint.slaPolicy;
      const newDeadlines = computeDeadlines({ cycleStart: now, priority: complaint.priority, slaTargets });

      const { updated, activityDoc } = await runTransaction(connection, async (session) => {
        const existingFeedback = await models.Feedback.findOne({ complaintId: complaint._id, isCurrent: true }).session(session);
        if (existingFeedback) {
          await updateWithVersion(models.Feedback, {
            filter: { _id: existingFeedback._id },
            expectedVersion: existingFeedback.version,
            session,
            mutate: (doc) => {
              doc.isCurrent = false;
            },
          });
        }

        const updatedDoc = await updateWithVersion(models.Complaint, {
          filter: { _id: complaint._id },
          expectedVersion: data.expectedVersion,
          session,
          mutate: (doc) => {
            doc.priorCycles.push(priorCycle);
            doc.cycleNumber += 1;
            doc.reopenCount += 1;
            doc.reopenedAt = now;
            doc.status = 'REOPENED';
            doc.assigneeId = null;
            doc.resolvedAt = null;
            doc.resolverId = null;
            doc.resolutionNote = null;
            doc.workStartedAt = null;
            doc.firstRespondedAt = null;
            doc.reopenUntil = null;
            doc.slaPolicy = slaTargets;
            doc.responseDueAt = newDeadlines.responseDueAt;
            doc.resolutionDueAt = newDeadlines.resolutionDueAt;
          },
        });

        const [act] = await models.Activity.create(
          [
            {
              complaintId: complaint._id,
              type: 'REOPENED',
              actorId: user._id,
              actorName: user.name,
              actorRole: user.role,
              occurredAt: now,
              previousStatus: 'RESOLVED',
              newStatus: 'REOPENED',
              note: data.reason,
              changes: null,
            },
          ],
          { session }
        );

        return { updated: updatedDoc, activityDoc: act };
      });

      const detail = await loadDetail(updated._id, user, now);
      return { complaint: detail, activity: activity(activityDoc) };
    },

    submitFeedback: async (user, complaintId, data) => {
      if (user.role !== 'STUDENT') {
        throw new AppError(403, 'FORBIDDEN', 'Only students can submit feedback.');
      }
      const complaint = await models.Complaint.findById(complaintId);
      if (!complaint) {
        throw new AppError(404, 'NOT_FOUND', 'Complaint not found.');
      }
      const ownerId = complaint.ownerId?._id || complaint.ownerId;
      if (String(ownerId) !== String(user._id)) {
        throw new AppError(403, 'FORBIDDEN', 'You can only submit feedback for your own complaints.');
      }

      if (complaint.version !== data.expectedVersion) {
        throw new AppError(409, 'VERSION_CONFLICT', 'This complaint changed. Refresh it before retrying.');
      }

      if (!['RESOLVED', 'CLOSED'].includes(complaint.status)) {
        throw new AppError(409, 'FEEDBACK_NOT_ALLOWED', 'Feedback can only be submitted for resolved or closed complaints.');
      }

      const now = new Date();
      const { updated, feedbackDoc, activityDoc } = await runTransaction(connection, async (session) => {
        const existingFeedback = await models.Feedback.findOne({ complaintId: complaint._id }).session(session);
        if (existingFeedback && existingFeedback.isCurrent) {
          throw new AppError(409, 'FEEDBACK_EXISTS', 'Feedback has already been submitted for the current resolution cycle.');
        }

        let savedFeedback;
        if (existingFeedback) {
          savedFeedback = await updateWithVersion(models.Feedback, {
            filter: { _id: existingFeedback._id },
            expectedVersion: existingFeedback.version,
            session,
            mutate: (doc) => {
              doc.rating = data.rating;
              doc.comment = data.comment ? data.comment.trim() : null;
              doc.cycleNumber = complaint.cycleNumber;
              doc.isCurrent = true;
            },
          });
        } else {
          const [createdFeedback] = await models.Feedback.create(
            [
              {
                complaintId: complaint._id,
                authorId: user._id,
                rating: data.rating,
                comment: data.comment ? data.comment.trim() : null,
                cycleNumber: complaint.cycleNumber,
                isCurrent: true,
              },
            ],
            { session }
          );
          savedFeedback = createdFeedback;
        }

        const updatedDoc = await updateWithVersion(models.Complaint, {
          filter: { _id: complaint._id },
          expectedVersion: data.expectedVersion,
          session,
          mutate: () => {},
        });

        const [act] = await models.Activity.create(
          [
            {
              complaintId: complaint._id,
              type: 'FEEDBACK_SUBMITTED',
              actorId: user._id,
              actorName: user.name,
              actorRole: user.role,
              occurredAt: now,
              previousStatus: complaint.status,
              newStatus: complaint.status,
              note: null,
              changes: {
                rating: data.rating,
                comment: data.comment ? data.comment.trim() : null,
              },
            },
          ],
          { session }
        );

        return { updated: updatedDoc, feedbackDoc: savedFeedback, activityDoc: act };
      });

      const detail = await loadDetail(updated._id, user, now);
      return { complaint: detail, activity: activity(activityDoc), feedback: feedback(feedbackDoc) };
    },
  };
}

module.exports = {
  createComplaintService,
  computeCanonicalPayloadHash,
  getAllowedActions,
  verifyComplaintScope,
};
