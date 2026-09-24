import type { IContactService } from '@/modules/user/interfaces';
import { contactService } from '@/modules/user/services/ContactService';
import { cacheService, type ICacheService } from '@/shared/cache';
import { eventBus, type EventBus } from '@/shared/event-bus';
import { logger } from '@/shared/logger';
import { ChatEvents } from '@/shared/types';
import { CHAT_CACHE_KEYS } from '../constants';
import type { IMessageRepository } from '../interfaces';
import { messageRepository } from '../repositories';

const DETACHED = { async: true } as const;

/**
 * Registra os subscribers do módulo de chat no EventBus. Chamado no bootstrap (após as
 * conexões); retorna uma função que cancela todas as inscrições.
 *
 * - MESSAGE_SENT em conversa direct → atualiza `last_interaction_at` dos contatos (RF002.2;
 *   best-effort: uma falha é logada, nunca propagada — a mensagem já foi entregue).
 * - CONVERSATION_DELETED → apaga as mensagens órfãs da conversa no MongoDB (best-effort: uma
 *   falha aqui é logada, nunca propagada — a conversa já foi removida do Postgres).
 *
 * Ambos são inscritos com `{ async: true }`: fazem I/O que não precisa atrasar a resposta de
 * quem publicou (envio de mensagem, saída do grupo). A ponte Socket.IO continua síncrona.
 */
export function registerChatListeners(
  bus: Pick<EventBus, 'subscribe'> = eventBus,
  contacts: Pick<IContactService, 'recordInteraction'> = contactService,
  messages: Pick<IMessageRepository, 'deleteByConversation'> = messageRepository
): () => void {
  const unsubscribers = [
    bus.subscribe(
      ChatEvents.MESSAGE_SENT,
      async ({ payload }) => {
        if (payload.conversationType !== 'direct') {
          return;
        }
        const otherId = payload.participantIds.find((id) => id !== payload.senderId);
        if (otherId === undefined) {
          return;
        }
        try {
          await contacts.recordInteraction(payload.senderId, otherId);
        } catch (error) {
          logger.error(
            'Falha ao registrar a interação entre os contatos da conversa direct',
            error instanceof Error ? error : new Error(String(error)),
            { conversationId: payload.conversationId, senderId: payload.senderId, otherId }
          );
        }
      },
      DETACHED
    ),
    bus.subscribe(
      ChatEvents.CONVERSATION_DELETED,
      async ({ payload }) => {
        try {
          await messages.deleteByConversation(payload.conversationId);
        } catch (error) {
          logger.error(
            'Falha ao apagar mensagens órfãs da conversa removida',
            error instanceof Error ? error : new Error(String(error)),
            { conversationId: payload.conversationId, actorId: payload.actorId }
          );
        }
      },
      DETACHED
    ),
  ];

  return () => {
    unsubscribers.forEach((unsubscribe) => {
      unsubscribe();
    });
  };
}

/**
 * Invalida `cache:conv:participants:<id>` em toda mudança de participação. Subscribers
 * síncronos que devolvem a promise do `del`: quem publica só termina com o cache já limpo (o
 * próximo envio/listagem relê do Postgres).
 */
export function registerChatCacheListeners(
  bus: Pick<EventBus, 'subscribe'> = eventBus,
  cache: Pick<ICacheService, 'del'> = cacheService
): () => void {
  const forget = ({ payload }: { payload: { conversationId: string } }): Promise<void> =>
    cache.del(CHAT_CACHE_KEYS.participants(payload.conversationId));

  const unsubscribers = [
    bus.subscribe(ChatEvents.CONVERSATION_CREATED, forget),
    bus.subscribe(ChatEvents.CONVERSATION_UPDATED, forget),
    bus.subscribe(ChatEvents.CONVERSATION_DELETED, forget),
  ];

  return () => {
    unsubscribers.forEach((unsubscribe) => {
      unsubscribe();
    });
  };
}
