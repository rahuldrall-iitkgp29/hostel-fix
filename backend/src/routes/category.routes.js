const { Router } = require('express');
const { createCatalogController } = require('../controllers/catalog.controller');
const { authenticate } = require('../middleware/authenticate');
const { validateQuery } = require('../middleware/validateQuery');
const { categoriesQuery } = require('../validators/catalog.validators');

function createCategoryRouter(options) {
  const router = Router({ caseSensitive: true, strict: true });
  const controller = createCatalogController(options.getServices);

  router.get(
    '/',
    authenticate(options.getServices),
    options.limiters.read,
    validateQuery(categoriesQuery),
    controller.listCategories
  );

  return router;
}

module.exports = { createCategoryRouter };
