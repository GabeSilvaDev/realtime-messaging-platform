jest.mock('@/shared/database/redis', () => ({ redis: {} }));
jest.mock('@/shared/database/elasticsearch', () => ({ elasticsearch: {} }));
jest.mock('@/shared/logger', () => ({ logger: { info: jest.fn(), error: jest.fn() } }));

import type { estypes } from '@elastic/elasticsearch';
import { ConversationNotFoundException } from '@/modules/chat/errors';
import type { MessageDTO } from '@/modules/chat/types';
import { InvalidSearchRangeException, SearchUnavailableException } from '@/modules/search/errors';
import { SearchService, searchService } from '@/modules/search/services';
import type {
  MessageDocument,
  MessageSearchAggregations,
  SearchMessagesParams,
} from '@/modules/search/types';
import { logger } from '@/shared/logger';
import { FakeSearchClient } from '../../../../support/elasticsearch/fakeSearchClient';

const INDEX = 'messages';
const ANA = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const CONV_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CONV_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CONV_OTHER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const BASE = Date.parse('2026-09-27T10:00:00.000Z');

function at(minutes: number): Date {
  return new Date(BASE + minutes * 60_000);
}

function dto(
  id: string,
  conversationId: string,
  senderId: string,
  text: string,
  minutes: number
): MessageDTO {
  return {
    id,
    conversationId,
    senderId,
    content: { type: 'text', text },
    replyTo: null,
    mentions: [],
    clientMessageId: null,
    status: { sentAt: at(minutes), deliveredTo: [], readBy: [] },
    deletedAt: null,
    createdAt: at(minutes),
    updatedAt: at(minutes),
  };
}

function toDocument(message: MessageDTO): MessageDocument {
  return {
    messageId: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    content: message.content?.text ?? '',
    createdAt: message.createdAt.toISOString(),
  };
}

const M1 = dto('m1', CONV_A, ANA, 'Meu coração está feliz', 0);
const M2 = dto('m2', CONV_A, BOB, 'coração <b>partido</b> e coração inteiro', 10);
const M3 = dto('m3', CONV_B, ANA, 'CORAÇÃO', 20);
const M_OTHER = dto('m9', CONV_OTHER, BOB, 'coração alheio', 30);

function params(overrides: Partial<SearchMessagesParams> = {}): SearchMessagesParams {
  return { q: 'coração', limit: 20, ...overrides };
}

function configuredResponse(
  overrides: Partial<estypes.SearchResponse<unknown, unknown>> = {}
): estypes.SearchResponse<unknown, MessageSearchAggregations> {
  return {
    took: 3,
    timed_out: false,
    _shards: { total: 1, successful: 1, failed: 0 },
    hits: { total: { value: 0, relation: 'eq' }, hits: [] },
    ...overrides,
  } as estypes.SearchResponse<unknown, MessageSearchAggregations>;
}

