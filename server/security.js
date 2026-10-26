const crypto = require('crypto');

function hashPassword(password) {
    if (!password) return '';
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
    if (!password || !stored) return false;

    const [salt, expected] = String(stored).split(':');
    if (!salt || !expected) return false;

    const actual = crypto.scryptSync(password, salt, 64).toString('hex');

    const bufActual = Buffer.from(actual, 'hex');
    const bufExpected = Buffer.from(expected, 'hex');

    // Si las longitudes de los buffers no coinciden, la clave es incorrecta
    if (bufActual.length !== bufExpected.length) {
        return false;
    }

    return crypto.timingSafeEqual(bufActual, bufExpected);
}

function createToken() {
    return crypto.randomBytes(32).toString('hex');
}

module.exports = { hashPassword, verifyPassword, createToken };