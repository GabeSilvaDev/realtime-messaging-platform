/**
 * Contrato público da presença (REST, EventBus e Socket.IO).
 *
 * Fica em `shared` porque o `EventMap` (camada shared) e os tipos de evento do realtime o
 * referenciam; o módulo `presence` re-exporta estes tipos.
 */

/** Status escolhido pelo usuário; persiste entre reconexões (ausente = `available`). */
export type ManualPresenceStatus = 'available' | 'away' | 'busy';

/**
 * Estado efetivo: sem conexão → `offline`; conectado → `online` se o status manual for
 * `available`, senão o próprio status manual (`away`/`busy`).
 */
export type PresenceState = 'online' | 'away' | 'busy' | 'offline';

/** Estado de um usuário como exposto aos clientes (`lastSeenAt` só quando `offline`). */
export interface PresenceStateDTO {
  userId: string;
  state: PresenceState;
  lastSeenAt: Date | null;
}
