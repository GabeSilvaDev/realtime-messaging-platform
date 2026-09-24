import { cacheService, type ICacheService } from '@/shared/cache';
import { eventBus, type EventBus } from '@/shared/event-bus';
import { UserEvents } from '@/shared/types';
import { USER_CACHE_KEYS } from '../constants';

/**
 * Invalidação do cache do módulo user pelo EventBus. Os subscribers são síncronos e devolvem a
 * promise do `del`: quem publica (ex.: `blockUser`) só termina depois de o cache ser limpo, então
 * a próxima leitura já vê o dado novo. O TTL cobre um evento perdido.
 *
 * - `user:updated`/`user:deleted` → `cache:user:<id>` (perfil público)
 * - `user:blocked`/`user:unblocked` → `cache:blocks:<id>` dos dois envolvidos
 */
export function registerUserCacheListeners(
  bus: Pick<EventBus, 'subscribe'> = eventBus,
  cache: Pick<ICacheService, 'del'> = cacheService
): () => void {
  const unsubscribers = [
    bus.subscribe(UserEvents.UPDATED, ({ payload }) =>
      cache.del(USER_CACHE_KEYS.publicUser(payload.userId))
    ),
    bus.subscribe(UserEvents.DELETED, ({ payload }) =>
      cache.del(USER_CACHE_KEYS.publicUser(payload.userId))
    ),
    bus.subscribe(UserEvents.BLOCKED, ({ payload }) =>
      cache.del([
        USER_CACHE_KEYS.blocks(payload.userId),
        USER_CACHE_KEYS.blocks(payload.blockedUserId),
      ])
    ),
    bus.subscribe(UserEvents.UNBLOCKED, ({ payload }) =>
      cache.del([
        USER_CACHE_KEYS.blocks(payload.userId),
        USER_CACHE_KEYS.blocks(payload.unblockedUserId),
      ])
    ),
  ];

  return () => {
    unsubscribers.forEach((unsubscribe) => {
      unsubscribe();
    });
  };
}
