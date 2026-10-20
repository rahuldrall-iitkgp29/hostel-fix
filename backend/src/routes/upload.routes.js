const { Router } = require('express');
const { createUploadController } = require('../controllers/upload.controller');
const { authenticate } = require('../middleware/authenticate');
const { requireRole } = require('../middleware/authorize');
const { uploadMultipart } = require('../middleware/uploadMultipart');
const { validateParams } = require('../middleware/validateParams');
const { noQuery, noInput } = require('../validators/common.validators');
const { attachmentParam } = require('../validators/upload.validators');

function createUploadRouter(options) {
  const router = Router({ caseSensitive: true, strict: true });
  const controller = createUploadController(options.getServices);

  router.post(
    '/',
    authenticate(options.getServices),
    requireRole('STUDENT'),
    options.limiters.upload,
    uploadMultipart,
    controller.create
  );

  router.get(
    '/:attachmentId/content',
    authenticate(options.getServices),
    options.limiters.read,
    validateParams(attachmentParam),
    noQuery,
    controller.getContent
  );

  router.delete(
    '/:attachmentId',
    authenticate(options.getServices),
    requireRole('STUDENT'),
    options.limiters.write,
    validateParams(attachmentParam),
    noInput,
    controller.delete
  );

  return router;
}

module.exports = { createUploadRouter };
