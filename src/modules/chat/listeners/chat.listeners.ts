import type { IContactService } from '@/modules/user/interfaces';
import { contactService } from '@/modules/user/services/ContactService';
import { eventBus, type EventBus } from '@/shared/event-bus';
import { logger } from '@/shared/logger';
import { ChatEvents } from '@/shared/types';
import type { IMessageRepository } from '../interfaces';
import { messageRepository } from '../repositories';

const DETACHED = { async: true } as const;

/**
 * Registra os subscribers do módulo de chat no EventBus. Chamado no bootstrap (após as
 * conexões); retorna uma função que cancela todas as inscrições.
 *
 * - MESSAGE_SENT em conversa direct → atualiza `last_interaction_at` dos contatos (RF002.2).
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
        await contacts.recordInteraction(payload.senderId, otherId);
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
