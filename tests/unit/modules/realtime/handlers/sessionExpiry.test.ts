import { registerSessionExpiry } from '@/modules/realtime/handlers/sessionExpiry';
import { createFakeSocket, type FakeSocket } from '../../../../support/realtime/fakeSocket';

const USER_A = '11111111-1111-4111-8111-111111111111';
const NOW = 1_800_000_000_000;

describe('registerSessionExpiry', () => {
  let socket: FakeSocket;

  function withExpiry(tokenExpiresAt: number | null): FakeSocket {
    return createFakeSocket({ data: { userId: USER_A, ip: null, device: null, tokenExpiresAt } });
  }

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('desconecta o socket (disconnect(true)) quando o access token expira', () => {
    socket = withExpiry(NOW + 60_000);
    registerSessionExpiry(socket.asSocket());

    jest.advanceTimersByTime(59_999);
    expect(socket.disconnect).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('token já expirado na conexão: desconecta no próximo tick', () => {
    socket = withExpiry(NOW - 1);
    registerSessionExpiry(socket.asSocket());

    jest.advanceTimersByTime(0);

    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('cancela o timer na desconexão', () => {
    socket = withExpiry(NOW + 60_000);
    registerSessionExpiry(socket.asSocket());

    socket.handlers.get('disconnect')?.('client namespace disconnect');
    jest.advanceTimersByTime(120_000);

    expect(socket.disconnect).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('expiração além do limite do setTimeout: reagenda até a hora certa', () => {
    socket = withExpiry(NOW + 30_000);
    registerSessionExpiry(socket.asSocket(), { maxDelayMs: 10_000 });

    jest.advanceTimersByTime(20_000);
    expect(socket.disconnect).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(1);

    jest.advanceTimersByTime(10_000);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('timer desreferenciado (não segura o processo)', () => {
    const realSetTimeout = global.setTimeout;
    let captured: NodeJS.Timeout | undefined;
    jest.useRealTimers();
    const spy = jest.spyOn(global, 'setTimeout').mockImplementation(((
      ...args: Parameters<typeof setTimeout>
    ) => {
      captured = realSetTimeout(...args);
      return captured;
    }) as typeof setTimeout);

    socket = withExpiry(Date.now() + 60_000);
    registerSessionExpiry(socket.asSocket());

    expect(captured?.hasRef()).toBe(false);
    spy.mockRestore();
    clearTimeout(captured);
  });

  it('sem exp conhecido: não arma timer', () => {
    socket = withExpiry(null);
    registerSessionExpiry(socket.asSocket());

    expect(jest.getTimerCount()).toBe(0);
    expect(socket.handlers.has('disconnect')).toBe(false);
  });
});
