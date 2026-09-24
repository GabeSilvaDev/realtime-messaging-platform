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

  it('deve entregar MESSAGE_SENT com o payload completo', async () => {
    const received: BaseEvent<EventPayload<ChatEvents.MESSAGE_SENT>>[] = [];
    bus.subscribe(ChatEvents.MESSAGE_SENT, (event) => {
      received.push(event);
    });
    const payload: EventPayload<ChatEvents.MESSAGE_SENT> = {
      messageId: '65f000000000000000000001',
      conversationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      conversationType: 'direct',
      senderId: '11111111-1111-4111-8111-111111111111',
      text: 'olá',
      mentions: [],
      replyTo: null,
      createdAt: new Date('2026-09-24T10:00:00.000Z'),
      participantIds: [
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
      ],
    };

    await bus.publish(ChatEvents.MESSAGE_SENT, payload);

    expect(received).toHaveLength(1);
    expect(received[0]!.name).toBe('chat:message-sent');
    expect(received[0]!.payload).toEqual(payload);
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

  it('deve entregar CONVERSATION_UPDATED', async () => {
    const handler = jest.fn();
    bus.subscribe(ChatEvents.CONVERSATION_UPDATED, handler);

    await bus.publish(ChatEvents.CONVERSATION_UPDATED, {
      conversationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      change: 'renamed',
      actorId: '11111111-1111-4111-8111-111111111111',
      participantIds: ['11111111-1111-4111-8111-111111111111'],
    });

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'chat:conversation-updated',
        payload: expect.objectContaining({ change: 'renamed' }),
      })
    );
  });
});
