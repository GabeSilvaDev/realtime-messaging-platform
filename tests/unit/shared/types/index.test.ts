import {
  HttpStatus,
  ErrorCode,
  AuthErrorReason,
  SystemEvents,
  AuthEvents,
  UserEvents,
  ChatEvents,
  PresenceEvents,
  NotificationEvents,
  LogLevel,
  LogCategory,
} from '@/shared/types';

describe('Types Index Exports', () => {
  describe('Error Types', () => {
    it('should export HttpStatus enum', () => {
      expect(HttpStatus.OK).toBe(200);
      expect(HttpStatus.CREATED).toBe(201);
      expect(HttpStatus.BAD_REQUEST).toBe(400);
      expect(HttpStatus.INTERNAL_SERVER_ERROR).toBe(500);
    });

    it('should export ErrorCode enum', () => {
      expect(ErrorCode.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
      expect(ErrorCode.VALIDATION_ERROR).toBe('VALIDATION_ERROR');
      expect(ErrorCode.UNAUTHORIZED).toBe('UNAUTHORIZED');
    });

    it('should export AuthErrorReason enum', () => {
      expect(AuthErrorReason.INVALID_TOKEN).toBe('INVALID_TOKEN');
      expect(AuthErrorReason.EXPIRED_TOKEN).toBe('EXPIRED_TOKEN');
      expect(AuthErrorReason.MISSING_TOKEN).toBe('MISSING_TOKEN');
    });
  });

  describe('Event Types', () => {
    it('should export SystemEvents enum', () => {
      expect(SystemEvents.STARTUP).toBe('system:startup');
      expect(SystemEvents.SHUTDOWN).toBe('system:shutdown');
      expect(SystemEvents.ERROR).toBe('system:error');
    });

    it('should export AuthEvents enum', () => {
      expect(AuthEvents.LOGIN).toBe('auth:login');
      expect(AuthEvents.LOGOUT).toBe('auth:logout');
      expect(AuthEvents.REGISTER).toBe('auth:register');
      expect(AuthEvents.PASSWORD_RESET_REQUESTED).toBe('auth:password-reset-requested');
      expect(AuthEvents.PASSWORD_RESET_COMPLETED).toBe('auth:password-reset-completed');
    });

    it('should export UserEvents enum', () => {
      expect(UserEvents.CREATED).toBe('user:created');
      expect(UserEvents.UPDATED).toBe('user:updated');
      expect(UserEvents.DELETED).toBe('user:deleted');
      expect(UserEvents.BLOCKED).toBe('user:blocked');
      expect(UserEvents.UNBLOCKED).toBe('user:unblocked');
    });

    it('should export ChatEvents enum', () => {
      expect(ChatEvents.MESSAGE_SENT).toBe('chat:message-sent');
      expect(ChatEvents.MESSAGE_DELIVERED).toBe('chat:message-delivered');
      expect(ChatEvents.MESSAGE_READ).toBe('chat:message-read');
      expect(ChatEvents.TYPING_STARTED).toBe('chat:typing-started');
      expect(ChatEvents.TYPING_STOPPED).toBe('chat:typing-stopped');
      expect(ChatEvents.CONVERSATION_CREATED).toBe('chat:conversation-created');
    });

    it('should export PresenceEvents enum', () => {
      expect(PresenceEvents.ONLINE).toBe('presence:online');
      expect(PresenceEvents.OFFLINE).toBe('presence:offline');
      expect(PresenceEvents.STATUS_CHANGED).toBe('presence:status-changed');
    });

    it('should export NotificationEvents enum', () => {
      expect(NotificationEvents.SEND).toBe('notification:send');
      expect(NotificationEvents.READ).toBe('notification:read');
    });
  });

  describe('Logger Types', () => {
    it('should export LogLevel enum', () => {
      expect(LogLevel.DEBUG).toBe('debug');
      expect(LogLevel.INFO).toBe('info');
      expect(LogLevel.WARN).toBe('warn');
      expect(LogLevel.ERROR).toBe('error');
      expect(LogLevel.FATAL).toBe('fatal');
    });

    it('should export LogCategory enum', () => {
      expect(LogCategory.SYSTEM).toBe('system');
      expect(LogCategory.AUTH).toBe('auth');
      expect(LogCategory.USER).toBe('user');
      expect(LogCategory.CHAT).toBe('chat');
      expect(LogCategory.DATABASE).toBe('database');
      expect(LogCategory.HTTP).toBe('http');
      expect(LogCategory.WEBSOCKET).toBe('websocket');
      expect(LogCategory.QUEUE).toBe('queue');
      expect(LogCategory.CACHE).toBe('cache');
      expect(LogCategory.NOTIFICATION).toBe('notification');
    });
  });
});
