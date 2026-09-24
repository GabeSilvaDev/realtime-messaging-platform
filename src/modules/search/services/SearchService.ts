import type { estypes } from '@elastic/elasticsearch';
import { ConversationNotFoundException } from '@/modules/chat/errors';
import type { IConversationService, IMessageService } from '@/modules/chat/interfaces';
import { conversationService } from '@/modules/chat/services/ConversationService';
import { messageService } from '@/modules/chat/services/MessageService';
import { elasticsearch } from '@/shared/database/elasticsearch';
import { logger } from '@/shared/logger';
import { SEARCH_CONSTANTS } from '../constants';
import { InvalidSearchRangeException, SearchUnavailableException } from '../errors';
import type { ISearchService } from '../interfaces';
import type {
  ConversationFacet,
  MessageSearchAggregations,
  MessageSearchHit,
  MessageSearchResult,
  SearchClient,
  SearchMessagesParams,
} from '../types';

export interface SearchServiceOptions {
  /** @default o cliente `elasticsearch` da aplicação */
  client?: SearchClient;
  /** @default SEARCH_CONSTANTS.MESSAGES_INDEX */
  index?: string;
  /** Conversas das quais o usuário participa hoje. @default conversationService */
  conversations?: Pick<IConversationService, 'getUserConversationIds'>;
  /** Hidratação no MongoDB. @default messageService */
  messages?: Pick<IMessageService, 'findByIdsForSearch'>;
  /** Relógio em ms para o `tookMs`. @default performance.now */
  now?: () => number;
}

type SearchResponse = estypes.SearchResponse<unknown, MessageSearchAggregations>;

/** A busca é interativa: timeout curto e uma nova tentativa, no máximo (ver SEARCH_CONSTANTS). */
const SEARCH_REQUEST_OPTIONS = {
  requestTimeout: SEARCH_CONSTANTS.SEARCH_REQUEST_TIMEOUT_MS,
  maxRetries: SEARCH_CONSTANTS.SEARCH_MAX_RETRIES,
};

const HIGHLIGHT_FIELD = {
  fragment_size: SEARCH_CONSTANTS.FRAGMENT_SIZE,
  number_of_fragments: SEARCH_CONSTANTS.MAX_FRAGMENTS,
};

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/** Total de acertos: objeto `{ value }` no Elasticsearch 8 (número em `rest_total_hits_as_int`). */
function countHits(total: SearchResponse['hits']['total']): number {
  return typeof total === 'number' ? total : (total?.value ?? 0);
}

/**
 * Busca de mensagens (RF006). Os resultados ficam restritos às conversas das quais o usuário
 * participa NO MOMENTO da busca (filtro `terms` no Elasticsearch e, de novo, na hidratação). O
 * texto devolvido vem do MongoDB (fonte da verdade): documento de mensagem apagada que ainda
 * esteja no índice é descartado.
 */
export class SearchService implements ISearchService {
  private readonly client: SearchClient;
  private readonly index: string;
  private readonly conversations: Pick<IConversationService, 'getUserConversationIds'>;
  private readonly messages: Pick<IMessageService, 'findByIdsForSearch'>;
  private readonly now: () => number;

  constructor({
    client = elasticsearch,
    index = SEARCH_CONSTANTS.MESSAGES_INDEX,
    conversations = conversationService,
    messages = messageService,
    now = performance.now.bind(performance),
  }: SearchServiceOptions = {}) {
    this.client = client;
    this.index = index;
    this.conversations = conversations;
    this.messages = messages;
    this.now = now;
  }

  async searchMessages(userId: string, params: SearchMessagesParams): Promise<MessageSearchResult> {
    const startedAt = this.now();
    if (
      params.from !== undefined &&
      params.to !== undefined &&
      params.from.getTime() > params.to.getTime()
    ) {
      throw new InvalidSearchRangeException();
    }

    const scope = await this.allowedConversations(userId, params.conversationId);
    if (scope.length === 0) {
      return this.result([], 0, [], startedAt);
    }

    const response = await this.query(scope, params);
    const items = await this.hydrate(response.hits.hits, new Set(scope));
    const facets =
      response.aggregations?.conversations.buckets.map((bucket) => ({
        conversationId: bucket.key,
        count: bucket.doc_count,
      })) ?? [];

    return this.result(items, countHits(response.hits.total), facets, startedAt);
  }

