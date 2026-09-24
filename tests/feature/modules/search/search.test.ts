import express, { type Application, type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { errorHandler } from '@/shared/middlewares/errorHandler';

const ANA = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const CAROL = '33333333-3333-4333-8333-333333333333';
const DAVE = '44444444-4444-4444-8444-444444444444';
// Nunca vira conversa de verdade: prova que "não existe" e "não participo" respondem igual.
const GHOST_CONVERSATION = '99999999-9999-4999-8999-999999999999';

// Fronteira do módulo user com estado em memória (funções simples: resetMocks apagaria jest.fn).
const mockUsers = new Set<string>([ANA, BOB, CAROL, DAVE]);
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
      })),
};
const mockContactService = {
  isBlockedByEither: async (): Promise<boolean> => false,
  recordInteraction: async (): Promise<void> => undefined,
};

jest.mock('@/modules/user/services/UserService', () => ({ userService: mockUserService }));
jest.mock('@/modules/user/services/ContactService', () => ({
  contactService: mockContactService,
}));
jest.mock('@/modules/chat/repositories', () =>
  jest.requireActual('../../../support/chat/inMemoryChat').createInMemoryChatRepositories()
);
// Cache de participantes num Redis em memória (nunca o Redis real da máquina).
jest.mock('@/shared/database/redis', () => {
  const { FakeRedis } = jest.requireActual('../../../support/redis/fakeRedis');
  return { redis: new FakeRedis() };
});
// O cliente Elasticsearch da aplicação é o fake: os services padrão da busca o usam.
jest.mock('@/shared/database/elasticsearch', () => {
  const { FakeSearchClient } = jest.requireActual(
    '../../../support/elasticsearch/fakeSearchClient'
  );
  return { elasticsearch: new FakeSearchClient() };
});
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

import { registerChatCacheListeners } from '@/modules/chat/listeners';
import * as chatRepositories from '@/modules/chat/repositories';
import { conversationRoutes } from '@/modules/chat/routes/conversation.routes';
import { registerSearchIndexListeners } from '@/modules/search/listeners';
import { createSearchRoutes } from '@/modules/search/routes';
import { searchIndexService } from '@/modules/search/services';
import { elasticsearch } from '@/shared/database/elasticsearch';
import { redis } from '@/shared/database/redis';
import type { InMemoryChatStore } from '../../../support/chat/inMemoryChat';
import type { FakeSearchClient } from '../../../support/elasticsearch/fakeSearchClient';
import type { FakeRedis } from '../../../support/redis/fakeRedis';

const store = (chatRepositories as unknown as { store: InMemoryChatStore }).store;
const fakeEs = elasticsearch as unknown as FakeSearchClient;
const fakeRedis = redis as unknown as FakeRedis;
const as = (userId: string): { Authorization: string } => ({ Authorization: `Bearer ${userId}` });

