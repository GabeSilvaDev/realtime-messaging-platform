import type { IAuthService } from '@/modules/auth/interfaces';
import { authService } from '@/modules/auth/services/AuthService';
import { REALTIME_CONSTANTS, SOCKET_ERRORS } from '../constants';
import type { RealtimeSocket, SocketMiddleware } from '../types';

const BEARER_PREFIX = 'Bearer ';

/** Token do handshake: `auth.token` (preferido) ou header `Authorization: Bearer <token>`. */
export function extractHandshakeToken(handshake: RealtimeSocket['handshake']): string | null {
  const { token } = handshake.auth as { token?: unknown };
  if (typeof token === 'string' && token !== '') {
    return token;
  }

  const header = handshake.headers.authorization;
  if (header?.startsWith(BEARER_PREFIX) === true) {
    const bearer = header.slice(BEARER_PREFIX.length).trim();
    return bearer === '' ? null : bearer;
  }

  return null;
}

/**
 * Autentica o handshake com a mesma regra do middleware HTTP (`validateAccessToken`). Sem token
 * ou com token inválido, recusa com `connect_error` de `message: 'UNAUTHORIZED'`; aceito,
 * preenche `socket.data` com `userId`, `ip`, `device` (user-agent truncado a 255) e
 * `tokenExpiresAt` (o socket é derrubado nessa hora — ver `registerSessionExpiry`).
 */
export function createSocketAuthMiddleware(
  auth: Pick<IAuthService, 'validateAccessToken'> = authService
): SocketMiddleware {
  return (socket, next) => {
    const token = extractHandshakeToken(socket.handshake);
    const validation: { valid: boolean; userId?: string; exp?: number } =
      token === null ? { valid: false } : auth.validateAccessToken(token);

    if (!validation.valid || validation.userId === undefined || validation.userId === '') {
      next(new Error(SOCKET_ERRORS.UNAUTHORIZED));
      return;
    }

    const { address, headers } = socket.handshake;
    const userAgent = headers['user-agent'];
    socket.data = {
      userId: validation.userId,
      ip: address === '' ? null : address,
      device:
        userAgent === undefined ? null : userAgent.slice(0, REALTIME_CONSTANTS.MAX_DEVICE_LENGTH),
      tokenExpiresAt: validation.exp === undefined ? null : validation.exp * 1000,
    };
    next();
  };
}
