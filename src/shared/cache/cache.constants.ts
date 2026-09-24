export const CACHE_CONSTANTS = {
  /** Toda chave do cache começa com este prefixo (`cache:user:<id>`, ...). */
  KEY_PREFIX: 'cache:',
  /** TTL padrão (s): garante convergência se um evento de invalidação se perder. */
  DEFAULT_TTL_SECONDS: 300,
  /** Atraso (ms) do segundo DEL da invalidação em dois tempos (`DelayedCacheInvalidator`). */
  DELAYED_DELETE_MS: 1000,
} as const;
