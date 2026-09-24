import type { RealtimeSocket } from '../types';

/** Maior atraso aceito pelo `setTimeout` (~24,8 dias); acima disso o timer é reagendado. */
export const MAX_TIMER_DELAY_MS = 2_147_483_647;

export interface SessionExpiryOptions {
  /** @default MAX_TIMER_DELAY_MS (injetável para testar o reagendamento). */
  maxDelayMs?: number;
}

/**
 * O handshake só valida o token uma vez: sem isto, um socket sobreviveria à expiração do access
 * token. Arma um timer (`unref`) que chama `socket.disconnect(true)` em `tokenExpiresAt`; o
 * cliente recebe `disconnect` com motivo `io server disconnect` (sem reconexão automática) e
 * precisa reconectar com um token renovado. O timer é cancelado na desconexão.
 */
export function registerSessionExpiry(
  socket: RealtimeSocket,
  { maxDelayMs = MAX_TIMER_DELAY_MS }: SessionExpiryOptions = {}
): void {
  const { tokenExpiresAt } = socket.data;
  if (tokenExpiresAt === null) {
    return;
  }

  let timer: NodeJS.Timeout;
  const arm = (): void => {
    const remaining = tokenExpiresAt - Date.now();
    timer = setTimeout(
      () => {
        if (Date.now() >= tokenExpiresAt) {
          socket.disconnect(true);
        } else {
          arm();
        }
      },
      Math.max(0, Math.min(remaining, maxDelayMs))
    );
    timer.unref();
  };
  arm();

  socket.on('disconnect', () => {
    clearTimeout(timer);
  });
}
