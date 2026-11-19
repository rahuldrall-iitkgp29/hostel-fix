const { bearerToken, verifyAccessToken } = require('../utils/tokens');

function authenticate(getServices, { allowPasswordChange = false } = {}) {
  return async (req, res, next) => {
    const token = bearerToken(req);
    const { config, sessions } = getServices();
    const claims = verifyAccessToken(token, config);
    const { user, record } = await sessions.loadAccount(claims, undefined, {
      allowPasswordChange,
    });
    req.user = user;
    user.$locals.authClaims = claims;
    req.auth = { claims, sessionId: record._id };
    next();
  };
}

module.exports = { authenticate };
