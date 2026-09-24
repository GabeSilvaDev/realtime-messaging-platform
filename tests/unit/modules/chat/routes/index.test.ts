jest.mock('@/modules/chat/controllers/ConversationController', () => ({
  conversationController: {},
}));
jest.mock('@/modules/chat/controllers/MessageController', () => ({ messageController: {} }));

import { conversationRoutes } from '@/modules/chat/routes';

describe('chat routes index', () => {
  it('deve exportar conversationRoutes', () => {
    expect(conversationRoutes).toBeDefined();
  });
});
