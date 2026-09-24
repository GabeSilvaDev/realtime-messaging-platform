jest.mock('@/modules/chat/repositories', () => ({
  conversationRepository: {},
  participantRepository: {},
  messageRepository: {},
}));
jest.mock('@/modules/user/services/UserService', () => ({ userService: {} }));
jest.mock('@/modules/user/services/ContactService', () => ({ contactService: {} }));

import * as services from '@/modules/chat/services';

describe('chat services index', () => {
  it('deve exportar ConversationService, a instância padrão e buildDirectKey', () => {
    expect(services.conversationService).toBeInstanceOf(services.ConversationService);
    expect(typeof services.buildDirectKey).toBe('function');
  });
});
