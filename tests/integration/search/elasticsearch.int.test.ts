// Integração OPCIONAL com um Elasticsearch de verdade: só roda com ELASTICSEARCH_IT_URL definido
// (ex.: http://localhost:19200 ou http://elastic:<senha>@localhost:9201). Fora disso a suíte é
// pulada — o CI e a suíte normal nunca abrem conexão com um Elasticsearch. Prova o que o
// FakeSearchClient não reproduz: o analyzer pt_folded (acentos, caixa, plural e stemmer), o
// highlight escapado, o mapping strict e as consultas exatas do SearchService.
jest.mock('@/shared/database/redis', () => ({ redis: {} }));
jest.mock('@/shared/database/elasticsearch', () => ({ elasticsearch: {} }));
jest.mock('@/shared/logger', () => ({ logger: { info: jest.fn(), error: jest.fn() } }));

import { randomBytes } from 'crypto';
import { Client } from '@elastic/elasticsearch';
import type { IndexableMessage, MessageDTO } from '@/modules/chat/types';
import { SearchIndexService, SearchService } from '@/modules/search/services';
import type { SearchClient, SearchMessagesParams } from '@/modules/search/types';

const URL = process.env.ELASTICSEARCH_IT_URL;
const describeWithEs = URL !== undefined && URL !== '' ? describe : describe.skip;

const ANA = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const CONV_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CONV_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CONV_OTHER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const BASE = Date.parse('2026-09-27T10:00:00.000Z');

function message(
  id: string,
  conversationId: string,
  senderId: string,
  text: string | null,
  minutes: number
): IndexableMessage {
  return { id, conversationId, senderId, text, createdAt: new Date(BASE + minutes * 60_000) };
}

function toDto(item: IndexableMessage): MessageDTO {
  return {
    id: item.id,
    conversationId: item.conversationId,
    senderId: item.senderId,
    content: item.text === null ? null : { type: 'text', text: item.text },
    replyTo: null,
    mentions: [],
    clientMessageId: null,
    status: { sentAt: item.createdAt, deliveredTo: [], readBy: [] },
    deletedAt: null,
    createdAt: item.createdAt,
    updatedAt: item.createdAt,
  };
}

const ALL = [
  message('m1', CONV_A, ANA, 'Meu coração está feliz', 0),
  message('m2', CONV_A, BOB, 'CORAÇÕES partidos <script>alert(1)</script>', 10),
  message('m3', CONV_B, ANA, 'coracao sem acento; reunião amanhã de manhã', 20),
  message('m4', CONV_OTHER, BOB, 'coração de outra conversa', 30),
  message('m5', CONV_A, ANA, 'mensagem apagada sobre coração', 40),
  message('m6', CONV_B, BOB, 'as reuniões e as ações da semana', 50),
];

