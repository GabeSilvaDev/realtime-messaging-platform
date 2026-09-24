/** Chaves do cache do módulo chat (o `CacheService` acrescenta o prefixo `cache:`). */
export const CHAT_CACHE_KEYS = {
  /** Participantes da conversa: `[{ userId, role }]`. */
  participants: (conversationId: string): string => `conv:participants:${conversationId}`,
} as const;

/** TTL (s) dos participantes da conversa (evento invalida; TTL = fallback). */
export const CHAT_PARTICIPANTS_CACHE_TTL_SECONDS = 60;

/** Intervalo (ms) do segundo DEL nos participantes (mitigação de write-back stale). */
export const CHAT_PARTICIPANTS_CACHE_DELAYED_DELETE_MS = 1000;

/** @deprecated Use CHAT_PARTICIPANTS_CACHE_TTL_SECONDS instead. */
export const CHAT_CACHE_TTL_SECONDS = CHAT_PARTICIPANTS_CACHE_TTL_SECONDS;
