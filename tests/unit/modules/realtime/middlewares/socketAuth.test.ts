jest.mock('@/modules/auth/services/AuthService', () => ({ authService: {} }));

import {
  createSocketAuthMiddleware,
  extractHandshakeToken,
} from '@/modules/realtime/middlewares/socketAuth';
import { createFakeSocket, type FakeSocket } from '../../../../support/realtime/fakeSocket';

const USER_A = '11111111-1111-4111-8111-111111111111';

describe('socketAuth', () => {
  let auth: { validateAccessToken: jest.Mock };
  let socket: FakeSocket;
  let next: jest.Mock;

  beforeEach(() => {
    auth = { validateAccessToken: jest.fn() };
    socket = createFakeSocket();
    next = jest.fn();
  });

  describe('extractHandshakeToken', () => {
    it('prefere auth.token', () => {
      socket.handshake.auth = { token: 'from-auth' };
      socket.handshake.headers.authorization = 'Bearer from-header';

      expect(extractHandshakeToken(socket.asSocket().handshake)).toBe('from-auth');
    });

    it('usa o header Authorization: Bearer quando não há auth.token', () => {
      socket.handshake.auth = { token: '' };
      socket.handshake.headers.authorization = 'Bearer from-header';

      expect(extractHandshakeToken(socket.asSocket().handshake)).toBe('from-header');
    });

    it('retorna null sem token, com esquema diferente de Bearer ou Bearer vazio', () => {
      expect(extractHandshakeToken(socket.asSocket().handshake)).toBeNull();

      socket.handshake.auth = { token: 123 };
      socket.handshake.headers.authorization = 'Basic abc';
      expect(extractHandshakeToken(socket.asSocket().handshake)).toBeNull();

      socket.handshake.headers.authorization = 'Bearer   ';
      expect(extractHandshakeToken(socket.asSocket().handshake)).toBeNull();
    });
  });

  describe('createSocketAuthMiddleware', () => {
    it('token válido: preenche socket.data (userId, ip, device) e segue', () => {
      auth.validateAccessToken.mockReturnValue({ valid: true, userId: USER_A, exp: 1_900_000_000 });
      socket.handshake.auth = { token: 'good' };
      socket.handshake.headers['user-agent'] = 'jest-agent';

      createSocketAuthMiddleware(auth)(socket.asSocket(), next);

      expect(auth.validateAccessToken).toHaveBeenCalledWith('good');
      expect(socket.data).toEqual({
        userId: USER_A,
        ip: '127.0.0.1',
        device: 'jest-agent',
        tokenExpiresAt: 1_900_000_000_000,
      });
      expect(next).toHaveBeenCalledWith();
    });

    it('trunca o user-agent em 255 e usa null sem user-agent/endereço', () => {
      auth.validateAccessToken.mockReturnValue({ valid: true, userId: USER_A });
      socket.handshake.auth = { token: 'good' };
      socket.handshake.headers['user-agent'] = 'a'.repeat(300);

      createSocketAuthMiddleware(auth)(socket.asSocket(), next);
      expect(socket.data.device).toBe('a'.repeat(255));

      const bare = createFakeSocket();
      bare.handshake.auth = { token: 'good' };
      bare.handshake.address = '';
      createSocketAuthMiddleware(auth)(bare.asSocket(), next);
      expect(bare.data).toEqual({ userId: USER_A, ip: null, device: null, tokenExpiresAt: null });
    });

    it('sem token: recusa com UNAUTHORIZED sem consultar o AuthService', () => {
      createSocketAuthMiddleware(auth)(socket.asSocket(), next);

      expect(auth.validateAccessToken).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'UNAUTHORIZED' }));
      expect(socket.data).toEqual({});
    });

    it('token inválido ou sem userId: recusa com UNAUTHORIZED', () => {
      socket.handshake.auth = { token: 'bad' };
      auth.validateAccessToken
        .mockReturnValueOnce({ valid: false })
        .mockReturnValueOnce({ valid: true })
        .mockReturnValueOnce({ valid: true, userId: '' });

      const middleware = createSocketAuthMiddleware(auth);
      middleware(socket.asSocket(), next);
      middleware(socket.asSocket(), next);
      middleware(socket.asSocket(), next);

      expect(next).toHaveBeenCalledTimes(3);
      for (const [error] of next.mock.calls) {
        expect(error).toEqual(expect.objectContaining({ message: 'UNAUTHORIZED' }));
      }
    });

    it('usa o authService padrão quando nada é injetado', () => {
      expect(typeof createSocketAuthMiddleware()).toBe('function');
    });
  });
});
