import { AuthEvents, authEvents } from '@/modules/auth/events/AuthEvents';
import { AuthEventType } from '@/modules/auth/constants/auth-events.constants';

describe('AuthEvents', () => {
  let events: AuthEvents;

  beforeEach(() => {
    events = new AuthEvents();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-04T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('on', () => {
    it('should register event listener', () => {
      const listener = jest.fn();
      events.on(AuthEventType.REGISTER, listener);

      events.emitRegister('user-123', 'test@example.com');

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should call listener with correct data', () => {
      const listener = jest.fn();
      events.on(AuthEventType.LOGIN, listener);

      events.emitLogin('user-123', 'test@example.com');

      expect(listener).toHaveBeenCalledWith({
        userId: 'user-123',
        email: 'test@example.com',
        timestamp: new Date('2026-01-04T12:00:00.000Z'),
      });
    });
  });

  describe('off', () => {
    it('should unregister event listener', () => {
      const listener = jest.fn();
      events.on(AuthEventType.LOGOUT, listener);
      events.off(AuthEventType.LOGOUT, listener);

      events.emitLogout('user-123');

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('emitRegister', () => {
    it('should emit register event with correct data', () => {
      const listener = jest.fn();
      events.on(AuthEventType.REGISTER, listener);

      events.emitRegister('user-123', 'test@example.com');

      expect(listener).toHaveBeenCalledWith({
        userId: 'user-123',
        email: 'test@example.com',
        timestamp: expect.any(Date),
      });
    });
  });

  describe('emitLogin', () => {
    it('should emit login event with correct data', () => {
      const listener = jest.fn();
      events.on(AuthEventType.LOGIN, listener);

      events.emitLogin('user-456', 'login@example.com');

      expect(listener).toHaveBeenCalledWith({
        userId: 'user-456',
        email: 'login@example.com',
        timestamp: expect.any(Date),
      });
    });
  });

  describe('emitLoginFailed', () => {
    it('should emit login failed event with correct data', () => {
      const listener = jest.fn();
      events.on(AuthEventType.LOGIN_FAILED, listener);

      events.emitLoginFailed('failed@example.com', 'Invalid password');

      expect(listener).toHaveBeenCalledWith({
        email: 'failed@example.com',
        reason: 'Invalid password',
        timestamp: expect.any(Date),
      });
    });
  });

  describe('emitLogout', () => {
    it('should emit logout event with correct data', () => {
      const listener = jest.fn();
      events.on(AuthEventType.LOGOUT, listener);

      events.emitLogout('user-789');

      expect(listener).toHaveBeenCalledWith({
        userId: 'user-789',
        timestamp: expect.any(Date),
      });
    });
  });

  describe('emitTokenRefresh', () => {
    it('should emit token refresh event with correct data', () => {
      const listener = jest.fn();
      events.on(AuthEventType.TOKEN_REFRESH, listener);

      events.emitTokenRefresh('user-refresh');

      expect(listener).toHaveBeenCalledWith({
        userId: 'user-refresh',
        timestamp: expect.any(Date),
      });
    });
  });

  describe('emitPasswordResetRequest', () => {
    it('should emit password reset request event with correct data', () => {
      const listener = jest.fn();
      events.on(AuthEventType.PASSWORD_RESET_REQUEST, listener);

      events.emitPasswordResetRequest('user-reset', 'reset@example.com');

      expect(listener).toHaveBeenCalledWith({
        userId: 'user-reset',
        email: 'reset@example.com',
        timestamp: expect.any(Date),
      });
    });
  });

  describe('emitPasswordReset', () => {
    it('should emit password reset event with correct data', () => {
      const listener = jest.fn();
      events.on(AuthEventType.PASSWORD_RESET, listener);

      events.emitPasswordReset('user-reset-done');

      expect(listener).toHaveBeenCalledWith({
        userId: 'user-reset-done',
        timestamp: expect.any(Date),
      });
    });
  });

  describe('emitPasswordChange', () => {
    it('should emit password change event with correct data', () => {
      const listener = jest.fn();
      events.on(AuthEventType.PASSWORD_CHANGE, listener);

      events.emitPasswordChange('user-change');

      expect(listener).toHaveBeenCalledWith({
        userId: 'user-change',
        timestamp: expect.any(Date),
      });
    });
  });

  describe('authEvents singleton', () => {
    it('should be an instance of AuthEvents', () => {
      expect(authEvents).toBeInstanceOf(AuthEvents);
    });

    it('should be usable as singleton', () => {
      const listener = jest.fn();
      authEvents.on(AuthEventType.LOGIN, listener);
      authEvents.emitLogin('singleton-user', 'singleton@example.com');

      expect(listener).toHaveBeenCalled();

      authEvents.off(AuthEventType.LOGIN, listener);
    });
  });
});
