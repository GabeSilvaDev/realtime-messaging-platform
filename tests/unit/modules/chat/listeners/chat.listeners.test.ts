jest.mock('@/modules/user/services/ContactService', () => ({ contactService: {} }));
jest.mock('@/modules/chat/repositories', () => ({ messageRepository: {} }));
jest.mock('@/shared/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { registerChatListeners } from '@/modules/chat/listeners';
import { EventBus } from '@/shared/event-bus/EventBus';
import type { EventPayload } from '@/shared/interfaces';
import { logger } from '@/shared/logger';
import { ChatEvents } from '@/shared/types';

const mockLogger = logger as jest.Mocked<typeof logger>;

/** Os listeners do chat são `{ async: true }`: rodam num setImmediate depois do publish. */
async function flushDetached(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const USER_C = '33333333-3333-4333-8333-333333333333';
const CONVERSATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function messageSent(
  overrides: Partial<EventPayload<ChatEvents.MESSAGE_SENT>> = {}
): EventPayload<ChatEvents.MESSAGE_SENT> {
  const createdAt = new Date('2026-09-24T10:00:00.000Z');
  return {
    messageId: '65f000000000000000000001',
    conversationId: CONVERSATION_ID,
    conversationType: 'direct',
    senderId: USER_A,
    text: 'oi',
    mentions: [],
    replyTo: null,
    createdAt,
    participantIds: [USER_A, USER_B],
    message: {
      id: '65f000000000000000000001',
      conversationId: CONVERSATION_ID,
      senderId: USER_A,
      content: { type: 'text', text: 'oi' },
      replyTo: null,
      mentions: [],
      clientMessageId: null,
      status: { sentAt: createdAt, deliveredTo: [], readBy: [] },
      deletedAt: null,
      createdAt,
      updatedAt: createdAt,
    },
    ...overrides,
  };
}

function conversationDeleted(
  overrides: Partial<EventPayload<ChatEvents.CONVERSATION_DELETED>> = {}
): EventPayload<ChatEvents.CONVERSATION_DELETED> {
  return {
    conversationId: CONVERSATION_ID,
    actorId: USER_A,
    participantIds: [USER_A],
    ...overrides,
  };
}

describe('registerChatListeners', () => {
  let bus: EventBus;
  let contacts: { recordInteraction: jest.Mock };
  let messages: { deleteByConversation: jest.Mock };

  beforeEach(() => {
    EventBus.resetInstance();
    bus = EventBus.getInstance();
    contacts = { recordInteraction: jest.fn().mockResolvedValue(undefined) };
    messages = { deleteByConversation: jest.fn().mockResolvedValue(1) };
  });

  afterEach(() => {
    EventBus.resetInstance();
  });

  it('deve registrar a interação entre remetente e destinatário em conversa direct', async () => {
    registerChatListeners(bus, contacts, messages);

    await bus.publish(ChatEvents.MESSAGE_SENT, messageSent());
    await flushDetached();

    expect(contacts.recordInteraction).toHaveBeenCalledWith(USER_A, USER_B);
  });

  it('roda fora do caminho de quem publica (subscribers com { async: true })', async () => {
    registerChatListeners(bus, contacts, messages);

    await bus.publish(ChatEvents.MESSAGE_SENT, messageSent());
    await bus.publish(ChatEvents.CONVERSATION_DELETED, conversationDeleted());

    expect(contacts.recordInteraction).not.toHaveBeenCalled();
    expect(messages.deleteByConversation).not.toHaveBeenCalled();

    await flushDetached();

    expect(contacts.recordInteraction).toHaveBeenCalledTimes(1);
    expect(messages.deleteByConversation).toHaveBeenCalledTimes(1);
  });

  it('falha ao registrar a interação: loga (não fica só em totalErrors) e não propaga', async () => {
    const dbError = new Error('contacts down');
    contacts.recordInteraction.mockRejectedValue(dbError);
    registerChatListeners(bus, contacts, messages);

    await bus.publish(ChatEvents.MESSAGE_SENT, messageSent());
    await flushDetached();

    expect(mockLogger.error).toHaveBeenCalledWith(
      'Falha ao registrar a interação entre os contatos da conversa direct',
      dbError,
      { conversationId: CONVERSATION_ID, senderId: USER_A, otherId: USER_B }
    );
    expect(bus.getStats().totalErrors).toBe(0);
  });

  it('falha não-Error ao registrar a interação: envolve antes de logar', async () => {
    contacts.recordInteraction.mockRejectedValue('falhou');
    registerChatListeners(bus, contacts, messages);

    await bus.publish(ChatEvents.MESSAGE_SENT, messageSent());
    await flushDetached();

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ message: 'falhou' }),
      expect.any(Object)
    );
  });

  it('deve ignorar mensagens de grupo', async () => {
    registerChatListeners(bus, contacts, messages);

    await bus.publish(
      ChatEvents.MESSAGE_SENT,
      messageSent({ conversationType: 'group', participantIds: [USER_A, USER_B, USER_C] })
    );
    await flushDetached();

    expect(contacts.recordInteraction).not.toHaveBeenCalled();
  });

  it('deve ignorar direct sem outro participante', async () => {
    registerChatListeners(bus, contacts, messages);

    await bus.publish(ChatEvents.MESSAGE_SENT, messageSent({ participantIds: [USER_A] }));
    await flushDetached();

    expect(contacts.recordInteraction).not.toHaveBeenCalled();
  });

  it('deve cancelar as inscrições com a função retornada', async () => {
    const unregister = registerChatListeners(bus, contacts, messages);

    unregister();
    await bus.publish(ChatEvents.MESSAGE_SENT, messageSent());
    await bus.publish(ChatEvents.CONVERSATION_DELETED, conversationDeleted());
    await flushDetached();

    expect(contacts.recordInteraction).not.toHaveBeenCalled();
    expect(messages.deleteByConversation).not.toHaveBeenCalled();
    expect(bus.hasSubscribers(ChatEvents.MESSAGE_SENT)).toBe(false);
    expect(bus.hasSubscribers(ChatEvents.CONVERSATION_DELETED)).toBe(false);
  });

  it('deve usar o eventBus, o contactService e o messageRepository padrão quando nada é injetado', () => {
    const unregister = registerChatListeners();

    expect(typeof unregister).toBe('function');
    unregister();
  });

  describe('CONVERSATION_DELETED — mensagens órfãs', () => {
    it('deve apagar as mensagens da conversa removida', async () => {
      registerChatListeners(bus, contacts, messages);

      await bus.publish(ChatEvents.CONVERSATION_DELETED, conversationDeleted());
      await flushDetached();

      expect(messages.deleteByConversation).toHaveBeenCalledWith(CONVERSATION_ID);
    });

    it('não deve propagar erro (best-effort) e deve logar a falha', async () => {
      const dbError = new Error('mongo down');
      messages.deleteByConversation.mockRejectedValue(dbError);
      registerChatListeners(bus, contacts, messages);

      await expect(
        bus.publish(ChatEvents.CONVERSATION_DELETED, conversationDeleted())
      ).resolves.not.toThrow();
      await flushDetached();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.any(String),
        dbError,
        expect.objectContaining({ conversationId: CONVERSATION_ID })
      );
    });

    it('deve envolver uma rejeição que não é Error antes de logar', async () => {
      messages.deleteByConversation.mockRejectedValue('mongo down');
      registerChatListeners(bus, contacts, messages);

      await bus.publish(ChatEvents.CONVERSATION_DELETED, conversationDeleted());
      await flushDetached();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ message: 'mongo down' }),
        expect.objectContaining({ conversationId: CONVERSATION_ID })
      );
    });
  });
});
