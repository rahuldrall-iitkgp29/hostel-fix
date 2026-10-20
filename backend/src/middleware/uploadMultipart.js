const { formidable } = require('formidable');
const { AppError } = require('../utils/AppError');
const { POLICY } = require('../config/policy');

function uploadMultipart(req, res, next) {
  const contentType = req.headers['content-type'] || '';
  if (!contentType.startsWith('multipart/form-data')) {
    return next(new AppError(422, 'VALIDATION_ERROR', 'Multipart form data is required.'));
  }

  const form = formidable({
    maxFiles: 1,
    maxFileSize: POLICY.upload.bytes,
    maxTotalFileSize: POLICY.upload.bytes,
    multiples: false,
  });

  form.parse(req, (err, fields, files) => {
    if (err) {
      if (err.code === 1016 || err.code === 1009 || /maxFileSize/i.test(err.message)) {
        return next(new AppError(413, 'FILE_TOO_LARGE', 'File exceeds the 5 MiB size limit.'));
      }
      return next(new AppError(422, 'VALIDATION_ERROR', 'Malformed upload data.'));
    }

    const fileList = files.file ? (Array.isArray(files.file) ? files.file : [files.file]) : [];
    if (fileList.length !== 1) {
      return next(new AppError(422, 'VALIDATION_ERROR', 'Exactly one file must be uploaded under the "file" field.'));
    }

    req.uploadedFile = fileList[0];
    next();
  });
}

module.exports = { uploadMultipart };
