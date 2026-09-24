// Elasticsearch em memória para os testes da busca. Não é arquivo de teste (não casa com
// testMatch). Implementa SÓ as chamadas que a busca usa (`indices.exists/create/delete/
// putIndexTemplate`, `index`, `delete`, `bulk`, `search`), com as mesmas formas de resposta e de
// erro do Elasticsearch 8.17 (conferidas contra um servidor real): `resource_already_exists_exception`
// (400) ao recriar o índice, `index_not_found_exception` (404), `strict_dynamic_mapping_exception`
// (400) para campo fora do mapping, `delete` de documento ausente com `result: 'not_found'` (404,
// ou resposta normal com `{ ignore: [404] }`) e, no `bulk`, erro item a item.
//
// Mapping e criação automática (como no 8.17 com `action.auto_create_index: true`, o padrão): o
// índice guarda o mapping com que foi criado — o do `indices.create` ou, sem ele, o do template de
// maior prioridade cujo `index_patterns` casa com o nome (`*` como curinga). Uma escrita (`index`
// ou `bulk`) num índice ausente o cria na hora, com o mapping desse template; sem template, o
// índice nasce dinâmico (`mappingOf` → `undefined`) e aceita qualquer campo — no Elasticsearch
// real, com `conversationId` como `text` e sem o analyzer. O índice é criado mesmo que o documento
// seja recusado em seguida. Só o `dynamic: 'strict'` é avaliado (campo fora de `properties` → 400).
//
// A `search` NÃO reproduz o analyzer: casa palavras inteiras sem acento e sem caixa (sem stemmer),
// ordena por número de palavras encontradas e depois `createdAt` desc, aplica os filtros `terms`/
// `term`/`range` e devolve highlight/agregação no formato do Elasticsearch. A semântica real do
// analyzer (stemmer, plural, stopwords) é provada no teste de integração opcional e no smoke.
// Para controlar a resposta, preencha `searchResponse`.
import type { estypes, TransportRequestOptions } from '@elastic/elasticsearch';
import type {
  MessageDocument,
  MessageSearchAggregations,
  SearchClient,
} from '@/modules/search/types';

export interface FakeCall {
  method: string;
  params: unknown;
  options?: unknown;
}

interface ErrorBody {
  error?: { type: string; reason: string };
  [key: string]: unknown;
}

/** Mesmo formato que o código inspeciona no `ResponseError` do cliente (`meta.statusCode/body`). */
export class FakeResponseError extends Error {
  override readonly name = 'ResponseError';
  readonly meta: { statusCode: number; body: ErrorBody };

  constructor(statusCode: number, body: ErrorBody) {
    super(body.error?.type ?? `HTTP ${String(statusCode)}`);
    this.meta = { statusCode, body };
  }
}

type BulkItem = Partial<Record<'index' | 'delete', estypes.BulkResponseItem>>;

interface BoolQuery {
  must: { multi_match: { query: string } }[];
  filter: estypes.QueryDslQueryContainer[];
}

function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function words(text: string): string[] {
  return fold(text)
    .split(/[^a-z0-9]+/)
    .filter((word) => word !== '');
}

