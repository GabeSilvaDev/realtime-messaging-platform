jest.mock('@/modules/user/services/ContactService', () => ({
  contactService: {},
}));

import type { Request, Response } from 'express';
import { ContactController } from '@/modules/user/controllers/ContactController';
import type { IContactService } from '@/modules/user/interfaces';
import { HttpStatus, UnauthorizedError } from '@/shared/errors';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const CONTACT_ID = '22222222-2222-4222-8222-222222222222';

function createService(): jest.Mocked<IContactService> {
  return {
    addContact: jest.fn(),
    updateContact: jest.fn(),
    removeContact: jest.fn(),
    getContact: jest.fn(),
    listContacts: jest.fn(),
    listFavorites: jest.fn(),
    setFavorite: jest.fn(),
    setNickname: jest.fn(),
    blockUser: jest.fn(),
    unblockUser: jest.fn(),
    listBlocked: jest.fn(),
    isBlocked: jest.fn(),
    isBlockedByEither: jest.fn(),
    isContact: jest.fn(),
    getStats: jest.fn(),
    searchUsers: jest.fn(),
    recordInteraction: jest.fn(),
    listWatchers: jest.fn(),
    listContactIds: jest.fn(),
    listBlockedEitherIds: jest.fn(),
    getContactsByIds: jest.fn(),
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

describe('ContactController', () => {
  let service: jest.Mocked<IContactService>;
  let controller: ContactController;
  let res: jest.Mocked<Response>;

  beforeEach(() => {
    service = createService();
    controller = new ContactController(service);
    res = createRes();
  });

  it('deve usar o contactService padrão quando nenhum service é injetado', () => {
    expect(new ContactController()).toBeInstanceOf(ContactController);
  });

  describe('list', () => {
    it('deve listar contatos mapeando query para ContactListOptions', async () => {
      const page = { contacts: [], total: 0, limit: 10, offset: 5, hasMore: false };
      service.listContacts.mockResolvedValue(page);

      await controller.list(
        createReq({
          query: {
            search: 'ana',
            isFavorite: 'true',
            isBlocked: 'false',
            limit: '10',
            offset: '5',
            orderBy: 'nickname',
            order: 'ASC',
          },
        }),
        res
      );

      expect(service.listContacts).toHaveBeenCalledWith(USER_ID, {
        filters: { search: 'ana', isFavorite: true, isBlocked: false },
        limit: 10,
        offset: 5,
        orderBy: 'nickname',
        order: 'ASC',
      });
      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: page });
    });

    it('deve aplicar defaults quando query é vazia', async () => {
      service.listContacts.mockResolvedValue({
        contacts: [],
        total: 0,
        limit: 20,
        offset: 0,
        hasMore: false,
      });

      await controller.list(createReq(), res);

      expect(service.listContacts).toHaveBeenCalledWith(USER_ID, {
        filters: { search: undefined, isFavorite: undefined, isBlocked: undefined },
        limit: 20,
        offset: 0,
        orderBy: 'createdAt',
        order: 'DESC',
      });
    });

    it('deve responder 400 com query inválida', async () => {
      await controller.list(createReq({ query: { limit: '0' } }), res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(service.listContacts).not.toHaveBeenCalled();
    });

    it('deve lançar UnauthorizedError sem usuário autenticado', async () => {
      await expect(controller.list(createReq({ user: undefined }), res)).rejects.toThrow(
        UnauthorizedError
      );
    });
  });

  describe('add', () => {
    it('deve adicionar contato e responder 201', async () => {
      const contact = { id: 'c-1' } as never;
      service.addContact.mockResolvedValue(contact);

      await controller.add(createReq({ body: { contactId: CONTACT_ID, nickname: 'Ana' } }), res);

      expect(service.addContact).toHaveBeenCalledWith(USER_ID, {
        contactId: CONTACT_ID,
        nickname: 'Ana',
      });
      expect(res.status).toHaveBeenCalledWith(HttpStatus.CREATED);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: contact,
        message: 'Contato adicionado com sucesso',
      });
    });

    it('deve responder 400 com body inválido', async () => {
      await controller.add(createReq({ body: { contactId: 'invalido' } }), res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(service.addContact).not.toHaveBeenCalled();
    });

    it('deve propagar exceções do service', async () => {
      service.addContact.mockRejectedValue(new Error('falhou'));

      await expect(
        controller.add(createReq({ body: { contactId: CONTACT_ID } }), res)
      ).rejects.toThrow('falhou');
    });
  });

  describe('listFavorites', () => {
    it('deve listar favoritos', async () => {
      service.listFavorites.mockResolvedValue([]);

      await controller.listFavorites(createReq(), res);

      expect(service.listFavorites).toHaveBeenCalledWith(USER_ID);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: [] });
    });
  });

  describe('stats', () => {
    it('deve retornar estatísticas', async () => {
      const stats = { total: 3, favorites: 1, blocked: 1 };
      service.getStats.mockResolvedValue(stats);

      await controller.stats(createReq(), res);

      expect(service.getStats).toHaveBeenCalledWith(USER_ID);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: stats });
    });
  });

  describe('get', () => {
    it('deve retornar um contato', async () => {
      const contact = { id: 'c-1' } as never;
      service.getContact.mockResolvedValue(contact);

      await controller.get(createReq({ params: { contactId: CONTACT_ID } }), res);

      expect(service.getContact).toHaveBeenCalledWith(USER_ID, CONTACT_ID);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: contact });
    });

    it('deve responder 400 com contactId inválido', async () => {
      await controller.get(createReq({ params: { contactId: 'x' } }), res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(service.getContact).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('deve atualizar apelido e favorito', async () => {
      const contact = { id: 'c-1' } as never;
      service.updateContact.mockResolvedValue(contact);

      await controller.update(
        createReq({
          params: { contactId: CONTACT_ID },
          body: { nickname: 'Aninha', isFavorite: true },
        }),
        res
      );

      expect(service.updateContact).toHaveBeenCalledWith(USER_ID, CONTACT_ID, {
        nickname: 'Aninha',
        isFavorite: true,
      });
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: contact,
        message: 'Contato atualizado com sucesso',
      });
    });

    it('deve responder 400 com contactId inválido', async () => {
      await controller.update(createReq({ params: { contactId: 'x' }, body: {} }), res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(service.updateContact).not.toHaveBeenCalled();
    });

    it('deve responder 400 com body inválido', async () => {
      await controller.update(
        createReq({ params: { contactId: CONTACT_ID }, body: { isFavorite: 'sim' } }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(service.updateContact).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deve remover e responder 204', async () => {
      service.removeContact.mockResolvedValue(undefined);

      await controller.remove(createReq({ params: { contactId: CONTACT_ID } }), res);

      expect(service.removeContact).toHaveBeenCalledWith(USER_ID, CONTACT_ID);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.NO_CONTENT);
      expect(res.send).toHaveBeenCalled();
    });

    it('deve responder 400 com contactId inválido', async () => {
      await controller.remove(createReq({ params: { contactId: 'x' } }), res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(service.removeContact).not.toHaveBeenCalled();
    });
  });
});
