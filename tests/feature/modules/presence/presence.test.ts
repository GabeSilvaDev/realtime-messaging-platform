// Integração da presença: servidor HTTP real em porta efêmera + createRealtimeServer com os hooks
// da presença + ponte + socket.io-client. PresenceService, ConversationService e o cache reais
// sobre um Redis em memória (FakeRedis) e repositórios do chat em memória; módulo user e auth
// falsos. TTL/heartbeat/varredura curtos injetados. Sem Docker e sem .env.
import express, { type NextFunction, type Request, type Response } from 'express';
import { createServer, type Server as HttpServer } from 'http';
import type { AddressInfo } from 'net';
import request from 'supertest';
import { io as connect, type Socket as ClientSocket } from 'socket.io-client';

const ANA = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const CAROL = '33333333-3333-4333-8333-333333333333';
const DAVE = '44444444-4444-4444-8444-444444444444';

const PRESENCE_TTL_MS = 400;
const HEARTBEAT_MS = 100;
const SWEEP_MS = 150;

// Módulo user em memória. Funções simples (não jest.fn): resetMocks:true apagaria implementações.
const mockUsers = new Set<string>([ANA, BOB, CAROL, DAVE]);
const mockLastSeen = new Map<string, Date>();
const mockContacts = new Set<string>(); // "<dono>:<contato>"
const mockBlocks = new Set<string>(); // "<quem bloqueou>:<bloqueado>"
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
        lastSeenAt: mockLastSeen.get(id) ?? null,
      })),
  updateLastSeen: async (id: string, at: Date): Promise<void> => {
    mockLastSeen.set(id, at);
  },
};
const mockBlockedEither = (a: string, b: string): boolean =>
  mockBlocks.has(`${a}:${b}`) || mockBlocks.has(`${b}:${a}`);
const mockContactService = {
  isBlockedByEither: async (a: string, b: string): Promise<boolean> => mockBlockedEither(a, b),
  listWatchers: async (userId: string): Promise<string[]> =>
    [...mockContacts].filter((row) => row.endsWith(`:${userId}`)).map((row) => row.split(':')[0]!),
  listContactIds: async (userId: string): Promise<string[]> =>
    [...mockContacts]
      .filter((row) => row.startsWith(`${userId}:`))
      .map((row) => row.split(':')[1]!),
  listBlockedEitherIds: async (userId: string): Promise<string[]> =>
    [...mockUsers].filter((other) => mockBlockedEither(userId, other)),
  getContactsByIds: async (userId: string, ids: string[]): Promise<unknown[]> =>
    ids
      .filter((id) => mockContacts.has(`${userId}:${id}`))
      .map((id) => ({
        id: `row-${id}`,
        userId,
        contactId: id,
        nickname: null,
        contact: { id, username: `user_${id.slice(0, 4)}`, displayName: null },
      })),
};

jest.mock('@/modules/user/services/UserService', () => ({ userService: mockUserService }));
jest.mock('@/modules/user/services/ContactService', () => ({
  contactService: mockContactService,
}));
jest.mock('@/modules/chat/repositories', () =>
  jest.requireActual('../../../support/chat/inMemoryChat').createInMemoryChatRepositories()
);
jest.mock('@/shared/database/redis', () => {
  const { FakeRedis } = jest.requireActual('../../../support/redis/fakeRedis');
  return { redis: new FakeRedis() };
});
jest.mock('@/modules/auth/services/AuthService', () => ({ authService: {} }));
jest.mock('@/modules/auth/middlewares/authenticate', () => ({
  // REST: "Authorization: Bearer <uuid do usuário>".
  authenticate: (req: Request, _res: Response, next: NextFunction): void => {
    const id = (req.headers.authorization ?? '').replace('Bearer ', '');
    req.user = { id, email: `${id}@example.com`, username: id };
    next();
  },
  optionalAuth: (_req: Request, _res: Response, next: NextFunction): void => {
    next();
  },
}));

import * as chatRepositories from '@/modules/chat/repositories';
import { registerChatCacheListeners } from '@/modules/chat/listeners';
import { conversationRoutes } from '@/modules/chat/routes/conversation.routes';
import { registerPresenceCacheListeners } from '@/modules/presence/listeners';
import { createPresenceRealtime, registerPresenceBridge } from '@/modules/presence/realtime';
import { presenceRoutes } from '@/modules/presence/routes';
import { PresenceService } from '@/modules/presence/services';
import { createRealtimeServer, type RealtimeServerHandle } from '@/modules/realtime/server';
import type { AckResponse, PresenceUpdatePayload } from '@/modules/realtime/types';
import { contactRoutes } from '@/modules/user/routes/contact.routes';
import { profileRoutes } from '@/modules/user/routes/profile.routes';
import { redis } from '@/shared/database/redis';
import { eventBus } from '@/shared/event-bus';
import { initLogger, LogCategory, LogLevel } from '@/shared/logger';
import { errorHandler } from '@/shared/middlewares/errorHandler';
import { UserEvents } from '@/shared/types';
import type { InMemoryChatStore } from '../../../support/chat/inMemoryChat';
import type { FakeRedis } from '../../../support/redis/fakeRedis';

