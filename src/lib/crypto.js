import crypto from 'crypto';

const ALGORITHM = 'aes256';
const PW_SECRET = crypto.randomBytes(32);
const IV = crypto.randomBytes(16);


function encrypt(str) {
  const cipher = crypto.createCipheriv(ALGORITHM, PW_SECRET, IV);
  let encrypted = cipher.update(str, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return Buffer.from(encrypted, 'utf8').toString('base64');
}

function decrypt(encrypted) {
  const decipher = crypto.createDecipheriv(ALGORITHM, PW_SECRET, IV);
  let dec = decipher.update(Buffer.from(encrypted, 'base64').toString('utf8'), 'hex', 'utf8');
  dec += decipher.final('utf8');
  return dec;
}

module.exports = {
  encrypt,
  decrypt,
};
