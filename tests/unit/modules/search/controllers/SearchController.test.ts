jest.mock('@/modules/search/services/SearchService', () => ({ searchService: {} }));

import type { Request, Response } from 'express';
import { SearchController } from '@/modules/search/controllers/SearchController';
import { HttpStatus, UnauthorizedError } from '@/shared/errors';

const ANA = '11111111-1111-4111-8111-111111111111';
const CONVERSATION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function createReq(overrides: Partial<Request> = {}): Request {
  return {
    user: { id: ANA, email: 'ana@example.com', username: 'ana' },
    query: {},
    ...overrides,
  } as unknown as Request;
}

function createRes(): jest.Mocked<Response> {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as jest.Mocked<Response>;
}

describe('SearchController', () => {
  let search: { searchMessages: jest.Mock };
  let controller: SearchController;
  let res: jest.Mocked<Response>;

  beforeEach(() => {
    search = { searchMessages: jest.fn() };
    controller = new SearchController(search);
    res = createRes();
  });

  it('usa o searchService padrão quando nenhum é injetado', () => {
    expect(new SearchController()).toBeInstanceOf(SearchController);
  });

  it('valida a query e responde { success, data } com o resultado da busca', async () => {
    const result = { items: [], total: 0, facets: { conversations: [] }, tookMs: 3 };
    search.searchMessages.mockResolvedValue(result);

    await controller.searchMessages(
      createReq({
        query: { q: ' coração ', conversationId: CONVERSATION, from: '2026-09-27T00:00:00Z' },
      }),
      res
    );

    expect(search.searchMessages).toHaveBeenCalledWith(ANA, {
      q: 'coração',
      conversationId: CONVERSATION,
      from: new Date('2026-09-27T00:00:00.000Z'),
      limit: 20,
    });
    expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: result });
  });

  it('query inválida → 400 no formato do projeto, sem chamar o service', async () => {
    await controller.searchMessages(createReq({ query: { q: '', limit: '500' } }), res);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Dados inválidos',
      errors: expect.arrayContaining([
        expect.objectContaining({ path: ['q'], message: 'q não pode estar vazio' }),
        expect.objectContaining({ path: ['limit'], message: 'limit deve estar entre 1 e 100' }),
      ]),
    });
    expect(search.searchMessages).not.toHaveBeenCalled();
  });

  it('sem usuário autenticado → UnauthorizedError', async () => {
    await expect(controller.searchMessages(createReq({ user: undefined }), res)).rejects.toThrow(
      UnauthorizedError
    );
  });

  it('erros do service propagam (o errorHandler responde)', async () => {
    search.searchMessages.mockRejectedValue(new Error('boom'));

    await expect(controller.searchMessages(createReq({ query: { q: 'x' } }), res)).rejects.toThrow(
      'boom'
    );
  });
});
