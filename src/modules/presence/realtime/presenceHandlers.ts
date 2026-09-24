import { CLIENT_EVENTS } from '@/modules/realtime/constants';
import { withAck } from '@/modules/realtime/handlers/ack';
import type { RealtimeSocket } from '@/modules/realtime/types';
import type { IPresenceService } from '../interfaces';
import { presenceStatusSchema } from '../validation';

export interface PresenceHandlerDeps {
  presence: Pick<IPresenceService, 'setManualStatus'>;
}

/**
 * `presence:set { status }` (ack): grava o status manual — a mesma regra do
 * `PUT /api/presence/status`. O ack devolve o estado efetivo resultante; o aviso aos contatos
 * sai da ponte (`presence:status-changed` → `presence:update`).
 */
export function registerPresenceHandlers(
  socket: RealtimeSocket,
  { presence }: PresenceHandlerDeps
): void {
  const { userId } = socket.data;

  socket.on(
    CLIENT_EVENTS.PRESENCE_SET,
    withAck(
      { event: CLIENT_EVENTS.PRESENCE_SET, userId },
      presenceStatusSchema,
      async ({ status }) => {
        const { state } = await presence.setManualStatus(userId, status);
        return { state };
      }
    )
  );
}
