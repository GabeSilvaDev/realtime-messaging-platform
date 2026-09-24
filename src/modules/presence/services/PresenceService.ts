import type { IUserService } from '@/modules/user/interfaces';
import { userService } from '@/modules/user/services/UserService';
import type { RedisCommand } from '@/shared/cache';
import { redis } from '@/shared/database/redis';
import { eventBus, type EventBus } from '@/shared/event-bus';
import { logger } from '@/shared/logger';
import { PresenceEvents } from '@/shared/types';
import { PRESENCE_CONSTANTS, PRESENCE_KEYS, effectiveState, toManualStatus } from '../constants';
import type { IPresenceService } from '../interfaces';
import type {
  ConnectResult,
  DisconnectResult,
  ManualPresenceStatus,
  PresenceConnection,
  PresenceRedisClient,
  PresenceState,
  PresenceStateEntry,
  SetManualStatusResult,
} from '../types';

export interface PresenceServiceOptions {
  redis?: PresenceRedisClient;
  users?: Pick<IUserService, 'getMultiple' | 'updateLastSeen'>;
  events?: Pick<EventBus, 'publish'>;
  /** Relógio (ms) injetável nos testes. */
  now?: () => number;
  /** @default PRESENCE_CONSTANTS.TTL_MS */
  ttlMs?: number;
  /** @default PRESENCE_CONSTANTS.CONNECTIONS_KEY_TTL_MS */
  connectionsKeyTtlMs?: number;
  /** @default PRESENCE_CONSTANTS.SWEEP_SCAN_COUNT */
  sweepScanCount?: number;
}

/**
 * Presença (RF004) sobre o Redis — a única porta de acesso às chaves `presence:*`:
 *
 * - `presence:conns:<userId>`: ZSET com uma entrada por socket (`<nodeId>:<socketId>`), score =
 *   último heartbeat (ms). Conectado = alguma entrada com score ≥ agora − 30 s; as vencidas
 *   (queda de nó sem `disconnect`) são removidas com `ZREMRANGEBYSCORE`.
 * - `presence:manual:<userId>`: status manual (`available`/`away`/`busy`), sem TTL.
 *
 * Toda leitura-e-escrita de conexão roda num `MULTI` (atômico): com várias instâncias, só uma
 * delas vê a transição online/offline e publica o evento.
 */
export class PresenceService implements IPresenceService {
  private readonly redis: PresenceRedisClient;
  private readonly users: Pick<IUserService, 'getMultiple' | 'updateLastSeen'>;
  private readonly events: Pick<EventBus, 'publish'>;
  private readonly now: () => number;
  private readonly ttlMs: number;
  private readonly connectionsKeyTtlMs: number;
  private readonly sweepScanCount: number;

  constructor(options: PresenceServiceOptions = {}) {
    this.redis = options.redis ?? redis;
    this.users = options.users ?? userService;
    this.events = options.events ?? eventBus;
    this.now = options.now ?? Date.now;
    this.ttlMs = options.ttlMs ?? PRESENCE_CONSTANTS.TTL_MS;
    this.connectionsKeyTtlMs =
      options.connectionsKeyTtlMs ?? PRESENCE_CONSTANTS.CONNECTIONS_KEY_TTL_MS;
    this.sweepScanCount = options.sweepScanCount ?? PRESENCE_CONSTANTS.SWEEP_SCAN_COUNT;
  }

  async connect(userId: string, connectionId: string): Promise<ConnectResult> {
    const now = this.now();
    const key = PRESENCE_KEYS.connections(userId);
    const [, validBefore] = await this.exec('multi', [
      ['zremrangebyscore', key, '-inf', `(${String(now - this.ttlMs)}`],
      ['zcard', key],
      ['zadd', key, now, connectionId],
      ['pexpire', key, this.connectionsKeyTtlMs],
    ]);

    const becameOnline = validBefore === 0;
    if (becameOnline) {
      await this.events.publish(PresenceEvents.ONLINE, { userId, timestamp: new Date(now) });
    }
    return { becameOnline };
  }

  async heartbeat(connections: PresenceConnection[]): Promise<void> {
    if (connections.length === 0) {
      return;
    }
    const now = this.now();
    // `XX`: só renova entradas que ainda existem — um socket que acabou de desconectar (ou que a
    // varredura já removeu) não é ressuscitado.
    await this.exec(
      'pipeline',
      connections.flatMap(({ userId, connectionId }): RedisCommand[] => {
        const key = PRESENCE_KEYS.connections(userId);
        return [
          ['zadd', key, 'XX', now, connectionId],
          ['pexpire', key, this.connectionsKeyTtlMs],
        ];
      })
    );
  }

