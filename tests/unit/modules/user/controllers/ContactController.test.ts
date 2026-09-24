jest.mock('@/modules/user/services/ContactService', () => ({
  contactService: {},
}));
jest.mock('@/modules/presence/services/PresenceService', () => ({ presenceService: {} }));

import type { Request, Response } from 'express';
import { ContactController } from '@/modules/user/controllers/ContactController';
import type { IContactService } from '@/modules/user/interfaces';
import type { ContactWithUser } from '@/modules/user/types';
import { HttpStatus, UnauthorizedError } from '@/shared/errors';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const CONTACT_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_ID = '33333333-3333-4333-8333-333333333333';
const THIRD_ID = '44444444-4444-4444-8444-444444444444';

function contactRow(
  contactId: string,
  names: { nickname?: string | null; displayName?: string | null; username: string }
): ContactWithUser {
  return {
    id: `row-${contactId}`,
    userId: USER_ID,
    contactId,
    nickname: names.nickname ?? null,
    isBlocked: false,
    isFavorite: false,
    blockedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    contact: {
      id: contactId,
      username: names.username,
      displayName: names.displayName ?? null,
      avatarUrl: null,
    },
  };
}

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
  let presence: { getVisibleStates: jest.Mock };
  let controller: ContactController;
  let res: jest.Mocked<Response>;

  beforeEach(() => {
    service = createService();
    presence = { getVisibleStates: jest.fn().mockResolvedValue([]) };
    controller = new ContactController(service, presence);
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

  describe('presença nos contatos', () => {
    const page = (contacts: ContactWithUser[]) => ({
      contacts,
      total: contacts.length,
      limit: 20,
      offset: 0,
      hasMore: false,
    });

    it('list anexa presence { state, lastSeenAt } a cada contato (visto por quem lista)', async () => {
      const lastSeenAt = new Date('2026-09-26T09:00:00.000Z');
      service.listContacts.mockResolvedValue(
        page([
          contactRow(CONTACT_ID, { username: 'bia' }),
          contactRow(OTHER_ID, { username: 'caio' }),
        ])
      );
      presence.getVisibleStates.mockResolvedValue([
        { userId: CONTACT_ID, state: 'busy', lastSeenAt: null },
        { userId: OTHER_ID, state: 'offline', lastSeenAt },
      ]);

      await controller.list(createReq(), res);

      expect(presence.getVisibleStates).toHaveBeenCalledWith(USER_ID, [CONTACT_ID, OTHER_ID]);
      const { data } = res.json.mock.calls[0]![0] as { data: { contacts: unknown[] } };
      expect(data.contacts).toEqual([
        expect.objectContaining({
          contactId: CONTACT_ID,
          presence: { state: 'busy', lastSeenAt: null },
        }),
        expect.objectContaining({
          contactId: OTHER_ID,
          presence: { state: 'offline', lastSeenAt },
        }),
      ]);
    });

    it('contato sem estado conhecido sai offline', async () => {
      service.listContacts.mockResolvedValue(page([contactRow(CONTACT_ID, { username: 'bia' })]));

      await controller.list(createReq(), res);

      const { data } = res.json.mock.calls[0]![0] as {
        data: { contacts: { presence: unknown }[] };
      };
      expect(data.contacts[0]!.presence).toEqual({ state: 'offline', lastSeenAt: null });
    });

    it('orderBy=presence: banco na ordem padrão; página online → away → busy → offline (visto mais recente primeiro)', async () => {
      const ids = ['a', 'b', 'c', 'd', 'e', 'f'].map(
        (letter) => `${letter.repeat(8)}-0000-4000-8000-000000000000`
      );
      service.listContacts.mockResolvedValue(
        page(ids.map((id) => contactRow(id, { username: id.slice(0, 1) })))
      );
      presence.getVisibleStates.mockResolvedValue([
        { userId: ids[0], state: 'offline', lastSeenAt: null },
        { userId: ids[1], state: 'busy', lastSeenAt: null },
        { userId: ids[2], state: 'offline', lastSeenAt: new Date('2026-09-26T08:00:00.000Z') },
        { userId: ids[3], state: 'online', lastSeenAt: null },
        { userId: ids[4], state: 'offline', lastSeenAt: new Date('2026-09-26T09:00:00.000Z') },
        { userId: ids[5], state: 'away', lastSeenAt: null },
      ]);

      await controller.list(createReq({ query: { orderBy: 'presence' } }), res);

      expect(service.listContacts).toHaveBeenCalledWith(
        USER_ID,
        expect.objectContaining({ orderBy: undefined })
      );
      const { data } = res.json.mock.calls[0]![0] as {
        data: { contacts: { contact: { username: string } }[] };
      };
      expect(data.contacts.map((c) => c.contact.username).join('')).toBe('dfbeca');
    });

    it('online: só os conectados, carregados em lote e ordenados pelo nome exibido', async () => {
      service.listContactIds.mockResolvedValue([CONTACT_ID, OTHER_ID, THIRD_ID]);
      presence.getVisibleStates.mockResolvedValue([
        { userId: CONTACT_ID, state: 'online', lastSeenAt: null },
        { userId: OTHER_ID, state: 'offline', lastSeenAt: null },
        { userId: THIRD_ID, state: 'away', lastSeenAt: null },
      ]);
      service.getContactsByIds.mockResolvedValue([
        contactRow(CONTACT_ID, { username: 'zeca', displayName: 'Zeca' }),
        contactRow(THIRD_ID, { username: 'yuri', nickname: 'Álvaro' }),
      ]);

      await controller.online(createReq(), res);

      expect(presence.getVisibleStates).toHaveBeenCalledWith(USER_ID, [
        CONTACT_ID,
        OTHER_ID,
        THIRD_ID,
      ]);
      expect(service.getContactsByIds).toHaveBeenCalledWith(USER_ID, [CONTACT_ID, THIRD_ID]);
      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      const { data } = res.json.mock.calls[0]![0] as {
        data: { contactId: string; presence: { state: string } }[];
      };
      expect(data.map((c) => [c.contactId, c.presence.state])).toEqual([
        [THIRD_ID, 'away'],
        [CONTACT_ID, 'online'],
      ]);
    });

    it('online ordena por username quando não há apelido nem nome de exibição', async () => {
      service.listContactIds.mockResolvedValue([CONTACT_ID, OTHER_ID]);
      presence.getVisibleStates.mockResolvedValue([
        { userId: CONTACT_ID, state: 'online', lastSeenAt: null },
        { userId: OTHER_ID, state: 'busy', lastSeenAt: null },
      ]);
      service.getContactsByIds.mockResolvedValue([
        contactRow(CONTACT_ID, { username: 'marta' }),
        contactRow(OTHER_ID, { username: 'bruno' }),
      ]);

      await controller.online(createReq(), res);

      const { data } = res.json.mock.calls[0]![0] as { data: { contactId: string }[] };
      expect(data.map((c) => c.contactId)).toEqual([OTHER_ID, CONTACT_ID]);
    });

    it('online sem usuário autenticado lança UnauthorizedError', async () => {
      await expect(controller.online(createReq({ user: undefined }), res)).rejects.toThrow(
        UnauthorizedError
      );
    });
  });
});
