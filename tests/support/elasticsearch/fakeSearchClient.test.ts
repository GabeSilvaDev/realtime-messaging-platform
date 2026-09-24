// Contrato do FakeSearchClient: as formas de resposta e de erro que o Elasticsearch 8.17 devolve
// para as chamadas usadas pela busca (conferidas contra um servidor real na escrita do plano) e a
// avaliação simplificada da `search` (sem analyzer — ver o cabeçalho do fake).
import type { estypes } from '@elastic/elasticsearch';
import { MESSAGES_INDEX_MAPPINGS, MESSAGES_INDEX_SETTINGS } from '@/modules/search/constants';
import type { MessageDocument } from '@/modules/search/types';
import { FakeResponseError, FakeSearchClient } from './fakeSearchClient';

const INDEX = 'messages';

/** O template que o SearchIndexService instala (`<índice>-template`). */
function template(
  overrides: Partial<estypes.IndicesPutIndexTemplateRequest> = {}
): estypes.IndicesPutIndexTemplateRequest {
  return {
    name: `${INDEX}-template`,
    index_patterns: [INDEX],
    priority: 500,
    template: { settings: MESSAGES_INDEX_SETTINGS, mappings: MESSAGES_INDEX_MAPPINGS },
    ...overrides,
  };
}

function doc(overrides: Partial<MessageDocument> = {}): MessageDocument {
  return {
    messageId: 'm1',
    conversationId: 'c1',
    senderId: 'u1',
    content: 'Meu coração está feliz',
    createdAt: '2026-09-27T10:00:00.000Z',
    ...overrides,
  };
}

function query(q: string, filter: estypes.QueryDslQueryContainer[] = []): estypes.SearchRequest {
  return {
    index: INDEX,
    size: 20,
    query: { bool: { must: [{ multi_match: { query: q } }], filter } },
    highlight: { pre_tags: ['<mark>'], post_tags: ['</mark>'], fields: { content: {} } },
    aggs: { conversations: { terms: { field: 'conversationId', size: 10 } } },
  };
}

