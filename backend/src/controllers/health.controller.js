const { sendData } = require('../utils/response');

function liveness(req, res) {
  return sendData(req, res, { status: 'ok' });
}

function readiness(checkReady) {
  // Express 5 forwards rejected async handlers to the centralized error handler.
  return async (req, res) => {
    res.set('Cache-Control', 'no-store');
    await checkReady();
    return sendData(req, res, { status: 'ready' });
  };
}

module.exports = { liveness, readiness };
