// Privacidade da presença fora da API de presença: `status`/`lastSeenAt` de OUTRO usuário nunca
// saem pelo REST de contatos, bloqueios, busca ou perfil público (a presença é a única fonte, e
// ela esconde pares bloqueados). Rotas, controllers, services e repositórios reais do módulo
// user; só os models do Sequelize são trocados por um banco em memória cujas linhas trazem
// `status` e `last_seen_at` preenchidos (o que o Postgres devolveria). Presença falsa: pares
// bloqueados → offline sem `lastSeenAt`.
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { Op } from 'sequelize';

const ANA = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222'; // bloqueou a Ana
const CAROL = '33333333-3333-4333-8333-333333333333'; // bloqueada pela Ana
const DAVE = '44444444-4444-4444-8444-444444444444'; // contato comum
const ERIN = '55555555-5555-4555-8555-555555555555'; // ainda não é contato

const mockLastSeen = new Date('2026-09-26T09:00:00.000Z');
const mockUserIds = [ANA, BOB, CAROL, DAVE, ERIN];

interface ContactRowAttrs {
  id: string;
  userId: string;
  contactId: string;
  nickname: string | null;
  isBlocked: boolean;
  isFavorite: boolean;
  blockedAt: Date | null;
  createdByBlock: boolean;
  lastInteractionAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const mockContactRows: ContactRowAttrs[] = [];
const mockBlockedPairs = (): Set<string> =>
  new Set(
    mockContactRows.filter((row) => row.isBlocked).map((row) => `${row.userId}:${row.contactId}`)
  );

// Presença falsa (funções simples: resetMocks apagaria implementações de jest.fn).
const mockPresenceService = {
  getVisibleStates: async (viewerId: string, ids: string[]): Promise<unknown[]> => {
    const blocked = mockBlockedPairs();
    return ids.map((userId) =>
      blocked.has(`${viewerId}:${userId}`) || blocked.has(`${userId}:${viewerId}`)
        ? { userId, state: 'offline', lastSeenAt: null }
        : {
            userId,
            state: userId === DAVE ? 'online' : 'offline',
            lastSeenAt: userId === DAVE ? null : mockLastSeen,
          }
    );
  },
  setManualStatus: async (): Promise<unknown> => ({ state: 'online', changed: false }),
};

jest.mock('@/shared/database/sequelize', () => ({ __esModule: true, default: {} }));
jest.mock('@/shared/database/models/User', () => ({
  __esModule: true,
  default: { findByPk: jest.fn(), findAndCountAll: jest.fn() },
}));
jest.mock('@/modules/user/models/Contact', () => ({
  __esModule: true,
  default: {
    findByPk: jest.fn(),
    findOne: jest.fn(),
    findAll: jest.fn(),
    findAndCountAll: jest.fn(),
    create: jest.fn(),
  },
}));
jest.mock('@/shared/database/redis', () => {
  const { FakeRedis } = jest.requireActual('../../../support/redis/fakeRedis');
  return { redis: new FakeRedis() };
});
jest.mock('@/modules/presence/services/PresenceService', () => ({
  presenceService: mockPresenceService,
}));
jest.mock('@/modules/auth/middlewares/authenticate', () => ({
  // "Authorization: Bearer <uuid do usuário>".
  authenticate: (req: Request, _res: Response, next: NextFunction): void => {
    const id = (req.headers.authorization ?? '').replace('Bearer ', '');
    req.user = { id, email: `${id}@example.com`, username: id };
    next();
  },
  optionalAuth: (_req: Request, _res: Response, next: NextFunction): void => {
    next();
  },
}));

import Contact from '@/modules/user/models/Contact';
import { blockRoutes } from '@/modules/user/routes/block.routes';
import { contactRoutes } from '@/modules/user/routes/contact.routes';
import { profileRoutes } from '@/modules/user/routes/profile.routes';
import { userRoutes } from '@/modules/user/routes/user.routes';
import User from '@/shared/database/models/User';
import { redis } from '@/shared/database/redis';
import { errorHandler } from '@/shared/middlewares/errorHandler';
import type { FakeRedis } from '../../../support/redis/fakeRedis';

const UserModel = User as unknown as Record<'findByPk' | 'findAndCountAll', jest.Mock>;
const ContactModel = Contact as unknown as Record<
  'findByPk' | 'findOne' | 'findAll' | 'findAndCountAll' | 'create',
  jest.Mock
>;
const as = (userId: string): { Authorization: string } => ({ Authorization: `Bearer ${userId}` });

/** Linha de `users` como o Sequelize a devolve: TODAS as colunas, inclusive status e last seen. */
function userRow(id: string): Record<string, unknown> {
  const attributes = {
    id,
    username: `user_${id.slice(0, 4)}`,
    email: `${id}@example.com`,
    password: 'hash',
    displayName: `User ${id.slice(0, 4)}`,
    avatarUrl: null,
    bio: 'bio',
    status: 'online',
    lastSeenAt: mockLastSeen,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  return {
    ...attributes,
    get: () => ({ ...attributes }),
    toPublicJSON: () => ({
      id,
      username: attributes.username,
      displayName: attributes.displayName,
      avatarUrl: null,
      status: attributes.status,
      lastSeenAt: attributes.lastSeenAt,
    }),
  };
}

/** Linha de `contacts` (com o usuário do contato incluído, como no `include`). */
function contactRow(attributes: ContactRowAttrs): Record<string, unknown> {
  return {
    ...attributes,
    contact: userRow(attributes.contactId),
    toJSON: () => ({ ...attributes }),
    update: async (data: Partial<ContactRowAttrs>): Promise<void> => {
      Object.assign(attributes, data);
    },
  };
}

function addRow(
  userId: string,
  contactId: string,
  extra: Partial<ContactRowAttrs> = {}
): ContactRowAttrs {
  const row: ContactRowAttrs = {
    id: `row-${userId.slice(0, 4)}-${contactId.slice(0, 4)}`,
    userId,
    contactId,
    nickname: null,
    isBlocked: false,
    isFavorite: false,
    blockedAt: null,
    createdByBlock: false,
    lastInteractionAt: null,
    createdAt: new Date('2026-02-01T00:00:00.000Z'),
    updatedAt: new Date('2026-02-01T00:00:00.000Z'),
    ...extra,
  };
  mockContactRows.push(row);
  return row;
}

/** `where` simples do Sequelize: igualdade, `{ [Op.in]: [...] }` e `[Op.or]: [...]`. */
function matches(row: ContactRowAttrs, where: Record<string | symbol, unknown>): boolean {
  const alternatives = where[Op.or] as Record<string, unknown>[] | undefined;
  if (alternatives !== undefined && !alternatives.some((alt) => matches(row, alt))) {
    return false;
  }
  return Object.entries(where).every(([field, expected]) => {
    const value = row[field as keyof ContactRowAttrs];
    if (expected !== null && typeof expected === 'object' && Op.in in expected) {
      return (expected as Record<symbol, unknown[]>)[Op.in]!.includes(value);
    }
    return value === expected;
  });
}

const select = (where: Record<string | symbol, unknown>): Record<string, unknown>[] =>
  mockContactRows.filter((row) => matches(row, where)).map(contactRow);

/** Nenhuma chave `status`/`lastSeenAt` fora de `presence` (a única fonte do estado). */
function presenceFieldsOutsidePresence(value: unknown, path = '$'): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      presenceFieldsOutsidePresence(item, `${path}[${String(index)}]`)
    );
  }
  if (value === null || typeof value !== 'object') {
    return [];
  }
  return Object.entries(value).flatMap(([key, child]) => {
    if (key === 'presence') {
      return [];
    }
    const here = key === 'status' || key === 'lastSeenAt' ? [`${path}.${key}`] : [];
    return [...here, ...presenceFieldsOutsidePresence(child, `${path}.${key}`)];
  });
}

