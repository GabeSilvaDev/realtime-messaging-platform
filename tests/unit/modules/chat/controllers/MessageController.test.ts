jest.mock('@/modules/chat/services/MessageService', () => ({
  messageService: {},
}));

import type { Request, Response } from 'express';
import { MessageController } from '@/modules/chat/controllers/MessageController';
import type { IMessageService } from '@/modules/chat/interfaces';
import { HttpStatus } from '@/shared/errors';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const CONVERSATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MESSAGE_ID = '65f000000000000000000001';

function createService(): jest.Mocked<IMessageService> {
  return {
    send: jest.fn(),
    list: jest.fn(),
    delete: jest.fn(),
    markDelivered: jest.fn(),
    markRead: jest.fn(),
    findByIdsForSearch: jest.fn(),
    forEachForIndexing: jest.fn(),
  };
}

function createReq(overrides: Record<string, unknown> = {}): Request {
  return {
    user: { id: USER_A, email: 'a@b.com', username: 'ana' },
    params: { id: CONVERSATION_ID },
    query: {},
    body: {},
    headers: {},
    ip: '127.0.0.1',
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

describe('MessageController', () => {
  let service: jest.Mocked<IMessageService>;
  let controller: MessageController;
  let res: jest.Mocked<Response>;

  beforeEach(() => {
    service = createService();
    controller = new MessageController(service);
    res = createRes();
  });

  it('deve usar o messageService padrão quando nada é injetado', () => {
    expect(new MessageController()).toBeInstanceOf(MessageController);
  });

  describe('list', () => {
    it('deve repassar limit/before e responder 200', async () => {
      const page = { messages: [], nextCursor: null };
      service.list.mockResolvedValue(page);

      await controller.list(createReq({ query: { limit: '2', before: MESSAGE_ID } }), res);

      expect(service.list).toHaveBeenCalledWith(USER_A, CONVERSATION_ID, {
        limit: 2,
        before: MESSAGE_ID,
      });
      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: page });
    });

    it('deve responder 400 para id da conversa ou query inválidos', async () => {
      await controller.list(createReq({ params: { id: 'x' } }), res);
      await controller.list(createReq({ query: { limit: '51' } }), res);

      expect(res.status).toHaveBeenNthCalledWith(1, HttpStatus.BAD_REQUEST);
      expect(res.status).toHaveBeenNthCalledWith(2, HttpStatus.BAD_REQUEST);
      expect(service.list).not.toHaveBeenCalled();
    });
  });

  describe('send', () => {
    it('deve responder 201 repassando ip e user-agent como metadados', async () => {
      const message = { id: MESSAGE_ID };
      service.send.mockResolvedValue(message as never);

      await controller.send(
        createReq({
          body: { text: ' oi ', mentions: [USER_B] },
          headers: { 'user-agent': 'jest-agent' },
        }),
        res
      );

      expect(service.send).toHaveBeenCalledWith(
        USER_A,
        CONVERSATION_ID,
        { text: 'oi', mentions: [USER_B] },
        { ip: '127.0.0.1', device: 'jest-agent' }
      );
      expect(res.status).toHaveBeenCalledWith(HttpStatus.CREATED);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: message });
    });

    it('deve truncar o user-agent em 255 caracteres e aceitar ausência de ip/user-agent', async () => {
      service.send.mockResolvedValue({} as never);

      await controller.send(
        createReq({ body: { text: 'oi' }, headers: { 'user-agent': 'a'.repeat(300) } }),
        res
      );
      await controller.send(createReq({ body: { text: 'oi' }, ip: undefined }), res);

      expect(service.send.mock.calls[0]![3]).toEqual({ ip: '127.0.0.1', device: 'a'.repeat(255) });
      expect(service.send.mock.calls[1]![3]).toEqual({ ip: null, device: null });
    });

    it('deve responder 400 para id da conversa ou corpo inválidos', async () => {
      await controller.send(createReq({ params: { id: 'x' }, body: { text: 'oi' } }), res);
      await controller.send(createReq({ body: { text: '   ' } }), res);

      expect(res.status).toHaveBeenNthCalledWith(1, HttpStatus.BAD_REQUEST);
      expect(res.status).toHaveBeenNthCalledWith(2, HttpStatus.BAD_REQUEST);
      expect(service.send).not.toHaveBeenCalled();
    });
  });

  describe('markRead', () => {
    it('deve marcar como lido até a mensagem e responder 204', async () => {
      service.markRead.mockResolvedValue(undefined);

      await controller.markRead(createReq({ body: { messageId: MESSAGE_ID } }), res);

      expect(service.markRead).toHaveBeenCalledWith(USER_A, CONVERSATION_ID, MESSAGE_ID);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.NO_CONTENT);
      expect(res.send).toHaveBeenCalled();
    });

    it('deve responder 400 para id da conversa ou messageId inválidos', async () => {
      await controller.markRead(
        createReq({ params: { id: 'x' }, body: { messageId: MESSAGE_ID } }),
        res
      );
      await controller.markRead(createReq({ body: { messageId: 'x' } }), res);
      await controller.markRead(createReq({ body: {} }), res);

      expect(res.status).toHaveBeenCalledTimes(3);
      expect(res.status).toHaveBeenNthCalledWith(1, HttpStatus.BAD_REQUEST);
      expect(res.status).toHaveBeenNthCalledWith(2, HttpStatus.BAD_REQUEST);
      expect(res.status).toHaveBeenNthCalledWith(3, HttpStatus.BAD_REQUEST);
      expect(service.markRead).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('deve responder 204', async () => {
      service.delete.mockResolvedValue(undefined);

      await controller.delete(
        createReq({ params: { id: CONVERSATION_ID, messageId: MESSAGE_ID } }),
        res
      );

      expect(service.delete).toHaveBeenCalledWith(USER_A, CONVERSATION_ID, MESSAGE_ID);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.NO_CONTENT);
      expect(res.send).toHaveBeenCalled();
    });

    it('deve responder 400 para messageId inválido', async () => {
      await controller.delete(createReq({ params: { id: CONVERSATION_ID, messageId: 'x' } }), res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(service.delete).not.toHaveBeenCalled();
    });
  });
});
