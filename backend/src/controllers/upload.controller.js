const { sendData } = require('../utils/response');

function createUploadController(getServices) {
  return {
    create: async (req, res) => {
      const services = getServices();
      const result = await services.uploads.createUpload({
        file: req.uploadedFile,
        user: req.user,
      });
      return sendData(req, res, result, { status: 201 });
    },

    getContent: async (req, res) => {
      const services = getServices();
      const { data, attachment } = await services.uploads.getContent(req.params.attachmentId, req.user);
      res.setHeader('Content-Type', attachment.mimeType);
      res.setHeader('Content-Length', attachment.sizeBytes);
      res.setHeader('Content-Disposition', `inline; filename="${attachment.originalName}"`);
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.status(200).send(data);
    },

    delete: async (req, res) => {
      const services = getServices();
      await services.uploads.deleteUpload(req.params.attachmentId, req.user);
      return sendData(req, res, undefined, { status: 204 });
    },
  };
}

module.exports = { createUploadController };
