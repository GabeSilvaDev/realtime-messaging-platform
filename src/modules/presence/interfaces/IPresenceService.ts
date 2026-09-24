import type {
  ConnectResult,
  DisconnectResult,
  ManualPresenceStatus,
  PresenceConnection,
  PresenceStateDTO,
  PresenceStateEntry,
  SetManualStatusResult,
} from '../types';

/** Única porta de acesso às chaves `presence:*` do Redis. */
export interface IPresenceService {
  /** Registra a conexão; publica `presence:online` se for a primeira válida do usuário. */
  connect(userId: string, connectionId: string): Promise<ConnectResult>;
  /** Renova o score das conexões (só as que ainda existem — `ZADD XX`), em lote. */
  heartbeat(connections: PresenceConnection[]): Promise<void>;
  /** Remove a conexão; se era a última, grava `last_seen_at` e publica `presence:offline`. */
  disconnect(userId: string, connectionId: string): Promise<DisconnectResult>;
  /** Grava o status manual; publica `presence:status-changed` se o estado efetivo mudou. */
  setManualStatus(userId: string, status: ManualPresenceStatus): Promise<SetManualStatusResult>;
  /** Estados em lote (sem filtro de bloqueio); `lastSeenAt` do Postgres só para os offline. */
  getStates(userIds: string[]): Promise<Map<string, PresenceStateEntry>>;
  /** Remove conexões vencidas e publica `presence:offline` de quem ficou sem nenhuma. */
  sweep(): Promise<string[]>;
  /** Quem deve ser notificado das mudanças de `userId` (cacheado). */
  presenceAudience(userId: string): Promise<string[]>;
  /** De quem `userId` recebe atualizações: contatos + parceiros 1:1, menos bloqueios. */
  watchedUserIds(userId: string): Promise<string[]>;
  /** Estados como `viewerId` os vê: pares bloqueados sempre `offline` sem `lastSeenAt`. */
  getVisibleStates(viewerId: string, userIds: string[]): Promise<PresenceStateDTO[]>;
}
