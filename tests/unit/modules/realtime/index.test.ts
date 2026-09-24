jest.mock('@/modules/auth/services/AuthService', () => ({ authService: {} }));
jest.mock('@/modules/chat/services/ConversationService', () => ({ conversationService: {} }));
jest.mock('@/modules/chat/services/MessageService', () => ({ messageService: {} }));
jest.mock('@/shared/database/redis', () => ({ redis: {} }));

import * as realtime from '@/modules/realtime';

describe('realtime module index', () => {
  it('deve exportar constantes, erros e schemas', () => {
    expect(realtime.REALTIME_CONSTANTS.TYPING_TTL_MS).toBe(3000);
    expect(realtime.TypingNotAllowedException).toBeDefined();
    expect(realtime.messageSendPayloadSchema).toBeDefined();
  });

  it('deve exportar middlewares, serviço, handlers, ponte e o servidor', () => {
    expect(typeof realtime.createSocketAuthMiddleware).toBe('function');
    expect(typeof realtime.createJoinRoomsMiddleware).toBe('function');
    expect(typeof realtime.extractHandshakeToken).toBe('function');
    expect(typeof realtime.reconcileConversationRooms).toBe('function');
    expect(typeof realtime.withAck).toBe('function');
    expect(typeof realtime.toAckError).toBe('function');
    expect(new realtime.TypingService()).toBeInstanceOf(realtime.TypingService);
    expect(typeof realtime.registerMessageHandlers).toBe('function');
    expect(typeof realtime.registerTypingHandlers).toBe('function');
    expect(typeof realtime.registerSessionExpiry).toBe('function');
    expect(typeof realtime.registerRealtimeListeners).toBe('function');
    expect(typeof realtime.createRealtimeServer).toBe('function');
    expect(typeof realtime.shouldUseRedisAdapter).toBe('function');
  });
});
