const { Router } = require('express');
const { createHealthRouter } = require('./health.routes');
const { createAuthRouter } = require('./auth.routes');
const { createUserRouter } = require('./user.routes');
const { createCatalogRouter } = require('./catalog.routes');
const { createCategoryRouter } = require('./category.routes');
const { createAdminRouter } = require('./admin.routes');
const { createUploadRouter } = require('./upload.routes');
const { createComplaintRouter } = require('./complaint.routes');
const { createDashboardRouter } = require('./dashboard.routes');
const { createIpLimiter, createUserLimiter } = require('../middleware/rateLimiter');

function createApiRouter(options) {
  const router = Router({ caseSensitive: true, strict: true });
  router.use(createHealthRouter(options));
  const limiters = {
    public: createIpLimiter('public'), refresh: createIpLimiter('refresh'),
    read: createUserLimiter('read'), write: createUserLimiter('write'),
    upload: createUserLimiter('upload'),
  };
  router.use('/auth', createAuthRouter({ ...options, limiters }));
  router.use('/users', createUserRouter({ ...options, limiters }));
  router.use('/catalog', createCatalogRouter({ ...options, limiters }));
  router.use('/categories', createCategoryRouter({ ...options, limiters }));
  router.use('/admin', createAdminRouter({ ...options, limiters }));
  router.use('/uploads', createUploadRouter({ ...options, limiters }));
  router.use('/complaints', createComplaintRouter({ ...options, limiters }));
  router.use('/dashboard', createDashboardRouter({ ...options, limiters }));
  return router;
}

module.exports = { createApiRouter };

