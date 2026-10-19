const { sendData } = require('../utils/response');
const { clearRefreshCookie } = require('../utils/tokens');

function createUserController(getServices) {
  return {
    me: (req, res) => sendData(req, res, getServices().users.self(req.user)),
    update: async (req, res) => sendData(req, res, await getServices().users.update(req.auth.claims, req.body)),
    password: async (req, res) => {
      const services = getServices();
      await services.auth.changePassword(req.auth.claims, req.body);
      clearRefreshCookie(res, services.config);
      return sendData(req, res, undefined, { status: 204 });
    },
  };
}

module.exports = { createUserController };
