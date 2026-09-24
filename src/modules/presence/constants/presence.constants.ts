import type { ManualPresenceStatus, PresenceState, PresenceStateDTO } from '@/shared/types';

export const PRESENCE_CONSTANTS = {
  /** Conexão sem heartbeat há mais que isto está vencida (usuário offline se não houver outra). */
  TTL_MS: 30_000,
  /** Cada nó renova o score de todos os seus sockets neste intervalo. */
  HEARTBEAT_MS: 15_000,
  /** Varredura de conexões vencidas (queda de nó sem `disconnect`). */
  SWEEP_MS: 30_000,
  /** `COUNT` de cada `SCAN presence:conns:*` da varredura. */
  SWEEP_SCAN_COUNT: 100,
  /** Expiração do sorted set inteiro (renovada a cada conexão/heartbeat): some se ninguém o renova. */
  CONNECTIONS_KEY_TTL_MS: 120_000,
  /** Máximo de ids por consulta de presença (`GET /api/presence`). */
  MAX_QUERY_USER_IDS: 100,
  /** TTL (s) da audiência cacheada; a invalidação é por evento. */
  AUDIENCE_CACHE_TTL_SECONDS: 300,
} as const;

/** Chaves da presença no Redis (sem o prefixo `cache:` — não são cache, são estado). */
export const PRESENCE_KEYS = {
  CONNECTIONS_PREFIX: 'presence:conns:',
  /** ZSET: membro = `<nodeId>:<socketId>`, score = último heartbeat (ms). */
  connections: (userId: string): string => `presence:conns:${userId}`,
  /** Status manual (`available`/`away`/`busy`), sem TTL: sobrevive às reconexões. */
  manual: (userId: string): string => `presence:manual:${userId}`,
} as const;

/** Chaves de cache da presença (o `CacheService` acrescenta `cache:`). */
export const PRESENCE_CACHE_KEYS = {
  /** Quem é notificado quando o usuário muda de estado. */
  audience: (userId: string): string => `presence:audience:${userId}`,
} as const;

export const MANUAL_PRESENCE_STATUSES = [
  'available',
  'away',
  'busy',
] as const satisfies readonly ManualPresenceStatus[];

export const PRESENCE_STATES = [
  'online',
  'away',
  'busy',
  'offline',
] as const satisfies readonly PresenceState[];

/** Valor gravado no Redis → status manual; ausente/desconhecido vale `available`. */
export function toManualStatus(raw: unknown): ManualPresenceStatus {
  return MANUAL_PRESENCE_STATUSES.find((status) => status === raw) ?? 'available';
}

/** Sem conexão → `offline`; conectado → `online` (se `available`) ou o próprio status manual. */
export function effectiveState(connected: boolean, manual: ManualPresenceStatus): PresenceState {
  if (!connected) {
    return 'offline';
  }
  return manual === 'available' ? 'online' : manual;
}

/** Ordem de exibição: online, ausente, ocupado e, por fim, offline. */
const PRESENCE_RANK: Record<PresenceState, number> = { online: 0, away: 1, busy: 2, offline: 3 };

type PresenceSortKey = Pick<PresenceStateDTO, 'state' | 'lastSeenAt'>;

/** "Visto por último" em ms; sem data conta como o mais antigo possível. */
function lastSeenMs(entry: PresenceSortKey): number {
  return entry.lastSeenAt?.getTime() ?? 0;
}

/**
 * Comparador para `sort`: conectados primeiro (online → away → busy), depois offline pelo
 * "visto por último" mais recente (sem data vai para o fim). Empates mantêm a ordem original.
 */
export function compareByPresence(a: PresenceSortKey, b: PresenceSortKey): number {
  return PRESENCE_RANK[a.state] - PRESENCE_RANK[b.state] || lastSeenMs(b) - lastSeenMs(a);
}
