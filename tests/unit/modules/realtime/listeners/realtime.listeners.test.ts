import { registerRealtimeListeners } from '@/modules/realtime/listeners';
import { EventBus } from '@/shared/event-bus/EventBus';
import { AuthEvents, ChatEvents, type MessageDTO } from '@/shared/types';
import { createFakeServer, type FakeServer } from '../../../../support/realtime/fakeSocket';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const USER_C = '33333333-3333-4333-8333-333333333333';
const CONVERSATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MESSAGE_ID = '65f000000000000000000001';
const ROOM = `conversation:${CONVERSATION_ID}`;
const AT = new Date('2026-09-25T10:00:00.000Z');

function message(): MessageDTO {
  return {
    id: MESSAGE_ID,
    conversationId: CONVERSATION_ID,
    senderId: USER_A,
    content: { type: 'text', text: 'oi' },
    replyTo: null,
    mentions: [],
    clientMessageId: null,
    status: { sentAt: AT, deliveredTo: [], readBy: [] },
    deletedAt: null,
    createdAt: AT,
    updatedAt: AT,
  };
}

describe('registerRealtimeListeners (ponte EventBus → Socket.IO)', () => {
  let bus: EventBus;
  let io: FakeServer;

  beforeEach(() => {
    EventBus.resetInstance();
    bus = EventBus.getInstance();
    io = createFakeServer();
    registerRealtimeListeners(io.asServer(), bus);
  });

  afterEach(() => {
    EventBus.resetInstance();
  });

  it('MESSAGE_SENT → message:new (a própria MessageDTO) para a room da conversa', async () => {
    const dto = message();

    await bus.publish(ChatEvents.MESSAGE_SENT, {
      messageId: MESSAGE_ID,
      conversationId: CONVERSATION_ID,
      conversationType: 'direct',
      senderId: USER_A,
      text: 'oi',
      mentions: [],
      replyTo: null,
      createdAt: AT,
      participantIds: [USER_A, USER_B],
      message: dto,
    });

    expect(io.emits).toEqual([[[ROOM], 'message:new', dto]]);
  });

  it('MESSAGE_DELETED → message:deleted para a room da conversa', async () => {
    await bus.publish(ChatEvents.MESSAGE_DELETED, {
      messageId: MESSAGE_ID,
      conversationId: CONVERSATION_ID,
      deletedBy: USER_A,
    });

    expect(io.emits).toEqual([
      [[ROOM], 'message:deleted', { conversationId: CONVERSATION_ID, messageId: MESSAGE_ID }],
    ]);
  });

  it('MESSAGE_DELIVERED → message:status delivered só para a room do remetente', async () => {
    await bus.publish(ChatEvents.MESSAGE_DELIVERED, {
      messageId: MESSAGE_ID,
      conversationId: CONVERSATION_ID,
      userId: USER_B,
      senderId: USER_A,
      at: AT,
    });

    expect(io.emits).toEqual([
      [
        [`user:${USER_A}`],
        'message:status',
        {
          type: 'delivered',
          conversationId: CONVERSATION_ID,
          messageId: MESSAGE_ID,
          userId: USER_B,
          at: AT,
        },
      ],
    ]);
  });

  it('MESSAGE_READ → message:status read para a room da conversa', async () => {
    await bus.publish(ChatEvents.MESSAGE_READ, {
      conversationId: CONVERSATION_ID,
      userId: USER_B,
      upToMessageId: MESSAGE_ID,
      at: AT,
    });

    expect(io.emits).toEqual([
      [
        [ROOM],
        'message:status',
        {
          type: 'read',
          conversationId: CONVERSATION_ID,
          userId: USER_B,
          upToMessageId: MESSAGE_ID,
          at: AT,
        },
      ],
    ]);
  });

  it('CONVERSATION_CREATED → sockets dos participantes entram na room e recebem conversation:new', async () => {
    await bus.publish(ChatEvents.CONVERSATION_CREATED, {
      conversationId: CONVERSATION_ID,
      type: 'group',
      creatorId: USER_A,
      participantIds: [USER_A, USER_B],
    });

    expect(io.joins).toEqual([
      [`user:${USER_A}`, ROOM],
      [`user:${USER_B}`, ROOM],
    ]);
    expect(io.emits).toEqual([
      [
        [ROOM, `user:${USER_A}`, `user:${USER_B}`],
        'conversation:new',
        { conversationId: CONVERSATION_ID, type: 'group' },
      ],
    ]);
  });

  it('CONVERSATION_UPDATED members_added → novos entram na room antes do aviso', async () => {
    await bus.publish(ChatEvents.CONVERSATION_UPDATED, {
      conversationId: CONVERSATION_ID,
      change: 'members_added',
      actorId: USER_A,
      participantIds: [USER_A, USER_B, USER_C],
      affectedUserIds: [USER_B, USER_C],
    });

    expect(io.joins).toEqual([
      [`user:${USER_B}`, ROOM],
      [`user:${USER_C}`, ROOM],
    ]);
    expect(io.leaves).toEqual([]);
    expect(io.emits).toEqual([
      [
        [ROOM, `user:${USER_B}`, `user:${USER_C}`],
        'conversation:updated',
        {
          conversationId: CONVERSATION_ID,
          change: 'members_added',
          actorId: USER_A,
          affectedUserIds: [USER_B, USER_C],
        },
      ],
    ]);
  });

  it.each(['member_left', 'member_removed'] as const)(
    'CONVERSATION_UPDATED %s → avisa a room e o afetado, depois o tira da room',
    async (change) => {
      await bus.publish(ChatEvents.CONVERSATION_UPDATED, {
        conversationId: CONVERSATION_ID,
        change,
        actorId: USER_A,
        participantIds: [USER_B, USER_A],
        affectedUserIds: [USER_B],
      });

      expect(io.emits).toEqual([
        [
          [ROOM, `user:${USER_B}`],
          'conversation:updated',
          { conversationId: CONVERSATION_ID, change, actorId: USER_A, affectedUserIds: [USER_B] },
        ],
      ]);
      expect(io.leaves).toEqual([[`user:${USER_B}`, ROOM]]);
      expect(io.joins).toEqual([]);
    }
  );

  it('CONVERSATION_UPDATED renamed → conversation:updated com o novo nome, sem mexer em rooms', async () => {
    await bus.publish(ChatEvents.CONVERSATION_UPDATED, {
      conversationId: CONVERSATION_ID,
      change: 'renamed',
      actorId: USER_A,
      participantIds: [USER_A, USER_B],
      affectedUserIds: [],
      name: 'Novo nome',
    });

    expect(io.emits).toEqual([
      [
        [ROOM],
        'conversation:updated',
        {
          conversationId: CONVERSATION_ID,
          change: 'renamed',
          actorId: USER_A,
          affectedUserIds: [],
          name: 'Novo nome',
        },
      ],
    ]);
    expect(io.joins).toEqual([]);
    expect(io.leaves).toEqual([]);
  });

  it('CONVERSATION_DELETED → conversation:deleted para quem participava e esvazia a room', async () => {
    await bus.publish(ChatEvents.CONVERSATION_DELETED, {
      conversationId: CONVERSATION_ID,
      actorId: USER_A,
      participantIds: [USER_A],
    });

    expect(io.emits).toEqual([
      [[ROOM, `user:${USER_A}`], 'conversation:deleted', { conversationId: CONVERSATION_ID }],
    ]);
    expect(io.leaves).toEqual([[ROOM, ROOM]]);
  });

  it('a função retornada cancela todas as inscrições', async () => {
    EventBus.resetInstance();
    bus = EventBus.getInstance();
    const unregister = registerRealtimeListeners(io.asServer(), bus);

    unregister();
    await bus.publish(ChatEvents.MESSAGE_DELETED, {
      messageId: MESSAGE_ID,
      conversationId: CONVERSATION_ID,
      deletedBy: USER_A,
    });

    expect(io.emits).toEqual([]);
    expect(bus.subscriberCount()).toBe(0);
  });

  it('usa o eventBus padrão quando nada é injetado', () => {
    const unregister = registerRealtimeListeners(io.asServer());

    expect(typeof unregister).toBe('function');
    unregister();
  });

  it('SESSIONS_REVOKED → derruba (close) todos os sockets do usuário, em todas as instâncias', async () => {
    await bus.publish(AuthEvents.SESSIONS_REVOKED, { userId: USER_A });

    expect(io.in).toHaveBeenCalledWith(`user:${USER_A}`);
    expect(io.disconnects).toEqual([[`user:${USER_A}`, true]]);
    expect(io.emits).toEqual([]);
  });
});
