const crypto = require('node:crypto');

const CHARSET = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function generateReference(year = new Date().getFullYear()) {
  const bytes = crypto.randomBytes(10);
  let randomPart = '';
  for (let i = 0; i < 10; i++) {
    randomPart += CHARSET[bytes[i] % CHARSET.length];
  }
  return `HFX-${year}-${randomPart}`;
}

module.exports = { generateReference };
