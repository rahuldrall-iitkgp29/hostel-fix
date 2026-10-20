const { Router } = require('express');
const { createDashboardController } = require('../controllers/dashboard.controller');
const { authenticate } = require('../middleware/authenticate');
const { requireRole } = require('../middleware/authorize');
const { validateQuery } = require('../middleware/validateQuery');
const {
  studentDashboardQuery,
  staffDashboardQuery,
  adminDashboardQuery,
} = require('../validators/dashboard.validators');

function createDashboardRouter(options) {
  const router = Router({ caseSensitive: true, strict: true });
  const controller = createDashboardController(options.getServices);

  router.get(
    '/student',
    authenticate(options.getServices),
    requireRole('STUDENT'),
    options.limiters.read,
    validateQuery(studentDashboardQuery),
    controller.student
  );

  router.get(
    '/staff',
    authenticate(options.getServices),
    requireRole('STAFF'),
    options.limiters.read,
    validateQuery(staffDashboardQuery),
    controller.staff
  );

  router.get(
    '/admin',
    authenticate(options.getServices),
    requireRole('ADMIN'),
    options.limiters.read,
    validateQuery(adminDashboardQuery),
    controller.admin
  );

  return router;
}

module.exports = { createDashboardRouter };
