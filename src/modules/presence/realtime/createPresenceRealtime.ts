import { randomUUID } from 'crypto';
import { SERVER_EVENTS } from '@/modules/realtime/constants';
import type { ConnectionHook, DisconnectHook, RealtimeSocket } from '@/modules/realtime/types';
import { logger } from '@/shared/logger';
import { PRESENCE_CONSTANTS } from '../constants';
import type { IPresenceService } from '../interfaces';
import { presenceService } from '../services';
import type { PresenceConnection } from '../types';
import { registerPresenceHandlers } from './presenceHandlers';

/** Motivo do Socket.IO no `io.close()`: as entradas deste nó expiram sozinhas (e a varredura publica o offline). */
const SERVER_SHUTTING_DOWN = 'server shutting down';

export interface PresenceRealtimeOptions {
  presence?: Pick<
    IPresenceService,
    | 'connect'
    | 'disconnect'
    | 'heartbeat'
    | 'sweep'
    | 'setManualStatus'
    | 'watchedUserIds'
    | 'getVisibleStates'
  >;
  /** Identifica este processo nos membros `<nodeId>:<socketId>`; padrão: UUID novo. */
  nodeId?: string;
  /** @default PRESENCE_CONSTANTS.HEARTBEAT_MS */
  heartbeatMs?: number;
  /** @default PRESENCE_CONSTANTS.SWEEP_MS */
  sweepMs?: number;
}

export interface PresenceRealtimeHandle {
  nodeId: string;
  /** Hook de conexão para `createRealtimeServer({ onConnection })`. */
  onConnection: ConnectionHook;
  /** Hook de desconexão para `createRealtimeServer({ onDisconnect })`. */
  onDisconnect: DisconnectHook;
  /** Liga os timers de heartbeat e de varredura (`unref`; idempotente). */
  start(): void;
  /** Para os timers (antes de fechar o Socket.IO). */
  stop(): void;
  /** Um ciclo de heartbeat dos sockets deste nó (o timer chama; exposto para testes). */
  heartbeat(): Promise<void>;
  /** Um ciclo de varredura (o timer chama; ignorado se o anterior ainda roda). */
  sweep(): Promise<void>;
}

function logFailure(message: string, error: unknown): void {
  logger.error(message, error instanceof Error ? error : new Error(String(error)));
}

/**
 * Integração da presença com o Socket.IO, sem que o realtime conheça o presence: hooks de
 * conexão/desconexão (registrados no `server.ts`), o handler `presence:set`, o snapshot enviado
 * ao conectar, o heartbeat dos sockets deste nó e a varredura de conexões vencidas.
 *
 * `onConnection`/`onDisconnect` propagam a falha do Redis em vez de engoli-la: quem os registra
 * (`createRealtimeServer`) já garante o log e que o socket segue vivo (contrato de
 * `ConnectionHook`/`DisconnectHook`) — um único lugar cuida disso para todos os hooks, presença
 * inclusa. `heartbeat`/`sweep`, chamados direto pelos timers (sem esse chamador), fazem o próprio
 * try/catch + log.
 */
export function createPresenceRealtime(
  options: PresenceRealtimeOptions = {}
): PresenceRealtimeHandle {
  const {
    presence = presenceService,
    nodeId = randomUUID(),
    heartbeatMs = PRESENCE_CONSTANTS.HEARTBEAT_MS,
    sweepMs = PRESENCE_CONSTANTS.SWEEP_MS,
  } = options;

  /** Sockets conectados neste nó (socket.id → conexão), renovados a cada heartbeat. */
  const local = new Map<string, PresenceConnection>();
  /**
   * `presence.connect(...)` ainda em andamento, por socket. Cobre a corrida entre o hook de
   * conexão e o de desconexão do MESMO socket (ex.: o cliente cai antes do `connect` terminar):
   * sem isto, o `disconnect` poderia rodar (e o `ZREM` não achar nada) antes do `ZADD` do
   * `connect`, que chegaria depois e deixaria uma conexão fantasma (nunca mais removida).
   */
  const pendingConnects = new Map<string, Promise<unknown>>();
  const timers: NodeJS.Timeout[] = [];
  let sweeping = false;

  const connectionOf = (socket: RealtimeSocket): PresenceConnection => ({
    userId: socket.data.userId,
    connectionId: `${nodeId}:${socket.id}`,
  });

  const onConnection: ConnectionHook = async (socket) => {
    const connection = connectionOf(socket);
    local.set(socket.id, connection);
    registerPresenceHandlers(socket, { presence });

    // O ZADD sai antes de qualquer outro `await`: um `onDisconnect` concorrente do mesmo socket
    // espera esta mesma promise (`pendingConnects`) antes de tocar o Redis.
    const connecting = presence.connect(connection.userId, connection.connectionId);
    pendingConnects.set(socket.id, connecting);
    try {
      await connecting;
    } finally {
      // Seguro sem checar identidade: o Socket.IO nunca reaproveita um `socket.id` numa segunda
      // conexão concorrente — este `onConnection` roda no máximo uma vez por id.
      pendingConnects.delete(socket.id);
    }

    const watched = await presence.watchedUserIds(connection.userId);
    const states = await presence.getVisibleStates(connection.userId, watched);
    if (socket.connected) {
      socket.emit(SERVER_EVENTS.PRESENCE_SNAPSHOT, { states });
    }
  };

  const onDisconnect: DisconnectHook = async (socket, reason) => {
    local.delete(socket.id);

    // Corrida com o `connect` do mesmo socket ainda em voo: espera terminar (sucesso ou falha,
    // sem relançar) antes de decidir o que fazer no Redis — nunca uma conexão fantasma.
    const pendingConnect = pendingConnects.get(socket.id);
    if (pendingConnect !== undefined) {
      await pendingConnect.catch(() => undefined);
    }

    if (reason === SERVER_SHUTTING_DOWN) {
      return;
    }
    const { userId, connectionId } = connectionOf(socket);
    await presence.disconnect(userId, connectionId);
  };

  const heartbeat = async (): Promise<void> => {
    if (local.size === 0) {
      return;
    }
    try {
      await presence.heartbeat([...local.values()]);
    } catch (error) {
      logFailure('Falha no heartbeat de presença', error);
    }
  };

  const sweep = async (): Promise<void> => {
    if (sweeping) {
      return;
    }
    sweeping = true;
    try {
      await presence.sweep();
    } catch (error) {
      logFailure('Falha na varredura de presença', error);
    } finally {
      sweeping = false;
    }
  };

  return {
    nodeId,
    onConnection,
    onDisconnect,
    start: (): void => {
      if (timers.length > 0) {
        return;
      }
      timers.push(
        setInterval(() => void heartbeat(), heartbeatMs),
        setInterval(() => void sweep(), sweepMs)
      );
      timers.forEach((timer) => timer.unref());
    },
    stop: (): void => {
      timers.splice(0).forEach((timer) => {
        clearInterval(timer);
      });
    },
    heartbeat,
    sweep,
  };
}
