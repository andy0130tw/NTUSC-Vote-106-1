const crypto = require('crypto');
const config = require('./config.json');

// pre-launch check
if (!config.AUTH_SALT) {
    throw new Error('AUTH_SALT is required in config file.');
}

function doHash(str) {
    const hash1 = crypto.createHash('sha256'),
          hash2 = crypto.createHash('sha256');
    hash1.update(str + config.AUTH_SALT);
    hash2.update(hash1.digest('hex') + config.AUTH_SALT);
    return hash2.digest('hex');
}

function generateTxString() {
    const chars = [];
    const charList = '0123456789abcdef';
    for (let i = 0; i < 32; i++) {
        chars.push(charList[Math.floor(Math.random() * 16)]);
    }
    return chars.join('');
}

module.exports = {
    doHash: doHash,
    generateTxString: generateTxString
};