const store = (chatRepositories as unknown as { store: InMemoryChatStore }).store;
const fakeRedis = redis as unknown as FakeRedis;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// Handshake: o token é o próprio id do usuário (UUID).
const fakeAuth = {
  validateAccessToken: (token: string): { valid: boolean; userId?: string } =>
    UUID.test(token) ? { valid: true, userId: token } : { valid: false },
};

type Update = PresenceUpdatePayload & { lastSeenAt: string | null };

describe('Presença — integração com socket.io-client', () => {
  const presence = new PresenceService({ ttlMs: PRESENCE_TTL_MS });
  const presenceRealtime = createPresenceRealtime({
    presence,
    heartbeatMs: HEARTBEAT_MS,
    sweepMs: SWEEP_MS,
  });
  let app: express.Application;
  let httpServer: HttpServer;
  let realtime: RealtimeServerHandle;
  let url: string;
  let stopListeners: (() => void)[] = [];
  const clients: ClientSocket[] = [];

  async function connected(userId: string): Promise<ClientSocket> {
    const socket = connect(url, {
      auth: { token: userId },
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });
    clients.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => {
        resolve();
      });
      socket.once('connect_error', reject);
    });
    return socket;
  }

  /** Próximo `event` que satisfaz `predicate`; falha em 2s (timer sempre limpo). */
  function next<T>(
    socket: ClientSocket,
    event: string,
    predicate: (payload: T) => boolean = () => true
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.off(event, listener);
        reject(new Error(`timeout esperando ${event}`));
      }, 2000);
      const listener = (payload: T): void => {
        if (predicate(payload)) {
          clearTimeout(timer);
          socket.off(event, listener);
          resolve(payload);
        }
      };
      socket.on(event, listener);
    });
  }

  /** Tudo que chegar em `event` durante `ms` (para provar que NÃO chegou). */
  async function collect<T>(socket: ClientSocket, event: string, ms: number): Promise<T[]> {
    const received: T[] = [];
    const listener = (payload: T): void => {
      received.push(payload);
    };
    socket.on(event, listener);
    await new Promise((resolve) => setTimeout(resolve, ms));
    socket.off(event, listener);
    return received;
  }

  const update = (userId: string, state: string) => (payload: Update) =>
    payload.userId === userId && payload.state === state;

  /** Espera até `condition` valer (polling de 10 ms, falha em 2 s). */
  async function waitFor(condition: () => boolean): Promise<void> {
    const deadline = Date.now() + 2000;
    while (!condition()) {
      if (Date.now() > deadline) {
        throw new Error('condição não satisfeita em 2s');
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  const connectionKeys = (): string[] =>
    fakeRedis.keys().filter((key) => key.startsWith('presence:conns:'));

  async function addContact(owner: string, target: string): Promise<void> {
    mockContacts.add(`${owner}:${target}`);
    await eventBus.publish(UserEvents.CONTACT_ADDED, { userId: owner, contactId: target });
  }

  async function block(userId: string, target: string): Promise<void> {
    mockBlocks.add(`${userId}:${target}`);
    await eventBus.publish(UserEvents.BLOCKED, { userId, blockedUserId: target });
  }

  async function unblock(userId: string, target: string): Promise<void> {
    mockBlocks.delete(`${userId}:${target}`);
    await eventBus.publish(UserEvents.UNBLOCKED, { userId, unblockedUserId: target });
  }

  /** Desconecta a única aba do usuário e espera o servidor registrar o offline. */
  async function disconnect(socket: ClientSocket, userId: string): Promise<void> {
    socket.disconnect();
    await waitFor(() => !connectionKeys().includes(`presence:conns:${userId}`));
  }

  beforeAll(async () => {
    initLogger({
      service: 'test',
      environment: 'test',
      minLevel: LogLevel.FATAL,
      enableConsole: false,
      enableMongo: false,
      category: LogCategory.SYSTEM,
    });

    app = express();
    app.use(express.json());
    app.use('/api/conversations', conversationRoutes);
    app.use('/api/presence', presenceRoutes);
    app.use('/api/contacts', contactRoutes);
    app.use('/api/profile', profileRoutes);
    app.use(errorHandler);

    httpServer = createServer(app);
    realtime = createRealtimeServer(httpServer, {
      auth: fakeAuth,
      env: { NODE_ENV: 'test' },
      onConnection: [presenceRealtime.onConnection],
      onDisconnect: [presenceRealtime.onDisconnect],
    });
    stopListeners = [
      registerPresenceBridge(realtime.io, { presence }),
      registerPresenceCacheListeners(),
      registerChatCacheListeners(),
    ];
    presenceRealtime.start();
    await new Promise<void>((resolve) => {
      httpServer.listen(0, resolve);
    });
    url = `http://localhost:${String((httpServer.address() as AddressInfo).port)}`;
  });

  afterEach(async () => {
    clients.splice(0).forEach((socket) => socket.disconnect());
    // Os hooks de desconexão terminam antes do próximo teste (sem eventos atrasados).
    await waitFor(() => connectionKeys().length === 0);
    fakeRedis.flushall();
    store.reset();
    mockContacts.clear();
    mockBlocks.clear();
    mockLastSeen.clear();
  });

  afterAll(async () => {
    presenceRealtime.stop();
    stopListeners.forEach((stop) => {
      stop();
    });
    await realtime.close();
  });

  it('duas abas: online uma vez; offline (com lastSeenAt) só quando as duas fecham', async () => {
    await addContact(BOB, ANA);
    const bob = await connected(BOB);

    const online = next<Update>(bob, 'presence:update', update(ANA, 'online'));
    const startedAt = Date.now();
    const tab1 = await connected(ANA);
    await online;
    expect(Date.now() - startedAt).toBeLessThan(3000);

    const quiet = collect<Update>(bob, 'presence:update', 300);
    const tab2 = await connected(ANA);
    tab1.disconnect();
    expect(await quiet).toEqual([]);

    const offline = next<Update>(bob, 'presence:update', update(ANA, 'offline'));
    tab2.disconnect();
    const received = await offline;

    expect(received.lastSeenAt).toBe(mockLastSeen.get(ANA)?.toISOString());
    expect(connectionKeys()).toEqual([`presence:conns:${BOB}`]);
  });

  it('snapshot ao conectar e presence:set chegam ao contato em menos de 3 s (e às outras abas)', async () => {
    await addContact(BOB, ANA);
    const ana = await connected(ANA);
    const anaOtherTab = await connected(ANA);

    const bob = connect(url, { auth: { token: BOB }, transports: ['websocket'], forceNew: true });
    clients.push(bob);
    const snapshot = await next<{ states: Update[] }>(bob, 'presence:snapshot');
    expect(snapshot.states).toEqual([{ userId: ANA, state: 'online', lastSeenAt: null }]);

    const seenByBob = next<Update>(bob, 'presence:update', update(ANA, 'busy'));
    const seenByOtherTab = next<Update>(anaOtherTab, 'presence:update', update(ANA, 'busy'));
    const startedAt = Date.now();
    const ack = (await ana.emitWithAck('presence:set', { status: 'busy' })) as AckResponse<unknown>;

    expect(ack).toEqual({ ok: true, data: { state: 'busy' } });
    await seenByBob;
    await seenByOtherTab;
    expect(Date.now() - startedAt).toBeLessThan(3000);
  });

  it('status manual persiste após reconectar (REST e reconexão)', async () => {
    await addContact(BOB, ANA);
    const bob = await connected(BOB);
    const ana = await connected(ANA);

    const status = await request(app)
      .put('/api/presence/status')
      .set('Authorization', `Bearer ${ANA}`)
      .send({ status: 'away' });
    expect(status.status).toBe(204);
    await disconnect(ana, ANA);

    const back = next<Update>(bob, 'presence:update', update(ANA, 'away'));
    await connected(ANA);
    await back;

    const query = await request(app)
      .get(`/api/presence?userIds=${ANA}`)
      .set('Authorization', `Bearer ${BOB}`);
    expect(query.body.data.items).toEqual([{ userId: ANA, state: 'away', lastSeenAt: null }]);
  });

  it('bloqueio: cada lado vê o outro offline na hora, deixa de receber avisos e o REST esconde', async () => {
    const created = await request(app)
      .post('/api/conversations/direct')
      .set('Authorization', `Bearer ${ANA}`)
      .send({ userId: BOB });
    expect(created.status).toBe(201);
    const bob = await connected(BOB);
    const ana = await connected(ANA);

    const hiddenForBob = next<Update>(bob, 'presence:update', update(ANA, 'offline'));
    const hiddenForAna = next<Update>(ana, 'presence:update', update(BOB, 'offline'));
    await block(ANA, BOB);
    expect((await hiddenForBob).lastSeenAt).toBeNull();
    await hiddenForAna;

    const silence = collect<Update>(bob, 'presence:update', 300);
    await ana.emitWithAck('presence:set', { status: 'busy' });
    expect(await silence).toEqual([]);

    const query = await request(app)
      .get(`/api/presence?userIds=${ANA}`)
      .set('Authorization', `Bearer ${BOB}`);
    expect(query.body.data.items).toEqual([{ userId: ANA, state: 'offline', lastSeenAt: null }]);

    const revealed = next<Update>(bob, 'presence:update', update(ANA, 'busy'));
    await unblock(ANA, BOB);
    await revealed;
  });

  it('GET /api/presence é a fonte do lastSeenAt: entregue a quem não tem bloqueio, escondido nos dois sentidos', async () => {
    await addContact(BOB, ANA);
    await disconnect(await connected(ANA), ANA);
    const lastSeen = mockLastSeen.get(ANA)!.toISOString();
    const query = (viewer: string, target: string): Promise<request.Response> =>
      request(app).get(`/api/presence?userIds=${target}`).set('Authorization', `Bearer ${viewer}`);

    expect((await query(BOB, ANA)).body.data.items).toEqual([
      { userId: ANA, state: 'offline', lastSeenAt: lastSeen },
    ]);

    await block(BOB, ANA);
    expect((await query(BOB, ANA)).body.data.items).toEqual([
      { userId: ANA, state: 'offline', lastSeenAt: null },
    ]);
    await unblock(BOB, ANA);

    await block(ANA, BOB);
    expect((await query(BOB, ANA)).body.data.items).toEqual([
      { userId: ANA, state: 'offline', lastSeenAt: null },
    ]);
    // Quem não tem bloqueio com a Ana continua vendo o visto por último.
    expect((await query(CAROL, ANA)).body.data.items).toEqual([
      { userId: ANA, state: 'offline', lastSeenAt: lastSeen },
    ]);
  });

  it('conversa 1:1 nova passa a propagar a presença entre os dois', async () => {
    const ana = await connected(ANA);
    const carol = await connected(CAROL);

    const before = collect<Update>(carol, 'presence:update', 200);
    await ana.emitWithAck('presence:set', { status: 'away' });
    expect(await before).toEqual([]);

    await request(app)
      .post('/api/conversations/direct')
      .set('Authorization', `Bearer ${ANA}`)
      .send({ userId: CAROL });
    const after = next<Update>(carol, 'presence:update', update(ANA, 'busy'));
    await ana.emitWithAck('presence:set', { status: 'busy' });
    await after;
  });

  it('heartbeat mantém quem está conectado; a varredura derruba conexão de nó que caiu', async () => {
    await addContact(BOB, ANA);
    await addContact(BOB, DAVE);
    const bob = await connected(BOB);
    await connected(ANA);

    // "Nó que caiu": uma conexão registrada que nunca recebe heartbeat.
    const daveOnline = next<Update>(bob, 'presence:update', update(DAVE, 'online'));
    await presence.connect(DAVE, 'dead-node:socket-1');
    await daveOnline;

    const daveOffline = next<Update>(bob, 'presence:update', update(DAVE, 'offline'));
    const anaUpdates = collect<Update>(bob, 'presence:update', PRESENCE_TTL_MS * 2);
    await daveOffline;

    expect((await anaUpdates).filter((payload) => payload.userId === ANA)).toEqual([]);
    expect((await presence.getStates([ANA])).get(ANA)?.state).toBe('online');
  });

  it('GET /api/contacts/online lista só os contatos conectados', async () => {
    await addContact(BOB, ANA);
    await addContact(BOB, CAROL);
    await connected(ANA);

    const response = await request(app)
      .get('/api/contacts/online')
      .set('Authorization', `Bearer ${BOB}`);

    expect(response.status).toBe(200);
    expect(
      response.body.data.map((c: { contactId: string; presence: unknown }) => [
        c.contactId,
        c.presence,
      ])
    ).toEqual([[ANA, { state: 'online', lastSeenAt: null }]]);
  });

  it('endpoints legados de status delegam à presença; offline responde 400', async () => {
    await addContact(BOB, ANA);
    const bob = await connected(BOB);
    const ana = await connected(ANA);
    await ana.emitWithAck('presence:set', { status: 'busy' });

    const back = next<Update>(bob, 'presence:update', update(ANA, 'online'));
    const online = await request(app)
      .post('/api/profile/online')
      .set('Authorization', `Bearer ${ANA}`);
    expect(online.status).toBe(200);
    await back;

    const offline = await request(app)
      .post('/api/profile/offline')
      .set('Authorization', `Bearer ${ANA}`);
    const statusOffline = await request(app)
      .put('/api/profile/status')
      .set('Authorization', `Bearer ${ANA}`)
      .send({ status: 'offline' });
    expect([offline.status, statusOffline.status]).toEqual([400, 400]);
    expect(offline.body.error.message).toBe(
      'Não é possível definir offline manualmente: use a desconexão'
    );
  });
});