describe('SearchService', () => {
  let fake: FakeSearchClient;
  let conversations: { getUserConversationIds: jest.Mock };
  let stored: MessageDTO[];
  let messages: { findByIdsForSearch: jest.Mock };
  let clock: number;
  let service: SearchService;

  beforeEach(async () => {
    fake = new FakeSearchClient();
    await fake.indices.create({ index: INDEX });
    stored = [M1, M2, M3, M_OTHER];
    for (const message of stored) {
      await fake.index({ index: INDEX, id: message.id, document: toDocument(message) });
    }
    fake.calls.length = 0;

    conversations = { getUserConversationIds: jest.fn().mockResolvedValue([CONV_A, CONV_B]) };
    messages = {
      findByIdsForSearch: jest.fn(async (ids: string[]) =>
        // O MongoDB devolve em qualquer ordem: aqui, invertida.
        stored.filter((message) => ids.includes(message.id)).reverse()
      ),
    };
    clock = 1000;
    service = new SearchService({
      client: fake.client,
      index: INDEX,
      conversations,
      messages,
      now: () => (clock += 7) - 7,
    });
  });

  it('exporta a instância padrão', () => {
    expect(searchService).toBeInstanceOf(SearchService);
  });

  it('manda ao Elasticsearch a consulta do spec (relevância, filtros, highlight, facetas)', async () => {
    await service.searchMessages(ANA, params({ limit: 5 }));

    expect(fake.callsOf('search')).toEqual([
      {
        method: 'search',
        params: {
          index: INDEX,
          size: 5,
          _source: false,
          query: {
            bool: {
              must: [
                {
                  multi_match: {
                    query: 'coração',
                    type: 'most_fields',
                    fields: ['content', 'content.exact^2'],
                  },
                },
              ],
              filter: [{ terms: { conversationId: [CONV_A, CONV_B] } }],
            },
          },
          sort: [{ _score: { order: 'desc' } }, { createdAt: { order: 'desc' } }],
          highlight: {
            encoder: 'html',
            pre_tags: ['<mark>'],
            post_tags: ['</mark>'],
            fields: {
              content: { fragment_size: 150, number_of_fragments: 3 },
              'content.exact': { fragment_size: 150, number_of_fragments: 3 },
            },
          },
          aggs: { conversations: { terms: { field: 'conversationId', size: 10 } } },
        },
        // Busca é interativa: 3 s por tentativa e no máximo 1 nova tentativa (conexão/502-504).
        options: { requestTimeout: 3_000, maxRetries: 1 },
      },
    ]);
    expect(conversations.getUserConversationIds).toHaveBeenCalledWith(ANA);
  });

  it('hidrata no MongoDB mantendo a ordem do Elasticsearch, com highlight, score, total, facetas e tookMs', async () => {
    const result = await service.searchMessages(ANA, params());

    expect(result).toEqual({
      items: [
        {
          message: M2,
          highlights: [
            '<mark>coração</mark> &lt;b&gt;partido&lt;&#x2F;b&gt; e <mark>coração</mark> inteiro',
          ],
          score: 2,
        },
        { message: M3, highlights: ['<mark>CORAÇÃO</mark>'], score: 1 },
        { message: M1, highlights: ['Meu <mark>coração</mark> está feliz'], score: 1 },
      ],
      total: 3,
      facets: {
        conversations: [
          { conversationId: CONV_A, count: 2 },
          { conversationId: CONV_B, count: 1 },
        ],
      },
      tookMs: 7,
    });
    expect(messages.findByIdsForSearch).toHaveBeenCalledWith(['m2', 'm3', 'm1']);
  });

  describe('filtros', () => {
    it('conversationId permitido restringe a ela; senderId e período viram filtros', async () => {
      const result = await service.searchMessages(
        ANA,
        params({ conversationId: CONV_A, senderId: ANA, from: at(-5), to: at(5) })
      );

      expect(result.items.map((item) => item.message.id)).toEqual(['m1']);
      expect(fake.callsOf('search')[0]?.params).toMatchObject({
        query: {
          bool: {
            filter: [
              { terms: { conversationId: [CONV_A] } },
              { term: { senderId: ANA } },
              {
                range: {
                  createdAt: { gte: '2026-09-27T09:55:00.000Z', lte: '2026-09-27T10:05:00.000Z' },
                },
              },
            ],
          },
        },
      });
    });

    it('só from ou só to', async () => {
      const onlyFrom = await service.searchMessages(ANA, params({ from: at(15) }));
      const onlyTo = await service.searchMessages(ANA, params({ to: at(5) }));

      expect(onlyFrom.items.map((item) => item.message.id)).toEqual(['m3']);
      expect(onlyTo.items.map((item) => item.message.id)).toEqual(['m1']);
      const filters = fake
        .callsOf('search')
        .map(
          (call) => (call.params as { query: { bool: { filter: unknown[] } } }).query.bool.filter[1]
        );
      expect(filters).toEqual([
        { range: { createdAt: { gte: '2026-09-27T10:15:00.000Z', lte: undefined } } },
        { range: { createdAt: { gte: undefined, lte: '2026-09-27T10:05:00.000Z' } } },
      ]);
    });

    it('from igual a to é válido', async () => {
      const result = await service.searchMessages(ANA, params({ from: at(0), to: at(0) }));

      expect(result.items.map((item) => item.message.id)).toEqual(['m1']);
    });
  });

  describe('autorização', () => {
    it('conversationId de conversa da qual não participa → 404, sem consultar o Elasticsearch', async () => {
      await expect(
        service.searchMessages(ANA, params({ conversationId: CONV_OTHER }))
      ).rejects.toThrow(ConversationNotFoundException);
      expect(fake.callsOf('search')).toEqual([]);
    });

    it('sem conversas → resposta vazia sem consultar Elasticsearch nem MongoDB', async () => {
      conversations.getUserConversationIds.mockResolvedValue([]);

      await expect(service.searchMessages(ANA, params())).resolves.toEqual({
        items: [],
        total: 0,
        facets: { conversations: [] },
        tookMs: 7,
      });
      expect(fake.calls).toEqual([]);
      expect(messages.findByIdsForSearch).not.toHaveBeenCalled();
    });

    it('hidratação descarta apagadas (não voltam do MongoDB) e conversas fora do conjunto permitido', async () => {
      fake.searchResponse = configuredResponse({
        hits: {
          total: { value: 3, relation: 'eq' },
          hits: [
            { _index: INDEX, _id: 'm1', _score: 3, highlight: { content: ['a'] } },
            { _index: INDEX, _id: 'apagada', _score: 2, highlight: { content: ['b'] } },
            { _index: INDEX, _id: 'm9', _score: 1, highlight: { content: ['c'] } },
          ],
        },
      });

      const result = await service.searchMessages(ANA, params());

      expect(result.items).toEqual([{ message: M1, highlights: ['a'], score: 3 }]);
      expect(result.total).toBe(3);
    });
  });

  it('from depois de to → 400, antes de qualquer consulta', async () => {
    await expect(service.searchMessages(ANA, params({ from: at(10), to: at(9) }))).rejects.toThrow(
      InvalidSearchRangeException
    );
    expect(conversations.getUserConversationIds).not.toHaveBeenCalled();
  });

  describe('Elasticsearch fora do ar', () => {
    it('→ 503 SearchUnavailableException, com log do erro original', async () => {
      fake.failWith = new Error('connect ECONNREFUSED');

      await expect(service.searchMessages(ANA, params())).rejects.toThrow(
        SearchUnavailableException
      );
      expect(logger.error).toHaveBeenCalledWith(
        'Falha na consulta ao Elasticsearch',
        fake.failWith,
        { index: INDEX }
      );
      expect(messages.findByIdsForSearch).not.toHaveBeenCalled();
    });

    it('rejeição que não é Error também vira 503', async () => {
      jest.spyOn(fake, 'search').mockRejectedValue('timeout');

      await expect(service.searchMessages(ANA, params())).rejects.toThrow(
        SearchUnavailableException
      );
      expect(jest.mocked(logger.error).mock.calls[0]?.[1]).toEqual(new Error('timeout'));
    });
  });

  describe('formas da resposta do Elasticsearch', () => {
    it('highlight só no content.exact (stopword), sem highlight, sem _id, _score null, total numérico, sem agregações', async () => {
      fake.searchResponse = configuredResponse({
        hits: {
          total: 12,
          hits: [
            {
              _index: INDEX,
              _id: 'm1',
              _score: null,
              highlight: { 'content.exact': ['<mark>de</mark>'] },
            },
            { _index: INDEX, _id: 'm2' },
            { _index: INDEX },
          ],
        },
      });

      const result = await service.searchMessages(ANA, params());

      expect(result).toEqual({
        items: [
          { message: M1, highlights: ['<mark>de</mark>'], score: 0 },
          { message: M2, highlights: [], score: 0 },
        ],
        total: 12,
        facets: { conversations: [] },
        tookMs: 7,
      });
      expect(messages.findByIdsForSearch).toHaveBeenCalledWith(['m1', 'm2']);
    });

    it('total ausente vale 0', async () => {
      fake.searchResponse = configuredResponse({ hits: { hits: [] } });

      await expect(service.searchMessages(ANA, params())).resolves.toMatchObject({ total: 0 });
    });

    it('relógio padrão (performance.now) mede um tempo não negativo', async () => {
      const real = new SearchService({
        client: fake.client,
        index: INDEX,
        conversations,
        messages,
      });

      const { tookMs } = await real.searchMessages(ANA, params());

      expect(tookMs).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(tookMs)).toBe(true);
    });
  });
});
