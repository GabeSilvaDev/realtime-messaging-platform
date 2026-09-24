import type { RedisBatch, RedisCommand } from '@/shared/cache';
import type { PresenceState } from '@/shared/types';

export type { ManualPresenceStatus, PresenceState, PresenceStateDTO } from '@/shared/types';

/** Uma conexão (socket) de um usuário: `connectionId` = `<nodeId>:<socketId>`. */
export interface PresenceConnection {
  userId: string;
  connectionId: string;
}

export interface ConnectResult {
  /** `true` se não havia outra conexão válida (primeira aba/dispositivo). */
  becameOnline: boolean;
}

export interface DisconnectResult {
  /** `true` se esta era a última conexão do usuário. */
  becameOffline: boolean;
  /** Gravado em `users.last_seen_at` quando `becameOffline`. */
  lastSeenAt?: Date;
}

export interface SetManualStatusResult {
  /** Estado efetivo depois da mudança. */
  state: PresenceState;
  /** `true` se o estado efetivo mudou (e `presence:status-changed` foi publicado). */
  changed: boolean;
}

/** Estado de um usuário (`lastSeenAt` só quando `offline`). */
export interface PresenceStateEntry {
  state: PresenceState;
  lastSeenAt: Date | null;
}

/** Os comandos do Redis que a presença usa (o `Redis` do ioredis satisfaz esta interface). */
export interface PresenceRedisClient {
  multi(commands: RedisCommand[]): RedisBatch;
  pipeline(commands: RedisCommand[]): RedisBatch;
  scan(
    cursor: string,
    matchToken: 'MATCH',
    pattern: string,
    countToken: 'COUNT',
    count: number
  ): Promise<[string, string[]]>;
}
