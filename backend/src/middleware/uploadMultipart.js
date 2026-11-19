const { formidable } = require('formidable');
const { removeTemporaryUpload } = require('../utils/temporaryUploads');
const { AppError } = require('../utils/AppError');
const { POLICY } = require('../config/policy');

function uploadMultipart(req, res, next) {
  const contentType = req.headers['content-type'] || '';
  if (!contentType.startsWith('multipart/form-data')) {
    return next(
      new AppError(422, 'VALIDATION_ERROR', 'Multipart form data is required.')
    );
  }

  const form = formidable({
    maxFiles: 1,
    maxFileSize: POLICY.upload.bytes,
    maxTotalFileSize: POLICY.upload.bytes,
    multiples: false,
    maxFields: 0,
  });
  const temporaryFiles = new Set();
  form.on('fileBegin', (_name, file) => temporaryFiles.add(file.filepath));
  form.parse(req, async (err, fields, files) => {
    const cleanup = async () => {
      for (const filepath of temporaryFiles)
        await removeTemporaryUpload(filepath);
    };
    if (err) {
      try {
        await cleanup();
      } catch {
        return next(
          new AppError(
            503,
            'SERVICE_UNAVAILABLE',
            'Unable to clean up the temporary upload.'
          )
        );
      }
      if (
        err.code === 1016 ||
        err.code === 1009 ||
        /maxFileSize/i.test(err.message)
      ) {
        return next(
          new AppError(
            413,
            'FILE_TOO_LARGE',
            'File exceeds the 5 MiB size limit.'
          )
        );
      }
      return next(
        new AppError(422, 'VALIDATION_ERROR', 'Malformed upload data.')
      );
    }

    const fileList = files.file
      ? Array.isArray(files.file)
        ? files.file
        : [files.file]
      : [];
    if (
      fileList.length !== 1 ||
      Object.keys(files).length !== 1 ||
      Object.keys(fields).length
    ) {
      try {
        await cleanup();
      } catch {
        return next(
          new AppError(
            503,
            'SERVICE_UNAVAILABLE',
            'Unable to clean up the temporary upload.'
          )
        );
      }
      return next(
        new AppError(
          422,
          'VALIDATION_ERROR',
          'Exactly one file must be uploaded under the "file" field.'
        )
      );
    }

    req.uploadedFile = fileList[0];
    // Also covers a later controller failure or client disconnect.
    const finishCleanup = () => {
      void cleanup().catch(() =>
        req.app.locals.logger?.warn(
          { event: 'temporary_upload_cleanup_failed' },
          'Temporary upload cleanup failed.'
        )
      );
    };
    res.once('finish', finishCleanup);
    res.once('close', finishCleanup);
    next();
  });
}

module.exports = { uploadMultipart };
