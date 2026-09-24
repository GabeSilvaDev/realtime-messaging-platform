import {
  DEFAULT_MESSAGES_INDEX,
  MESSAGES_INDEX_MAPPINGS,
  MESSAGES_INDEX_SETTINGS,
  SEARCH_CONSTANTS,
  resolveMessagesIndex,
} from '@/modules/search/constants';

describe('search constants', () => {
  it('limites da busca e do reindex (spec §4 e §5)', () => {
    expect(SEARCH_CONSTANTS).toEqual({
      MESSAGES_INDEX: expect.any(String),
      MAX_LIMIT: 100,
      DEFAULT_LIMIT: 20,
      MAX_QUERY_LENGTH: 200,
      REINDEX_BATCH: 500,
      FRAGMENT_SIZE: 150,
      MAX_FRAGMENTS: 3,
      FACET_SIZE: 10,
      HIGHLIGHT_PRE_TAG: '<mark>',
      HIGHLIGHT_POST_TAG: '</mark>',
      RATE_LIMIT_WINDOW_MS: 60_000,
      RATE_LIMIT_MAX_REQUESTS: 30,
      RATE_LIMIT_KEY_PREFIX: 'rl:search:',
    });
  });

  describe('resolveMessagesIndex', () => {
    it('usa ELASTICSEARCH_MESSAGES_INDEX quando definido (aparando espaços)', () => {
      expect(resolveMessagesIndex({ ELASTICSEARCH_MESSAGES_INDEX: ' messages-v2 ' })).toBe(
        'messages-v2'
      );
    });

    it.each([{}, { ELASTICSEARCH_MESSAGES_INDEX: '' }, { ELASTICSEARCH_MESSAGES_INDEX: '   ' }])(
      'cai no padrão "messages" com %j',
      (env) => {
        expect(resolveMessagesIndex(env)).toBe(DEFAULT_MESSAGES_INDEX);
        expect(DEFAULT_MESSAGES_INDEX).toBe('messages');
      }
    );

    it('lê process.env por padrão (e o índice das constantes vem daí)', () => {
      expect(resolveMessagesIndex()).toBe(SEARCH_CONSTANTS.MESSAGES_INDEX);
    });
  });

  describe('definição do índice', () => {
    it('1 shard, 0 réplicas e o analyzer pt_folded (acentos dobrados antes do stemmer)', () => {
      expect(MESSAGES_INDEX_SETTINGS).toEqual({
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
      });
    });

    it('mapping strict com content (pt_folded) + content.exact (pt_exact)', () => {
      expect(MESSAGES_INDEX_MAPPINGS).toEqual({
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
      });
    });
  });
});
