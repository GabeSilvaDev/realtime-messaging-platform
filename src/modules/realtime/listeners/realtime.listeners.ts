import { eventBus, type EventBus } from '@/shared/event-bus';
import { ChatEvents } from '@/shared/types';
import { SERVER_EVENTS, conversationRoom, userRoom } from '../constants';
import type { RealtimeServer } from '../types';

/**
 * Ponte EventBus → Socket.IO: traduz os eventos do chat em emissões para as rooms. Os
 * subscribers são síncronos (só emitem; sem I/O). Retorna a função que cancela as inscrições.
 *
 * Mudanças de participação também ajustam as rooms de quem já está conectado
 * (`socketsJoin`/`socketsLeave` via room `user:<id>`, válido entre instâncias com o Redis
 * adapter). Avisos que dependem dessa mudança vão também para as rooms `user:<id>` dos
 * afetados — o Socket.IO não duplica a entrega a quem está nas duas rooms.
 */
export function registerRealtimeListeners(
  io: Pick<RealtimeServer, 'to' | 'in'>,
  bus: Pick<EventBus, 'subscribe'> = eventBus
): () => void {
  const unsubscribers = [
    bus.subscribe(ChatEvents.MESSAGE_SENT, ({ payload }) => {
      io.to(conversationRoom(payload.conversationId)).emit(
        SERVER_EVENTS.MESSAGE_NEW,
        payload.message
      );
    }),

    bus.subscribe(ChatEvents.MESSAGE_DELETED, ({ payload: { conversationId, messageId } }) => {
      io.to(conversationRoom(conversationId)).emit(SERVER_EVENTS.MESSAGE_DELETED, {
        conversationId,
        messageId,
      });
    }),

    bus.subscribe(ChatEvents.MESSAGE_DELIVERED, ({ payload }) => {
      io.to(userRoom(payload.senderId)).emit(SERVER_EVENTS.MESSAGE_STATUS, {
        type: 'delivered',
        conversationId: payload.conversationId,
        messageId: payload.messageId,
        userId: payload.userId,
        at: payload.at,
      });
    }),

    bus.subscribe(ChatEvents.MESSAGE_READ, ({ payload }) => {
      io.to(conversationRoom(payload.conversationId)).emit(SERVER_EVENTS.MESSAGE_STATUS, {
        type: 'read',
        conversationId: payload.conversationId,
        userId: payload.userId,
        upToMessageId: payload.upToMessageId,
        at: payload.at,
      });
    }),

    bus.subscribe(ChatEvents.CONVERSATION_CREATED, ({ payload }) => {
      const room = conversationRoom(payload.conversationId);
      const participantRooms = payload.participantIds.map(userRoom);
      participantRooms.forEach((participantRoom) => {
        io.in(participantRoom).socketsJoin(room);
      });
      io.to([room, ...participantRooms]).emit(SERVER_EVENTS.CONVERSATION_NEW, {
        conversationId: payload.conversationId,
        type: payload.type,
      });
    }),

    bus.subscribe(ChatEvents.CONVERSATION_UPDATED, ({ payload }) => {
      const room = conversationRoom(payload.conversationId);
      const affectedRooms = payload.affectedUserIds.map(userRoom);

      if (payload.change === 'members_added') {
        affectedRooms.forEach((affectedRoom) => {
          io.in(affectedRoom).socketsJoin(room);
        });
      }

      io.to([room, ...affectedRooms]).emit(SERVER_EVENTS.CONVERSATION_UPDATED, {
        conversationId: payload.conversationId,
        change: payload.change,
        actorId: payload.actorId,
        affectedUserIds: payload.affectedUserIds,
        ...(payload.name !== undefined ? { name: payload.name } : {}),
      });

      if (payload.change === 'member_left' || payload.change === 'member_removed') {
        affectedRooms.forEach((affectedRoom) => {
          io.in(affectedRoom).socketsLeave(room);
        });
      }
    }),

    bus.subscribe(ChatEvents.CONVERSATION_DELETED, ({ payload }) => {
      const room = conversationRoom(payload.conversationId);
      io.to([room, ...payload.participantIds.map(userRoom)]).emit(
        SERVER_EVENTS.CONVERSATION_DELETED,
        { conversationId: payload.conversationId }
      );
      io.in(room).socketsLeave(room);
    }),
  ];

  return () => {
    unsubscribers.forEach((unsubscribe) => {
      unsubscribe();
    });
  };
}
