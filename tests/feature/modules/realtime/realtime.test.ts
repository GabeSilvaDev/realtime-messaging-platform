// Integração do tempo real: servidor HTTP real em porta efêmera + createRealtimeServer +
// socket.io-client. Services do chat reais (singletons) sobre repositórios em memória; auth e
// módulo user falsos. Sem Docker e sem .env.
import express, { type NextFunction, type Request, type Response } from 'express';
import { createServer, type Server as HttpServer } from 'http';
import type { AddressInfo } from 'net';
import request from 'supertest';
import { io as connect, type Socket as ClientSocket } from 'socket.io-client';

const ANA = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const CAROL = '33333333-3333-4333-8333-333333333333';
const TYPING_TTL_MS = 150;

// Funções simples (não jest.fn) porque resetMocks:true apagaria implementações.
const mockUsers = new Set<string>([ANA, BOB, CAROL]);
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
const mockContactService = { isBlockedByEither: async (): Promise<boolean> => false };

jest.mock('@/modules/user/services/UserService', () => ({ userService: mockUserService }));
jest.mock('@/modules/user/services/ContactService', () => ({
  contactService: mockContactService,
}));
jest.mock('@/modules/chat/repositories', () =>
  jest.requireActual('../../../support/chat/inMemoryChat').createInMemoryChatRepositories()
);
jest.mock('@/modules/auth/services/AuthService', () => ({ authService: {} }));
jest.mock('@/shared/database/redis', () => ({ redis: {} }));
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
import { conversationRoutes } from '@/modules/chat/routes/conversation.routes';
import { createRealtimeServer, type RealtimeServerHandle } from '@/modules/realtime/server';
import { TypingService } from '@/modules/realtime/services';
import type { AckResponse } from '@/modules/realtime/types';
import { initLogger, LogCategory, LogLevel } from '@/shared/logger';
import { errorHandler } from '@/shared/middlewares/errorHandler';
import type { InMemoryChatStore } from '../../../support/chat/inMemoryChat';

const store = (chatRepositories as unknown as { store: InMemoryChatStore }).store;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// Handshake: o token é o próprio id do usuário (UUID); qualquer outra coisa é inválida.
const fakeAuth = {
  validateAccessToken: (token: string): { valid: boolean; userId?: string } =>
    UUID.test(token) ? { valid: true, userId: token } : { valid: false },
};

interface WireMessage {
  id: string;
  conversationId: string;
  senderId: string;
  clientMessageId: string | null;
  content: { text: string } | null;
}

