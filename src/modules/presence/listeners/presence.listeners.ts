import { cacheService, type ICacheService } from '@/shared/cache';
import { eventBus, type EventBus } from '@/shared/event-bus';
import { ChatEvents, UserEvents } from '@/shared/types';
import { PRESENCE_CACHE_KEYS } from '../constants';

/**
 * Invalida a audiência cacheada (`cache:presence:audience:<id>`) quando muda quem deve ver a
 * presença de alguém. Subscribers síncronos que devolvem a promise do `del` (a próxima mudança
 * de estado já usa a audiência nova); o TTL cobre um evento perdido.
 *
 * - bloqueio/desbloqueio → os dois envolvidos
 * - `user:contact-added`/`removed` → `contactId` (quem o observa mudou)
 * - conversa `direct` criada → os dois participantes
 */
export function registerPresenceCacheListeners(
  bus: Pick<EventBus, 'subscribe'> = eventBus,
  cache: Pick<ICacheService, 'del'> = cacheService
): () => void {
  const forget = (...userIds: string[]): Promise<void> =>
    cache.del(userIds.map(PRESENCE_CACHE_KEYS.audience));

  const unsubscribers = [
    bus.subscribe(UserEvents.BLOCKED, ({ payload }) =>
      forget(payload.userId, payload.blockedUserId)
    ),
    bus.subscribe(UserEvents.UNBLOCKED, ({ payload }) =>
      forget(payload.userId, payload.unblockedUserId)
    ),
    bus.subscribe(UserEvents.CONTACT_ADDED, ({ payload }) => forget(payload.contactId)),
    bus.subscribe(UserEvents.CONTACT_REMOVED, ({ payload }) => forget(payload.contactId)),
    bus.subscribe(ChatEvents.CONVERSATION_CREATED, ({ payload }) =>
      payload.type === 'direct' ? forget(...payload.participantIds) : Promise.resolve()
    ),
  ];

  return () => {
    unsubscribers.forEach((unsubscribe) => {
      unsubscribe();
    });
  };
}
