const { Router } = require('express');
const { liveness, readiness } = require('../controllers/health.controller');
const { validateHealthRequest } = require('../validators/health.validators');
const { createIpLimiter } = require('../middleware/rateLimiter');

function createHealthRouter({ checkReady } = {}) {
  const router = Router({ caseSensitive: true, strict: true });
  const limiter = createIpLimiter('health');
  router.get('/health', limiter, validateHealthRequest, liveness);
  router.get('/health/ready', limiter, validateHealthRequest, readiness(checkReady));
  return router;
}

module.exports = { createHealthRouter };
