jest.mock('@/modules/auth/services/AuthService', () => ({ authService: {} }));
jest.mock('@/modules/chat/services/ConversationService', () => ({ conversationService: {} }));

import * as middlewares from '@/modules/realtime/middlewares';

describe('realtime middlewares index', () => {
  it('deve exportar os middlewares do handshake', () => {
    expect(typeof middlewares.createSocketAuthMiddleware).toBe('function');
    expect(typeof middlewares.createJoinRoomsMiddleware).toBe('function');
    expect(typeof middlewares.extractHandshakeToken).toBe('function');
    expect(typeof middlewares.reconcileConversationRooms).toBe('function');
    expect(typeof middlewares.resolveHandshakeIp).toBe('function');
  });
});
