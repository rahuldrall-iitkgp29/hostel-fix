const { validateImage, parsePng, parseJpeg, parseWebP } = require('../../src/utils/imageValidation');
const { attachmentParam } = require('../../src/validators/upload.validators');

// Valid 1x1 test image buffers
const validPng = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082', 'hex');
const validJpeg = Buffer.from('ffd8ffe000104a46494600010101004800480000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffc0000b080001000101011100ffc4001f0000010501010101010100000000000000000102030405060708090a0bffda0008010100003f007f00ffd9', 'hex');
const validWebp = Buffer.from('524946461a000000574542505650384c0d0000002f00000010071011118888fe0700', 'hex');

describe('image validation unit tests', () => {
  test('validates valid 1x1 PNG, JPEG, WebP buffers', () => {
    const pngResult = validateImage(validPng);
    expect(pngResult).toMatchObject({
      mimeType: 'image/png',
      width: 1,
      height: 1,
      sizeBytes: validPng.length,
    });

    const jpegResult = validateImage(validJpeg);
    expect(jpegResult).toMatchObject({
      mimeType: 'image/jpeg',
      width: 1,
      height: 1,
      sizeBytes: validJpeg.length,
    });

    const webpResult = validateImage(validWebp);
    expect(webpResult).toMatchObject({
      mimeType: 'image/webp',
      width: 1,
      height: 1,
      sizeBytes: validWebp.length,
    });
  });

  test('rejects non-buffer or oversized buffer', () => {
    expect(() => validateImage('not a buffer')).toThrow();
    const oversized = Buffer.alloc(5 * 1024 * 1024 + 1);
    expect(() => validateImage(oversized)).toThrow();
  });

  test('rejects non-image or fake MIME files with unsupported media type', () => {
    const fake = Buffer.from('This is a text file posing as an image');
    expect(() => validateImage(fake)).toThrow();
  });

  test('rejects images exceeding 6000px dimension or 12 MP pixels', () => {
    // Construct a PNG header claiming 6001 x 100
    const bigDimPng = Buffer.from(validPng);
    bigDimPng.writeUInt32BE(6001, 16);
    expect(() => validateImage(bigDimPng)).toThrow();

    // Construct a PNG header claiming 4000 x 4000 = 16 MP (> 12 MP)
    const bigPixelsPng = Buffer.from(validPng);
    bigPixelsPng.writeUInt32BE(4000, 16);
    bigPixelsPng.writeUInt32BE(4000, 20);
    expect(() => validateImage(bigPixelsPng)).toThrow();
  });
});

describe('upload validators unit tests', () => {
  test('attachmentParam validates 24-hex string', () => {
    const valid = '670000000000000000000501';
    expect(attachmentParam.parse({ attachmentId: valid }).attachmentId).toBe(valid);
    expect(() => attachmentParam.parse({ attachmentId: 'invalid' })).toThrow();
  });
});
