jest.mock('@/modules/user/services/ContactService', () => ({
  contactService: {},
}));

import type { Request, Response } from 'express';
import { BlockController } from '@/modules/user/controllers/BlockController';
import type { IContactService } from '@/modules/user/interfaces';
import { HttpStatus } from '@/shared/errors';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const TARGET_ID = '33333333-3333-4333-8333-333333333333';

function createService(): jest.Mocked<
  Pick<IContactService, 'blockUser' | 'unblockUser' | 'listBlocked'>
> {
  return {
    blockUser: jest.fn(),
    unblockUser: jest.fn(),
    listBlocked: jest.fn(),
  };
}

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
    send: jest.fn().mockReturnThis(),
  } as unknown as jest.Mocked<Response>;
}

describe('BlockController', () => {
  let service: ReturnType<typeof createService>;
  let controller: BlockController;
  let res: jest.Mocked<Response>;

  beforeEach(() => {
    service = createService();
    controller = new BlockController(service as unknown as IContactService);
    res = createRes();
  });

  it('deve usar o contactService padrão quando nenhum service é injetado', () => {
    expect(new BlockController()).toBeInstanceOf(BlockController);
  });

  describe('list', () => {
    it('deve listar usuários bloqueados', async () => {
      service.listBlocked.mockResolvedValue([]);

      await controller.list(createReq(), res);

      expect(service.listBlocked).toHaveBeenCalledWith(USER_ID);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: [] });
    });
  });

  describe('block', () => {
    it('deve bloquear e responder 201', async () => {
      service.blockUser.mockResolvedValue(undefined);

      await controller.block(createReq({ body: { userId: TARGET_ID } }), res);

      expect(service.blockUser).toHaveBeenCalledWith(USER_ID, TARGET_ID);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.CREATED);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Usuário bloqueado com sucesso',
      });
    });

    it('deve responder 400 com userId inválido', async () => {
      await controller.block(createReq({ body: { userId: 'x' } }), res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(service.blockUser).not.toHaveBeenCalled();
    });

    it('deve propagar exceções do service', async () => {
      service.blockUser.mockRejectedValue(new Error('falhou'));

      await expect(
        controller.block(createReq({ body: { userId: TARGET_ID } }), res)
      ).rejects.toThrow('falhou');
    });
  });

  describe('unblock', () => {
    it('deve desbloquear e responder 204', async () => {
      service.unblockUser.mockResolvedValue(undefined);

      await controller.unblock(createReq({ params: { userId: TARGET_ID } }), res);

      expect(service.unblockUser).toHaveBeenCalledWith(USER_ID, TARGET_ID);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.NO_CONTENT);
      expect(res.send).toHaveBeenCalled();
    });

    it('deve responder 400 com userId inválido', async () => {
      await controller.unblock(createReq({ params: { userId: 'x' } }), res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(service.unblockUser).not.toHaveBeenCalled();
    });
  });
});
