jest.mock('@/shared/database/redis', () => ({ redis: {} }));
jest.mock('@/shared/database/elasticsearch', () => ({ elasticsearch: {} }));

import * as searchModule from '@/modules/search';

describe('search module index', () => {
  it('deve exportar constantes, erros e validação', () => {
    expect(searchModule.SEARCH_CONSTANTS.MAX_LIMIT).toBe(100);
    expect(searchModule.resolveMessagesIndex({})).toBe('messages');
    expect(searchModule.MESSAGES_INDEX_SETTINGS).toBeDefined();
    expect(searchModule.MESSAGES_INDEX_MAPPINGS).toBeDefined();
    expect(new searchModule.SearchUnavailableException().statusCode).toBe(503);
    expect(new searchModule.InvalidSearchRangeException().statusCode).toBe(400);
    expect(searchModule.searchMessagesQuerySchema).toBeDefined();
  });

  it('deve exportar os services e as instâncias padrão', () => {
    expect(searchModule.searchIndexService).toBeInstanceOf(searchModule.SearchIndexService);
    expect(searchModule.searchService).toBeInstanceOf(searchModule.SearchService);
  });

  it('deve exportar o MessageIndexer, o controller e as rotas', () => {
    expect(searchModule.registerSearchIndexListeners).toBeInstanceOf(Function);
    expect(searchModule.searchController).toBeInstanceOf(searchModule.SearchController);
    expect(searchModule.searchRoutes).toBeDefined();
    expect(searchModule.createSearchRoutes).toBeInstanceOf(Function);
    expect(searchModule.createSearchRateLimiter).toBeInstanceOf(Function);
  });

  it('deve exportar o comando de reindex', () => {
    expect(searchModule.runReindex).toBeInstanceOf(Function);
  });
});