describe('FakeSearchClient', () => {
  let fake: FakeSearchClient;

  beforeEach(() => {
    fake = new FakeSearchClient();
  });

  describe('índices', () => {
    it('exists/create/delete como no Elasticsearch', async () => {
      expect(await fake.indices.exists({ index: INDEX })).toBe(false);
      expect(await fake.indices.create({ index: INDEX })).toEqual({
        acknowledged: true,
        shards_acknowledged: true,
        index: INDEX,
      });
      expect(await fake.indices.exists({ index: INDEX })).toBe(true);
      expect(await fake.indices.delete({ index: INDEX })).toEqual({ acknowledged: true });
      expect(fake.hasIndex(INDEX)).toBe(false);
    });

    it('criar de novo → 400 resource_already_exists_exception', async () => {
      await fake.indices.create({ index: INDEX });

      const error = (await fake.indices.create({ index: INDEX }).catch((e: unknown) => e)) as
        | FakeResponseError
        | undefined;

      expect(error).toBeInstanceOf(FakeResponseError);
      expect(error?.name).toBe('ResponseError');
      expect(error?.meta.statusCode).toBe(400);
      expect(error?.meta.body.error?.type).toBe('resource_already_exists_exception');
    });

    it('apagar inexistente → 404 index_not_found_exception, salvo com ignore_unavailable', async () => {
      await expect(fake.indices.delete({ index: INDEX })).rejects.toMatchObject({
        meta: { statusCode: 404, body: { error: { type: 'index_not_found_exception' } } },
      });
      await expect(
        fake.indices.delete({ index: INDEX, ignore_unavailable: true })
      ).resolves.toEqual({ acknowledged: true });
    });
  });

  describe('template de índice e criação automática na escrita', () => {
    it('putIndexTemplate reconhece e substitui o template de mesmo nome', async () => {
      await expect(fake.indices.putIndexTemplate(template())).resolves.toEqual({
        acknowledged: true,
      });
      await expect(fake.indices.putIndexTemplate(template())).resolves.toEqual({
        acknowledged: true,
      });
      expect(fake.callsOf('indices.putIndexTemplate')).toEqual([
        { method: 'indices.putIndexTemplate', params: template() },
        { method: 'indices.putIndexTemplate', params: template() },
      ]);
    });

    it('sem template, a escrita cria o índice com mapping dinâmico (auto_create_index)', async () => {
      await fake.index({ index: INDEX, id: 'm1', document: doc() });
      await fake.bulk({ operations: [{ index: { _index: 'outro', _id: 'm2' } }, doc()] });

      expect(fake.hasIndex(INDEX)).toBe(true);
      expect(fake.mappingOf(INDEX)).toBeUndefined();
      expect(fake.mappingOf('outro')).toBeUndefined();
    });

    it('com template, index e bulk criam o índice com o mapping dele (strict vale)', async () => {
      await fake.indices.putIndexTemplate(template());
      const extra = { ...doc(), extra: 1 } as unknown as MessageDocument;

      // Como no Elasticsearch: o índice é criado antes, mesmo que o documento seja recusado.
      await expect(fake.index({ index: INDEX, id: 'm1', document: extra })).rejects.toMatchObject({
        meta: { statusCode: 400, body: { error: { type: 'strict_dynamic_mapping_exception' } } },
      });
      expect(fake.mappingOf(INDEX)).toEqual(MESSAGES_INDEX_MAPPINGS);

      await fake.indices.delete({ index: INDEX });
      const response = await fake.bulk({
        operations: [
          { index: { _index: INDEX, _id: 'm1' } },
          extra,
          { index: { _index: INDEX, _id: 'm2' } },
          doc({ messageId: 'm2' }),
        ],
      });

      expect(response.items.map((item) => item.index?.status)).toEqual([400, 201]);
      expect(fake.mappingOf(INDEX)).toEqual(MESSAGES_INDEX_MAPPINGS);
      expect(fake.documents(INDEX)).toEqual([doc({ messageId: 'm2' })]);
    });

    it('create sem mappings usa o do template; com mappings, o informado', async () => {
      await fake.indices.putIndexTemplate(template());
      const own: estypes.MappingTypeMapping = { properties: { messageId: { type: 'keyword' } } };

      await fake.indices.create({ index: INDEX });
      await fake.indices.putIndexTemplate(template({ name: 'x', index_patterns: ['explicito'] }));
      await fake.indices.create({ index: 'explicito', mappings: own });

      expect(fake.mappingOf(INDEX)).toEqual(MESSAGES_INDEX_MAPPINGS);
      expect(fake.mappingOf('explicito')).toEqual(own);
    });

    it('padrões com * e prioridade: vale o template de maior prioridade que casa', async () => {
      const low: estypes.MappingTypeMapping = { dynamic: 'strict', properties: {} };
      await fake.indices.putIndexTemplate(
        template({
          name: 'baixa',
          index_patterns: 'mess*',
          priority: 1,
          template: { mappings: low },
        })
      );
      await fake.indices.putIndexTemplate(
        template({ name: 'nada', index_patterns: ['outro'], priority: 900 })
      );
      // Sem prioridade (vale 0) e sem corpo: o índice criado continua dinâmico.
      await fake.indices.putIndexTemplate({ name: 'sem-template', index_patterns: ['vazio'] });

      await fake.index({ index: 'messages-2', id: 'm1', document: doc() }).catch(() => undefined);
      await fake.index({ index: 'vazio', id: 'm1', document: doc() });
      expect(fake.mappingOf('messages-2')).toEqual(low);
      expect(fake.mappingOf('vazio')).toBeUndefined();

      await fake.indices.putIndexTemplate(template());
      await fake.index({ index: INDEX, id: 'm1', document: doc() });
      expect(fake.mappingOf(INDEX)).toEqual(MESSAGES_INDEX_MAPPINGS);
    });

    it('strict sem properties recusa qualquer campo', async () => {
      await fake.indices.create({ index: INDEX, mappings: { dynamic: 'strict' } });

      await expect(fake.index({ index: INDEX, id: 'm1', document: doc() })).rejects.toMatchObject({
        meta: { body: { error: { type: 'strict_dynamic_mapping_exception' } } },
      });
    });
  });

  describe('index/delete', () => {
    it('index cria (e o índice, se faltar) e depois atualiza', async () => {
      expect(await fake.index({ index: INDEX, id: 'm1', document: doc() })).toMatchObject({
        _index: INDEX,
        _id: 'm1',
        result: 'created',
        _version: 1,
        _shards: { total: 1, successful: 1, failed: 0 },
      });
      expect(
        await fake.index({ index: INDEX, id: 'm1', document: doc({ content: 'outro' }) })
      ).toMatchObject({ result: 'updated', _version: 2 });
      expect(fake.documents(INDEX)).toEqual([doc({ content: 'outro' })]);
    });

    it('índice com mapping strict: campo fora do mapping → 400 strict_dynamic_mapping_exception', async () => {
      await fake.indices.create({ index: INDEX, mappings: MESSAGES_INDEX_MAPPINGS });
      const document = { ...doc(), extra: true } as unknown as MessageDocument;

      await expect(fake.index({ index: INDEX, id: 'm1', document })).rejects.toMatchObject({
        meta: { statusCode: 400, body: { error: { type: 'strict_dynamic_mapping_exception' } } },
      });
      expect(fake.documents(INDEX)).toEqual([]);
    });

    it('índice sem mapping (dinâmico): aceita qualquer campo, como o Elasticsearch', async () => {
      const document = { ...doc(), extra: true } as unknown as MessageDocument;

      await expect(fake.index({ index: INDEX, id: 'm1', document })).resolves.toMatchObject({
        result: 'created',
      });
      expect(fake.mappingOf(INDEX)).toBeUndefined();
    });

    it('delete: deleted; ausente → 404 not_found, ou resposta normal com ignore [404]', async () => {
      await fake.index({ index: INDEX, id: 'm1', document: doc() });

      expect(await fake.delete({ index: INDEX, id: 'm1' })).toMatchObject({
        _index: INDEX,
        _id: 'm1',
        result: 'deleted',
        _version: 2,
        _shards: { total: 1, successful: 1, failed: 0 },
      });
      await expect(fake.delete({ index: INDEX, id: 'm1' })).rejects.toMatchObject({
        meta: { statusCode: 404, body: { result: 'not_found' } },
      });
      expect(await fake.delete({ index: INDEX, id: 'm1' }, { ignore: [404] })).toMatchObject({
        result: 'not_found',
      });
      expect(fake.callsOf('delete')[2]).toEqual({
        method: 'delete',
        params: { index: INDEX, id: 'm1' },
        options: { ignore: [404] },
      });
    });
  });

  describe('bulk', () => {
    it('index e delete item a item; delete ausente é 404 sem erro (errors: false)', async () => {
      await fake.index({ index: INDEX, id: 'old', document: doc({ messageId: 'old' }) });

      const response = await fake.bulk({
        operations: [
          { index: { _index: INDEX, _id: 'm1' } },
          doc(),
          { index: { _index: INDEX, _id: 'old' } },
          doc({ messageId: 'old' }),
          { delete: { _index: INDEX, _id: 'gone' } },
        ],
      });

      expect(response).toEqual({
        took: 1,
        errors: false,
        items: [
          { index: { _index: INDEX, _id: 'm1', status: 201, result: 'created', _version: 1 } },
          { index: { _index: INDEX, _id: 'old', status: 200, result: 'updated', _version: 2 } },
          { delete: { _index: INDEX, _id: 'gone', status: 404, result: 'not_found' } },
        ],
      });
    });

    it('erro item a item (strict e failingBulkIds) → errors: true e os demais seguem', async () => {
      await fake.indices.create({ index: INDEX, mappings: MESSAGES_INDEX_MAPPINGS });
      fake.failingBulkIds.add('m2');
      await fake.index({ index: INDEX, id: 'm3', document: doc({ messageId: 'm3' }) });

      const response = await fake.bulk({
        operations: [
          { index: { _index: INDEX, _id: 'm1' } },
          { ...doc(), extra: 1 } as unknown as MessageDocument,
          { index: { _index: INDEX, _id: 'm2' } },
          doc({ messageId: 'm2' }),
          { delete: { _index: INDEX, _id: 'm3' } },
        ],
      });

      expect(response.errors).toBe(true);
      expect(response.items).toEqual([
        {
          index: expect.objectContaining({
            _id: 'm1',
            status: 400,
            error: expect.objectContaining({ type: 'strict_dynamic_mapping_exception' }),
          }),
        },
        {
          index: {
            _index: INDEX,
            _id: 'm2',
            status: 429,
            error: { type: 'es_rejected_execution_exception', reason: 'fila de escrita cheia' },
          },
        },
        { delete: { _index: INDEX, _id: 'm3', status: 200, result: 'deleted' } },
      ]);
      expect(fake.documents(INDEX)).toEqual([]);
    });

    it('sem operações', async () => {
      await expect(fake.bulk({})).resolves.toEqual({ took: 1, errors: false, items: [] });
    });
  });

  describe('search (avaliação simplificada)', () => {
    beforeEach(async () => {
      await fake.bulk({
        operations: [
          { index: { _index: INDEX, _id: 'm1' } },
          doc(),
          { index: { _index: INDEX, _id: 'm2' } },
          doc({
            messageId: 'm2',
            conversationId: 'c2',
            senderId: 'u2',
            content: 'coracao <b>sem</b> acento & coração',
            createdAt: '2026-09-27T11:00:00.000Z',
          }),
          { index: { _index: INDEX, _id: 'm3' } },
          doc({
            messageId: 'm3',
            conversationId: 'c2',
            content: 'CORAÇÃO',
            createdAt: '2026-09-27T12:00:00.000Z',
          }),
          { index: { _index: INDEX, _id: 'm4' } },
          doc({ messageId: 'm4', content: 'nada a ver', createdAt: '2026-09-27T13:00:00.000Z' }),
        ],
      });
    });

    it('palavra sem acento/caixa; relevância e depois createdAt desc; highlight escapado; facetas', async () => {
      const response = await fake.search(query('Coração'));

      expect(response.hits.total).toEqual({ value: 3, relation: 'eq' });
      expect(response.hits.max_score).toBe(2);
      expect(response.hits.hits.map((hit) => [hit._id, hit._score])).toEqual([
        ['m2', 2],
        ['m3', 1],
        ['m1', 1],
      ]);
      expect(response.hits.hits[0]?.highlight).toEqual({
        content: [
          '<mark>coracao</mark> &lt;b&gt;sem&lt;&#x2F;b&gt; acento &amp; <mark>coração</mark>',
        ],
      });
      expect(response.aggregations).toEqual({
        conversations: {
          buckets: [
            { key: 'c2', doc_count: 2 },
            { key: 'c1', doc_count: 1 },
          ],
        },
      });
    });

    it('filtros terms/term/range e size', async () => {
      const filtered = await fake.search(
        query('coração', [
          { terms: { conversationId: ['c1', 'c2'] } },
          { term: { senderId: 'u1' } },
          {
            range: {
              createdAt: { gte: '2026-09-27T10:30:00.000Z', lte: '2026-09-27T12:00:00.000Z' },
            },
          },
        ])
      );
      const onlyFrom = await fake.search(
        query('coração', [{ range: { createdAt: { gte: '2026-09-27T11:30:00.000Z' } } }])
      );
      const onlyTo = await fake.search(
        query('coração', [{ range: { createdAt: { lte: '2026-09-27T10:00:00.000Z' } } }])
      );
      const small = await fake.search({ ...query('coração'), size: 1 });

      expect(filtered.hits.hits.map((hit) => hit._id)).toEqual(['m3']);
      expect(onlyFrom.hits.hits.map((hit) => hit._id)).toEqual(['m3']);
      expect(onlyTo.hits.hits.map((hit) => hit._id)).toEqual(['m1']);
      expect(small.hits.hits).toHaveLength(1);
      expect(small.hits.total).toEqual({ value: 3, relation: 'eq' });
    });

    it('sem acerto: lista vazia, max_score null; size padrão 10', async () => {
      const { size: _size, ...withoutSize } = query('inexistente');
      const response = await fake.search(withoutSize);

      expect(response.hits).toEqual({
        total: { value: 0, relation: 'eq' },
        max_score: null,
        hits: [],
      });
    });

    it('facetas limitadas ao size da agregação', async () => {
      const request = query('coração');
      request.aggs = { conversations: { terms: { field: 'conversationId', size: 1 } } };

      const response = await fake.search(request);

      expect(
        (response.aggregations as { conversations: { buckets: unknown[] } }).conversations.buckets
      ).toEqual([{ key: 'c2', doc_count: 2 }]);
    });

    it('índice inexistente → 404 index_not_found_exception', async () => {
      await expect(fake.search({ ...query('x'), index: 'outro' })).rejects.toMatchObject({
        meta: { statusCode: 404, body: { error: { type: 'index_not_found_exception' } } },
      });
    });

    it('registra as opções da requisição (timeout/retries), sem elas não há options', async () => {
      await fake.search(query('coração'), { requestTimeout: 3_000, maxRetries: 1 });
      await fake.search(query('coração'));

      expect(fake.callsOf('search').map((call) => call.options)).toEqual([
        { requestTimeout: 3_000, maxRetries: 1 },
        undefined,
      ]);
      expect(fake.callsOf('search')[1]).not.toHaveProperty('options');
    });

    it('searchResponse sobrepõe a avaliação', async () => {
      const configured = {
        took: 7,
        timed_out: false,
        _shards: { total: 1, successful: 1, failed: 0 },
        hits: { hits: [] },
      };
      fake.searchResponse = configured;

      await expect(fake.search(query('coração'))).resolves.toBe(configured);
    });

    it('sem pre/post tags usa <em>', async () => {
      const response = await fake.search({
        ...query('coração'),
        highlight: { pre_tags: [], post_tags: [], fields: { content: {} } },
      });

      expect(response.hits.hits[2]?.highlight?.content).toEqual([
        'Meu <em>coração</em> está feliz',
      ]);
    });

    it('_source false: omite documento nos hits', async () => {
      const response = await fake.search({
        ...query('coração'),
        _source: false,
      });

      expect(response.hits.hits[0]).not.toHaveProperty('_source');
      expect(response.hits.hits[0]).toHaveProperty('_id');
      expect(response.hits.hits[0]).toHaveProperty('_score');
    });

    it('_source não informado ou true: inclui documento nos hits', async () => {
      const withoutSource = await fake.search(query('coração'));
      const withTrue = await fake.search({ ...query('coração'), _source: true });

      expect(withoutSource.hits.hits[0]).toHaveProperty('_source');
      expect((withoutSource.hits.hits[0] as unknown as Record<string, unknown>)._source).toEqual(
        expect.objectContaining({ messageId: 'm2', conversationId: 'c2' })
      );
      expect(withTrue.hits.hits[0]).toHaveProperty('_source');
      expect((withTrue.hits.hits[0] as unknown as Record<string, unknown>)._source).toEqual(
        expect.objectContaining({ messageId: 'm2', conversationId: 'c2' })
      );
    });
  });

  describe('falha, registro e reset', () => {
    it('failWith faz toda chamada rejeitar (e ainda assim registra)', async () => {
      fake.failWith = new Error('connect ECONNREFUSED');

      await expect(fake.indices.exists({ index: INDEX })).rejects.toThrow('ECONNREFUSED');
      await expect(fake.search(query('x'))).rejects.toThrow('ECONNREFUSED');
      expect(fake.calls.map((call) => call.method)).toEqual(['indices.exists', 'search']);
    });

    it('client é o próprio fake; reset limpa tudo', async () => {
      await fake.client.index({ index: INDEX, id: 'm1', document: doc() });
      fake.failingBulkIds.add('x');
      fake.searchResponse = {
        took: 1,
        timed_out: false,
        _shards: { total: 1, successful: 1, failed: 0 },
        hits: { hits: [] },
      };

      await fake.indices.putIndexTemplate(template());
      fake.reset();
      await fake.index({ index: INDEX, id: 'm1', document: doc() });

      expect(fake.client).toBe(fake);
      expect(fake.calls.map((call) => call.method)).toEqual(['index']);
      // O template sumiu: o índice recriado pela escrita é dinâmico.
      expect(fake.mappingOf(INDEX)).toBeUndefined();
      fake.reset();
      expect(fake.hasIndex(INDEX)).toBe(false);
      expect(fake.documents(INDEX)).toEqual([]);
      expect(fake.failingBulkIds.size).toBe(0);
      expect(fake.searchResponse).toBeNull();
    });
  });
});
