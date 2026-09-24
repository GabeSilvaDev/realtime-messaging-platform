import type { IConversationService } from '@/modules/chat/interfaces';
import { conversationService } from '@/modules/chat/services/ConversationService';
import { logger } from '@/shared/logger';
import { SOCKET_ERRORS, conversationRoom, userRoom } from '../constants';
import type { RealtimeSocket, SocketMiddleware } from '../types';

async function joinUserRooms(
  socket: RealtimeSocket,
  conversations: Pick<IConversationService, 'getUserConversationIds'>
): Promise<void> {
  const { userId } = socket.data;
  const conversationIds = await conversations.getUserConversationIds(userId);
  await socket.join([userRoom(userId), ...conversationIds.map(conversationRoom)]);
}

/**
 * Coloca o socket na room `user:<id>` e nas `conversation:<id>` de todas as conversas do
 * usuário. Roda como middleware (depois do `socketAuth`) para que as rooms já existam quando o
 * cliente receber `connect` — nenhuma mensagem enviada logo após conectar se perde. Reconexões
 * repetem o handshake e, portanto, restauram as rooms.
 */
export function createJoinRoomsMiddleware(
  conversations: Pick<IConversationService, 'getUserConversationIds'> = conversationService
): SocketMiddleware {
  return (socket, next) => {
    joinUserRooms(socket, conversations).then(
      () => {
        next();
      },
      (error: unknown) => {
        logger.error(
          'Falha ao entrar nas rooms das conversas no handshake',
          error instanceof Error ? error : new Error(String(error)),
          { userId: socket.data.userId }
        );
        next(new Error(SOCKET_ERRORS.INTERNAL_ERROR));
      }
    );
  };
}
