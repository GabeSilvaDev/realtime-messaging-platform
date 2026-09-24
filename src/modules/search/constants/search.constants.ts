import type { estypes } from '@elastic/elasticsearch';

/** Nome padrão do índice de mensagens (sobrescrito por `ELASTICSEARCH_MESSAGES_INDEX`). */
export const DEFAULT_MESSAGES_INDEX = 'messages';

/** `ELASTICSEARCH_MESSAGES_INDEX` (aparado) ou `messages` quando ausente/vazio. */
export function resolveMessagesIndex(
  env: Record<string, string | undefined> = process.env
): string {
  const configured = env.ELASTICSEARCH_MESSAGES_INDEX?.trim() ?? '';
  return configured === '' ? DEFAULT_MESSAGES_INDEX : configured;
}

export const SEARCH_CONSTANTS = {
  /** Índice das mensagens, lido do ambiente na carga do módulo. */
  MESSAGES_INDEX: resolveMessagesIndex(),
  /** RF006.2: no máximo 100 resultados por consulta. */
  MAX_LIMIT: 100,
  DEFAULT_LIMIT: 20,
  /** Tamanho máximo de `q` (após o trim). */
  MAX_QUERY_LENGTH: 200,
  /** Mensagens por lote no reindex (`bulk`). */
  REINDEX_BATCH: 500,
  /** Highlight: fragmentos de até 150 caracteres, no máximo 3 por mensagem. */
  FRAGMENT_SIZE: 150,
  MAX_FRAGMENTS: 3,
  /** Facetas: as 10 conversas com mais acertos. */
  FACET_SIZE: 10,
  HIGHLIGHT_PRE_TAG: '<mark>',
  HIGHLIGHT_POST_TAG: '</mark>',
  /** Rate limit próprio de `GET /api/search/messages`: 30 requisições por minuto por IP. */
  RATE_LIMIT_WINDOW_MS: 60_000,
  RATE_LIMIT_MAX_REQUESTS: 30,
  RATE_LIMIT_KEY_PREFIX: 'rl:search:',
  /**
   * Opções por requisição da consulta (`search`): 3 s por tentativa (o cliente usa 10 s) e no
   * máximo 1 nova tentativa — só para erro de conexão ou 502/503/504; timeout não é repetido
   * (`retryOnTimeout: false`, padrão do cliente). Esgotado, a busca responde 503.
   */
  SEARCH_REQUEST_TIMEOUT_MS: 3_000,
  SEARCH_MAX_RETRIES: 1,
  /**
   * Prioridade do template `<índice>-template` (`index_patterns: [<índice>]`), instalado pelo
   * `ensureIndex`. Qualquer valor > 0 serve: os templates embutidos do Elasticsearch (`logs-*-*`,
   * `metrics-*-*`, ...) usam 100 e não casam com o nome do índice; 500 deixa folga acima deles.
   */
  INDEX_TEMPLATE_PRIORITY: 500,
} as const;

/**
 * Analyzer `pt_folded` (indexação e consulta): minúsculas → sem acentos → stopwords do português
 * → plural nasal `-oes` vira `-ao` → stemmer leve do português. O `pt_plural_oes` existe porque o
 * `light_portuguese` só reduz "-ões" a "-ão" COM acento: depois do `asciifolding`, "corações" e
 * "coração" virariam radicais diferentes ("coraco" × "coraca"). `pt_exact` (sem stopwords nem
 * stemmer) alimenta `content.exact`, que pesa mais na relevância (forma exata da palavra).
 *
 * 1 shard e 0 réplicas servem ao ambiente de desenvolvimento (um nó); em produção, defina as
 * réplicas conforme o cluster (`PUT /messages/_settings`).
 */
export const MESSAGES_INDEX_SETTINGS: estypes.IndicesIndexSettings = {
  number_of_shards: 1,
  number_of_replicas: 0,
  analysis: {
    filter: {
      pt_stop: { type: 'stop', stopwords: '_portuguese_' },
      pt_plural_oes: { type: 'pattern_replace', pattern: 'oes$', replacement: 'ao' },
      pt_stemmer: { type: 'stemmer', language: 'light_portuguese' },
    },
    analyzer: {
      pt_folded: {
        type: 'custom',
        tokenizer: 'standard',
        filter: ['lowercase', 'asciifolding', 'pt_stop', 'pt_plural_oes', 'pt_stemmer'],
      },
      pt_exact: {
        type: 'custom',
        tokenizer: 'standard',
        filter: ['lowercase', 'asciifolding'],
      },
    },
  },
};

/** Mapping `strict`: um campo fora desta lista faz a indexação falhar (nada entra por engano). */
export const MESSAGES_INDEX_MAPPINGS: estypes.MappingTypeMapping = {
  dynamic: 'strict',
  properties: {
    messageId: { type: 'keyword' },
    conversationId: { type: 'keyword' },
    senderId: { type: 'keyword' },
    content: {
      type: 'text',
      analyzer: 'pt_folded',
      fields: { exact: { type: 'text', analyzer: 'pt_exact' } },
    },
    createdAt: { type: 'date' },
  },
};
