/** Chaves do cache do módulo chat (o `CacheService` acrescenta o prefixo `cache:`). */
export const CHAT_CACHE_KEYS = {
  /** Participantes da conversa: `[{ userId, role }]`. */
  participants: (conversationId: string): string => `conv:participants:${conversationId}`,
} as const;

/** TTL (s) das chaves do chat: a invalidação é por evento; o TTL só garante convergência. */
export const CHAT_CACHE_TTL_SECONDS = 300;
