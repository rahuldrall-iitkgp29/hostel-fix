const { sendData } = require('../utils/response');

function createComplaintController(getServices) {
  return {
    create: async (req, res) => {
      const services = getServices();
      const result = await services.complaints.createComplaint(
        req.user,
        req.body
      );
      const status = result.idempotentReplay ? 200 : 201;
      const meta = result.idempotentReplay ? { idempotentReplay: true } : {};
      return sendData(
        req,
        res,
        { complaint: result.complaint },
        { status, meta }
      );
    },

    list: async (req, res) => {
      const services = getServices();
      const result = await services.complaints.listComplaints(
        req.user,
        req.query
      );
      return sendData(req, res, result.items, {
        status: 200,
        meta: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages,
        },
      });
    },

    detail: async (req, res) => {
      const services = getServices();
      const complaint = await services.complaints.getComplaintDetail(
        req.user,
        req.params.complaintId
      );
      return sendData(req, res, { complaint }, { status: 200 });
    },

    edit: async (req, res) => {
      const services = getServices();
      const result = await services.complaints.editComplaint(
        req.user,
        req.params.complaintId,
        req.body
      );
      return sendData(
        req,
        res,
        { complaint: result.complaint, activity: result.activity },
        { status: 200 }
      );
    },

    listComments: async (req, res) => {
      const services = getServices();
      const result = await services.complaints.listComments(
        req.user,
        req.params.complaintId,
        req.query
      );
      return sendData(req, res, result.items, {
        status: 200,
        meta: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages,
        },
      });
    },

    createComment: async (req, res) => {
      const services = getServices();
      const result = await services.complaints.createComment(
        req.user,
        req.params.complaintId,
        req.body
      );
      return sendData(
        req,
        res,
        {
          complaint: result.complaint,
          activity: result.activity,
          comment: result.comment,
        },
        { status: 201 }
      );
    },

    listActivities: async (req, res) => {
      const services = getServices();
      const result = await services.complaints.listActivities(
        req.user,
        req.params.complaintId,
        req.query
      );
      return sendData(req, res, result.items, {
        status: 200,
        meta: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages,
        },
      });
    },

    transition: async (req, res) => {
      const services = getServices();
      const result = await services.complaints.transitionComplaint(
        req.user,
        req.params.complaintId,
        req.body
      );
      return sendData(
        req,
        res,
        { complaint: result.complaint, activity: result.activity },
        { status: 200 }
      );
    },

    assign: async (req, res) => {
      const services = getServices();
      const result = await services.complaints.assignComplaint(
        req.user,
        req.params.complaintId,
        req.body
      );
      return sendData(
        req,
        res,
        { complaint: result.complaint, activity: result.activity },
        { status: 200 }
      );
    },

    overridePriority: async (req, res) => {
      const services = getServices();
      const result = await services.complaints.overridePriority(
        req.user,
        req.params.complaintId,
        req.body
      );
      return sendData(
        req,
        res,
        { complaint: result.complaint, activity: result.activity },
        { status: 200 }
      );
    },

    reopen: async (req, res) => {
      const services = getServices();
      const result = await services.complaints.reopenComplaint(
        req.user,
        req.params.complaintId,
        req.body
      );
      return sendData(
        req,
        res,
        { complaint: result.complaint, activity: result.activity },
        { status: 200 }
      );
    },

    feedback: async (req, res) => {
      const services = getServices();
      const result = await services.complaints.submitFeedback(
        req.user,
        req.params.complaintId,
        req.body
      );
      return sendData(
        req,
        res,
        {
          complaint: result.complaint,
          activity: result.activity,
          feedback: result.feedback,
        },
        { status: 201 }
      );
    },
  };
}

module.exports = { createComplaintController };
