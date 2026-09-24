jest.mock('@/shared/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { registerPresenceHandlers } from '@/modules/presence/realtime/presenceHandlers';
import type { AckResponse } from '@/modules/realtime/types';
import { logger } from '@/shared/logger';
import { createFakeSocket, type FakeSocket } from '../../../../support/realtime/fakeSocket';

const ANA = '11111111-1111-4111-8111-111111111111';

function emit(socket: FakeSocket, payload: unknown): Promise<AckResponse<unknown>> {
  const handler = socket.handlers.get('presence:set');
  if (handler === undefined) {
    throw new Error('handler presence:set não registrado');
  }
  return new Promise((resolve) => {
    handler(payload, resolve);
  });
}

describe('registerPresenceHandlers', () => {
  let socket: FakeSocket;
  let presence: { setManualStatus: jest.Mock };

  beforeEach(() => {
    socket = createFakeSocket({ data: { userId: ANA, ip: null, device: null } });
    presence = { setManualStatus: jest.fn().mockResolvedValue({ state: 'busy', changed: true }) };
    registerPresenceHandlers(socket.asSocket(), { presence });
  });

  it('presence:set grava o status e devolve o estado efetivo no ack', async () => {
    await expect(emit(socket, { status: 'busy' })).resolves.toEqual({
      ok: true,
      data: { state: 'busy' },
    });
    expect(presence.setManualStatus).toHaveBeenCalledWith(ANA, 'busy');
  });

  it('status fora de available/away/busy → VALIDATION_ERROR 400', async () => {
    const response = await emit(socket, { status: 'offline' });

    expect(response).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'VALIDATION_ERROR', statusCode: 400 }),
    });
    expect(presence.setManualStatus).not.toHaveBeenCalled();
  });

  it('falha do Redis → INTERNAL_ERROR 500 (logada via o logger da aplicação)', async () => {
    const redisError = new Error('ECONNREFUSED');
    presence.setManualStatus.mockRejectedValue(redisError);

    await expect(emit(socket, { status: 'away' })).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'INTERNAL_ERROR', statusCode: 500 }),
    });
    expect(logger.error).toHaveBeenCalledWith(
      'Falha ao processar presence:set',
      redisError,
      expect.objectContaining({ event: 'presence:set', userId: ANA })
    );
  });
});
