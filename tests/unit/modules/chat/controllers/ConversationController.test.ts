jest.mock('@/modules/chat/services/ConversationService', () => ({
  conversationService: {},
}));

import type { Request, Response } from 'express';
import { ConversationController } from '@/modules/chat/controllers/ConversationController';
import type { IConversationService } from '@/modules/chat/interfaces';
import { HttpStatus, UnauthorizedError } from '@/shared/errors';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const CONVERSATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DTO = { id: CONVERSATION_ID };

function createService(): jest.Mocked<IConversationService> {
  return {
    createDirect: jest.fn(),
    createGroup: jest.fn(),
    list: jest.fn(),
    get: jest.fn(),
    rename: jest.fn(),
    archive: jest.fn(),
    unarchive: jest.fn(),
    leave: jest.fn(),
    addMembers: jest.fn(),
    removeMember: jest.fn(),
    isParticipant: jest.fn(),
    getParticipantIds: jest.fn(),
    getUserConversationIds: jest.fn(),
    getTypeForParticipant: jest.fn(),
    getDirectPartnerIds: jest.fn(),
  };
}

function createReq(overrides: Partial<Request> = {}): Request {
  return {
    user: { id: USER_A, email: 'a@b.com', username: 'ana' },
    params: {},
    query: {},
    body: {},
    headers: {},
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

describe('ConversationController', () => {
  let service: jest.Mocked<IConversationService>;
  let controller: ConversationController;
  let res: jest.Mocked<Response>;

  beforeEach(() => {
    service = createService();
    controller = new ConversationController(service);
    res = createRes();
  });

  it('deve usar o conversationService padrão quando nada é injetado', () => {
    expect(new ConversationController()).toBeInstanceOf(ConversationController);
  });

  it('deve propagar 401 quando não há usuário autenticado', async () => {
    await expect(controller.list(createReq({ user: undefined }), res)).rejects.toThrow(
      UnauthorizedError
    );
  });

  describe('createDirect', () => {
    it('deve responder 201 quando a conversa foi criada', async () => {
      service.createDirect.mockResolvedValue({ conversation: DTO as never, created: true });

      await controller.createDirect(createReq({ body: { userId: USER_B } }), res);

      expect(service.createDirect).toHaveBeenCalledWith(USER_A, USER_B);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.CREATED);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: DTO });
    });

    it('deve responder 200 quando a conversa já existia', async () => {
      service.createDirect.mockResolvedValue({ conversation: DTO as never, created: false });

      await controller.createDirect(createReq({ body: { userId: USER_B } }), res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
    });

    it('deve responder 400 para userId inválido', async () => {
      await controller.createDirect(createReq({ body: { userId: 'x' } }), res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(service.createDirect).not.toHaveBeenCalled();
    });
  });

  describe('createGroup', () => {
    it('deve responder 201 com o grupo criado', async () => {
      service.createGroup.mockResolvedValue(DTO as never);

      await controller.createGroup(
        createReq({ body: { name: ' Time ', participantIds: [USER_B] } }),
        res
      );

      expect(service.createGroup).toHaveBeenCalledWith(USER_A, {
        name: 'Time',
        participantIds: [USER_B],
      });
      expect(res.status).toHaveBeenCalledWith(HttpStatus.CREATED);
    });

    it('deve responder 400 para corpo inválido', async () => {
      await controller.createGroup(createReq({ body: { name: '' } }), res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    });
  });

  describe('list', () => {
    it('deve converter a query e responder 200', async () => {
      const page = { items: [], total: 0, limit: 5, offset: 0, hasMore: false };
      service.list.mockResolvedValue(page);

      await controller.list(createReq({ query: { archived: 'true', limit: '5' } }), res);

      expect(service.list).toHaveBeenCalledWith(USER_A, { archived: true, limit: 5, offset: 0 });
      expect(res.json).toHaveBeenCalledWith({ success: true, data: page });
    });

    it('deve responder 400 para query inválida', async () => {
      await controller.list(createReq({ query: { limit: '0' } }), res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    });
  });

  describe('get', () => {
    it('deve responder 200 com a conversa', async () => {
      service.get.mockResolvedValue(DTO as never);

      await controller.get(createReq({ params: { id: CONVERSATION_ID } }), res);

      expect(service.get).toHaveBeenCalledWith(USER_A, CONVERSATION_ID);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
    });

    it('deve responder 400 para id inválido', async () => {
      await controller.get(createReq({ params: { id: 'x' } }), res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(service.get).not.toHaveBeenCalled();
    });
  });

  describe('rename', () => {
    it('deve responder 200 com a conversa renomeada', async () => {
      service.rename.mockResolvedValue(DTO as never);

      await controller.rename(
        createReq({ params: { id: CONVERSATION_ID }, body: { name: 'Novo' } }),
        res
      );

      expect(service.rename).toHaveBeenCalledWith(USER_A, CONVERSATION_ID, 'Novo');
      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
    });

    it('deve responder 400 para id ou nome inválidos', async () => {
      await controller.rename(createReq({ params: { id: 'x' }, body: { name: 'Novo' } }), res);
      await controller.rename(createReq({ params: { id: CONVERSATION_ID }, body: {} }), res);

      expect(res.status).toHaveBeenCalledTimes(2);
      expect(res.status).toHaveBeenNthCalledWith(1, HttpStatus.BAD_REQUEST);
      expect(res.status).toHaveBeenNthCalledWith(2, HttpStatus.BAD_REQUEST);
      expect(service.rename).not.toHaveBeenCalled();
    });
  });

  describe.each(['archive', 'unarchive', 'leave'] as const)('%s', (method) => {
    it('deve responder 204', async () => {
      service[method].mockResolvedValue(undefined);

      await controller[method](createReq({ params: { id: CONVERSATION_ID } }), res);

      expect(service[method]).toHaveBeenCalledWith(USER_A, CONVERSATION_ID);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.NO_CONTENT);
      expect(res.send).toHaveBeenCalled();
    });

    it('deve responder 400 para id inválido', async () => {
      await controller[method](createReq({ params: { id: 'x' } }), res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(service[method]).not.toHaveBeenCalled();
    });
  });

  describe('addMembers', () => {
    it('deve responder 200 com a conversa atualizada', async () => {
      service.addMembers.mockResolvedValue(DTO as never);

      await controller.addMembers(
        createReq({ params: { id: CONVERSATION_ID }, body: { userIds: [USER_B] } }),
        res
      );

      expect(service.addMembers).toHaveBeenCalledWith(USER_A, CONVERSATION_ID, [USER_B]);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
    });

    it('deve responder 400 para id ou corpo inválidos', async () => {
      await controller.addMembers(
        createReq({ params: { id: 'x' }, body: { userIds: [USER_B] } }),
        res
      );
      await controller.addMembers(
        createReq({ params: { id: CONVERSATION_ID }, body: { userIds: [] } }),
        res
      );

      expect(res.status).toHaveBeenNthCalledWith(1, HttpStatus.BAD_REQUEST);
      expect(res.status).toHaveBeenNthCalledWith(2, HttpStatus.BAD_REQUEST);
      expect(service.addMembers).not.toHaveBeenCalled();
    });
  });

  describe('removeMember', () => {
    it('deve responder 204', async () => {
      service.removeMember.mockResolvedValue(undefined);

      await controller.removeMember(
        createReq({ params: { id: CONVERSATION_ID, userId: USER_B } }),
        res
      );

      expect(service.removeMember).toHaveBeenCalledWith(USER_A, CONVERSATION_ID, USER_B);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.NO_CONTENT);
    });

    it('deve responder 400 para params inválidos', async () => {
      await controller.removeMember(
        createReq({ params: { id: CONVERSATION_ID, userId: 'x' } }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    });
  });
});
