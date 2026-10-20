const { Router } = require('express');
const { createCatalogController } = require('../controllers/catalog.controller');
const { authenticate } = require('../middleware/authenticate');
const { requireRole } = require('../middleware/authorize');
const { validateQuery } = require('../middleware/validateQuery');
const { adminStaffQuery } = require('../validators/catalog.validators');

function createAdminRouter(options) {
  const router = Router({ caseSensitive: true, strict: true });
  const controller = createCatalogController(options.getServices);

  router.get(
    '/staff',
    authenticate(options.getServices),
    requireRole('ADMIN'),
    options.limiters.read,
    validateQuery(adminStaffQuery),
    controller.listAdminStaff
  );

  return router;
}

module.exports = { createAdminRouter };
