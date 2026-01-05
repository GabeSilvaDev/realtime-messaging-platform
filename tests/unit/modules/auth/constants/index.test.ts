import * as constants from '@/modules/auth/constants';
import { PASSWORD_RESET_PREFIX, PASSWORD_RESET_TTL, AuthEventType } from '@/modules/auth/constants';

describe('constants/index', () => {
  describe('exports', () => {
    it('should export PASSWORD_RESET_PREFIX', () => {
      expect(constants.PASSWORD_RESET_PREFIX).toBeDefined();
      expect(PASSWORD_RESET_PREFIX).toBe('password_reset:');
    });

    it('should export PASSWORD_RESET_TTL', () => {
      expect(constants.PASSWORD_RESET_TTL).toBeDefined();
      expect(PASSWORD_RESET_TTL).toBe(3600);
    });

    it('should export AuthEventType enum', () => {
      expect(constants.AuthEventType).toBeDefined();
      expect(AuthEventType).toBeDefined();
      expect(AuthEventType.REGISTER).toBe('auth:register');
    });
  });
});
