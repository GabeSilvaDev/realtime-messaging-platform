import { EventBus } from '@/shared/event-bus/EventBus';
import type { BaseEvent, EventPayload } from '@/shared/interfaces';
import { ChatEvents } from '@/shared/types';

describe('EventBus — eventos de chat tipados', () => {
  let bus: EventBus;

  beforeEach(() => {
    EventBus.resetInstance();
    bus = EventBus.getInstance();
  });

  afterEach(() => {
    EventBus.resetInstance();
  });

  it('deve entregar MESSAGE_SENT com o payload completo (incluindo o DTO da mensagem)', async () => {
    const received: BaseEvent<EventPayload<ChatEvents.MESSAGE_SENT>>[] = [];
    bus.subscribe(ChatEvents.MESSAGE_SENT, (event) => {
      received.push(event);
    });
    const createdAt = new Date('2026-09-24T10:00:00.000Z');
    const payload: EventPayload<ChatEvents.MESSAGE_SENT> = {
      messageId: '65f000000000000000000001',
      conversationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      conversationType: 'direct',
      senderId: '11111111-1111-4111-8111-111111111111',
      text: 'olá',
      mentions: [],
      replyTo: null,
      createdAt,
      participantIds: [
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
      ],
      message: {
        id: '65f000000000000000000001',
        conversationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        senderId: '11111111-1111-4111-8111-111111111111',
        content: { type: 'text', text: 'olá' },
        replyTo: null,
        mentions: [],
        clientMessageId: null,
        status: { sentAt: createdAt, deliveredTo: [], readBy: [] },
        deletedAt: null,
        createdAt,
        updatedAt: createdAt,
      },
    };

    await bus.publish(ChatEvents.MESSAGE_SENT, payload);

    expect(received).toHaveLength(1);
    expect(received[0]!.name).toBe('chat:message-sent');
    expect(received[0]!.payload).toEqual(payload);
  });

  it('deve entregar MESSAGE_DELIVERED com senderId e at', async () => {
    const handler = jest.fn();
    bus.subscribe(ChatEvents.MESSAGE_DELIVERED, handler);
    const payload: EventPayload<ChatEvents.MESSAGE_DELIVERED> = {
      messageId: '65f000000000000000000001',
      conversationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      userId: '22222222-2222-4222-8222-222222222222',
      senderId: '11111111-1111-4111-8111-111111111111',
      at: new Date('2026-09-25T10:00:00.000Z'),
    };

    await bus.publish(ChatEvents.MESSAGE_DELIVERED, payload);

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'chat:message-delivered', payload })
    );
  });

  it('deve entregar MESSAGE_READ com upToMessageId e at', async () => {
    const handler = jest.fn();
    bus.subscribe(ChatEvents.MESSAGE_READ, handler);
    const payload: EventPayload<ChatEvents.MESSAGE_READ> = {
      conversationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      userId: '22222222-2222-4222-8222-222222222222',
      upToMessageId: '65f000000000000000000001',
      at: new Date('2026-09-25T10:00:00.000Z'),
    };

    await bus.publish(ChatEvents.MESSAGE_READ, payload);

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'chat:message-read', payload })
    );
  });

  it('deve entregar MESSAGE_DELETED', async () => {
    const handler = jest.fn();
    bus.subscribe(ChatEvents.MESSAGE_DELETED, handler);

    await bus.publish(ChatEvents.MESSAGE_DELETED, {
      messageId: '65f000000000000000000001',
      conversationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      deletedBy: '11111111-1111-4111-8111-111111111111',
    });

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'chat:message-deleted',
        payload: expect.objectContaining({ deletedBy: '11111111-1111-4111-8111-111111111111' }),
      })
    );
  });

  it('deve entregar CONVERSATION_CREATED com type', async () => {
    const handler = jest.fn();
    bus.subscribe(ChatEvents.CONVERSATION_CREATED, handler);

    await bus.publish(ChatEvents.CONVERSATION_CREATED, {
      conversationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      type: 'group',
      creatorId: '11111111-1111-4111-8111-111111111111',
      participantIds: ['11111111-1111-4111-8111-111111111111'],
    });

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ type: 'group' }) })
    );
  });

  it('deve entregar CONVERSATION_UPDATED com affectedUserIds e name', async () => {
    const handler = jest.fn();
    bus.subscribe(ChatEvents.CONVERSATION_UPDATED, handler);

    await bus.publish(ChatEvents.CONVERSATION_UPDATED, {
      conversationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      change: 'renamed',
      actorId: '11111111-1111-4111-8111-111111111111',
      participantIds: ['11111111-1111-4111-8111-111111111111'],
      affectedUserIds: [],
      name: 'Novo nome',
    });

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'chat:conversation-updated',
        payload: expect.objectContaining({
          change: 'renamed',
          affectedUserIds: [],
          name: 'Novo nome',
        }),
      })
    );
  });

  it('deve entregar CONVERSATION_DELETED', async () => {
    const handler = jest.fn();
    bus.subscribe(ChatEvents.CONVERSATION_DELETED, handler);

    await bus.publish(ChatEvents.CONVERSATION_DELETED, {
      conversationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      actorId: '11111111-1111-4111-8111-111111111111',
      participantIds: ['11111111-1111-4111-8111-111111111111'],
    });

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'chat:conversation-deleted',
        payload: expect.objectContaining({
          conversationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        }),
      })
    );
  });
});
