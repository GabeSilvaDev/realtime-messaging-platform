import type { IConversationService } from '@/modules/chat/interfaces';
import { conversationService } from '@/modules/chat/services/ConversationService';
import { logger } from '@/shared/logger';
import { ROOM_PREFIXES, SOCKET_ERRORS, conversationRoom, userRoom } from '../constants';
import type { RealtimeSocket, SocketMiddleware } from '../types';

async function joinUserRooms(
  socket: RealtimeSocket,
  conversations: Pick<IConversationService, 'getUserConversationIds'>
): Promise<void> {
  const { userId } = socket.data;
  const conversationIds = await conversations.getUserConversationIds(userId);
  await socket.join([userRoom(userId), ...conversationIds.map(conversationRoom)]);
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * Coloca o socket na room `user:<id>` e nas `conversation:<id>` de todas as conversas do
 * usuário. Roda como middleware (depois do `socketAuth`) para que as rooms já existam quando o
 * cliente receber `connect` — nenhuma mensagem enviada logo após conectar se perde. Reconexões
 * repetem o handshake e, portanto, restauram as rooms.
 *
 * Durante o handshake o socket ainda não está em `nsp.sockets`, então um `socketsJoin`/
 * `socketsLeave` da ponte nesse intervalo não o alcança; `reconcileConversationRooms` (no
 * `connection`) corrige isso.
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
        logger.error('Falha ao entrar nas rooms das conversas no handshake', toError(error), {
          userId: socket.data.userId,
        });
        next(new Error(SOCKET_ERRORS.INTERNAL_ERROR));
      }
    );
  };
}

/**
 * Roda no `connection` (o socket já está em `nsp.sockets`, então a ponte o alcança daqui em
 * diante): relê as conversas do usuário e ajusta as rooms `conversation:*` — entra nas que faltam
 * e sai das que não constam mais (participação alterada durante o handshake).
 *
 * A diferença é calculada sobre o retrato das rooms tirado ANTES da leitura: um `socketsJoin`/
 * `socketsLeave` da ponte que chegue durante a leitura (mudança ainda não visível nela) não é
 * desfeito. Se o socket caiu no meio, não mexe em nada. Falha na leitura ⇒ log e desconexão
 * (não arrisca manter rooms de conversas revogadas; o cliente reconecta).
 */
export async function reconcileConversationRooms(
  socket: RealtimeSocket,
  conversations: Pick<IConversationService, 'getUserConversationIds'>
): Promise<void> {
  const { userId } = socket.data;
  const before = new Set(
    [...socket.rooms].filter((room) => room.startsWith(ROOM_PREFIXES.CONVERSATION))
  );

  let current: Set<string>;
  try {
    current = new Set((await conversations.getUserConversationIds(userId)).map(conversationRoom));
  } catch (error) {
    logger.error('Falha ao reconciliar as rooms das conversas na conexão', toError(error), {
      userId,
    });
    socket.disconnect(true);
    return;
  }

  if (!socket.connected) {
    return;
  }

  const stale = [...before].filter((room) => !current.has(room));
  const missing = [...current].filter((room) => !before.has(room));

  for (const room of stale) {
    await socket.leave(room);
  }
  if (missing.length > 0) {
    await socket.join(missing);
  }
}
