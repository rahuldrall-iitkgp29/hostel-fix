const { sendData } = require('../utils/response');
const { POLICY, refreshCookieOptions } = require('../config/policy');
const {
  issueAccessToken,
  readRefreshCookie,
  clearRefreshCookie,
} = require('../utils/tokens');

function createAuthController(getServices) {
  function sendSession(req, res, services, result) {
    const accessToken = issueAccessToken(
      result.user,
      result.record,
      services.config
    );
    res.cookie(
      POLICY.cookieName,
      result.cookie,
      refreshCookieOptions(services.config)
    );
    return sendData(req, res, {
      ...services.users.self(result.user),
      accessToken,
      expiresIn: 600,
    });
  }
  return {
    register: async (req, res) => {
      const services = getServices();
      const user = await services.auth.register(req.body);
      return sendData(req, res, services.users.self(user), { status: 201 });
    },
    login: async (req, res) => {
      const services = getServices();
      const result = await services.auth.login(req.body, {
        userAgent: req.get('User-Agent'),
        ipAddress: req.ip,
      });
      return sendSession(req, res, services, result);
    },
    refresh: async (req, res) => {
      const services = getServices();
      try {
        return sendSession(
          req,
          res,
          services,
          await services.sessions.refresh(readRefreshCookie(req))
        );
      } catch (error) {
        if (error.status === 401 || error.code === 'ACCOUNT_INACTIVE')
          clearRefreshCookie(res, services.config);
        throw error;
      }
    },
    logout: async (req, res) => {
      const services = getServices();
      await services.sessions.logout({
        cookie: readRefreshCookie(req),
        claims: req.logoutClaims,
      });
      clearRefreshCookie(res, services.config);
      return sendData(req, res, undefined, { status: 204 });
    },
  };
}

module.exports = { createAuthController };
