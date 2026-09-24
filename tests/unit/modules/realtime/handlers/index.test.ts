import * as handlers from '@/modules/realtime/handlers';

describe('realtime handlers index', () => {
  it('deve exportar o helper de ack e os registradores de handlers', () => {
    expect(typeof handlers.withAck).toBe('function');
    expect(typeof handlers.toAckError).toBe('function');
    expect(typeof handlers.registerMessageHandlers).toBe('function');
    expect(typeof handlers.registerTypingHandlers).toBe('function');
    expect(typeof handlers.registerSessionExpiry).toBe('function');
    expect(handlers.MAX_TIMER_DELAY_MS).toBe(2_147_483_647);
  });
});
