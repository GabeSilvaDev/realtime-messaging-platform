jest.mock('@/modules/user/services/ContactService', () => ({
  contactService: {},
}));

import type { Request, Response } from 'express';
import { UserController } from '@/modules/user/controllers/UserController';
import type { IContactService } from '@/modules/user/interfaces';
import { HttpStatus } from '@/shared/errors';

const USER_ID = '11111111-1111-4111-8111-111111111111';

function createReq(overrides: Partial<Request> = {}): Request {
  return {
    user: { id: USER_ID, email: 'a@b.com', username: 'user' },
    params: {},
    query: {},
    body: {},
    ...overrides,
  } as unknown as Request;
}

function createRes(): jest.Mocked<Response> {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as jest.Mocked<Response>;
}

describe('UserController', () => {
  const service = { searchUsers: jest.fn() };
  let controller: UserController;
  let res: jest.Mocked<Response>;

  beforeEach(() => {
    service.searchUsers.mockReset();
    controller = new UserController(service as unknown as IContactService);
    res = createRes();
  });

  it('deve usar o contactService padrão quando nenhum service é injetado', () => {
    expect(new UserController()).toBeInstanceOf(UserController);
  });

  it('deve buscar usuários excluindo bloqueados por padrão', async () => {
    const users = [{ id: 'u-2', username: 'ana' }];
    service.searchUsers.mockResolvedValue(users);

    await controller.search(createReq({ query: { query: 'ana' } }), res);

    expect(service.searchUsers).toHaveBeenCalledWith(USER_ID, 'ana', {
      limit: 20,
      excludeBlocked: true,
    });
    expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: users });
  });

  it('deve repassar limit e excludeBlocked=false', async () => {
    service.searchUsers.mockResolvedValue([]);

    await controller.search(
      createReq({ query: { query: 'ana', limit: '5', excludeBlocked: 'false' } }),
      res
    );

    expect(service.searchUsers).toHaveBeenCalledWith(USER_ID, 'ana', {
      limit: 5,
      excludeBlocked: false,
    });
  });

  it('deve responder 400 sem termo de busca', async () => {
    await controller.search(createReq({ query: {} }), res);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(service.searchUsers).not.toHaveBeenCalled();
  });
});
