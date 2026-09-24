jest.mock('@/modules/auth/services/AuthService', () => ({ authService: {} }));
jest.mock('@/modules/chat/services/ConversationService', () => ({ conversationService: {} }));
jest.mock('@/modules/chat/services/MessageService', () => ({ messageService: {} }));
jest.mock('@/shared/database/redis', () => ({ redis: {} }));

import { createRealtimeServer, shouldUseRedisAdapter } from '@/modules/realtime/server';

describe('realtime server index', () => {
  it('deve exportar a fábrica do servidor e a regra do adapter', () => {
    expect(typeof createRealtimeServer).toBe('function');
    expect(typeof shouldUseRedisAdapter).toBe('function');
  });
});
