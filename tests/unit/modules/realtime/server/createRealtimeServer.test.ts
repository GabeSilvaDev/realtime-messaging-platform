jest.mock('@/modules/auth/services/AuthService', () => ({ authService: {} }));
jest.mock('@/modules/chat/services/ConversationService', () => ({ conversationService: {} }));
jest.mock('@/modules/chat/services/MessageService', () => ({ messageService: {} }));
jest.mock('@/shared/database/redis', () => ({ redis: {} }));
jest.mock('@socket.io/redis-adapter', () => ({ createAdapter: jest.fn() }));

import { createServer, type Server as HttpServer } from 'http';
import type { AddressInfo } from 'net';
import { createAdapter } from '@socket.io/redis-adapter';
import { Adapter } from 'socket.io-adapter';
import { io as connect, type Socket as ClientSocket } from 'socket.io-client';
import {
  createRealtimeServer,
  shouldUseRedisAdapter,
  type RealtimeServerHandle,
} from '@/modules/realtime/server/createRealtimeServer';
import { TypingService } from '@/modules/realtime/services/TypingService';
import { EventBus } from '@/shared/event-bus/EventBus';
import { getLogger, initLogger, LogCategory, LogLevel } from '@/shared/logger';
import { AuthEvents } from '@/shared/types';

const mockCreateAdapter = createAdapter as jest.Mock;
const USER_A = '11111111-1111-4111-8111-111111111111';
const CONVERSATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

/** Espera (poll curto) até a condição valer; falha após ~1s. */
async function waitFor(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (condition()) {
      return;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  }
  throw new Error('condição não atingida a tempo');
}

function fakePubSubPair(): {
  pub: { quit: jest.Mock; on: jest.Mock };
  sub: { quit: jest.Mock; on: jest.Mock };
  redisClient: { duplicate: jest.Mock };
} {
  const pub = { quit: jest.fn().mockResolvedValue('OK'), on: jest.fn() };
  const sub = { quit: jest.fn().mockResolvedValue('OK'), on: jest.fn() };
  return {
    pub,
    sub,
    redisClient: { duplicate: jest.fn().mockReturnValueOnce(pub).mockReturnValueOnce(sub) },
  };
}

function fakeDeps(): {
  auth: { validateAccessToken: jest.Mock };
  conversations: { getUserConversationIds: jest.Mock; getTypeForParticipant: jest.Mock };
  messages: { send: jest.Mock; markDelivered: jest.Mock; markRead: jest.Mock };
} {
  return {
    auth: {
      validateAccessToken: jest.fn((token: string) =>
        token === 'good' ? { valid: true, userId: USER_A } : { valid: false }
      ),
    },
    conversations: {
      getUserConversationIds: jest.fn().mockResolvedValue([CONVERSATION_ID]),
      getTypeForParticipant: jest.fn().mockResolvedValue('direct'),
    },
    messages: { send: jest.fn(), markDelivered: jest.fn(), markRead: jest.fn() },
  };
}

