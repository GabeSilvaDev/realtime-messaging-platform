import type { Server as HttpServer } from 'http';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Redis } from 'ioredis';
import { Server } from 'socket.io';
import type { IAuthService } from '@/modules/auth/interfaces';
import { authService } from '@/modules/auth/services/AuthService';
import type { IConversationService, IMessageService } from '@/modules/chat/interfaces';
import { conversationService } from '@/modules/chat/services/ConversationService';
import { messageService } from '@/modules/chat/services/MessageService';
import { redis } from '@/shared/database/redis';
import { eventBus, type EventBus } from '@/shared/event-bus';
import { buildCorsOptions } from '@/shared/middlewares/cors';
import { registerMessageHandlers, registerTypingHandlers } from '../handlers';
import { registerRealtimeListeners } from '../listeners';
import { createJoinRoomsMiddleware, createSocketAuthMiddleware } from '../middlewares';
import { TypingService } from '../services';
import type { RealtimeServer } from '../types';

export interface RealtimeServerOptions {
  auth?: Pick<IAuthService, 'validateAccessToken'>;
  conversations?: Pick<IConversationService, 'getUserConversationIds' | 'getTypeForParticipant'>;
  messages?: Pick<IMessageService, 'send' | 'markDelivered' | 'markRead'>;
  bus?: Pick<EventBus, 'subscribe'>;
  /** Injetável para testes usarem um TTL curto. */
  typing?: TypingService;
  /** Cliente base duplicado em pub/sub para o Redis adapter. */
  redisClient?: Pick<Redis, 'duplicate'>;
  env?: Record<string, string | undefined>;
}

export interface RealtimeServerHandle {
  io: RealtimeServer;
  /** Fecha os sockets e o servidor HTTP, cancela a ponte do EventBus e os clientes pub/sub. */
  close(): Promise<void>;
}

/** Redis adapter (escala horizontal) fora de `NODE_ENV=test`, salvo `REALTIME_REDIS_ADAPTER=false`. */
export function shouldUseRedisAdapter(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.REALTIME_REDIS_ADAPTER !== 'false' && env.NODE_ENV !== 'test';
}

/**
 * Cria o servidor Socket.IO sobre o servidor HTTP da API: CORS igual ao HTTP, Redis adapter
 * (quando habilitado), handshake autenticado (`socketAuth`) que já entra nas rooms do usuário
 * (`joinRooms`), handlers de mensagem/digitação por conexão e a ponte EventBus → rooms.
 */
export function createRealtimeServer(
  httpServer: HttpServer,
  options: RealtimeServerOptions = {}
): RealtimeServerHandle {
  const {
    auth = authService,
    conversations = conversationService,
    messages = messageService,
    bus = eventBus,
    typing = new TypingService(),
    redisClient = redis,
    env = process.env,
  } = options;

  const io: RealtimeServer = new Server(httpServer, { cors: buildCorsOptions() });

  const pubSubClients: Pick<Redis, 'quit'>[] = [];
  if (shouldUseRedisAdapter(env)) {
    const pubClient = redisClient.duplicate();
    const subClient = redisClient.duplicate();
    pubSubClients.push(pubClient, subClient);
    io.adapter(createAdapter(pubClient, subClient));
  }

  io.use(createSocketAuthMiddleware(auth));
  io.use(createJoinRoomsMiddleware(conversations));

  io.on('connection', (socket) => {
    registerMessageHandlers(socket, { messages });
    registerTypingHandlers(socket, { conversations, typing });
  });

  const unregisterListeners = registerRealtimeListeners(io, bus);

  return {
    io,
    close: async (): Promise<void> => {
      unregisterListeners();
      await io.close();
      await Promise.all(pubSubClients.map((client) => client.quit()));
    },
  };
}
