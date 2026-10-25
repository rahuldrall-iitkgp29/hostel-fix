const { sendData } = require('../utils/response');

function createDashboardController(getServices) {
  return {
    student: async (req, res) => {
      const services = getServices();
      const result = await services.dashboard.getStudentDashboard(
        req.user,
        req.query
      );
      return sendData(req, res, result, { status: 200 });
    },

    staff: async (req, res) => {
      const services = getServices();
      const result = await services.dashboard.getStaffDashboard(
        req.user,
        req.query
      );
      return sendData(req, res, result, { status: 200 });
    },

    admin: async (req, res) => {
      const services = getServices();
      const result = await services.dashboard.getAdminDashboard(
        req.user,
        req.query
      );
      return sendData(req, res, result, { status: 200 });
    },
  };
}

module.exports = { createDashboardController };
