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
import { logger } from '@/shared/logger';
import { buildCorsOptions } from '@/shared/middlewares/cors';
import {
  registerMessageHandlers,
  registerSessionExpiry,
  registerTypingHandlers,
} from '../handlers';
import { registerRealtimeListeners } from '../listeners';
import {
  createJoinRoomsMiddleware,
  createSocketAuthMiddleware,
  reconcileConversationRooms,
} from '../middlewares';
import { TypingService } from '../services';
import type {
  ConnectionHook,
  DisconnectHook,
  RealtimeServer,
  RealtimeSocket,
  TrustProxyFn,
} from '../types';

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
  /** `app.get('trust proxy fn')`: o IP do socket segue a mesma regra do `req.ip` do Express. */
  trustProxy?: TrustProxyFn;
  /**
   * Ponto de extensão (ex.: presença, subprojeto 4): rodam em paralelo a cada conexão aceita, com
   * as rooms do handshake já aplicadas. Erros/rejeições são logados e nunca derrubam o socket.
   */
  onConnection?: ConnectionHook[];
  /** Rodam a cada desconexão, com o `reason` do Socket.IO; mesmas garantias de `onConnection`. */
  onDisconnect?: DisconnectHook[];
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

/** Loga erros do cliente Redis pub/sub do adapter via o logger da aplicação, sem derrubar o processo. */
function logRedisClientErrors(client: Pick<Redis, 'on'>, role: 'pub' | 'sub'): void {
  client.on('error', (error: Error) => {
    logger.error(`Erro no cliente Redis (${role}) do adapter do Socket.IO`, error);
  });
}

/** Roda o hook isolado: exceção síncrona ou rejeição vira log, nunca derruba quem chamou. */
function runHook(
  run: () => void | Promise<void>,
  message: string,
  socket: RealtimeSocket,
  context: Record<string, unknown> = {}
): void {
  const fail = (error: unknown): void => {
    logger.error(message, error instanceof Error ? error : new Error(String(error)), {
      userId: socket.data.userId,
      socketId: socket.id,
      ...context,
    });
  };
  try {
    void Promise.resolve(run()).catch(fail);
  } catch (error) {
    fail(error);
  }
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
    trustProxy,
    onConnection = [],
    onDisconnect = [],
  } = options;

  const io: RealtimeServer = new Server(httpServer, { cors: buildCorsOptions() });

  const pubSubClients: Pick<Redis, 'quit'>[] = [];
  if (shouldUseRedisAdapter(env)) {
    // `maxRetriesPerRequest: null`: com o Redis fora do ar, os comandos do adapter ficam na fila
    // do ioredis até a reconexão em vez de rejeitar após 3 tentativas — o adapter publica sem
    // `catch`, e uma rejeição não tratada derrubaria o processo.
    const pubClient = redisClient.duplicate({ maxRetriesPerRequest: null });
    const subClient = redisClient.duplicate({ maxRetriesPerRequest: null });
    logRedisClientErrors(pubClient, 'pub');
    logRedisClientErrors(subClient, 'sub');
    pubSubClients.push(pubClient, subClient);
    io.adapter(createAdapter(pubClient, subClient));
  }

  io.use(createSocketAuthMiddleware(auth, { trustProxy }));
  io.use(createJoinRoomsMiddleware(conversations));

  io.on('connection', (socket) => {
    // Corrige mudanças de participação ocorridas durante o handshake (a ponte ainda não via o
    // socket); nunca rejeita — falhas são logadas e desconectam o socket.
    void reconcileConversationRooms(socket, conversations);
    registerSessionExpiry(socket);
    registerMessageHandlers(socket, { messages });
    registerTypingHandlers(socket, { conversations, typing });

    onConnection.forEach((hook) => {
      runHook(() => hook(socket, io), 'Falha num hook de conexão do realtime', socket);
    });
    if (onDisconnect.length > 0) {
      socket.on('disconnect', (reason) => {
        onDisconnect.forEach((hook) => {
          runHook(
            () => hook(socket, reason, io),
            'Falha num hook de desconexão do realtime',
            socket,
            {
              reason,
            }
          );
        });
      });
    }
  });

  const unregisterListeners = registerRealtimeListeners(io, bus);

  let closePromise: Promise<void> | null = null;
  const closeOnce = async (): Promise<void> => {
    unregisterListeners();
    await io.close();
    await Promise.all(pubSubClients.map((client) => client.quit()));
  };

  return {
    io,
    // Idempotente: chamadas repetidas (ex.: reentrância no encerramento) devolvem a mesma
    // promise em vez de fechar o io/Redis de novo (o que quebraria com o Redis adapter — um
    // client já encerrado rejeita um segundo `quit()`).
    close: (): Promise<void> => {
      closePromise ??= closeOnce();
      return closePromise;
    },
  };
}
