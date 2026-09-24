import type { IConversationService } from '@/modules/chat/interfaces';
import { CLIENT_EVENTS, SERVER_EVENTS, conversationRoom } from '../constants';
import { TypingNotAllowedException } from '../errors';
import type { TypingService } from '../services';
import type { RealtimeSocket } from '../types';
import { typingPayloadSchema } from '../validation';
import { withAck } from './ack';

export interface TypingHandlerDeps {
  conversations: Pick<IConversationService, 'getTypeForParticipant'>;
  typing: TypingService;
}

/**
 * Indicador de digitação (RF003.5), só em conversas 1:1. `typing:indicator` vai para a room da
 * conversa exceto o próprio socket; o primeiro `start` emite `isTyping: true`, os seguintes só
 * renovam o timer; `stop`, expiração (3s) ou desconexão emitem `isTyping: false`.
 */
export function registerTypingHandlers(
  socket: RealtimeSocket,
  { conversations, typing }: TypingHandlerDeps
): void {
  const { userId } = socket.data;

  const indicate = (conversationId: string, isTyping: boolean): void => {
    socket
      .to(conversationRoom(conversationId))
      .emit(SERVER_EVENTS.TYPING_INDICATOR, { conversationId, userId, isTyping });
  };

  socket.on(
    CLIENT_EVENTS.TYPING_START,
    withAck(
      { event: CLIENT_EVENTS.TYPING_START, userId },
      typingPayloadSchema,
      async ({ conversationId }) => {
        // Renovar um indicador já validado não consulta o banco de novo.
        if (!typing.isActive(socket.id, conversationId)) {
          const type = await conversations.getTypeForParticipant(userId, conversationId);
          if (type !== 'direct') {
            throw new TypingNotAllowedException();
          }
        }

        const activated = typing.start(socket.id, conversationId, () => {
          indicate(conversationId, false);
        });
        if (activated) {
          indicate(conversationId, true);
        }
        return null;
      }
    )
  );

  socket.on(
    CLIENT_EVENTS.TYPING_STOP,
    withAck(
      { event: CLIENT_EVENTS.TYPING_STOP, userId },
      typingPayloadSchema,
      ({ conversationId }) => {
        if (typing.stop(socket.id, conversationId)) {
          indicate(conversationId, false);
        }
        return Promise.resolve(null);
      }
    )
  );

  socket.on('disconnecting', () => {
    for (const conversationId of typing.stopAll(socket.id)) {
      indicate(conversationId, false);
    }
  });
}
