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
import { initLogger, LogCategory, LogLevel } from '@/shared/logger';

const mockCreateAdapter = createAdapter as jest.Mock;
const USER_A = '11111111-1111-4111-8111-111111111111';
const CONVERSATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

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
      const pub = { quit: jest.fn().mockResolvedValue('OK') };
      const sub = { quit: jest.fn().mockResolvedValue('OK') };
      const redisClient = {
        duplicate: jest.fn().mockReturnValueOnce(pub).mockReturnValueOnce(sub),
      };
      mockCreateAdapter.mockReturnValue(Adapter);

      const handle = createRealtimeServer(createServer(), {
        ...fakeDeps(),
        bus,
        redisClient: redisClient as never,
        env: { NODE_ENV: 'production' },
      });

      expect(redisClient.duplicate).toHaveBeenCalledTimes(2);
      expect(mockCreateAdapter).toHaveBeenCalledWith(pub, sub);
      await handle.close();
      expect(pub.quit).toHaveBeenCalledTimes(1);
      expect(sub.quit).toHaveBeenCalledTimes(1);
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

    it('close cancela a ponte do EventBus', async () => {
      expect(bus.subscriberCount()).toBeGreaterThan(0);

      await handle.close();

      expect(bus.subscriberCount()).toBe(0);
    });
  });
});