  /** Conversas do usuário hoje; com `conversationId`, só ela — ou 404 se ele não participa. */
  private async allowedConversations(userId: string, conversationId?: string): Promise<string[]> {
    const allowed = await this.conversations.getUserConversationIds(userId);
    if (conversationId === undefined) {
      return allowed;
    }
    // Mesma resposta de "conversa não existe": não revela conversas alheias.
    if (!allowed.includes(conversationId)) {
      throw new ConversationNotFoundException();
    }
    return [conversationId];
  }

  private filters(scope: string[], params: SearchMessagesParams): estypes.QueryDslQueryContainer[] {
    const filters: estypes.QueryDslQueryContainer[] = [{ terms: { conversationId: scope } }];
    if (params.senderId !== undefined) {
      filters.push({ term: { senderId: params.senderId } });
    }
    if (params.from !== undefined || params.to !== undefined) {
      filters.push({
        range: {
          createdAt: { gte: params.from?.toISOString(), lte: params.to?.toISOString() },
        },
      });
    }
    return filters;
  }

  private async query(scope: string[], params: SearchMessagesParams): Promise<SearchResponse> {
    try {
      return await this.client.search(
        {
          index: this.index,
          size: params.limit,
          // O texto vem do MongoDB (hidratação); do índice só precisamos de ids, score e highlight.
          _source: false,
          query: {
            bool: {
              must: [
                {
                  multi_match: {
                    query: params.q,
                    type: 'most_fields',
                    // A forma exata da palavra (sem stemmer) pesa o dobro.
                    fields: ['content', 'content.exact^2'],
                  },
                },
              ],
              filter: this.filters(scope, params),
            },
          },
          sort: [{ _score: { order: 'desc' } }, { createdAt: { order: 'desc' } }],
          highlight: {
            // O texto do usuário volta escapado para HTML; só as tags <mark> ficam cruas.
            encoder: 'html',
            pre_tags: [SEARCH_CONSTANTS.HIGHLIGHT_PRE_TAG],
            post_tags: [SEARCH_CONSTANTS.HIGHLIGHT_POST_TAG],
            fields: { content: HIGHLIGHT_FIELD, 'content.exact': HIGHLIGHT_FIELD },
          },
          aggs: {
            conversations: {
              terms: { field: 'conversationId', size: SEARCH_CONSTANTS.FACET_SIZE },
            },
          },
        },
        SEARCH_REQUEST_OPTIONS
      );
    } catch (error) {
      logger.error('Falha na consulta ao Elasticsearch', toError(error), { index: this.index });
      throw new SearchUnavailableException();
    }
  }

  /**
   * Busca as mensagens no MongoDB e monta os itens na ordem do Elasticsearch, descartando as
   * que não voltaram (apagadas) e as de conversas fora do conjunto permitido.
   */
  private async hydrate(
    hits: SearchResponse['hits']['hits'],
    scope: Set<string>
  ): Promise<MessageSearchHit[]> {
    const found = hits.flatMap((hit) => (hit._id === undefined ? [] : [{ id: hit._id, hit }]));
    const messages = await this.messages.findByIdsForSearch(found.map(({ id }) => id));
    const byId = new Map(messages.map((message) => [message.id, message]));

    return found.flatMap(({ id, hit }) => {
      const message = byId.get(id);
      if (message === undefined || !scope.has(message.conversationId)) {
        return [];
      }
      return [
        {
          message,
          // `content` (com stemmer) ou, se o acerto veio só da forma exata, `content.exact`.
          highlights: hit.highlight?.content ?? hit.highlight?.['content.exact'] ?? [],
          score: hit._score ?? 0,
        },
      ];
    });
  }

  private result(
    items: MessageSearchHit[],
    total: number,
    conversations: ConversationFacet[],
    startedAt: number
  ): MessageSearchResult {
    return {
      items,
      total,
      facets: { conversations },
      tookMs: Math.round(this.now() - startedAt),
    };
  }
}

export const searchService = new SearchService();
