import type { MessageSearchResult, SearchMessagesParams } from '../types';

export interface ISearchService {
  /**
   * Busca full-text nas mensagens das conversas das quais `userId` participa no momento da
   * busca, em ordem de relevância (empate: mais recentes primeiro), com highlight e facetas.
   *
   * @throws InvalidSearchRangeException (400) — `from` depois de `to`
   * @throws ConversationNotFoundException (404) — `conversationId` de conversa da qual não participa
   * @throws SearchUnavailableException (503) — Elasticsearch fora do ar
   */
  searchMessages(userId: string, params: SearchMessagesParams): Promise<MessageSearchResult>;
}
