import { PASSWORD_RESET_PREFIX, PASSWORD_RESET_TTL } from '@/modules/auth/constants/auth.constants';

describe('auth.constants', () => {
  describe('PASSWORD_RESET_PREFIX', () => {
    it('should be defined as string', () => {
      expect(typeof PASSWORD_RESET_PREFIX).toBe('string');
    });

    it('should have correct value', () => {
      expect(PASSWORD_RESET_PREFIX).toBe('password_reset:');
    });
  });

  describe('PASSWORD_RESET_TTL', () => {
    it('should be defined as number', () => {
      expect(typeof PASSWORD_RESET_TTL).toBe('number');
    });

    it('should be 3600 seconds (1 hour)', () => {
      expect(PASSWORD_RESET_TTL).toBe(3600);
    });

    it('should be positive number', () => {
      expect(PASSWORD_RESET_TTL).toBeGreaterThan(0);
    });
  });
});
