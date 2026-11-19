const mongoose = require('mongoose');
const { AppError } = require('../utils/AppError');
const { complaintSummary, activity } = require('../models/projections');
const { OPEN_STATUSES } = require('../models/enums');

async function recentScopedActivity(models, predicate) {
  const docs = await models.Activity.aggregate([
    {
      $lookup: {
        from: models.Complaint.collection.name,
        let: { id: '$complaintId' },
        pipeline: [
          { $match: { $expr: { $eq: ['$_id', '$$id'] } } },
          { $match: predicate },
        ],
        as: 'scopedComplaint',
      },
    },
    { $match: { 'scopedComplaint.0': { $exists: true } } },
    { $sort: { occurredAt: -1, _id: -1 } },
    { $limit: 10 },
    { $project: { scopedComplaint: 0 } },
  ]);
  return docs.map(activity);
}

function createDashboardService(context) {
  const { models } = context;

  return {
    getStudentDashboard: async (user, filters = {}) => {
      if (user.role !== 'STUDENT') {
        throw new AppError(
          403,
          'FORBIDDEN',
          'Only students can access the student dashboard.'
        );
      }

      const predicate = {
        ownerId: user._id,
        hostelId: user.hostelId,
      };

      if (filters.categoryId)
        predicate.categoryId = new mongoose.Types.ObjectId(filters.categoryId);
      if (filters.priority) predicate.priority = filters.priority;
      if (filters.createdFrom || filters.createdTo) {
        predicate.createdAt = {};
        if (filters.createdFrom)
          predicate.createdAt.$gte = new Date(filters.createdFrom);
        if (filters.createdTo)
          predicate.createdAt.$lt = new Date(filters.createdTo);
      }

      const statusCountsRaw = await models.Complaint.aggregate([
        { $match: predicate },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]);

      const statusCounts = {
        SUBMITTED: 0,
        TRIAGED: 0,
        ASSIGNED: 0,
        IN_PROGRESS: 0,
        RESOLVED: 0,
        CLOSED: 0,
        REOPENED: 0,
        REJECTED: 0,
      };

      for (const item of statusCountsRaw) {
        if (statusCounts[item._id] !== undefined) {
          statusCounts[item._id] = item.count;
        }
      }

      const total = Object.values(statusCounts).reduce((a, b) => a + b, 0);
      const open =
        statusCounts.SUBMITTED +
        statusCounts.TRIAGED +
        statusCounts.ASSIGNED +
        statusCounts.IN_PROGRESS +
        statusCounts.REOPENED;
      const resolved = statusCounts.RESOLVED;
      const closed = statusCounts.CLOSED;
      const rejected = statusCounts.REJECTED;

      const now = new Date();

      const recentDocs = await models.Complaint.find(predicate)
        .sort({ createdAt: -1, _id: -1 })
        .limit(5)
        .populate('categoryId', 'name')
        .populate('assigneeId', 'name')
        .populate('location.hostelId', 'name')
        .populate('location.blockId', 'name')
        .populate('location.roomId', 'label');

      const recentComplaints = recentDocs.map((doc) =>
        complaintSummary(doc, { now })
      );

      const userComplaintIds = await models.Complaint.find({
        ownerId: user._id,
      }).distinct('_id');
      const activityDocs = await models.Activity.find({
        complaintId: { $in: userComplaintIds },
      })
        .sort({ occurredAt: -1, _id: -1 })
        .limit(10);

      const latestActivity = activityDocs.map(activity);

      return {
        asOf: now.toISOString(),
        statusCounts,
        total,
        open,
        resolved,
        closed,
        rejected,
        recentComplaints,
        latestActivity,
      };
    },

    getStaffDashboard: async (user, filters = {}) => {
      if (user.role !== 'STAFF') {
        throw new AppError(
          403,
          'FORBIDDEN',
          'Only staff can access the staff dashboard.'
        );
      }

      const predicate = {
        assigneeId: user._id,
        hostelId: user.hostelId,
      };

      if (filters.categoryId)
        predicate.categoryId = new mongoose.Types.ObjectId(filters.categoryId);
      if (filters.priority) predicate.priority = filters.priority;
      if (filters.createdFrom || filters.createdTo) {
        predicate.createdAt = {};
        if (filters.createdFrom)
          predicate.createdAt.$gte = new Date(filters.createdFrom);
        if (filters.createdTo)
          predicate.createdAt.$lt = new Date(filters.createdTo);
      }

      const statusCountsRaw = await models.Complaint.aggregate([
        { $match: predicate },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]);

      const statusCounts = {
        SUBMITTED: 0,
        TRIAGED: 0,
        ASSIGNED: 0,
        IN_PROGRESS: 0,
        RESOLVED: 0,
        CLOSED: 0,
        REOPENED: 0,
        REJECTED: 0,
      };

      for (const item of statusCountsRaw) {
        if (statusCounts[item._id] !== undefined) {
          statusCounts[item._id] = item.count;
        }
      }

      const total = Object.values(statusCounts).reduce((a, b) => a + b, 0);
      const assignedPending = statusCounts.ASSIGNED;
      const inProgress = statusCounts.IN_PROGRESS;

      const now = new Date();
      const openStaffPredicate = {
        ...predicate,
        status: { $in: ['ASSIGNED', 'IN_PROGRESS'] },
      };

      const overdueResponse = await models.Complaint.countDocuments({
        ...openStaffPredicate,
        firstRespondedAt: null,
        responseDueAt: { $lt: now },
      });

      const overdueResolution = await models.Complaint.countDocuments({
        ...openStaffPredicate,
        resolvedAt: null,
        resolutionDueAt: { $lt: now },
      });

      const overdueAny = await models.Complaint.countDocuments({
        ...openStaffPredicate,
        $or: [
          { firstRespondedAt: null, responseDueAt: { $lt: now } },
          { resolvedAt: null, resolutionDueAt: { $lt: now } },
        ],
      });

      const queueDocs = await models.Complaint.find(openStaffPredicate)
        .populate('categoryId', 'name')
        .populate('assigneeId', 'name')
        .populate('location.hostelId', 'name')
        .populate('location.blockId', 'name')
        .populate('location.roomId', 'label');

      const PRIORITY_RANK = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
      queueDocs.sort((a, b) => {
        const aOverdue =
          (a.firstRespondedAt == null &&
            a.responseDueAt &&
            now > new Date(a.responseDueAt)) ||
          (a.resolvedAt == null &&
            a.resolutionDueAt &&
            now > new Date(a.resolutionDueAt));
        const bOverdue =
          (b.firstRespondedAt == null &&
            b.responseDueAt &&
            now > new Date(b.responseDueAt)) ||
          (b.resolvedAt == null &&
            b.resolutionDueAt &&
            now > new Date(b.resolutionDueAt));
        if (aOverdue !== bOverdue) return bOverdue ? 1 : -1;
        const pDiff =
          (PRIORITY_RANK[b.priority] || 0) - (PRIORITY_RANK[a.priority] || 0);
        if (pDiff !== 0) return pDiff;
        const cDiff =
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        if (cDiff !== 0) return cDiff;
        return String(a._id).localeCompare(String(b._id));
      });

      const queue = queueDocs
        .slice(0, 10)
        .map((doc) => complaintSummary(doc, { now }));
      const resolutionDocs = await models.Complaint.find({
        ...predicate,
        status: { $in: ['RESOLVED', 'CLOSED'] },
      })
        .sort({ resolvedAt: -1, _id: -1 })
        .limit(5)
        .populate('categoryId', 'name')
        .populate('assigneeId', 'name')
        .populate('location.hostelId', 'name')
        .populate('location.blockId', 'name')
        .populate('location.roomId', 'label');
      const resolutionHistory = resolutionDocs.map((doc) =>
        complaintSummary(doc, { now })
      );
      const latestActivity = await recentScopedActivity(models, predicate);

      return {
        asOf: now.toISOString(),
        statusCounts,
        total,
        assignedPending,
        inProgress,
        overdueResponse,
        overdueResolution,
        overdueAny,
        queue,
        resolutionHistory,
        latestActivity,
      };
    },

    getAdminDashboard: async (user, filters = {}) => {
      if (user.role !== 'ADMIN') {
        throw new AppError(
          403,
          'FORBIDDEN',
          'Only administrators can access the admin dashboard.'
        );
      }

      const adminHostelIds = (user.adminHostelIds || []).map(String);
      let targetHostelIds = adminHostelIds;

      if (filters.hostelId) {
        if (!adminHostelIds.includes(String(filters.hostelId))) {
          throw new AppError(
            404,
            'NOT_FOUND',
            'Hostel not found or not within admin scope.'
          );
        }
        targetHostelIds = [String(filters.hostelId)];
      }

      const targetObjectIds = targetHostelIds.map(
        (hId) => new mongoose.Types.ObjectId(hId)
      );

      const predicate = {
        hostelId: { $in: targetObjectIds },
      };

      if (filters.categoryId)
        predicate.categoryId = new mongoose.Types.ObjectId(filters.categoryId);
      if (filters.priority) predicate.priority = filters.priority;
      if (filters.createdFrom || filters.createdTo) {
        predicate.createdAt = {};
        if (filters.createdFrom)
          predicate.createdAt.$gte = new Date(filters.createdFrom);
        if (filters.createdTo)
          predicate.createdAt.$lt = new Date(filters.createdTo);
      }

      const statusCountsRaw = await models.Complaint.aggregate([
        { $match: predicate },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]);

      const statusCounts = {
        SUBMITTED: 0,
        TRIAGED: 0,
        ASSIGNED: 0,
        IN_PROGRESS: 0,
        RESOLVED: 0,
        CLOSED: 0,
        REOPENED: 0,
        REJECTED: 0,
      };

      for (const item of statusCountsRaw) {
        if (statusCounts[item._id] !== undefined) {
          statusCounts[item._id] = item.count;
        }
      }

      const total = Object.values(statusCounts).reduce((a, b) => a + b, 0);
      const open =
        statusCounts.SUBMITTED +
        statusCounts.TRIAGED +
        statusCounts.ASSIGNED +
        statusCounts.IN_PROGRESS +
        statusCounts.REOPENED;
      const resolved = statusCounts.RESOLVED;
      const closed = statusCounts.CLOSED;
      const rejected = statusCounts.REJECTED;
      const unassigned = await models.Complaint.countDocuments({
        ...predicate,
        status: { $in: ['SUBMITTED', 'TRIAGED', 'REOPENED'] },
        assigneeId: null,
      });

      const now = new Date();
      const openPredicate = {
        ...predicate,
        status: { $in: OPEN_STATUSES },
      };

      const overdueResponse = await models.Complaint.countDocuments({
        ...openPredicate,
        firstRespondedAt: null,
        responseDueAt: { $lt: now },
      });

      const overdueResolution = await models.Complaint.countDocuments({
        ...openPredicate,
        resolvedAt: null,
        resolutionDueAt: { $lt: now },
      });

      const overdueAny = await models.Complaint.countDocuments({
        ...openPredicate,
        $or: [
          { firstRespondedAt: null, responseDueAt: { $lt: now } },
          { resolvedAt: null, resolutionDueAt: { $lt: now } },
        ],
      });

      const activeStaff = await models.User.find({
        role: 'STAFF',
        status: 'ACTIVE',
        hostelId: { $in: targetObjectIds },
      }).sort({ name: 1 });

      const staffWorkloadRaw = await models.Complaint.aggregate([
        {
          $match: {
            hostelId: { $in: targetObjectIds },
            assigneeId: { $in: activeStaff.map((s) => s._id) },
            status: { $in: ['ASSIGNED', 'IN_PROGRESS'] },
          },
        },
        {
          $group: {
            _id: { assigneeId: '$assigneeId', status: '$status' },
            count: { $sum: 1 },
          },
        },
      ]);

      const workloadMap = new Map();
      for (const s of activeStaff) {
        workloadMap.set(String(s._id), {
          staffId: String(s._id),
          name: s.name,
          assignedPending: 0,
          inProgress: 0,
          openAssigned: 0,
        });
      }

      for (const item of staffWorkloadRaw) {
        const sId = String(item._id.assigneeId);
        const entry = workloadMap.get(sId);
        if (entry) {
          if (item._id.status === 'ASSIGNED') {
            entry.assignedPending += item.count;
          } else if (item._id.status === 'IN_PROGRESS') {
            entry.inProgress += item.count;
          }
          entry.openAssigned += item.count;
        }
      }

      const staffWorkload = Array.from(workloadMap.values());

      const recentDocs = await models.Complaint.find(predicate)
        .sort({ createdAt: -1, _id: -1 })
        .limit(5)
        .populate('categoryId', 'name')
        .populate('assigneeId', 'name')
        .populate('location.hostelId', 'name')
        .populate('location.blockId', 'name')
        .populate('location.roomId', 'label');

      const recentComplaints = recentDocs.map((doc) =>
        complaintSummary(doc, { now })
      );

      const priorityCounts = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
      for (const row of await models.Complaint.aggregate([
        { $match: predicate },
        { $group: { _id: '$priority', count: { $sum: 1 } } },
      ])) {
        if (Object.hasOwn(priorityCounts, row._id))
          priorityCounts[row._id] = row.count;
      }
      const grouped = await models.Complaint.aggregate([
        { $match: predicate },
        {
          $group: {
            _id: { hostelId: '$hostelId', status: '$status' },
            count: { $sum: 1 },
          },
        },
      ]);
      const hostelBreakdown = [];
      for (const hostel of await models.Hostel.find({
        _id: { $in: targetObjectIds },
      })
        .sort({ name: 1 })
        .lean()) {
        const counts = Object.fromEntries(
          Object.keys(statusCounts).map((status) => [status, 0])
        );
        for (const row of grouped)
          if (String(row._id.hostelId) === String(hostel._id))
            counts[row._id.status] = row.count;
        hostelBreakdown.push({
          hostelId: String(hostel._id),
          name: hostel.name,
          total: Object.values(counts).reduce((sum, count) => sum + count, 0),
          open: OPEN_STATUSES.reduce((sum, status) => sum + counts[status], 0),
          assigned: counts.ASSIGNED,
          inProgress: counts.IN_PROGRESS,
          resolved: counts.RESOLVED,
          closed: counts.CLOSED,
          unassigned: counts.SUBMITTED + counts.TRIAGED + counts.REOPENED,
        });
      }
      const recentActivity = await recentScopedActivity(models, predicate);

      return {
        asOf: now.toISOString(),
        statusCounts,
        total,
        open,
        resolved,
        closed,
        rejected,
        unassigned,
        overdueResponse,
        overdueResolution,
        overdueAny,
        staffWorkload,
        recentComplaints,
        priorityCounts,
        hostelBreakdown,
        recentActivity,
      };
    },
  };
}

module.exports = { createDashboardService };
