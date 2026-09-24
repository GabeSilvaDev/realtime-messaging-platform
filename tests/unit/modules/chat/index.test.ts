import * as chatModule from '@/modules/chat';

describe('chat module index', () => {
  it('deve exportar constantes, erros e validação', () => {
    expect(chatModule.CHAT_CONSTANTS.MAX_GROUP_PARTICIPANTS).toBe(256);
    expect(chatModule.ConversationNotFoundException).toBeDefined();
    expect(chatModule.sendMessageSchema).toBeDefined();
  });

  it('deve exportar models, repositories e services', () => {
    expect(chatModule.Conversation).toBeDefined();
    expect(chatModule.Participant).toBeDefined();
    expect(chatModule.MessageModel).toBeDefined();
    expect(chatModule.conversationRepository).toBeInstanceOf(chatModule.ConversationRepository);
    expect(chatModule.participantRepository).toBeInstanceOf(chatModule.ParticipantRepository);
    expect(chatModule.messageRepository).toBeInstanceOf(chatModule.MessageRepository);
    expect(chatModule.conversationService).toBeInstanceOf(chatModule.ConversationService);
    expect(chatModule.messageService).toBeInstanceOf(chatModule.MessageService);
    expect(typeof chatModule.buildDirectKey).toBe('function');
    expect(chatModule.ParticipantDirectory).toBeDefined();
  });

  it('deve exportar controllers, rotas e listeners', () => {
    expect(chatModule.conversationController).toBeInstanceOf(chatModule.ConversationController);
    expect(chatModule.messageController).toBeInstanceOf(chatModule.MessageController);
    expect(chatModule.conversationRoutes).toBeDefined();
    expect(typeof chatModule.registerChatListeners).toBe('function');
    expect(typeof chatModule.registerChatCacheListeners).toBe('function');
  });
});