describe('createRealtimeServer', () => {
  let bus: EventBus;

  beforeAll(() => {
    // O CORS do Socket.IO usa getLogger(); tests/setup.ts não chama initLogger.
    initLogger({
      service: 'test',
      environment: 'test',
      minLevel: LogLevel.FATAL,
      enableConsole: false,
      enableMongo: false,
      category: LogCategory.SYSTEM,
    });
  });

  beforeEach(() => {
    EventBus.resetInstance();
    bus = EventBus.getInstance();
  });

  afterEach(() => {
    EventBus.resetInstance();
  });

  describe('shouldUseRedisAdapter', () => {
    it.each([
      [{ NODE_ENV: 'production' }, true],
      [{ NODE_ENV: 'development', REALTIME_REDIS_ADAPTER: 'true' }, true],
      [{}, true],
      [{ NODE_ENV: 'test' }, false],
      [{ NODE_ENV: 'production', REALTIME_REDIS_ADAPTER: 'false' }, false],
    ])('%j → %s', (env, expected) => {
      expect(shouldUseRedisAdapter(env)).toBe(expected);
    });

    it('usa process.env por padrão (NODE_ENV=test na suíte)', () => {
      expect(shouldUseRedisAdapter()).toBe(false);
    });
  });

  describe('adapter', () => {
    it('com Redis: duplica o cliente em pub/sub, instala o adapter e fecha ambos no close', async () => {
      const { pub, sub, redisClient } = fakePubSubPair();
      mockCreateAdapter.mockReturnValue(Adapter);

      const handle = createRealtimeServer(createServer(), {
        ...fakeDeps(),
        bus,
        redisClient: redisClient as never,
        env: { NODE_ENV: 'production' },
      });

      expect(redisClient.duplicate).toHaveBeenCalledTimes(2);
      // Sem limite de tentativas por comando: com o Redis fora, os publishes do adapter ficam
      // na fila do ioredis em vez de rejeitar (o adapter não trata a rejeição).
      expect(redisClient.duplicate).toHaveBeenNthCalledWith(1, { maxRetriesPerRequest: null });
      expect(redisClient.duplicate).toHaveBeenNthCalledWith(2, { maxRetriesPerRequest: null });
      expect(mockCreateAdapter).toHaveBeenCalledWith(pub, sub);
      await handle.close();
      expect(pub.quit).toHaveBeenCalledTimes(1);
      expect(sub.quit).toHaveBeenCalledTimes(1);
    });

    it('close é idempotente: memoiza a promise e não toca no Redis mais de uma vez', async () => {
      const { pub, sub, redisClient } = fakePubSubPair();
      mockCreateAdapter.mockReturnValue(Adapter);

      const handle = createRealtimeServer(createServer(), {
        ...fakeDeps(),
        bus,
        redisClient: redisClient as never,
        env: { NODE_ENV: 'production' },
      });

      const first = handle.close();
      const second = handle.close();
      expect(first).toBe(second);

      await Promise.all([first, second]);
      await handle.close();

      expect(pub.quit).toHaveBeenCalledTimes(1);
      expect(sub.quit).toHaveBeenCalledTimes(1);
    });

    it('loga erros dos clientes Redis (pub/sub) do adapter via o logger da aplicação', async () => {
      const { pub, sub, redisClient } = fakePubSubPair();
      mockCreateAdapter.mockReturnValue(Adapter);

      const handle = createRealtimeServer(createServer(), {
        ...fakeDeps(),
        bus,
        redisClient: redisClient as never,
        env: { NODE_ENV: 'production' },
      });

      expect(pub.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(sub.on).toHaveBeenCalledWith('error', expect.any(Function));

      const errorSpy = jest.spyOn(getLogger(), 'error').mockImplementation(() => undefined);
      const pubError = new Error('pub caiu');
      const subError = new Error('sub caiu');
      const [, pubHandler] = pub.on.mock.calls[0] as [string, (error: Error) => void];
      const [, subHandler] = sub.on.mock.calls[0] as [string, (error: Error) => void];
      pubHandler(pubError);
      subHandler(subError);

      expect(errorSpy).toHaveBeenCalledWith(expect.any(String), pubError);
      expect(errorSpy).toHaveBeenCalledWith(expect.any(String), subError);
      errorSpy.mockRestore();

      await handle.close();
    });

    it('em teste ou com REALTIME_REDIS_ADAPTER=false: adapter em memória, sem tocar no Redis', async () => {
      const redisClient = { duplicate: jest.fn() };

      const handles = [
        createRealtimeServer(createServer(), {
          ...fakeDeps(),
          bus,
          redisClient: redisClient as never,
          env: { NODE_ENV: 'test' },
        }),
        createRealtimeServer(createServer(), {
          ...fakeDeps(),
          bus,
          redisClient: redisClient as never,
          env: { NODE_ENV: 'production', REALTIME_REDIS_ADAPTER: 'false' },
        }),
      ];

      expect(redisClient.duplicate).not.toHaveBeenCalled();
      expect(mockCreateAdapter).not.toHaveBeenCalled();
      await Promise.all(handles.map((handle) => handle.close()));
    });

    it('usa os singletons (services, Redis, EventBus, process.env) quando nada é injetado', async () => {
      const handle = createRealtimeServer(createServer());

      expect(handle.io).toBeDefined();
      await handle.close();
    });
  });

  describe('conexão (servidor HTTP real em porta efêmera)', () => {
    let httpServer: HttpServer;
    let handle: RealtimeServerHandle;
    let deps: ReturnType<typeof fakeDeps>;
    let url: string;
    const clients: ClientSocket[] = [];

    function client(token?: string): ClientSocket {
      const socket = connect(url, {
        auth: token === undefined ? {} : { token },
        transports: ['websocket'],
        reconnection: false,
        forceNew: true,
      });
      clients.push(socket);
      return socket;
    }

    beforeEach(async () => {
      deps = fakeDeps();
      httpServer = createServer();
      handle = createRealtimeServer(httpServer, {
        ...deps,
        bus,
        typing: new TypingService(50),
        env: { NODE_ENV: 'test' },
      });
      await new Promise<void>((resolve) => {
        httpServer.listen(0, resolve);
      });
      url = `http://localhost:${String((httpServer.address() as AddressInfo).port)}`;
    });

    afterEach(async () => {
      clients.splice(0).forEach((socket) => socket.disconnect());
      await handle.close();
    });

    it('recusa handshake sem token válido com connect_error UNAUTHORIZED', async () => {
      const error = await new Promise<Error>((resolve) => {
        client('bad').on('connect_error', resolve);
      });

      expect(error.message).toBe('UNAUTHORIZED');
    });

    it('autentica, entra nas rooms e registra os handlers de mensagem e digitação', async () => {
      const socket = client('good');
      await new Promise<void>((resolve) => {
        socket.on('connect', () => {
          resolve();
        });
      });

      const rooms = handle.io.of('/').adapter.rooms;
      expect(rooms.get(`user:${USER_A}`)?.size).toBe(1);
      expect(rooms.get(`conversation:${CONVERSATION_ID}`)?.size).toBe(1);

      await expect(
        socket.emitWithAck('typing:stop', { conversationId: CONVERSATION_ID })
      ).resolves.toEqual({ ok: true, data: null });
      await expect(
        socket.emitWithAck('message:read', { conversationId: CONVERSATION_ID, messageId: 'x' })
      ).resolves.toEqual(expect.objectContaining({ ok: false }));
    });

    it('reconcilia as rooms na conexão: participação removida durante o handshake não fica', async () => {
      // Middleware lê a conversa; na conexão ela já não é do usuário (removido nesse intervalo,
      // quando o socketsLeave da ponte ainda não alcançava o socket).
      deps.conversations.getUserConversationIds
        .mockResolvedValueOnce([CONVERSATION_ID])
        .mockResolvedValueOnce([]);

      const socket = client('good');
      await new Promise<void>((resolve) => {
        socket.on('connect', () => {
          resolve();
        });
      });

      const rooms = handle.io.of('/').adapter.rooms;
      await waitFor(() => !rooms.has(`conversation:${CONVERSATION_ID}`));
      expect(deps.conversations.getUserConversationIds).toHaveBeenCalledTimes(2);
      expect(rooms.get(`user:${USER_A}`)?.size).toBe(1);
    });

    it('derruba o socket quando o access token expira (o cliente precisa de um token novo)', async () => {
      deps.auth.validateAccessToken.mockReturnValue({
        valid: true,
        userId: USER_A,
        exp: (Date.now() + 300) / 1000,
      });

      const socket = client('good');
      const reason = await new Promise<string>((resolve) => {
        socket.on('disconnect', resolve);
      });

      expect(reason).toBe('io server disconnect');
    });

    it('sessões revogadas (SESSIONS_REVOKED) derrubam o socket conectado', async () => {
      const socket = client('good');
      await new Promise<void>((resolve) => {
        socket.on('connect', () => {
          resolve();
        });
      });
      const disconnected = new Promise<string>((resolve) => {
        socket.on('disconnect', resolve);
      });

      await bus.publish(AuthEvents.SESSIONS_REVOKED, { userId: USER_A });

      await expect(disconnected).resolves.toBe('io server disconnect');
    });

    it('close cancela a ponte do EventBus', async () => {
      expect(bus.subscriberCount()).toBeGreaterThan(0);

      await handle.close();

      expect(bus.subscriberCount()).toBe(0);
    });
  });
});
