import type { estypes, TransportRequestOptions } from '@elastic/elasticsearch';
import type { MessageDTO } from '@/modules/chat/types';

/** Documento do índice de mensagens (`_id` = `messageId`). Apagadas não ficam no índice. */
export interface MessageDocument {
  messageId: string;
  conversationId: string;
  senderId: string;
  content: string;
  /** ISO 8601. */
  createdAt: string;
}

/** Agregações pedidas pela busca (facetas por conversa). */
export interface MessageSearchAggregations {
  conversations: { buckets: { key: string; doc_count: number }[] };
}

/**
 * A parte do cliente `@elastic/elasticsearch` que a busca usa. O `Client` real satisfaz esta
 * interface (não é um `Pick<Client, ...>`: os métodos do `Client` declaram `this` com o
 * `transport`, e um objeto só com os métodos não poderia chamá-los). Os testes injetam o
 * `FakeSearchClient` (`tests/support/elasticsearch`).
 */
export interface SearchClient {
  indices: {
    exists(params: estypes.IndicesExistsRequest): Promise<boolean>;
    create(params: estypes.IndicesCreateRequest): Promise<estypes.IndicesCreateResponse>;
    delete(params: estypes.IndicesDeleteRequest): Promise<estypes.IndicesDeleteResponse>;
  };
  index(params: estypes.IndexRequest<MessageDocument>): Promise<estypes.IndexResponse>;
  delete(
    params: estypes.DeleteRequest,
    options?: TransportRequestOptions
  ): Promise<estypes.DeleteResponse>;
  bulk(params: estypes.BulkRequest<MessageDocument>): Promise<estypes.BulkResponse>;
  search(
    params: estypes.SearchRequest,
    options?: TransportRequestOptions
  ): Promise<estypes.SearchResponse<unknown, MessageSearchAggregations>>;
}

/** Parâmetros já validados de `GET /api/search/messages`. */
export interface SearchMessagesParams {
  q: string;
  conversationId?: string;
  senderId?: string;
  from?: Date;
  to?: Date;
  limit: number;
}

export interface MessageSearchHit {
  message: MessageDTO;
  /** Fragmentos com `<mark>…</mark>`; o texto do usuário vem escapado para HTML. */
  highlights: string[];
  score: number;
}

export interface ConversationFacet {
  conversationId: string;
  count: number;
}

export interface MessageSearchResult {
  items: MessageSearchHit[];
  /** Acertos no Elasticsearch (limitado a 10 000 pelo `track_total_hits` padrão). */
  total: number;
  facets: { conversations: ConversationFacet[] };
  /** Tempo total da busca no servidor (conversas + Elasticsearch + hidratação), em ms. */
  tookMs: number;
}

export interface ReindexOptions {
  /** Apaga e recria o índice antes (mudança de mapping/analyzer). */
  recreate?: boolean;
}

export interface ReindexResult {
  /** Mensagens percorridas no MongoDB (apagadas inclusive). */
  scanned: number;
  indexed: number;
  /** Apagadas removidas do índice (as que já não estavam lá não contam). */
  deleted: number;
  /** Itens do `bulk` que falharam (cada um logado com o `messageId`). */
  failed: number;
}
