jest.mock('@/modules/chat/services/ConversationService', () => ({ conversationService: {} }));
jest.mock('@/modules/chat/services/MessageService', () => ({ messageService: {} }));

import * as controllers from '@/modules/chat/controllers';

describe('chat controllers index', () => {
  it('deve exportar classes e instâncias padrão', () => {
    expect(controllers.conversationController).toBeInstanceOf(controllers.ConversationController);
    expect(controllers.messageController).toBeInstanceOf(controllers.MessageController);
  });
});
