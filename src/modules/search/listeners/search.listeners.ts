import { eventBus, type EventBus } from '@/shared/event-bus';
import { logger } from '@/shared/logger';
import { ChatEvents } from '@/shared/types';
import type { ISearchIndexService } from '../interfaces';
import { searchIndexService } from '../services/SearchIndexService';

const DETACHED = { async: true } as const;

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * MessageIndexer: mantém o índice de busca em dia com o chat.
 *
 * - `chat:message-sent` → indexa a mensagem (`_id = messageId`).
 * - `chat:message-deleted` → remove do índice (documento ausente não é erro).
 *
 * Subscribers `{ async: true }`: não atrasam o envio nem a exclusão. Uma falha (Elasticsearch
 * fora do ar) é logada com o `messageId` e nunca relançada; a recuperação é o reindex
 * (`npm run search:reindex`). Registrado no `bootstrap()` depois do `ensureIndex()`; devolve a
 * função que cancela as inscrições.
 */
export function registerSearchIndexListeners(
  bus: Pick<EventBus, 'subscribe'> = eventBus,
  indexer: Pick<ISearchIndexService, 'indexMessage' | 'deleteMessage'> = searchIndexService
): () => void {
  const unsubscribers = [
    bus.subscribe(
      ChatEvents.MESSAGE_SENT,
      async ({ payload }) => {
        try {
          await indexer.indexMessage({
            messageId: payload.messageId,
            conversationId: payload.conversationId,
            senderId: payload.senderId,
            content: payload.text,
            createdAt: payload.createdAt.toISOString(),
          });
        } catch (error) {
          logger.error('Falha ao indexar a mensagem na busca', toError(error), {
            messageId: payload.messageId,
          });
        }
      },
      DETACHED
    ),
    bus.subscribe(
      ChatEvents.MESSAGE_DELETED,
      async ({ payload }) => {
        try {
          await indexer.deleteMessage(payload.messageId);
        } catch (error) {
          logger.error('Falha ao remover a mensagem da busca', toError(error), {
            messageId: payload.messageId,
          });
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
