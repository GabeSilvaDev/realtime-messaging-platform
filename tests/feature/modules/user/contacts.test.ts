import express, { type Application, type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { errorHandler } from '@/shared/middlewares/errorHandler';
import { AppError, ErrorCode, HttpStatus } from '@/shared/errors';

const mockContactService = {
  addContact: jest.fn(),
  updateContact: jest.fn(),
  removeContact: jest.fn(),
  getContact: jest.fn(),
  listContacts: jest.fn(),
  listFavorites: jest.fn(),
  getStats: jest.fn(),
  blockUser: jest.fn(),
  unblockUser: jest.fn(),
  listBlocked: jest.fn(),
  searchUsers: jest.fn(),
  listContactIds: jest.fn(),
  getContactsByIds: jest.fn(),
};
const mockPresenceService = { getVisibleStates: jest.fn() };

jest.mock('@/modules/user/services/ContactService', () => ({
  contactService: mockContactService,
}));
jest.mock('@/modules/presence/services/PresenceService', () => ({
  presenceService: mockPresenceService,
}));

jest.mock('@/modules/auth/middlewares/authenticate', () => ({
  authenticate: (req: Request, _res: Response, next: NextFunction): void => {
    if (req.headers.authorization === undefined) {
      const errors = jest.requireActual<typeof import('@/shared/errors')>('@/shared/errors');
      next(
        new errors.AppError(
          'Token de autenticação não fornecido',
          errors.HttpStatus.UNAUTHORIZED,
          errors.ErrorCode.UNAUTHORIZED
        )
      );
      return;
    }
    req.user = {
      id: '11111111-1111-4111-8111-111111111111',
      email: 'user@example.com',
      username: 'user',
    };
    next();
  },
  optionalAuth: (_req: Request, _res: Response, next: NextFunction): void => {
    next();
  },
}));

import { contactRoutes } from '@/modules/user/routes/contact.routes';
import { blockRoutes } from '@/modules/user/routes/block.routes';
import { userRoutes } from '@/modules/user/routes/user.routes';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const CONTACT_ID = '22222222-2222-4222-8222-222222222222';
const AUTH = { Authorization: 'Bearer token' };

describe('Contacts / Blocks / Users — Feature', () => {
  let app: Application;

  beforeEach(() => {
    jest.clearAllMocks();
    // Todos online (a presença em si é testada no módulo presence).
    mockPresenceService.getVisibleStates.mockImplementation(async (_viewer, ids: string[]) =>
      ids.map((userId) => ({ userId, state: 'online', lastSeenAt: null }))
    );
    app = express();
    app.use(express.json());
    app.use('/api/contacts', contactRoutes);
    app.use('/api/blocks', blockRoutes);
    app.use('/api/users', userRoutes);
    app.use(errorHandler);
  });

  describe('autenticação', () => {
    it.each([
      ['get', '/api/contacts'],
      ['post', '/api/contacts'],
      ['get', '/api/contacts/favorites'],
      ['get', '/api/contacts/online'],
      ['get', '/api/contacts/stats'],
      ['get', `/api/contacts/${CONTACT_ID}`],
      ['patch', `/api/contacts/${CONTACT_ID}`],
      ['delete', `/api/contacts/${CONTACT_ID}`],
      ['get', '/api/blocks'],
      ['post', '/api/blocks'],
      ['delete', `/api/blocks/${CONTACT_ID}`],
      ['get', '/api/users/search?query=ana'],
    ] as const)('%s %s sem token deve retornar 401', async (method, url) => {
      const response = await request(app)[method](url);
      expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('fluxo de contatos', () => {
    it('adicionar → listar → favoritar → listar favoritos → remover', async () => {
      const contact = { id: 'c-1', contactId: CONTACT_ID, isFavorite: false };
      mockContactService.addContact.mockResolvedValue(contact);
      mockContactService.listContacts.mockResolvedValue({
        contacts: [contact],
        total: 1,
        limit: 20,
        offset: 0,
        hasMore: false,
      });
      mockContactService.updateContact.mockResolvedValue({ ...contact, isFavorite: true });
      mockContactService.listFavorites.mockResolvedValue([{ ...contact, isFavorite: true }]);
      mockContactService.removeContact.mockResolvedValue(undefined);

      const added = await request(app)
        .post('/api/contacts')
        .set(AUTH)
        .send({ contactId: CONTACT_ID });
      expect(added.status).toBe(HttpStatus.CREATED);
      expect(mockContactService.addContact).toHaveBeenCalledWith(USER_ID, {
        contactId: CONTACT_ID,
      });

      const listed = await request(app).get('/api/contacts').set(AUTH);
      expect(listed.status).toBe(HttpStatus.OK);
      expect(listed.body.data.total).toBe(1);

      const favorited = await request(app)
        .patch(`/api/contacts/${CONTACT_ID}`)
        .set(AUTH)
        .send({ isFavorite: true });
      expect(favorited.status).toBe(HttpStatus.OK);
      expect(favorited.body.data.isFavorite).toBe(true);

      const favorites = await request(app).get('/api/contacts/favorites').set(AUTH);
      expect(favorites.status).toBe(HttpStatus.OK);
      expect(favorites.body.data).toHaveLength(1);
      expect(mockContactService.getContact).not.toHaveBeenCalled();

      const removed = await request(app).delete(`/api/contacts/${CONTACT_ID}`).set(AUTH);
      expect(removed.status).toBe(HttpStatus.NO_CONTENT);
    });

    it('GET /api/contacts/stats não deve ser capturado por /:contactId', async () => {
      mockContactService.getStats.mockResolvedValue({ total: 0, favorites: 0, blocked: 0 });

      const response = await request(app).get('/api/contacts/stats').set(AUTH);

      expect(response.status).toBe(HttpStatus.OK);
      expect(mockContactService.getStats).toHaveBeenCalledWith(USER_ID);
      expect(mockContactService.getContact).not.toHaveBeenCalled();
    });

    it('deve retornar 400 com contactId inválido', async () => {
      const response = await request(app).get('/api/contacts/nao-e-uuid').set(AUTH);
      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
      expect(response.body.success).toBe(false);
    });

    it('deve propagar 403 quando o contato está bloqueado', async () => {
      mockContactService.addContact.mockRejectedValue(
        new AppError('Este usuário está bloqueado', HttpStatus.FORBIDDEN, ErrorCode.USER_BLOCKED)
      );

      const response = await request(app)
        .post('/api/contacts')
        .set(AUTH)
        .send({ contactId: CONTACT_ID });

      expect(response.status).toBe(HttpStatus.FORBIDDEN);
      expect(response.body.error.code).toBe(ErrorCode.USER_BLOCKED);
    });

    it('deve propagar 409 para contato duplicado', async () => {
      mockContactService.addContact.mockRejectedValue(
        new AppError('Duplicado', HttpStatus.CONFLICT, ErrorCode.DUPLICATE_ENTRY)
      );

      const response = await request(app)
        .post('/api/contacts')
        .set(AUTH)
        .send({ contactId: CONTACT_ID });

      expect(response.status).toBe(HttpStatus.CONFLICT);
    });

    it('GET /api/contacts traz presence em cada contato e aceita orderBy=presence', async () => {
      mockContactService.listContacts.mockResolvedValue({
        contacts: [{ id: 'c-1', contactId: CONTACT_ID }],
        total: 1,
        limit: 20,
        offset: 0,
        hasMore: false,
      });

      const listed = await request(app).get('/api/contacts?orderBy=presence').set(AUTH);

      expect(listed.status).toBe(HttpStatus.OK);
      expect(listed.body.data.contacts[0].presence).toEqual({ state: 'online', lastSeenAt: null });
    });

    it('GET /api/contacts/online não deve ser capturado por /:contactId', async () => {
      mockContactService.listContactIds.mockResolvedValue([CONTACT_ID]);
      mockContactService.getContactsByIds.mockResolvedValue([
        { id: 'c-1', contactId: CONTACT_ID, nickname: 'Bia', contact: { username: 'bia' } },
      ]);

      const response = await request(app).get('/api/contacts/online').set(AUTH);

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.data).toEqual([
        expect.objectContaining({
          contactId: CONTACT_ID,
          presence: { state: 'online', lastSeenAt: null },
        }),
      ]);
      expect(mockContactService.getContact).not.toHaveBeenCalled();
    });
  });

  describe('bloqueios', () => {
    it('bloquear → listar → desbloquear', async () => {
      mockContactService.blockUser.mockResolvedValue(undefined);
      mockContactService.listBlocked.mockResolvedValue([{ contactId: CONTACT_ID }]);
      mockContactService.unblockUser.mockResolvedValue(undefined);

      const blocked = await request(app).post('/api/blocks').set(AUTH).send({ userId: CONTACT_ID });
      expect(blocked.status).toBe(HttpStatus.CREATED);
      expect(mockContactService.blockUser).toHaveBeenCalledWith(USER_ID, CONTACT_ID);

      const list = await request(app).get('/api/blocks').set(AUTH);
      expect(list.status).toBe(HttpStatus.OK);
      expect(list.body.data).toHaveLength(1);

      const unblocked = await request(app).delete(`/api/blocks/${CONTACT_ID}`).set(AUTH);
      expect(unblocked.status).toBe(HttpStatus.NO_CONTENT);
      expect(mockContactService.unblockUser).toHaveBeenCalledWith(USER_ID, CONTACT_ID);
    });

    it('deve propagar 400 ao bloquear a si mesmo', async () => {
      mockContactService.blockUser.mockRejectedValue(
        new AppError(
          'Você não pode bloquear a si mesmo',
          HttpStatus.BAD_REQUEST,
          ErrorCode.VALIDATION_ERROR
        )
      );

      const response = await request(app).post('/api/blocks').set(AUTH).send({ userId: USER_ID });

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
    });
  });

  describe('busca de usuários', () => {
    it('deve buscar usuários excluindo bloqueados por padrão', async () => {
      mockContactService.searchUsers.mockResolvedValue([{ id: CONTACT_ID, username: 'ana' }]);

      const response = await request(app).get('/api/users/search?query=ana&limit=5').set(AUTH);

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.data).toHaveLength(1);
      expect(mockContactService.searchUsers).toHaveBeenCalledWith(USER_ID, 'ana', {
        limit: 5,
        excludeBlocked: true,
      });
    });

    it('deve retornar 400 sem termo de busca', async () => {
      const response = await request(app).get('/api/users/search').set(AUTH);
      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
    });
  });
});
