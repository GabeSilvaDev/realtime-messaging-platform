import { AuthEventType } from '@/modules/auth/constants/auth-events.constants';

describe('auth-events.constants', () => {
  describe('AuthEventType', () => {
    it('should have REGISTER event', () => {
      expect(AuthEventType.REGISTER).toBe('auth:register');
    });

    it('should have LOGIN event', () => {
      expect(AuthEventType.LOGIN).toBe('auth:login');
    });

    it('should have LOGIN_FAILED event', () => {
      expect(AuthEventType.LOGIN_FAILED).toBe('auth:login_failed');
    });

    it('should have LOGOUT event', () => {
      expect(AuthEventType.LOGOUT).toBe('auth:logout');
    });

    it('should have TOKEN_REFRESH event', () => {
      expect(AuthEventType.TOKEN_REFRESH).toBe('auth:token_refresh');
    });

    it('should have PASSWORD_RESET_REQUEST event', () => {
      expect(AuthEventType.PASSWORD_RESET_REQUEST).toBe('auth:password_reset_request');
    });

    it('should have PASSWORD_RESET event', () => {
      expect(AuthEventType.PASSWORD_RESET).toBe('auth:password_reset');
    });

    it('should have PASSWORD_CHANGE event', () => {
      expect(AuthEventType.PASSWORD_CHANGE).toBe('auth:password_change');
    });

    it('should have exactly 8 event types', () => {
      const eventTypes = Object.values(AuthEventType);
      expect(eventTypes).toHaveLength(8);
    });

    it('should have unique values for all events', () => {
      const eventTypes = Object.values(AuthEventType);
      const uniqueValues = new Set(eventTypes);
      expect(uniqueValues.size).toBe(eventTypes.length);
    });
  });
});