/** O mesmo escape do `encoder: 'html'` do Elasticsearch. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

function highlight(content: string, terms: string[], pre: string, post: string): string {
  return content
    .split(/(\s+)/)
    .map((part) =>
      words(part).some((word) => terms.includes(word))
        ? `${pre}${escapeHtml(part)}${post}`
        : escapeHtml(part)
    )
    .join('');
}

/** `*` casa com qualquer sequência; o resto, literal. */
function matchesPattern(index: string, pattern: string): boolean {
  const source = pattern
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${source}$`).test(index);
}

function strictViolation(
  document: Record<string, unknown>,
  mapping: estypes.MappingTypeMapping | undefined
): FakeResponseError | null {
  if (mapping?.dynamic !== 'strict') {
    return null;
  }
  const allowed = Object.keys(mapping.properties ?? {});
  const extra = Object.keys(document).find((key) => !allowed.includes(key));
  return extra === undefined
    ? null
    : new FakeResponseError(400, {
        error: {
          type: 'strict_dynamic_mapping_exception',
          reason: `mapping set to strict, dynamic introduction of [${extra}] within [_doc] is not allowed`,
        },
      });
}

export class FakeSearchClient implements SearchClient {
  private readonly store = new Map<string, Map<string, MessageDocument>>();
  private readonly versions = new Map<string, number>();
  /** Mapping de cada índice existente (`undefined` = dinâmico). */
  private readonly mappings = new Map<string, estypes.MappingTypeMapping | undefined>();
  private readonly templates = new Map<string, estypes.IndicesPutIndexTemplateRequest>();

  /** Toda chamada registrada, na ordem. */
  readonly calls: FakeCall[] = [];

  /** Quando preenchido, toda chamada rejeita com este erro (Elasticsearch fora do ar). */
  failWith: Error | null = null;

  /** Quando preenchido, `search` devolve esta resposta em vez de avaliar a consulta. */
  searchResponse: estypes.SearchResponse<unknown, MessageSearchAggregations> | null = null;

  /** Ids cujos itens do `bulk` falham com `es_rejected_execution_exception` (429). */
  readonly failingBulkIds = new Set<string>();

  readonly indices = {
    exists: async (params: estypes.IndicesExistsRequest): Promise<boolean> => {
      this.record('indices.exists', params);
      return this.store.has(String(params.index));
    },
    create: async (
      params: estypes.IndicesCreateRequest
    ): Promise<estypes.IndicesCreateResponse> => {
      this.record('indices.create', params);
      if (this.store.has(params.index)) {
        throw new FakeResponseError(400, {
          error: {
            type: 'resource_already_exists_exception',
            reason: `index [${params.index}] already exists`,
          },
        });
      }
      this.createIndex(params.index, params.mappings ?? this.templateMappings(params.index));
      return { acknowledged: true, shards_acknowledged: true, index: params.index };
    },
    delete: async (
      params: estypes.IndicesDeleteRequest
    ): Promise<estypes.IndicesDeleteResponse> => {
      this.record('indices.delete', params);
      const index = String(params.index);
      this.mappings.delete(index);
      if (!this.store.delete(index) && params.ignore_unavailable !== true) {
        throw new FakeResponseError(404, {
          error: { type: 'index_not_found_exception', reason: `no such index [${index}]` },
        });
      }
      return { acknowledged: true };
    },
    putIndexTemplate: async (
      params: estypes.IndicesPutIndexTemplateRequest
    ): Promise<estypes.IndicesPutIndexTemplateResponse> => {
      this.record('indices.putIndexTemplate', params);
      this.templates.set(params.name, params);
      return { acknowledged: true };
    },
  };

  /** O cliente como o código da busca o enxerga. */
  get client(): SearchClient {
    return this;
  }

  /** Documentos do índice (vazio se o índice não existe), em ordem de inserção. */
  documents(index: string): MessageDocument[] {
    return [...(this.store.get(index)?.values() ?? [])];
  }

  hasIndex(index: string): boolean {
    return this.store.has(index);
  }

  /** Mapping com que o índice foi criado; `undefined` se é dinâmico (ou não existe). */
  mappingOf(index: string): estypes.MappingTypeMapping | undefined {
    return this.mappings.get(index);
  }

  /** Chamadas de um método (`'search'`, `'bulk'`, `'indices.create'`, ...). */
  callsOf(method: string): FakeCall[] {
    return this.calls.filter((call) => call.method === method);
  }

  reset(): void {
    this.store.clear();
    this.versions.clear();
    this.mappings.clear();
    this.templates.clear();
    this.calls.length = 0;
    this.failWith = null;
    this.searchResponse = null;
    this.failingBulkIds.clear();
  }

  async index(params: estypes.IndexRequest<MessageDocument>): Promise<estypes.IndexResponse> {
    this.record('index', params);
    const document = params.document as MessageDocument;
    const docs = this.indexStore(params.index);
    const violation = strictViolation(
      document as unknown as Record<string, unknown>,
      this.mappings.get(params.index)
    );
    if (violation !== null) {
      throw violation;
    }
    const id = String(params.id);
    const versionKey = `${params.index}:${id}`;
    const hadDoc = docs.has(id);
    docs.set(id, { ...document });
    const version = (this.versions.get(versionKey) ?? 0) + 1;
    this.versions.set(versionKey, version);
    return {
      _index: params.index,
      _id: id,
      _version: version,
      result: hadDoc ? 'updated' : 'created',
      _shards: { total: 1, successful: 1, failed: 0 },
    };
  }

  async delete(
    params: estypes.DeleteRequest,
    options?: TransportRequestOptions
  ): Promise<estypes.DeleteResponse> {
    this.record('delete', params, options);
    const deleted = this.store.get(params.index)?.delete(params.id) ?? false;
    const versionKey = `${params.index}:${params.id}`;
    const version = (this.versions.get(versionKey) ?? 0) + 1;
    this.versions.set(versionKey, version);
    const response = {
      _index: params.index,
      _id: params.id,
      _version: version,
      result: deleted ? ('deleted' as const) : ('not_found' as const),
      _shards: { total: 1, successful: 1, failed: 0 },
    };
    const ignore = (options?.ignore as number[]) ?? [];
    if (!deleted && !ignore.includes(404)) {
      throw new FakeResponseError(404, response);
    }
    return response;
  }

  async bulk(
    params: estypes.BulkRequest<MessageDocument>
  ): Promise<Pick<estypes.BulkResponse, 'errors' | 'items' | 'took'>> {
    this.record('bulk', params);
    const operations = [...(params.operations ?? [])] as Record<string, unknown>[];
    const items: BulkItem[] = [];
    while (operations.length > 0) {
      const action = operations.shift() as Record<string, { _index: string; _id: string }>;
      if ('index' in action) {
        const { _index, _id } = action.index as { _index: string; _id: string };
        const document = operations.shift() as unknown as MessageDocument;
        items.push({ index: this.bulkIndex(_index, _id, document) });
      } else {
        const { _index, _id } = action.delete as { _index: string; _id: string };
        items.push({ delete: this.bulkDelete(_index, _id) });
      }
    }
    const errors = items.some((item) => (item.index ?? item.delete)?.error !== undefined);
    return { took: 1, errors, items: items as estypes.BulkResponse['items'] };
  }

  async search(
    params: estypes.SearchRequest,
    options?: TransportRequestOptions
  ): Promise<estypes.SearchResponse<unknown, MessageSearchAggregations>> {
    this.record('search', params, options);
    if (this.searchResponse !== null) {
      return this.searchResponse;
    }
    const index = String(params.index);
    const docs = this.store.get(index);
    if (docs === undefined) {
      throw new FakeResponseError(404, {
        error: { type: 'index_not_found_exception', reason: `no such index [${index}]` },
      });
    }

    const bool = (params.query as { bool: BoolQuery }).bool;
    const terms = words(bool.must[0]?.multi_match.query ?? '');
    const matches = [...docs.values()]
      .filter((doc) => bool.filter.every((filter) => this.passes(doc, filter)))
      .map((doc) => ({ doc, score: words(doc.content).filter((w) => terms.includes(w)).length }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || b.doc.createdAt.localeCompare(a.doc.createdAt));

    const tags = params.highlight as { pre_tags: string[]; post_tags: string[] };
    const pre = tags.pre_tags[0] ?? '<em>';
    const post = tags.post_tags[0] ?? '</em>';
    const facetSize = (params.aggs as { conversations: { terms: { size: number } } }).conversations
      .terms.size;
    const includeSource = params._source !== false;

    const hits = matches.slice(0, params.size ?? 10).map(({ doc, score }) => {
      const hit: estypes.SearchHit<unknown> = {
        _index: index,
        _id: doc.messageId,
        _score: score,
        highlight: { content: [highlight(doc.content, terms, pre, post)] },
        sort: [score, Date.parse(doc.createdAt)],
      };
      if (includeSource) {
        hit._source = doc;
      }
      return hit;
    });

    const response: estypes.SearchResponse<unknown, MessageSearchAggregations> = {
      took: 1,
      timed_out: false,
      _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
      hits: {
        total: { value: matches.length, relation: 'eq' },
        max_score: matches[0]?.score ?? null,
        hits,
      },
      aggregations: {
        conversations: {
          buckets: this.countByConversation(matches.map(({ doc }) => doc)).slice(0, facetSize),
        },
      },
    };
    return response;
  }

  private record(method: string, params: unknown, options?: unknown): void {
    this.calls.push(options === undefined ? { method, params } : { method, params, options });
    if (this.failWith !== null) {
      throw this.failWith;
    }
  }

  private createIndex(
    index: string,
    mapping: estypes.MappingTypeMapping | undefined
  ): Map<string, MessageDocument> {
    const docs = new Map<string, MessageDocument>();
    this.store.set(index, docs);
    this.mappings.set(index, mapping);
    return docs;
  }

  /** Mapping do template de maior prioridade que casa com o índice (`undefined` se nenhum). */
  private templateMappings(index: string): estypes.MappingTypeMapping | undefined {
    const [best] = [...this.templates.values()]
      .filter((template) =>
        [template.index_patterns ?? []].flat().some((pattern) => matchesPattern(index, pattern))
      )
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    return best?.template?.mappings;
  }

  /** Como no Elasticsearch, escrever num índice inexistente o cria (com o template, se houver). */
  private indexStore(index: string): Map<string, MessageDocument> {
    return this.store.get(index) ?? this.createIndex(index, this.templateMappings(index));
  }

  private bulkIndex(
    index: string,
    id: string,
    document: MessageDocument
  ): estypes.BulkResponseItem {
    const docs = this.indexStore(index);
    const violation = this.failingBulkIds.has(id)
      ? new FakeResponseError(429, {
          error: { type: 'es_rejected_execution_exception', reason: 'fila de escrita cheia' },
        })
      : strictViolation(document as unknown as Record<string, unknown>, this.mappings.get(index));
    if (violation !== null) {
      return {
        _index: index,
        _id: id,
        status: violation.meta.statusCode,
        error: violation.meta.body.error,
      };
    }
    const versionKey = `${index}:${id}`;
    const hadDoc = docs.has(id);
    docs.set(id, { ...document });
    const version = (this.versions.get(versionKey) ?? 0) + 1;
    this.versions.set(versionKey, version);
    const status = hadDoc ? 200 : 201;
    return {
      _index: index,
      _id: id,
      status,
      result: status === 201 ? 'created' : 'updated',
      _version: version,
    };
  }

  private bulkDelete(index: string, id: string): estypes.BulkResponseItem {
    const deleted = this.store.get(index)?.delete(id) ?? false;
    return deleted
      ? { _index: index, _id: id, status: 200, result: 'deleted' }
      : { _index: index, _id: id, status: 404, result: 'not_found' };
  }

  private passes(doc: MessageDocument, filter: estypes.QueryDslQueryContainer): boolean {
    if (filter.terms !== undefined) {
      const values = (filter.terms as { conversationId: string[] }).conversationId;
      return values.includes(doc.conversationId);
    }
    if (filter.term !== undefined) {
      return (filter.term as { senderId: string }).senderId === doc.senderId;
    }
    const range = (filter.range as { createdAt: { gte?: string; lte?: string } }).createdAt;
    const at = Date.parse(doc.createdAt);
    return (
      (range.gte === undefined || at >= Date.parse(range.gte)) &&
      (range.lte === undefined || at <= Date.parse(range.lte))
    );
  }

  private countByConversation(docs: MessageDocument[]): { key: string; doc_count: number }[] {
    const counts = new Map<string, number>();
    for (const doc of docs) {
      counts.set(doc.conversationId, (counts.get(doc.conversationId) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([key, doc_count]) => ({ key, doc_count }))
      .sort((a, b) => b.doc_count - a.doc_count || a.key.localeCompare(b.key));
  }
}
