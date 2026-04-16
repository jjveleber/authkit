import passwordService from '../../src/services/passwordService.js';

describe('passwordService', () => {
  const plainPassword = 'MySecurePassword123!';
  const wrongPassword = 'WrongPassword456@';

  describe('hash', () => {
    it('should hash a password', async () => {
      const hash = await passwordService.hash(plainPassword);

      expect(typeof hash).toBe('string');
      expect(hash).not.toBe(plainPassword);
      expect(hash.length).toBeGreaterThan(20); // bcrypt hashes are long
    });

    it('should generate different hashes for same password', async () => {
      const hash1 = await passwordService.hash(plainPassword);
      const hash2 = await passwordService.hash(plainPassword);

      expect(hash1).not.toBe(hash2); // bcrypt uses random salt
    });

    it('should start with bcrypt identifier', async () => {
      const hash = await passwordService.hash(plainPassword);

      expect(hash.startsWith('$2b$') || hash.startsWith('$2a$')).toBe(true);
    });

    it('should handle empty password', async () => {
      const hash = await passwordService.hash('');

      expect(typeof hash).toBe('string');
      expect(hash.length).toBeGreaterThan(20);
    });

    it('should handle very long passwords', async () => {
      const longPassword = 'a'.repeat(200);
      const hash = await passwordService.hash(longPassword);

      expect(typeof hash).toBe('string');
      expect(hash.length).toBeGreaterThan(20);
    });
  });

  describe('verify', () => {
    let hashedPassword: string;

    beforeAll(async () => {
      hashedPassword = await passwordService.hash(plainPassword);
    });

    it('should return true for correct password', async () => {
      const result = await passwordService.verify(plainPassword, hashedPassword);

      expect(result).toBe(true);
    });

    it('should return false for incorrect password', async () => {
      const result = await passwordService.verify(wrongPassword, hashedPassword);

      expect(result).toBe(false);
    });

    it('should return false for empty password when hash is not empty', async () => {
      const result = await passwordService.verify('', hashedPassword);

      expect(result).toBe(false);
    });

    it('should handle invalid hash format gracefully', async () => {
      const result = await passwordService.verify(plainPassword, 'invalid-hash');

      expect(result).toBe(false);
    });

    it('should be case-sensitive', async () => {
      const result = await passwordService.verify(plainPassword.toLowerCase(), hashedPassword);

      expect(result).toBe(false);
    });

    it('should work with hash generated in same call', async () => {
      const newPassword = 'AnotherPassword789#';
      const hash = await passwordService.hash(newPassword);
      const isValid = await passwordService.verify(newPassword, hash);

      expect(isValid).toBe(true);
    });
  });

  describe('performance', () => {
    it('should hash password in reasonable time (< 1s)', async () => {
      const start = Date.now();
      await passwordService.hash(plainPassword);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(1000);
    });

    it('should verify password in reasonable time (< 1s)', async () => {
      const hash = await passwordService.hash(plainPassword);
      const start = Date.now();
      await passwordService.verify(plainPassword, hash);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(1000);
    });
  });
});
