function sendData(req, res, data, { status = 200, meta = {} } = {}) {
  if (status === 204) return res.status(204).end();
  return res.status(status).json({ data, meta: { ...meta, requestId: req.requestId } });
}

module.exports = { sendData };
