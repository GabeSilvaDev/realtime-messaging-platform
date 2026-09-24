jest.mock('@/modules/user/services/ContactService', () => ({ contactService: {} }));

import { registerChatListeners } from '@/modules/chat/listeners';
import { EventBus } from '@/shared/event-bus/EventBus';
import type { EventPayload } from '@/shared/interfaces';
import { ChatEvents } from '@/shared/types';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const USER_C = '33333333-3333-4333-8333-333333333333';

function messageSent(
  overrides: Partial<EventPayload<ChatEvents.MESSAGE_SENT>> = {}
): EventPayload<ChatEvents.MESSAGE_SENT> {
  const createdAt = new Date('2026-09-24T10:00:00.000Z');
  return {
    messageId: '65f000000000000000000001',
    conversationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    conversationType: 'direct',
    senderId: USER_A,
    text: 'oi',
    mentions: [],
    replyTo: null,
    createdAt,
    participantIds: [USER_A, USER_B],
    message: {
      id: '65f000000000000000000001',
      conversationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      senderId: USER_A,
      content: { type: 'text', text: 'oi' },
      replyTo: null,
      mentions: [],
      deletedAt: null,
      createdAt,
      updatedAt: createdAt,
    },
    ...overrides,
  };
}

describe('registerChatListeners', () => {
  let bus: EventBus;
  let contacts: { recordInteraction: jest.Mock };

  beforeEach(() => {
    EventBus.resetInstance();
    bus = EventBus.getInstance();
    contacts = { recordInteraction: jest.fn().mockResolvedValue(undefined) };
  });

  afterEach(() => {
    EventBus.resetInstance();
  });

  it('deve registrar a interação entre remetente e destinatário em conversa direct', async () => {
    registerChatListeners(bus, contacts);

    await bus.publish(ChatEvents.MESSAGE_SENT, messageSent());

    expect(contacts.recordInteraction).toHaveBeenCalledWith(USER_A, USER_B);
  });

  it('deve ignorar mensagens de grupo', async () => {
    registerChatListeners(bus, contacts);

    await bus.publish(
      ChatEvents.MESSAGE_SENT,
      messageSent({ conversationType: 'group', participantIds: [USER_A, USER_B, USER_C] })
    );

    expect(contacts.recordInteraction).not.toHaveBeenCalled();
  });

  it('deve ignorar direct sem outro participante', async () => {
    registerChatListeners(bus, contacts);

    await bus.publish(ChatEvents.MESSAGE_SENT, messageSent({ participantIds: [USER_A] }));

    expect(contacts.recordInteraction).not.toHaveBeenCalled();
  });

  it('deve cancelar as inscrições com a função retornada', async () => {
    const unregister = registerChatListeners(bus, contacts);

    unregister();
    await bus.publish(ChatEvents.MESSAGE_SENT, messageSent());

    expect(contacts.recordInteraction).not.toHaveBeenCalled();
    expect(bus.hasSubscribers(ChatEvents.MESSAGE_SENT)).toBe(false);
  });

  it('deve usar o eventBus e o contactService padrão quando nada é injetado', () => {
    const unregister = registerChatListeners();

    expect(typeof unregister).toBe('function');
    unregister();
  });
});
