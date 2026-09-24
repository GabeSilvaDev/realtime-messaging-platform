/** Chaves do cache do módulo user (o `CacheService` acrescenta o prefixo `cache:`). */
export const USER_CACHE_KEYS = {
  /** `PublicUserDTO` do usuário. */
  publicUser: (userId: string): string => `user:${userId}`,
  /** Ids com bloqueio em qualquer sentido com o usuário. */
  blocks: (userId: string): string => `blocks:${userId}`,
} as const;

/** TTL (s) das chaves do módulo user: a invalidação é por evento; o TTL só garante convergência. */
export const USER_CACHE_TTL_SECONDS = 300;