describe('Tempo real — integração com socket.io-client', () => {
  let app: express.Application;
  let httpServer: HttpServer;
  let realtime: RealtimeServerHandle;
  let url: string;
  const clients: ClientSocket[] = [];

  function client(token: string, options: { reconnection?: boolean } = {}): ClientSocket {
    const socket = connect(url, {
      auth: { token },
      transports: ['websocket'],
      forceNew: true,
      reconnection: options.reconnection ?? false,
      reconnectionDelay: 10,
      reconnectionDelayMax: 20,
    });
    clients.push(socket);
    return socket;
  }

  async function connected(token: string): Promise<ClientSocket> {
    const socket = client(token);
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

  /** Coleta tudo que chegar em `event` durante `ms` (para provar que NÃO chegou). */
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

  async function createDirect(from: string, to: string): Promise<string> {
    const response = await request(app)
      .post('/api/conversations/direct')
      .set('Authorization', `Bearer ${from}`)
      .send({ userId: to });
    return response.body.data.id as string;
  }

  async function send(
    socket: ClientSocket,
    payload: Record<string, unknown>
  ): Promise<AckResponse<WireMessage>> {
    return (await socket.emitWithAck('message:send', payload)) as AckResponse<WireMessage>;
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
    app.use(errorHandler);

    httpServer = createServer(app);
    realtime = createRealtimeServer(httpServer, {
      auth: fakeAuth,
      typing: new TypingService(TYPING_TTL_MS),
      env: { NODE_ENV: 'test' },
    });
    await new Promise<void>((resolve) => {
      httpServer.listen(0, resolve);
    });
    url = `http://localhost:${String((httpServer.address() as AddressInfo).port)}`;
  });

  afterEach(() => {
    clients.splice(0).forEach((socket) => socket.disconnect());
    store.reset();
  });

  afterAll(async () => {
    await realtime.close();
  });

  describe('handshake', () => {
    it.each([
      ['sem token', ''],
      ['com token inválido', 'nao-e-um-token'],
    ])('%s → connect_error UNAUTHORIZED', async (_case, token) => {
      const error = await new Promise<Error>((resolve) => {
        client(token).once('connect_error', resolve);
      });

      expect(error.message).toBe('UNAUTHORIZED');
    });
  });

  describe('mensagens', () => {
    it('envio via socket chega ao outro participante em menos de 100 ms (e ao remetente)', async () => {
      const conversationId = await createDirect(ANA, BOB);
      const ana = await connected(ANA);
      const bob = await connected(BOB);

      const bobReceives = next<WireMessage>(bob, 'message:new');
      const anaReceives = next<WireMessage>(ana, 'message:new');
      const startedAt = Date.now();
      const ack = await send(ana, { conversationId, text: 'olá, bob' });
      const received = await bobReceives;
      const elapsed = Date.now() - startedAt;

      expect(ack.ok).toBe(true);
      expect(received.content?.text).toBe('olá, bob');
      expect(received.senderId).toBe(ANA);
      expect(elapsed).toBeLessThan(100);
      if (ack.ok) {
        expect(received.id).toBe(ack.data.id);
        expect((await anaReceives).id).toBe(ack.data.id);
      }
    });

    it('ack de erro: não participante recebe 404 e payload inválido 400', async () => {
      const conversationId = await createDirect(ANA, BOB);
      const carol = await connected(CAROL);

      const outsider = await send(carol, { conversationId, text: 'intrusa' });
      const invalid = await send(carol, { conversationId: 'x', text: '' });

      expect(outsider).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'NOT_FOUND', statusCode: 404 }),
      });
      expect(invalid).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'VALIDATION_ERROR', statusCode: 400 }),
      });
    });

    it('clientMessageId repetido devolve a mesma mensagem e não gera novo message:new', async () => {
      const conversationId = await createDirect(ANA, BOB);
      const ana = await connected(ANA);
      const bob = await connected(BOB);
      const clientMessageId = '77777777-7777-4777-8777-777777777777';

      const seenByBob = collect<WireMessage>(bob, 'message:new', 300);
      const first = await send(ana, { conversationId, text: 'uma vez', clientMessageId });
      const retry = await send(ana, { conversationId, text: 'uma vez', clientMessageId });

      expect(first.ok && retry.ok && first.data.id === retry.data.id).toBe(true);
      expect(await seenByBob).toHaveLength(1);
      expect(store.messages).toHaveLength(1);
    });
  });

  describe('status (RF003.4)', () => {
    it('delivered → só o remetente recebe message:status delivered', async () => {
      const conversationId = await createDirect(ANA, BOB);
      const ana = await connected(ANA);
      const bob = await connected(BOB);
      const sent = await send(ana, { conversationId, text: 'chegou?' });
      const messageId = sent.ok ? sent.data.id : '';

      const anaStatus = next<Record<string, unknown>>(ana, 'message:status');
      const bobStatus = collect(bob, 'message:status', 200);
      const ack = await bob.emitWithAck('message:delivered', { conversationId, messageId });

      expect(ack).toEqual({ ok: true, data: null });
      expect(await anaStatus).toEqual({
        type: 'delivered',
        conversationId,
        messageId,
        userId: BOB,
        at: expect.any(String),
      });
      expect(await bobStatus).toEqual([]);
    });

    it('read → a room da conversa recebe message:status read', async () => {
      const conversationId = await createDirect(ANA, BOB);
      const ana = await connected(ANA);
      const bob = await connected(BOB);
      await send(ana, { conversationId, text: 'm1' });
      const last = await send(ana, { conversationId, text: 'm2' });
      const upToMessageId = last.ok ? last.data.id : '';

      const anaStatus = next<Record<string, unknown>>(ana, 'message:status');
      const bobStatus = next<Record<string, unknown>>(bob, 'message:status');
      const ack = await bob.emitWithAck('message:read', {
        conversationId,
        messageId: upToMessageId,
      });

      expect(ack).toEqual({ ok: true, data: null });
      const expected = {
        type: 'read',
        conversationId,
        userId: BOB,
        upToMessageId,
        at: expect.any(String),
      };
      expect(await anaStatus).toEqual(expected);
      expect(await bobStatus).toEqual(expected);
      expect(store.messages.every((m) => m.readBy.some((entry) => entry.userId === BOB))).toBe(
        true
      );
    });
  });

  describe('digitação (RF003.5)', () => {
    it('start → o outro recebe isTyping=true (o próprio não); stop → false', async () => {
      const conversationId = await createDirect(ANA, BOB);
      const ana = await connected(ANA);
      const bob = await connected(BOB);

      const anaIndicators = collect(ana, 'typing:indicator', 250);
      const typingOn = next(bob, 'typing:indicator');
      expect(await ana.emitWithAck('typing:start', { conversationId })).toEqual({
        ok: true,
        data: null,
      });
      expect(await typingOn).toEqual({ conversationId, userId: ANA, isTyping: true });

      const typingOff = next(bob, 'typing:indicator');
      await ana.emitWithAck('typing:stop', { conversationId });
      expect(await typingOff).toEqual({ conversationId, userId: ANA, isTyping: false });
      expect(await anaIndicators).toEqual([]);
    });

    it('sem novo start, expira sozinho (TTL injetado) com isTyping=false', async () => {
      const conversationId = await createDirect(ANA, BOB);
      const ana = await connected(ANA);
      const bob = await connected(BOB);

      const typingOn = next(bob, 'typing:indicator');
      await ana.emitWithAck('typing:start', { conversationId });
      await typingOn;
      const startedAt = Date.now();

      const expired = await next(bob, 'typing:indicator');

      expect(expired).toEqual({ conversationId, userId: ANA, isTyping: false });
      expect(Date.now() - startedAt).toBeGreaterThanOrEqual(TYPING_TTL_MS - 20);
    });

    it('grupo não emite typing (ack 400)', async () => {
      const created = await request(app)
        .post('/api/conversations/group')
        .set('Authorization', `Bearer ${ANA}`)
        .send({ name: 'Time', participantIds: [BOB] });
      const conversationId = created.body.data.id as string;
      const ana = await connected(ANA);
      const bob = await connected(BOB);

      const bobIndicators = collect(bob, 'typing:indicator', 200);
      const ack = await ana.emitWithAck('typing:start', { conversationId });

      expect(ack).toEqual({
        ok: false,
        error: expect.objectContaining({ code: 'BAD_REQUEST', statusCode: 400 }),
      });
      expect(await bobIndicators).toEqual([]);
    });
  });

  describe('rooms', () => {
    it('reconexão automática re-entra nas rooms e volta a receber mensagens', async () => {
      const conversationId = await createDirect(ANA, BOB);
      const bob = await connected(BOB);
      const ana = client(ANA, { reconnection: true });
      await next(ana, 'connect');

      const reconnected = next(ana, 'connect');
      ana.io.engine.close();
      await reconnected;

      const received = next<WireMessage>(ana, 'message:new');
      await send(bob, { conversationId, text: 'depois da reconexão' });

      expect((await received).content?.text).toBe('depois da reconexão');
    });

    it('conversa criada via REST: o socket do participante entra na room e recebe mensagens', async () => {
      const carol = await connected(CAROL);
      const ana = await connected(ANA);

      const announced = next<{ conversationId: string; type: string }>(carol, 'conversation:new');
      const conversationId = await createDirect(ANA, CAROL);
      expect(await announced).toEqual({ conversationId, type: 'direct' });

      const received = next<WireMessage>(carol, 'message:new');
      await send(ana, { conversationId, text: 'bem-vinda' });

      expect((await received).conversationId).toBe(conversationId);
    });

    it('membro removido via REST é avisado e deixa de receber mensagens do grupo', async () => {
      const created = await request(app)
        .post('/api/conversations/group')
        .set('Authorization', `Bearer ${ANA}`)
        .send({ name: 'Time', participantIds: [BOB, CAROL] });
      const conversationId = created.body.data.id as string;
      const ana = await connected(ANA);
      const carol = await connected(CAROL);

      const notified = next<{ change: string }>(carol, 'conversation:updated');
      const removed = await request(app)
        .delete(`/api/conversations/${conversationId}/members/${CAROL}`)
        .set('Authorization', `Bearer ${ANA}`);
      expect(removed.status).toBe(204);
      expect(await notified).toEqual(
        expect.objectContaining({ conversationId, change: 'member_removed' })
      );

      const carolMessages = collect(carol, 'message:new', 200);
      await send(ana, { conversationId, text: 'só para quem ficou' });

      expect(await carolMessages).toEqual([]);
    });
  });
});
