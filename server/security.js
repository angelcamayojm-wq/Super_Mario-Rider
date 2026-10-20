const crypto = require('crypto');

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
    const [salt, expected] = String(stored || '').split(':');
    if (!salt || !expected) return false;
    const actual = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}

function createToken() {
    return crypto.randomBytes(32).toString('hex');
}

module.exports = { hashPassword, verifyPassword, createToken };
