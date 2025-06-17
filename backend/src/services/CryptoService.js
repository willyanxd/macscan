import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'your-32-character-secret-key-here!';
const ALGORITHM = 'aes-256-cbc';

export class CryptoService {
  /**
   * Encrypt a password
   * @param {string} text - Plain text password
   * @returns {string} Encrypted password with IV
   */
  static encrypt(text) {
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipher(ALGORITHM, ENCRYPTION_KEY);
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      return iv.toString('hex') + ':' + encrypted;
    } catch (error) {
      console.error('Encryption error:', error);
      throw new Error('Failed to encrypt password');
    }
  }

  /**
   * Decrypt a password
   * @param {string} encryptedText - Encrypted password with IV
   * @returns {string} Plain text password
   */
  static decrypt(encryptedText) {
    try {
      const textParts = encryptedText.split(':');
      const iv = Buffer.from(textParts.shift(), 'hex');
      const encryptedPassword = textParts.join(':');
      const decipher = crypto.createDecipher(ALGORITHM, ENCRYPTION_KEY);
      let decrypted = decipher.update(encryptedPassword, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (error) {
      console.error('Decryption error:', error);
      throw new Error('Failed to decrypt password');
    }
  }

  /**
   * Mask password for display
   * @param {string} password - Plain text password
   * @returns {string} Masked password
   */
  static maskPassword(password) {
    if (!password || password.length === 0) return '';
    if (password.length <= 2) return '*'.repeat(password.length);
    return password.charAt(0) + '*'.repeat(password.length - 2) + password.charAt(password.length - 1);
  }
}