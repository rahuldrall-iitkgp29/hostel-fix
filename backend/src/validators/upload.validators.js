const { z } = require('zod');
const { id } = require('./common.validators');

const attachmentParam = z.strictObject({
  attachmentId: id,
});

module.exports = { attachmentParam };
