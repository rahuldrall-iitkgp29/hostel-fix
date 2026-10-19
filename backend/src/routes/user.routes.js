const { Router } = require('express');
const { createUserController } = require('../controllers/user.controller');
const { authenticate } = require('../middleware/authenticate');
const { validateBody } = require('../middleware/validateBody');
const { noQuery, noInput } = require('../validators/common.validators');
const schemas = require('../validators/auth.validators');

function createUserRouter({ getServices, limiters }) {
  const router = Router({ caseSensitive: true, strict: true });
  const controller = createUserController(getServices);
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/me', noInput, authenticate(getServices, { allowPasswordChange: true }), limiters.read, controller.me);
  router.patch('/me', noQuery, validateBody(schemas.profile), authenticate(getServices), limiters.write, controller.update);
  router.post('/me/password', noQuery, validateBody(schemas.changePassword),
    authenticate(getServices, { allowPasswordChange: true }), limiters.write, controller.password);
  return router;
}

module.exports = { createUserRouter };