describe('Privacidade: status/lastSeenAt de outros usuários só pela presença', () => {
  let app: express.Application;

  beforeEach(() => {
    (redis as unknown as FakeRedis).flushall();
    mockContactRows.splice(0);
    addRow(ANA, BOB, { nickname: 'Bob' });
    addRow(BOB, ANA, { isBlocked: true, blockedAt: new Date(), createdByBlock: true });
    addRow(ANA, CAROL, { isBlocked: true, blockedAt: new Date() });
    addRow(ANA, DAVE, { isFavorite: true });

    UserModel.findByPk.mockImplementation(async (id: string) =>
      mockUserIds.includes(id) ? userRow(id) : null
    );
    UserModel.findAndCountAll.mockImplementation(async () => ({
      count: mockUserIds.length - 1,
      rows: mockUserIds.filter((id) => id !== ANA).map(userRow),
    }));
    ContactModel.findAndCountAll.mockImplementation(
      async ({ where }: { where: Record<string, unknown> }) => {
        const rows = select(where);
        return { count: rows.length, rows };
      }
    );
    ContactModel.findAll.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
      select(where)
    );
    ContactModel.findOne.mockImplementation(
      async ({ where }: { where: Record<string, unknown> }) => select(where)[0] ?? null
    );
    ContactModel.findByPk.mockImplementation(async (id: string) => {
      const row = mockContactRows.find((candidate) => candidate.id === id);
      return row === undefined ? null : contactRow(row);
    });
    ContactModel.create.mockImplementation(async (data: Partial<ContactRowAttrs>) =>
      contactRow(addRow(data.userId!, data.contactId!, data))
    );

    app = express();
    app.use(express.json());
    app.use('/api/contacts', contactRoutes);
    app.use('/api/blocks', blockRoutes);
    app.use('/api/users', userRoutes);
    app.use('/api/profile', profileRoutes);
    app.use(errorHandler);
  });

  it('GET /api/contacts: quem bloqueou (Bob) aparece só com a presença escondida', async () => {
    const response = await request(app).get('/api/contacts').set(as(ANA));

    expect(response.status).toBe(200);
    expect(presenceFieldsOutsidePresence(response.body)).toEqual([]);
    const byId = new Map(
      (
        response.body.data.contacts as { contactId: string; contact: unknown; presence: unknown }[]
      ).map((item) => [item.contactId, item])
    );
    expect(Object.keys(byId.get(BOB)!.contact as object).sort()).toEqual([
      'avatarUrl',
      'displayName',
      'id',
      'username',
    ]);
    expect(byId.get(BOB)!.presence).toEqual({ state: 'offline', lastSeenAt: null });
    expect(byId.get(DAVE)!.presence).toEqual({ state: 'online', lastSeenAt: null });
  });

  it('GET /api/contacts?isBlocked=true e GET /api/blocks: quem a Ana bloqueou não expõe status/lastSeenAt', async () => {
    const blockedContacts = await request(app).get('/api/contacts?isBlocked=true').set(as(ANA));
    const blocks = await request(app).get('/api/blocks').set(as(ANA));
    const blocksOfBob = await request(app).get('/api/blocks').set(as(BOB));

    expect(blockedContacts.status).toBe(200);
    expect(
      blockedContacts.body.data.contacts.map((c: { contactId: string }) => c.contactId)
    ).toEqual([CAROL]);
    expect(blocks.body.data.map((c: { contactId: string }) => c.contactId)).toEqual([CAROL]);
    expect(blocksOfBob.body.data.map((c: { contactId: string }) => c.contactId)).toEqual([ANA]);
    for (const response of [blockedContacts, blocks, blocksOfBob]) {
      expect(presenceFieldsOutsidePresence(response.body)).toEqual([]);
    }
  });

  it('GET /api/contacts/:id, /favorites e /online e POST/PATCH de contato não expõem status/lastSeenAt', async () => {
    const one = await request(app).get(`/api/contacts/${BOB}`).set(as(ANA));
    const favorites = await request(app).get('/api/contacts/favorites').set(as(ANA));
    const online = await request(app).get('/api/contacts/online').set(as(ANA));
    const added = await request(app).post('/api/contacts').set(as(ANA)).send({ contactId: ERIN });
    const updated = await request(app)
      .patch(`/api/contacts/${BOB}`)
      .set(as(ANA))
      .send({ nickname: 'Roberto' });

    expect([one.status, favorites.status, online.status, added.status, updated.status]).toEqual([
      200, 200, 200, 201, 200,
    ]);
    expect(one.body.data.contact).toEqual({
      id: BOB,
      username: `user_${BOB.slice(0, 4)}`,
      displayName: `User ${BOB.slice(0, 4)}`,
      avatarUrl: null,
    });
    expect(online.body.data.map((c: { contactId: string }) => c.contactId)).toEqual([DAVE]);
    for (const response of [one, favorites, online, added, updated]) {
      expect(presenceFieldsOutsidePresence(response.body)).toEqual([]);
    }
  });

  it('GET /api/users/search (mesmo com excludeBlocked=false) não expõe status/lastSeenAt', async () => {
    const response = await request(app)
      .get('/api/users/search?query=user&excludeBlocked=false')
      .set(as(ANA));

    expect(response.status).toBe(200);
    expect(response.body.data.map((u: { id: string }) => u.id)).toEqual([BOB, CAROL, DAVE, ERIN]);
    expect(presenceFieldsOutsidePresence(response.body)).toEqual([]);
  });

  it.each([
    ['quem foi bloqueado vendo quem bloqueou', ANA, BOB],
    ['quem bloqueou vendo quem foi bloqueado', BOB, ANA],
    ['quem bloqueou (Ana) vendo a bloqueada (Carol)', ANA, CAROL],
    ['sem bloqueio', ANA, DAVE],
  ])('GET /api/profile/:userId (%s) não expõe status/lastSeenAt', async (_case, viewer, target) => {
    const response = await request(app).get(`/api/profile/${target}`).set(as(viewer));

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      id: target,
      username: `user_${target.slice(0, 4)}`,
      displayName: `User ${target.slice(0, 4)}`,
      avatarUrl: null,
      bio: 'bio',
    });
  });

  it('GET /api/profile (o próprio perfil) mantém status e lastSeenAt', async () => {
    const response = await request(app).get('/api/profile').set(as(ANA));

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      id: ANA,
      status: 'online',
      lastSeenAt: mockLastSeen.toISOString(),
    });
  });
});
