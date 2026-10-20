const { AppError } = require('../utils/AppError');
const { catalogHostel, catalogBlock, catalogRoom, category, staffSummary } = require('../models/projections');

function createCatalogService({ models }) {
  async function listHostels({ page, limit }) {
    const filter = { isActive: true };
    const total = await models.Hostel.countDocuments(filter);
    const hostels = await models.Hostel.find(filter)
      .sort({ name: 1, _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit);
    return {
      data: hostels.map(catalogHostel),
      total,
      page,
      limit,
    };
  }

  async function getHostelBlocks(hostelId) {
    const hostel = await models.Hostel.findOne({ _id: hostelId, isActive: true });
    if (!hostel) throw new AppError(404, 'NOT_FOUND', 'Hostel not found.');
    const blocks = await models.Block.find({ hostelId, isActive: true })
      .sort({ name: 1, _id: 1 })
      .limit(20);
    return {
      data: blocks.map(catalogBlock),
    };
  }

  async function listRooms({ hostelId, blockId, page, limit }) {
    const hostel = await models.Hostel.findOne({ _id: hostelId, isActive: true });
    if (!hostel) throw new AppError(404, 'NOT_FOUND', 'Parent hostel not found or inactive.');
    const block = await models.Block.findOne({ _id: blockId, hostelId, isActive: true });
    if (!block) throw new AppError(404, 'NOT_FOUND', 'Parent block not found or inactive.');

    const filter = { hostelId, blockId, isActive: true };
    const total = await models.Room.countDocuments(filter);
    const rooms = await models.Room.find(filter)
      .sort({ label: 1, _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit);
    return {
      data: rooms.map(catalogRoom),
      total,
      page,
      limit,
    };
  }

  async function listCategories({ hostelId, includeInactive, page, limit }, caller) {
    if (caller.role === 'STUDENT' || caller.role === 'STAFF') {
      if (String(caller.hostelId) !== String(hostelId)) {
        throw new AppError(404, 'NOT_FOUND', 'Resource not found or out of scope.');
      }
    } else if (caller.role === 'ADMIN') {
      const adminHostels = (caller.adminHostelIds ?? []).map(String);
      if (!adminHostels.includes(String(hostelId))) {
        throw new AppError(404, 'NOT_FOUND', 'Resource not found or out of scope.');
      }
    } else {
      throw new AppError(403, 'FORBIDDEN', 'Access forbidden.');
    }

    if (includeInactive && caller.role !== 'ADMIN') {
      throw new AppError(403, 'FORBIDDEN', 'Only administrators can view inactive categories.');
    }

    const hostel = await models.Hostel.findOne({ _id: hostelId, ...(includeInactive ? {} : { isActive: true }) });
    if (!hostel) throw new AppError(404, 'NOT_FOUND', 'Hostel not found or out of scope.');

    const filter = { hostelId, ...(includeInactive ? {} : { isActive: true }) };
    const total = await models.Category.countDocuments(filter);
    const categories = await models.Category.find(filter)
      .sort({ name: 1, _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit);
    return {
      data: categories.map(category),
      total,
      page,
      limit,
    };
  }

  async function listAdminStaff({ hostelId, categoryId, status, eligibleForComplaintId, page, limit }, caller) {
    if (caller.role !== 'ADMIN') {
      throw new AppError(403, 'FORBIDDEN', 'Access forbidden.');
    }
    const adminHostels = (caller.adminHostelIds ?? []).map(String);
    if (!adminHostels.includes(String(hostelId))) {
      throw new AppError(404, 'NOT_FOUND', 'Hostel not found or out of scope.');
    }

    const userFilter = { role: 'STAFF', hostelId };

    if (eligibleForComplaintId) {
      const complaint = await models.Complaint.findOne({ _id: eligibleForComplaintId, hostelId });
      if (!complaint) throw new AppError(404, 'NOT_FOUND', 'Complaint not found or out of scope.');

      if (status === 'INACTIVE' || (categoryId && String(categoryId) !== String(complaint.categoryId))) {
        throw new AppError(422, 'VALIDATION_ERROR', 'Contradictory filters.');
      }
      userFilter.status = 'ACTIVE';
      userFilter.categoryIds = complaint.categoryId;
    } else {
      if (status) userFilter.status = status;
      if (categoryId) userFilter.categoryIds = categoryId;
    }

    const total = await models.User.countDocuments(userFilter);
    const users = await models.User.find(userFilter)
      .sort({ name: 1, _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const userIds = users.map((u) => u._id);
    const counts = userIds.length > 0
      ? await models.Complaint.aggregate([
          { $match: { assigneeId: { $in: userIds }, status: { $in: ['ASSIGNED', 'IN_PROGRESS'] } } },
          { $group: { _id: '$assigneeId', count: { $sum: 1 } } },
        ])
      : [];
    const countMap = new Map(counts.map((c) => [String(c._id), c.count]));

    return {
      data: users.map((user) => staffSummary(user, {
        includeEmail: true,
        openAssignedCount: countMap.get(String(user._id)) ?? 0,
      })),
      total,
      page,
      limit,
    };
  }

  return {
    listHostels,
    getHostelBlocks,
    listRooms,
    listCategories,
    listAdminStaff,
  };
}

module.exports = { createCatalogService };
