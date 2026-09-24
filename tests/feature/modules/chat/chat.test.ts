import express, { type Application, type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { errorHandler } from '@/shared/middlewares/errorHandler';
import { HttpStatus } from '@/shared/errors';

const ANA = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const CAROL = '33333333-3333-4333-8333-333333333333';
const DAVE = '44444444-4444-4444-8444-444444444444';

// Serviços do módulo de usuários (fronteira do módulo chat) com estado em memória.
// Funções simples (não jest.fn) porque resetMocks:true apagaria implementações.
const mockUsers = new Set<string>([ANA, BOB, CAROL, DAVE]);
const mockBlocks = new Set<string>();
const mockUserService = {
  exists: async (id: string): Promise<boolean> => mockUsers.has(id),
  getMultiple: async (ids: string[]): Promise<unknown[]> =>
    ids
      .filter((id) => mockUsers.has(id))
      .map((id) => ({
        id,
        username: `user_${id.slice(0, 4)}`,
        displayName: null,
        avatarUrl: null,
        status: 'offline',
        lastSeenAt: null,
      })),
};
const mockContactService = {
  isBlockedByEither: async (a: string, b: string): Promise<boolean> =>
    mockBlocks.has(`${a}:${b}`) || mockBlocks.has(`${b}:${a}`),
};

jest.mock('@/modules/user/services/UserService', () => ({ userService: mockUserService }));
jest.mock('@/modules/user/services/ContactService', () => ({
  contactService: mockContactService,
}));
jest.mock('@/modules/chat/repositories', () =>
  jest.requireActual('../../../support/chat/inMemoryChat').createInMemoryChatRepositories()
);
jest.mock('@/modules/auth/middlewares/authenticate', () => ({
  // O token do teste é o próprio id do usuário: "Authorization: Bearer <uuid>".
  authenticate: (req: Request, _res: Response, next: NextFunction): void => {
    const header = req.headers.authorization;
    if (header === undefined) {
      const errors = jest.requireActual('@/shared/errors');
      next(
        new errors.AppError(
          'Token de autenticação não fornecido',
          errors.HttpStatus.UNAUTHORIZED,
          errors.ErrorCode.UNAUTHORIZED
        )
      );
      return;
    }
    const id = header.replace('Bearer ', '');
    req.user = { id, email: `${id}@example.com`, username: id };
    next();
  },
  optionalAuth: (_req: Request, _res: Response, next: NextFunction): void => {
    next();
  },
}));

import * as chatRepositories from '@/modules/chat/repositories';
import { conversationRoutes } from '@/modules/chat/routes/conversation.routes';
import type { InMemoryChatStore } from '../../../support/chat/inMemoryChat';

const store = (chatRepositories as unknown as { store: InMemoryChatStore }).store;
const as = (userId: string): { Authorization: string } => ({ Authorization: `Bearer ${userId}` });
const FAKE_CONVERSATION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FAKE_MESSAGE = '65f000000000000000000001';

describe('Chat — Feature', () => {
  let app: Application;

  beforeEach(() => {
    store.reset();
    mockBlocks.clear();
    app = express();
    app.use(express.json());
    app.use('/api/conversations', conversationRoutes);
    app.use(errorHandler);
  });

  async function createDirect(from: string, to: string): Promise<request.Response> {
    return request(app).post('/api/conversations/direct').set(as(from)).send({ userId: to });
  }

  async function send(
    from: string,
    conversationId: string,
    text: string
  ): Promise<request.Response> {
    return request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set(as(from))
      .send({ text });
  }

  describe('autenticação', () => {
    it.each([
      ['post', '/api/conversations/direct'],
      ['post', '/api/conversations/group'],
      ['get', '/api/conversations'],
      ['get', `/api/conversations/${FAKE_CONVERSATION}`],
      ['patch', `/api/conversations/${FAKE_CONVERSATION}`],
      ['post', `/api/conversations/${FAKE_CONVERSATION}/archive`],
      ['delete', `/api/conversations/${FAKE_CONVERSATION}/archive`],
      ['post', `/api/conversations/${FAKE_CONVERSATION}/leave`],
      ['post', `/api/conversations/${FAKE_CONVERSATION}/members`],
      ['delete', `/api/conversations/${FAKE_CONVERSATION}/members/${BOB}`],
      ['get', `/api/conversations/${FAKE_CONVERSATION}/messages`],
      ['post', `/api/conversations/${FAKE_CONVERSATION}/messages`],
      ['delete', `/api/conversations/${FAKE_CONVERSATION}/messages/${FAKE_MESSAGE}`],
      ['post', `/api/conversations/${FAKE_CONVERSATION}/read`],
    ] as const)('%s %s sem token deve retornar 401', async (method, url) => {
      const response = await request(app)[method](url);
      expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('conversa direct', () => {
    it('criar (idempotente) → enviar → paginar com cursor → apagar (tombstone)', async () => {
      const created = await createDirect(ANA, BOB);
      expect(created.status).toBe(HttpStatus.CREATED);
      const conversationId = created.body.data.id as string;
      expect(created.body.data.participants).toHaveLength(2);

      const again = await createDirect(BOB, ANA);
      expect(again.status).toBe(HttpStatus.OK);
      expect(again.body.data.id).toBe(conversationId);

      const ids: string[] = [];
      for (const text of ['m1', 'm2', 'm3']) {
        const sent = await send(ANA, conversationId, text);
        expect(sent.status).toBe(HttpStatus.CREATED);
        ids.push(sent.body.data.id as string);
      }

      const page1 = await request(app)
        .get(`/api/conversations/${conversationId}/messages?limit=2`)
        .set(as(BOB));
      expect(page1.status).toBe(HttpStatus.OK);
      expect(
        page1.body.data.messages.map((m: { content: { text: string } }) => m.content.text)
      ).toEqual(['m3', 'm2']);
      expect(page1.body.data.nextCursor).toBe(ids[1]);

      const page2 = await request(app)
        .get(`/api/conversations/${conversationId}/messages?limit=2&before=${String(ids[1])}`)
        .set(as(BOB));
      expect(page2.body.data.messages).toHaveLength(1);
      expect(page2.body.data.messages[0].content.text).toBe('m1');
      expect(page2.body.data.nextCursor).toBeNull();

      const notAuthor = await request(app)
        .delete(`/api/conversations/${conversationId}/messages/${String(ids[1])}`)
        .set(as(BOB));
      expect(notAuthor.status).toBe(HttpStatus.FORBIDDEN);

      for (let attempt = 0; attempt < 2; attempt++) {
        const deleted = await request(app)
          .delete(`/api/conversations/${conversationId}/messages/${String(ids[1])}`)
          .set(as(ANA));
        expect(deleted.status).toBe(HttpStatus.NO_CONTENT);
      }

      const afterDelete = await request(app)
        .get(`/api/conversations/${conversationId}/messages`)
        .set(as(ANA));
      const tombstone = afterDelete.body.data.messages.find((m: { id: string }) => m.id === ids[1]);
      expect(tombstone.content).toBeNull();
      expect(tombstone.deletedAt).not.toBeNull();

      const list = await request(app).get('/api/conversations').set(as(ANA));
      expect(list.body.data.total).toBe(1);
      expect(list.body.data.items[0].lastMessageAt).not.toBeNull();
    });

    it('envio idempotente: repetir o clientMessageId devolve a mesma mensagem, sem duplicar', async () => {
      const created = await createDirect(ANA, BOB);
      const conversationId = created.body.data.id as string;
      const clientMessageId = '66666666-6666-4666-8666-666666666666';

      const first = await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set(as(ANA))
        .send({ text: 'uma vez só', clientMessageId });
      const retry = await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set(as(ANA))
        .send({ text: 'uma vez só', clientMessageId });

      expect(first.status).toBe(HttpStatus.CREATED);
      expect(retry.status).toBe(HttpStatus.CREATED);
      expect(retry.body.data.id).toBe(first.body.data.id);
      expect(retry.body.data.clientMessageId).toBe(clientMessageId);
      expect(first.body.data.status).toEqual({
        sentAt: first.body.data.createdAt,
        deliveredTo: [],
        readBy: [],
      });

      const page = await request(app)
        .get(`/api/conversations/${conversationId}/messages`)
        .set(as(BOB));
      expect(page.body.data.messages).toHaveLength(1);
    });

    it('POST /:id/read marca como lidas (e entregues) as mensagens do outro até a indicada', async () => {
      const created = await createDirect(ANA, BOB);
      const conversationId = created.body.data.id as string;
      const m1 = await send(ANA, conversationId, 'm1');
      const m2 = await send(ANA, conversationId, 'm2');
      const own = await send(BOB, conversationId, 'minha');

      const read = await request(app)
        .post(`/api/conversations/${conversationId}/read`)
        .set(as(BOB))
        .send({ messageId: m2.body.data.id });
      expect(read.status).toBe(HttpStatus.NO_CONTENT);

      const page = await request(app)
        .get(`/api/conversations/${conversationId}/messages`)
        .set(as(ANA));
      const byId = new Map(
        page.body.data.messages.map((m: { id: string; status: unknown }) => [m.id, m.status])
      );
      for (const id of [m1.body.data.id, m2.body.data.id]) {
        expect(byId.get(id)).toEqual(
          expect.objectContaining({
            deliveredTo: [expect.objectContaining({ userId: BOB })],
            readBy: [expect.objectContaining({ userId: BOB })],
          })
        );
      }
      expect(byId.get(own.body.data.id)).toEqual(expect.objectContaining({ readBy: [] }));

      const membership = store.participants.find(
        (p) => p.conversationId === conversationId && p.userId === BOB
      );
      expect(membership?.lastReadAt?.toISOString()).toBe(m2.body.data.createdAt);
    });

    it('POST /:id/read valida o corpo (400) e esconde mensagens de outras conversas (404)', async () => {
      const first = await createDirect(ANA, BOB);
      const second = await createDirect(ANA, CAROL);
      const elsewhere = await send(ANA, second.body.data.id as string, 'noutra conversa');

      const invalid = await request(app)
        .post(`/api/conversations/${String(first.body.data.id)}/read`)
        .set(as(BOB))
        .send({ messageId: 'x' });
      const foreign = await request(app)
        .post(`/api/conversations/${String(first.body.data.id)}/read`)
        .set(as(BOB))
        .send({ messageId: elsewhere.body.data.id });

      expect(invalid.status).toBe(HttpStatus.BAD_REQUEST);
      expect(foreign.status).toBe(HttpStatus.NOT_FOUND);
    });

    it('bloqueio em qualquer sentido → 403 ao criar e ao enviar', async () => {
      const created = await createDirect(ANA, BOB);
      const conversationId = created.body.data.id as string;

      mockBlocks.add(`${BOB}:${ANA}`);

      const sent = await send(ANA, conversationId, 'oi');
      expect(sent.status).toBe(HttpStatus.FORBIDDEN);
      expect(sent.body.error.code).toBe('USER_BLOCKED');

      const newDirect = await createDirect(BOB, ANA);
      expect(newDirect.status).toBe(HttpStatus.FORBIDDEN);
    });

    it('não participante recebe 404 em conversa e mensagens', async () => {
      const created = await createDirect(ANA, BOB);
      const conversationId = created.body.data.id as string;

      const get = await request(app).get(`/api/conversations/${conversationId}`).set(as(CAROL));
      const list = await request(app)
        .get(`/api/conversations/${conversationId}/messages`)
        .set(as(CAROL));
      const sent = await send(CAROL, conversationId, 'intruso');

      expect(get.status).toBe(HttpStatus.NOT_FOUND);
      expect(list.status).toBe(HttpStatus.NOT_FOUND);
      expect(sent.status).toBe(HttpStatus.NOT_FOUND);
    });

    it('validação: 400 para ids inválidos, autoconversa, mention de não participante e rename em direct', async () => {
      const invalidUser = await request(app)
        .post('/api/conversations/direct')
        .set(as(ANA))
        .send({ userId: 'x' });
      expect(invalidUser.status).toBe(HttpStatus.BAD_REQUEST);
      expect(invalidUser.body.success).toBe(false);

      const self = await createDirect(ANA, ANA);
      expect(self.status).toBe(HttpStatus.BAD_REQUEST);

      const invalidId = await request(app).get('/api/conversations/nao-e-uuid').set(as(ANA));
      expect(invalidId.status).toBe(HttpStatus.BAD_REQUEST);

      const created = await createDirect(ANA, BOB);
      const conversationId = created.body.data.id as string;

      const mention = await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set(as(ANA))
        .send({ text: 'oi', mentions: [CAROL] });
      expect(mention.status).toBe(HttpStatus.BAD_REQUEST);

      const rename = await request(app)
        .patch(`/api/conversations/${conversationId}`)
        .set(as(ANA))
        .send({ name: 'x' });
      expect(rename.status).toBe(HttpStatus.BAD_REQUEST);
    });

    it('arquivar/desarquivar é por participante', async () => {
      const created = await createDirect(ANA, BOB);
      const conversationId = created.body.data.id as string;

      const archived = await request(app)
        .post(`/api/conversations/${conversationId}/archive`)
        .set(as(ANA));
      expect(archived.status).toBe(HttpStatus.NO_CONTENT);

      const active = await request(app).get('/api/conversations').set(as(ANA));
      const archivedList = await request(app).get('/api/conversations?archived=true').set(as(ANA));
      const bobList = await request(app).get('/api/conversations').set(as(BOB));
      expect(active.body.data.total).toBe(0);
      expect(archivedList.body.data.total).toBe(1);
      expect(bobList.body.data.total).toBe(1);

      const unarchived = await request(app)
        .delete(`/api/conversations/${conversationId}/archive`)
        .set(as(ANA));
      expect(unarchived.status).toBe(HttpStatus.NO_CONTENT);
      const again = await request(app).get('/api/conversations').set(as(ANA));
      expect(again.body.data.total).toBe(1);
    });
  });

  describe('grupo', () => {
    it('criar → renomear (admin) → adicionar/remover → sair com promoção de admin', async () => {
      const created = await request(app)
        .post('/api/conversations/group')
        .set(as(ANA))
        .send({ name: 'Time', participantIds: [BOB] });
      expect(created.status).toBe(HttpStatus.CREATED);
      expect(created.body.data.membership.role).toBe('admin');
      const groupId = created.body.data.id as string;

      const renameByMember = await request(app)
        .patch(`/api/conversations/${groupId}`)
        .set(as(BOB))
        .send({ name: 'Hack' });
      expect(renameByMember.status).toBe(HttpStatus.FORBIDDEN);

      const renamed = await request(app)
        .patch(`/api/conversations/${groupId}`)
        .set(as(ANA))
        .send({ name: 'Time 2' });
      expect(renamed.status).toBe(HttpStatus.OK);
      expect(renamed.body.data.name).toBe('Time 2');

      const added = await request(app)
        .post(`/api/conversations/${groupId}/members`)
        .set(as(ANA))
        .send({ userIds: [CAROL, DAVE] });
      expect(added.status).toBe(HttpStatus.OK);
      expect(added.body.data.participants).toHaveLength(4);

      const removed = await request(app)
        .delete(`/api/conversations/${groupId}/members/${DAVE}`)
        .set(as(ANA));
      expect(removed.status).toBe(HttpStatus.NO_CONTENT);

      const left = await request(app).post(`/api/conversations/${groupId}/leave`).set(as(ANA));
      expect(left.status).toBe(HttpStatus.NO_CONTENT);

      const asBob = await request(app).get(`/api/conversations/${groupId}`).set(as(BOB));
      expect(asBob.status).toBe(HttpStatus.OK);
      expect(asBob.body.data.membership.role).toBe('admin');
      expect(asBob.body.data.participants).toHaveLength(2);

      const asAna = await request(app).get(`/api/conversations/${groupId}`).set(as(ANA));
      expect(asAna.status).toBe(HttpStatus.NOT_FOUND);
    });

    it('404 listando usuários inexistentes ao criar grupo', async () => {
      const unknown = '55555555-5555-4555-8555-555555555555';

      const response = await request(app)
        .post('/api/conversations/group')
        .set(as(ANA))
        .send({ name: 'Time', participantIds: [BOB, unknown] });

      expect(response.status).toBe(HttpStatus.NOT_FOUND);
      expect(response.body.error.details).toEqual([expect.objectContaining({ message: unknown })]);
    });

    it('último participante saindo remove o grupo', async () => {
      const created = await request(app)
        .post('/api/conversations/group')
        .set(as(ANA))
        .send({ name: 'Solo', participantIds: [BOB] });
      const groupId = created.body.data.id as string;

      await request(app).post(`/api/conversations/${groupId}/leave`).set(as(ANA));
      await request(app).post(`/api/conversations/${groupId}/leave`).set(as(BOB));

      expect(store.conversations.has(groupId)).toBe(false);
    });

    it('promoção de admin usa id como tie-break em membros com mesmo joined_at', async () => {
      // ANA cria grupo, CAROL e BOB adicionados juntos (mesmo joinedAt).
      // IDs gerados com descending counter: ANA → 0xff, CAROL → 0xfe, BOB → 0xfd.
      // BOB tem menor ID lexicograficamente apesar de inserido depois;
      // quando ANA sai, BOB (menor participant ID) é promovido a admin.
      const created = await request(app)
        .post('/api/conversations/group')
        .set(as(ANA))
        .send({ name: 'TieBreak', participantIds: [CAROL, BOB] });
      expect(created.status).toBe(HttpStatus.CREATED);
      const groupId = created.body.data.id as string;

      // ANA deixa o grupo
      const left = await request(app).post(`/api/conversations/${groupId}/leave`).set(as(ANA));
      expect(left.status).toBe(HttpStatus.NO_CONTENT);

      // Verificar que BOB foi promovido a admin (menor participant ID, apesar de inserido por último)
      const bobView = await request(app).get(`/api/conversations/${groupId}`).set(as(BOB));
      expect(bobView.status).toBe(HttpStatus.OK);
      expect(bobView.body.data.membership.role).toBe('admin');

      // Verificar que CAROL continua como membro
      const carolView = await request(app).get(`/api/conversations/${groupId}`).set(as(CAROL));
      expect(carolView.status).toBe(HttpStatus.OK);
      expect(carolView.body.data.membership.role).toBe('member');
    });
  });
});
