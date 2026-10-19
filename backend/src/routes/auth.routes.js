const { Router } = require('express');
const { createAuthController } = require('../controllers/auth.controller');
const { createUserController } = require('../controllers/user.controller');
const { authenticate } = require('../middleware/authenticate');
const { validateBody } = require('../middleware/validateBody');
const { noQuery, noInput } = require('../validators/common.validators');
const schemas = require('../validators/auth.validators');
const { bearerToken, verifyAccessToken } = require('../utils/tokens');

function createAuthRouter({ getServices, limiters }) {
  const router = Router({ caseSensitive: true, strict: true });
  const controller = createAuthController(getServices);
  const users = createUserController(getServices);
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.post('/register', limiters.public, noQuery, validateBody(schemas.register), controller.register);
  router.post('/login', limiters.public, noQuery, validateBody(schemas.login), controller.login);
  router.post('/refresh', limiters.refresh, noQuery, validateBody(schemas.empty), controller.refresh);
  const logoutLimit = (req, res, next) => {
    try {
      const token = bearerToken(req);
      req.logoutClaims = verifyAccessToken(token, getServices().config);
      req.user = { _id: req.logoutClaims.sub };
    } catch (error) { if (error.status !== 401) return next(error); }
    return (req.logoutClaims ? limiters.write : limiters.public)(req, res, next);
  };
  router.post('/logout', logoutLimit, noQuery, validateBody(schemas.empty), controller.logout);
  router.get('/me', noInput, authenticate(getServices, { allowPasswordChange: true }), limiters.read, users.me);
  return router;
}

module.exports = { createAuthRouter };
