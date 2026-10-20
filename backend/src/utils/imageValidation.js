const { POLICY } = require('../config/policy');
const { AppError } = require('./AppError');

function parsePng(buf) {
  if (buf.length < 24) return null;
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return width > 0 && height > 0 ? { width, height } : null;
}

function parseJpeg(buf) {
  let offset = 2;
  while (offset < buf.length) {
    if (buf[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buf[offset + 1];
    if (marker === 0xd9 || marker === 0xda) break;
    if (offset + 4 > buf.length) break;
    const len = buf.readUInt16BE(offset + 2);
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      if (offset + 9 > buf.length) break;
      const height = buf.readUInt16BE(offset + 5);
      const width = buf.readUInt16BE(offset + 7);
      return width > 0 && height > 0 ? { width, height } : null;
    }
    offset += 2 + len;
  }
  return null;
}

function parseWebP(buf) {
  if (buf.length < 16) return null;
  const chunkType = buf.slice(12, 16).toString('ascii');
  if (chunkType === 'VP8X' && buf.length >= 30) {
    const width = 1 + buf.readUIntLE(24, 3);
    const height = 1 + buf.readUIntLE(27, 3);
    return width > 0 && height > 0 ? { width, height } : null;
  }
  if (chunkType === 'VP8 ' && buf.length >= 30) {
    const width = buf.readUInt16LE(26) & 0x3fff;
    const height = buf.readUInt16LE(28) & 0x3fff;
    return width > 0 && height > 0 ? { width, height } : null;
  }
  if (chunkType === 'VP8L' && buf.length >= 25) {
    const b1 = buf[21];
    const b2 = buf[22];
    const b3 = buf[23];
    const b4 = buf[24];
    const width = 1 + (((b2 & 0x3f) << 8) | b1);
    const height = 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6));
    return width > 0 && height > 0 ? { width, height } : null;
  }
  return null;
}

function validateImage(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    throw new AppError(422, 'INVALID_IMAGE', 'Invalid file data.');
  }

  if (buffer.length > POLICY.upload.bytes) {
    throw new AppError(413, 'FILE_TOO_LARGE', 'File exceeds the 5 MiB size limit.');
  }

  let mimeType = null;
  let dims = null;

  // PNG: 89 50 4e 47 0d 0a 1a 0a
  if (buffer.length >= 8 && buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    mimeType = 'image/png';
    dims = parsePng(buffer);
  } else if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    mimeType = 'image/jpeg';
    dims = parseJpeg(buffer);
  } else if (
    buffer.length >= 12
    && buffer.slice(0, 4).toString('ascii') === 'RIFF'
    && buffer.slice(8, 12).toString('ascii') === 'WEBP'
  ) {
    mimeType = 'image/webp';
    dims = parseWebP(buffer);
  } else {
    throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Only JPEG, PNG, and WebP images are supported.');
  }

  if (!dims) {
    throw new AppError(422, 'INVALID_IMAGE', 'Malformed or invalid image data.');
  }

  const { width, height } = dims;
  if (width > POLICY.upload.dimension || height > POLICY.upload.dimension || width * height > POLICY.upload.pixels) {
    throw new AppError(422, 'INVALID_IMAGE', 'Decoded image exceeds the pixel or dimension limit.');
  }

  return {
    mimeType,
    width,
    height,
    sizeBytes: buffer.length,
  };
}

module.exports = { validateImage, parsePng, parseJpeg, parseWebP };