  async disconnect(userId: string, connectionId: string): Promise<DisconnectResult> {
    const now = this.now();
    const key = PRESENCE_KEYS.connections(userId);
    const [removed, , remaining] = await this.exec('multi', [
      ['zrem', key, connectionId],
      ['zremrangebyscore', key, '-inf', `(${String(now - this.ttlMs)}`],
      ['zcard', key],
    ]);

    // `removed === 0`: a varredura já tirou esta entrada (e já publicou o offline).
    if (removed === 0 || remaining !== 0) {
      return { becameOffline: false };
    }
    const lastSeenAt = new Date(now);
    await this.goOffline(userId, lastSeenAt);
    return { becameOffline: true, lastSeenAt };
  }

  async setManualStatus(
    userId: string,
    status: ManualPresenceStatus
  ): Promise<SetManualStatusResult> {
    const [previous, , connections] = await this.exec('multi', [
      ['get', PRESENCE_KEYS.manual(userId)],
      ['set', PRESENCE_KEYS.manual(userId), status],
      ['zcount', PRESENCE_KEYS.connections(userId), this.now() - this.ttlMs, '+inf'],
    ]);

    const connected = (connections as number) > 0;
    const before = effectiveState(connected, toManualStatus(previous));
    const state = effectiveState(connected, status);
    const changed = before !== state;
    if (changed) {
      await this.events.publish(PresenceEvents.STATUS_CHANGED, { userId, status });
    }
    return { state, changed };
  }

  async getStates(userIds: string[]): Promise<Map<string, PresenceStateEntry>> {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) {
      return new Map();
    }

    const cutoff = this.now() - this.ttlMs;
    const results = await this.exec(
      'pipeline',
      unique.flatMap((id): RedisCommand[] => [
        ['zcount', PRESENCE_KEYS.connections(id), cutoff, '+inf'],
        ['get', PRESENCE_KEYS.manual(id)],
      ])
    );

    const online = new Map<string, PresenceState>();
    unique.forEach((id, index) => {
      if ((results[index * 2] as number) > 0) {
        online.set(id, effectiveState(true, toManualStatus(results[index * 2 + 1])));
      }
    });

    // `last_seen_at` só de quem está offline, numa leitura em lote (cacheada no módulo user).
    const offlineIds = unique.filter((id) => !online.has(id));
    const lastSeen = new Map(
      (await this.users.getMultiple(offlineIds)).map((user) => [user.id, user.lastSeenAt])
    );

    return new Map(
      unique.map((id): [string, PresenceStateEntry] => {
        const state = online.get(id);
        return state === undefined
          ? [id, { state: 'offline', lastSeenAt: lastSeen.get(id) ?? null }]
          : [id, { state, lastSeenAt: null }];
      })
    );
  }

  /**
   * Varre `presence:conns:*` (SCAN com COUNT 100) e remove as entradas vencidas; quem ficou sem
   * nenhuma conexão vai para offline (cobre a queda de uma instância sem `disconnect`). O MULTI
   * por chave garante que só uma instância publique o offline. Custo O(chaves de presença) a
   * cada 30 s — aceitável para o porte do projeto.
   */
  async sweep(): Promise<string[]> {
    const keys = new Set<string>();
    let cursor = '0';
    do {
      const [next, batch] = await this.redis.scan(
        cursor,
        'MATCH',
        `${PRESENCE_KEYS.CONNECTIONS_PREFIX}*`,
        'COUNT',
        this.sweepScanCount
      );
      batch.forEach((key) => keys.add(key));
      cursor = next;
    } while (cursor !== '0');

    const now = this.now();
    const wentOffline: string[] = [];
    for (const key of keys) {
      const [removed, remaining] = await this.exec('multi', [
        ['zremrangebyscore', key, '-inf', `(${String(now - this.ttlMs)}`],
        ['zcard', key],
      ]);
      if ((removed as number) > 0 && remaining === 0) {
        const userId = key.slice(PRESENCE_KEYS.CONNECTIONS_PREFIX.length);
        await this.goOffline(userId, new Date(now));
        wentOffline.push(userId);
      }
    }
    return wentOffline;
  }

  /**
   * Grava `last_seen_at` e publica `presence:offline`. Uma falha no Postgres é logada e não
   * impede o evento (os contatos precisam ver o offline mesmo assim).
   */
  private async goOffline(userId: string, at: Date): Promise<void> {
    try {
      await this.users.updateLastSeen(userId, at);
    } catch (error) {
      logger.error(
        'Falha ao gravar last_seen_at na saída do usuário',
        error instanceof Error ? error : new Error(String(error)),
        { userId }
      );
    }
    await this.events.publish(PresenceEvents.OFFLINE, { userId, lastSeen: at });
  }

  /** Executa o lote e devolve os resultados; erro em qualquer comando (ou lote abortado) lança. */
  private async exec(mode: 'multi' | 'pipeline', commands: RedisCommand[]): Promise<unknown[]> {
    const results = await this.redis[mode](commands).exec();
    if (results === null) {
      throw new Error('Lote do Redis abortado');
    }
    return results.map(([error, value]) => {
      if (error !== null) {
        throw error;
      }
      return value;
    });
  }
}

export const presenceService = new PresenceService();