/** A indexação roda em subscribers `{ async: true }` (setImmediate depois do publish). */
async function flushIndexing(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

interface SearchItem {
  message: { id: string; conversationId: string; senderId: string; content: { text: string } };
  highlights: string[];
  score: number;
}

/** Compara respostas de erro ignorando o `timestamp` (varia a cada `new AppError`). */
function withoutTimestamp(body: unknown): unknown {
  const envelope = body as { error?: Record<string, unknown> };
  if (envelope.error === undefined) {
    return body;
  }
  const { timestamp: _timestamp, ...error } = envelope.error;
  return { ...envelope, error };
}

describe('Busca de mensagens — Feature', () => {
  let app: Application;
  let unregister: Array<() => void>;

  beforeAll(() => {
    // Em produção o bootstrap registra estes listeners; aqui o teste faz o mesmo.
    unregister = [registerChatCacheListeners(), registerSearchIndexListeners()];
  });

  afterAll(() => {
    unregister.forEach((fn) => {
      fn();
    });
  });

  beforeEach(async () => {
    store.reset();
    fakeRedis.flushall();
    fakeEs.reset();
    await searchIndexService.ensureIndex();
    app = express();
    app.use(express.json());
    app.use('/api/conversations', conversationRoutes);
    // Rotas novas a cada teste: o rate limit (30/min) recomeça do zero.
    app.use('/api/search', createSearchRoutes());
    app.use(errorHandler);
  });

  async function direct(from: string, to: string): Promise<string> {
    const response = await request(app)
      .post('/api/conversations/direct')
      .set(as(from))
      .send({ userId: to });
    return (response.body as { data: { id: string } }).data.id;
  }

  async function group(from: string, members: string[]): Promise<string> {
    const response = await request(app)
      .post('/api/conversations/group')
      .set(as(from))
      .send({ name: 'Equipe', participantIds: members });
    return (response.body as { data: { id: string } }).data.id;
  }

  async function send(from: string, conversationId: string, text: string): Promise<string> {
    const response = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set(as(from))
      .send({ text });
    expect(response.status).toBe(201);
    return (response.body as { data: { id: string } }).data.id;
  }

  async function search(userId: string, query: Record<string, string>): Promise<request.Response> {
    await flushIndexing();
    return request(app).get('/api/search/messages').query(query).set(as(userId));
  }

  function ids(response: request.Response): string[] {
    return (response.body as { data: { items: SearchItem[] } }).data.items.map(
      (item) => item.message.id
    );
  }

  it('sem token → 401', async () => {
    const response = await request(app).get('/api/search/messages?q=oi');

    expect(response.status).toBe(401);
  });

  it('mensagem enviada é indexada e encontrada com e sem acento, com highlight escapado e facetas', async () => {
    const conversation = await direct(ANA, BOB);
    const first = await send(ANA, conversation, 'Meu coração está <b>feliz</b>');
    const second = await send(BOB, conversation, 'coracao sem acento');

    const withAccent = await search(ANA, { q: 'coração' });
    const withoutAccent = await search(BOB, { q: 'CORACAO' });

    expect(withAccent.status).toBe(200);
    expect(withAccent.body).toEqual({
      success: true,
      data: {
        items: [
          expect.objectContaining({
            message: expect.objectContaining({
              id: second,
              conversationId: conversation,
              senderId: BOB,
              content: { type: 'text', text: 'coracao sem acento' },
            }),
            highlights: ['<mark>coracao</mark> sem acento'],
            score: 1,
          }),
          expect.objectContaining({
            message: expect.objectContaining({ id: first, senderId: ANA }),
            highlights: ['Meu <mark>coração</mark> está &lt;b&gt;feliz&lt;&#x2F;b&gt;'],
          }),
        ],
        total: 2,
        facets: { conversations: [{ conversationId: conversation, count: 2 }] },
        tookMs: expect.any(Number),
      },
    });
    expect(ids(withoutAccent)).toEqual([second, first]);
  });

  it('só as conversas das quais o usuário participa no momento da busca', async () => {
    const anaBob = await direct(ANA, BOB);
    const team = await group(ANA, [CAROL]);
    const secret = await send(ANA, anaBob, 'reunião secreta');
    const open = await send(ANA, team, 'reunião da equipe');

    // Carol só vê a do grupo; Dave, sem conversas, não vê nada (e o ES nem é consultado).
    expect(ids(await search(CAROL, { q: 'reunião' }))).toEqual([open]);
    fakeEs.calls.length = 0;
    const dave = await search(DAVE, { q: 'reunião' });
    expect(dave.body.data).toEqual({
      items: [],
      total: 0,
      facets: { conversations: [] },
      tookMs: expect.any(Number),
    });
    expect(fakeEs.callsOf('search')).toEqual([]);

    // Conversa alheia no filtro → 404, igual a "não existe".
    const foreign = await search(CAROL, { q: 'reunião', conversationId: anaBob });
    expect(foreign.status).toBe(404);
    expect(foreign.body.error.code).toBe('NOT_FOUND');

    // Uma conversa que nunca existiu responde exatamente igual (mesmo código/mensagem): o
    // filtro não revela se o id é inválido ou se o usuário só não participa dela.
    const ghost = await search(CAROL, { q: 'reunião', conversationId: GHOST_CONVERSATION });
    expect(ghost.status).toBe(foreign.status);
    expect(withoutTimestamp(ghost.body)).toEqual(withoutTimestamp(foreign.body));

    // Removida do grupo, Carol deixa de ver as mensagens dele.
    await request(app).delete(`/api/conversations/${team}/members/${CAROL}`).set(as(ANA));
    expect(ids(await search(CAROL, { q: 'reunião' }))).toEqual([]);
    expect(ids(await search(ANA, { q: 'reunião' })).sort()).toEqual([open, secret].sort());
  });

  it('apagar remove da busca; documento "ressuscitado" no índice é descartado na hidratação', async () => {
    const conversation = await direct(ANA, BOB);
    const kept = await send(ANA, conversation, 'pão de queijo');
    const removed = await send(ANA, conversation, 'pão francês');

    const deleted = await request(app)
      .delete(`/api/conversations/${conversation}/messages/${removed}`)
      .set(as(ANA));
    expect(deleted.status).toBe(204);
    expect(ids(await search(BOB, { q: 'pão' }))).toEqual([kept]);

    // Corrida delete-antes-do-index: o documento volta ao índice, mas a busca não o mostra.
    await fakeEs.index({
      index: 'messages',
      id: removed,
      document: {
        messageId: removed,
        conversationId: conversation,
        senderId: ANA,
        content: 'pão francês',
        createdAt: new Date().toISOString(),
      },
    });
    const response = await search(BOB, { q: 'pão' });
    expect(ids(response)).toEqual([kept]);
    expect(response.body.data.total).toBe(2);
  });

  it('filtros por conversa, autor e período, e limit', async () => {
    const anaBob = await direct(ANA, BOB);
    const team = await group(ANA, [BOB]);
    const a1 = await send(ANA, anaBob, 'viagem marcada');
    const b1 = await send(BOB, anaBob, 'viagem confirmada');
    const t1 = await send(BOB, team, 'viagem da equipe');
    const [, createdB1, createdT1] = store.messages.map((message) => message.createdAt);

    expect(ids(await search(ANA, { q: 'viagem', conversationId: team }))).toEqual([t1]);
    expect(ids(await search(ANA, { q: 'viagem', senderId: BOB }))).toEqual([t1, b1]);
    expect(
      ids(
        await search(ANA, {
          q: 'viagem',
          from: createdB1!.toISOString(),
          to: createdT1!.toISOString(),
        })
      )
    ).toEqual([t1, b1]);
    expect(ids(await search(ANA, { q: 'viagem', limit: '1' }))).toEqual([t1]);
    expect(ids(await search(ANA, { q: 'viagem' }))).toEqual([t1, b1, a1]);
  });

  it('validação: q obrigatório, limit até 100, from ≤ to', async () => {
    const missing = await search(ANA, {});
    const tooMany = await search(ANA, { q: 'x', limit: '101' });
    const inverted = await search(ANA, {
      q: 'x',
      from: '2026-09-28T00:00:00Z',
      to: '2026-09-27T00:00:00Z',
    });

    expect(missing.status).toBe(400);
    expect(missing.body.errors[0].message).toBe('q é obrigatório');
    expect(tooMany.status).toBe(400);
    expect(inverted.status).toBe(400);
    expect(inverted.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Período inválido: "from" deve ser anterior ou igual a "to"',
    });
  });

  it('Elasticsearch fora do ar: busca → 503 SEARCH_UNAVAILABLE; o chat segue funcionando', async () => {
    const conversation = await direct(ANA, BOB);
    fakeEs.failWith = new Error('connect ECONNREFUSED');

    await send(ANA, conversation, 'ainda envio mensagens');
    const response = await search(ANA, { q: 'mensagens' });

    expect(response.status).toBe(503);
    expect(response.body.error).toMatchObject({
      code: 'SEARCH_UNAVAILABLE',
      message: 'Busca indisponível no momento; tente novamente mais tarde',
    });
  });
});
