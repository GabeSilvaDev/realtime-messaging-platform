export const CACHE_CONSTANTS = {
  /** Toda chave do cache começa com este prefixo (`cache:user:<id>`, ...). */
  KEY_PREFIX: 'cache:',
  /** TTL padrão (s): garante convergência se um evento de invalidação se perder. */
  DEFAULT_TTL_SECONDS: 300,
} as const;
