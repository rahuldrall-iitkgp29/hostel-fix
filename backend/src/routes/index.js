const { Router } = require('express');
const { createHealthRouter } = require('./health.routes');
const { createAuthRouter } = require('./auth.routes');
const { createUserRouter } = require('./user.routes');
const { createIpLimiter, createUserLimiter } = require('../middleware/rateLimiter');

function createApiRouter(options) {
  const router = Router({ caseSensitive: true, strict: true });
  router.use(createHealthRouter(options));
  const limiters = {
    public: createIpLimiter('public'), refresh: createIpLimiter('refresh'),
    read: createUserLimiter('read'), write: createUserLimiter('write'),
  };
  router.use('/auth', createAuthRouter({ ...options, limiters }));
  router.use('/users', createUserRouter({ ...options, limiters }));
  return router;
}

module.exports = { createApiRouter };
