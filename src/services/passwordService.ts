import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

class PasswordService {
  /**
   * Hash a password using bcrypt
   */
  async hash(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
  }

  /**
   * Verify a password against a bcrypt hash
   */
  async verify(password: string, hash: string): Promise<boolean> {
    try {
      return await bcrypt.compare(password, hash);
    } catch (error) {
      // Invalid hash format or other bcrypt errors
      return false;
    }
  }
}

export default new PasswordService();