describeWithEs('Elasticsearch real (opcional: ELASTICSEARCH_IT_URL)', () => {
  const index = `messages-it-${randomBytes(4).toString('hex')}`;
  let raw: Client;
  let indexer: SearchIndexService;
  let search: SearchService;
  let current: IndexableMessage[];

  async function tokens(text: string): Promise<string[]> {
    const response = await raw.indices.analyze({ index, analyzer: 'pt_folded', text });
    return (response.tokens ?? []).map((token) => token.token);
  }

  async function run(q: string, extra: Partial<SearchMessagesParams> = {}) {
    return search.searchMessages(ANA, { q, limit: 20, ...extra });
  }

  beforeAll(async () => {
    raw = new Client({ node: URL as string });
    const client = raw as unknown as SearchClient;
    current = [...ALL];
    const messages = {
      forEachForIndexing: async (
        batchSize: number,
        handler: (batch: IndexableMessage[]) => Promise<void>
      ): Promise<number> => {
        for (let start = 0; start < current.length; start += batchSize) {
          await handler(current.slice(start, start + batchSize));
        }
        return current.length;
      },
      findByIdsForSearch: async (ids: string[]): Promise<MessageDTO[]> =>
        current.filter((item) => ids.includes(item.id) && item.text !== null).map(toDto),
    };
    indexer = new SearchIndexService({ client, index, messages, batchSize: 4 });
    search = new SearchService({
      client,
      index,
      messages,
      conversations: { getUserConversationIds: async () => [CONV_A, CONV_B] },
    });

    await expect(indexer.ensureIndex()).resolves.toBe(true);
    await expect(indexer.ensureIndex()).resolves.toBe(false);
    await expect(indexer.reindexAll()).resolves.toEqual({
      scanned: 6,
      indexed: 6,
      deleted: 0,
      failed: 0,
    });
    await raw.indices.refresh({ index });
  });

  afterAll(async () => {
    await raw.indices.delete({ index, ignore_unavailable: true });
    await raw.close();
  });

  it('analyzer: "coração", "coracao", "CORAÇÕES" e "corações" viram o mesmo termo', async () => {
    const forms = ['coração', 'coracao', 'CORAÇÕES', 'corações', 'Coracoes'];
    const analyzed = await Promise.all(forms.map((form) => tokens(form)));

    expect(new Set(analyzed.map((list) => list.join(' '))).size).toBe(1);
    expect(await tokens('reunião')).toEqual(await tokens('reuniões'));
    expect(await tokens('ação')).toEqual(await tokens('ações'));
  });

  it.each(['coração', 'coracao', 'CORAÇÕES', 'corações'])(
    'busca "%s" encontra todas as formas, só nas conversas permitidas',
    async (q) => {
      const result = await run(q);

      expect(result.items.map((item) => item.message.id).sort()).toEqual(['m1', 'm2', 'm3', 'm5']);
      expect(result.total).toBe(4);
      expect(result.facets.conversations).toEqual([
        { conversationId: CONV_A, count: 3 },
        { conversationId: CONV_B, count: 1 },
      ]);
      expect(result.tookMs).toBeLessThan(300);
    }
  );

  it('forma exata pesa mais: "CORAÇÕES" põe m2 primeiro; highlight com <mark> e HTML escapado', async () => {
    const result = await run('CORAÇÕES');

    expect(result.items[0]?.message.id).toBe('m2');
    expect(result.items[0]?.highlights).toEqual([
      '<mark>CORAÇÕES</mark> partidos &lt;script&gt;alert(1)&lt;&#x2F;script&gt;',
    ]);
    expect(result.items[0]?.score).toBeGreaterThan(result.items[1]?.score ?? Infinity);
  });

  it('plural e acento no meio da frase: "reuniao" acha "reunião" e "reuniões"', async () => {
    const result = await run('reuniao');

    expect(result.items.map((item) => item.message.id)).toEqual(
      expect.arrayContaining(['m3', 'm6'])
    );
    expect(result.items.find((item) => item.message.id === 'm6')?.highlights).toEqual([
      'as <mark>reuniões</mark> e as ações da semana',
    ]);
  });

  it('stopword só casa pela forma exata: highlight vem de content.exact', async () => {
    const result = await run('de');

    expect(result.items.map((item) => item.message.id)).toEqual(['m3']);
    expect(result.items[0]?.highlights).toEqual([
      'coracao sem acento; reunião amanhã <mark>de</mark> manhã',
    ]);
  });

  it('filtros por conversa, autor e período', async () => {
    const byConversation = await run('coração', { conversationId: CONV_B });
    const bySender = await run('coração', { senderId: BOB });
    const byPeriod = await run('coração', {
      from: new Date(BASE + 5 * 60_000),
      to: new Date(BASE + 25 * 60_000),
    });

    expect(byConversation.items.map((item) => item.message.id)).toEqual(['m3']);
    expect(bySender.items.map((item) => item.message.id)).toEqual(['m2']);
    expect(byPeriod.items.map((item) => item.message.id).sort()).toEqual(['m2', 'm3']);
  });

  it('mapping strict recusa campo desconhecido', async () => {
    await expect(
      raw.index({ index, id: 'x', document: { messageId: 'x', extra: true } })
    ).rejects.toMatchObject({
      meta: { statusCode: 400, body: { error: { type: 'strict_dynamic_mapping_exception' } } },
    });
  });

  it('apagar remove do índice (ausente não é erro)', async () => {
    await indexer.deleteMessage('m1');
    await indexer.deleteMessage('m1');
    await raw.indices.refresh({ index });

    expect((await run('coração')).items.map((item) => item.message.id).sort()).toEqual([
      'm2',
      'm3',
      'm5',
    ]);
  });

  it('reindex: o MongoDB manda — reindexa a que só saiu do índice e remove as apagadas', async () => {
    current = current.map((item) => (item.id === 'm5' ? { ...item, text: null } : item));

    await expect(indexer.reindexAll()).resolves.toEqual({
      scanned: 6,
      indexed: 5,
      deleted: 1,
      failed: 0,
    });
    await raw.indices.refresh({ index });

    expect((await run('coração')).items.map((item) => item.message.id).sort()).toEqual([
      'm1',
      'm2',
      'm3',
    ]);
    expect((await raw.count({ index })).count).toBe(5);
  });

  it('--recreate apaga e recria o índice', async () => {
    await expect(indexer.reindexAll({ recreate: true })).resolves.toMatchObject({
      scanned: 6,
      indexed: 5,
      deleted: 0,
    });
    await raw.indices.refresh({ index });

    expect((await raw.count({ index })).count).toBe(5);
  });
});
