jest.mock('@/modules/presence/services', () => ({ presenceService: {} }));
jest.mock('@/shared/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { createPresenceRealtime } from '@/modules/presence/realtime';
import type { RealtimeServer } from '@/modules/realtime/types';
import { logger } from '@/shared/logger';
import { createFakeSocket, type FakeSocket } from '../../../../support/realtime/fakeSocket';

const ANA = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const NODE = 'node-1';
const io = {} as RealtimeServer;

function socketOf(userId: string, id: string): FakeSocket {
  return createFakeSocket({ id, data: { userId, ip: null, device: null } });
}

describe('createPresenceRealtime', () => {
  let presence: {
    connect: jest.Mock;
    disconnect: jest.Mock;
    heartbeat: jest.Mock;
    sweep: jest.Mock;
    setManualStatus: jest.Mock;
    watchedUserIds: jest.Mock;
    getVisibleStates: jest.Mock;
  };

  beforeEach(() => {
    presence = {
      connect: jest.fn().mockResolvedValue({ becameOnline: true }),
      disconnect: jest.fn().mockResolvedValue({ becameOffline: true }),
      heartbeat: jest.fn().mockResolvedValue(undefined),
      sweep: jest.fn().mockResolvedValue([]),
      setManualStatus: jest.fn(),
      watchedUserIds: jest.fn().mockResolvedValue([BOB]),
      getVisibleStates: jest
        .fn()
        .mockResolvedValue([{ userId: BOB, state: 'online', lastSeenAt: null }]),
    };
  });

  it('gera um nodeId (UUID) por padrão', () => {
    expect(createPresenceRealtime().nodeId).toMatch(/^[0-9a-f-]{36}$/);
  });

  describe('onConnection', () => {
    it('registra presence:set, conecta como <nodeId>:<socketId> e envia o snapshot ao próprio socket', async () => {
      const handle = createPresenceRealtime({ presence, nodeId: NODE });
      const socket = socketOf(ANA, 's1');

      await handle.onConnection(socket.asSocket(), io);

      expect(socket.handlers.has('presence:set')).toBe(true);
      expect(presence.connect).toHaveBeenCalledWith(ANA, 'node-1:s1');
      expect(presence.watchedUserIds).toHaveBeenCalledWith(ANA);
      expect(presence.getVisibleStates).toHaveBeenCalledWith(ANA, [BOB]);
      expect(socket.emitted).toEqual([
        ['presence:snapshot', { states: [{ userId: BOB, state: 'online', lastSeenAt: null }] }],
      ]);
    });

    it('não envia snapshot a um socket que já caiu', async () => {
      const handle = createPresenceRealtime({ presence, nodeId: NODE });
      const socket = socketOf(ANA, 's1');
      presence.connect.mockImplementation(async () => {
        socket.connected = false;
        return { becameOnline: true };
      });

      await handle.onConnection(socket.asSocket(), io);

      expect(socket.emitted).toEqual([]);
    });

    it('falha do Redis rejeita (o createRealtimeServer loga, o socket segue)', async () => {
      const handle = createPresenceRealtime({ presence, nodeId: NODE });
      presence.connect.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(handle.onConnection(socketOf(ANA, 's1').asSocket(), io)).rejects.toThrow(
        'ECONNREFUSED'
      );
    });

    it('falha do Redis ao montar o snapshot também rejeita (mesma garantia: o chamador loga)', async () => {
      const handle = createPresenceRealtime({ presence, nodeId: NODE });
      presence.getVisibleStates.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(handle.onConnection(socketOf(ANA, 's1').asSocket(), io)).rejects.toThrow(
        'ECONNREFUSED'
      );
    });
  });

  describe('onDisconnect', () => {
    it('remove a conexão do Redis', async () => {
      const handle = createPresenceRealtime({ presence, nodeId: NODE });
      const socket = socketOf(ANA, 's1');
      await handle.onConnection(socket.asSocket(), io);

      await handle.onDisconnect(socket.asSocket(), 'transport close', io);

      expect(presence.disconnect).toHaveBeenCalledWith(ANA, 'node-1:s1');
    });

    it('no encerramento do servidor não mexe no Redis (as entradas expiram sozinhas)', async () => {
      const handle = createPresenceRealtime({ presence, nodeId: NODE });
      const socket = socketOf(ANA, 's1');
      await handle.onConnection(socket.asSocket(), io);

      await handle.onDisconnect(socket.asSocket(), 'server shutting down', io);
      await handle.heartbeat();

      expect(presence.disconnect).not.toHaveBeenCalled();
      expect(presence.heartbeat).not.toHaveBeenCalled();
    });

    it('falha do Redis rejeita (mesma garantia do onConnection: o chamador loga)', async () => {
      const handle = createPresenceRealtime({ presence, nodeId: NODE });
      const socket = socketOf(ANA, 's1');
      await handle.onConnection(socket.asSocket(), io);
      presence.disconnect.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(handle.onDisconnect(socket.asSocket(), 'transport close', io)).rejects.toThrow(
        'ECONNREFUSED'
      );
    });

    it('corrida com um connect ainda pendente do mesmo socket: espera o connect terminar antes de tocar o Redis (sem conexão fantasma)', async () => {
      const handle = createPresenceRealtime({ presence, nodeId: NODE });
      const socket = socketOf(ANA, 's1');
      let resolveConnect: (result: { becameOnline: boolean }) => void = () => undefined;
      presence.connect.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveConnect = resolve;
          })
      );

      const connecting = handle.onConnection(socket.asSocket(), io);
      const disconnecting = handle.onDisconnect(socket.asSocket(), 'transport close', io);

      // Dá chance ao microtask do onDisconnect rodar; como o connect ainda não terminou, o
      // disconnect não pode ter chamado o Redis ainda (senão o ZADD do connect chegaria depois
      // e deixaria uma conexão fantasma).
      await Promise.resolve();
      await Promise.resolve();
      expect(presence.disconnect).not.toHaveBeenCalled();

      resolveConnect({ becameOnline: true });
      await connecting;
      await disconnecting;

      expect(presence.connect).toHaveBeenCalledTimes(1);
      expect(presence.disconnect).toHaveBeenCalledWith(ANA, 'node-1:s1');
    });

    it('corrida com um connect pendente que falha: o disconnect segue (sem nada a remover) sem travar', async () => {
      const handle = createPresenceRealtime({ presence, nodeId: NODE });
      const socket = socketOf(ANA, 's1');
      let rejectConnect: (error: Error) => void = () => undefined;
      presence.connect.mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectConnect = reject;
          })
      );

      const connecting = handle.onConnection(socket.asSocket(), io) as Promise<void>;
      const disconnecting = handle.onDisconnect(socket.asSocket(), 'transport close', io);
      connecting.catch(() => undefined);

      rejectConnect(new Error('ECONNREFUSED'));
      await expect(connecting).rejects.toThrow('ECONNREFUSED');
      await disconnecting;

      expect(presence.disconnect).toHaveBeenCalledWith(ANA, 'node-1:s1');
    });
  });

  describe('heartbeat', () => {
    it('renova só os sockets ainda conectados neste nó', async () => {
      const handle = createPresenceRealtime({ presence, nodeId: NODE });
      const ana = socketOf(ANA, 's1');
      const bob = socketOf(BOB, 's2');
      await handle.onConnection(ana.asSocket(), io);
      await handle.onConnection(bob.asSocket(), io);
      await handle.onDisconnect(bob.asSocket(), 'client namespace disconnect', io);

      await handle.heartbeat();

      expect(presence.heartbeat).toHaveBeenCalledWith([{ userId: ANA, connectionId: 'node-1:s1' }]);
    });

    it('sem sockets não vai ao Redis; falha é logada', async () => {
      const handle = createPresenceRealtime({ presence, nodeId: NODE });
      await handle.heartbeat();
      expect(presence.heartbeat).not.toHaveBeenCalled();

      await handle.onConnection(socketOf(ANA, 's1').asSocket(), io);
      presence.heartbeat.mockRejectedValue('down');
      await handle.heartbeat();

      expect(logger.error).toHaveBeenCalledWith(
        'Falha no heartbeat de presença',
        expect.objectContaining({ message: 'down' })
      );
    });
  });

  describe('sweep', () => {
    it('ignora um ciclo enquanto o anterior ainda roda; falha é logada', async () => {
      const handle = createPresenceRealtime({ presence, nodeId: NODE });
      let finish: () => void = () => undefined;
      presence.sweep.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          })
      );

      const first = handle.sweep();
      await handle.sweep();
      finish();
      await first;
      expect(presence.sweep).toHaveBeenCalledTimes(1);

      presence.sweep.mockRejectedValueOnce(new Error('scan failed'));
      await handle.sweep();
      expect(logger.error).toHaveBeenCalledWith(
        'Falha na varredura de presença',
        expect.objectContaining({ message: 'scan failed' })
      );
    });
  });

  describe('timers', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('start liga heartbeat (15 s) e varredura (30 s); stop desliga; start é idempotente', async () => {
      const handle = createPresenceRealtime({ presence, nodeId: NODE });
      await handle.onConnection(socketOf(ANA, 's1').asSocket(), io);

      handle.start();
      handle.start();
      await jest.advanceTimersByTimeAsync(30_000);

      expect(presence.heartbeat).toHaveBeenCalledTimes(2);
      expect(presence.sweep).toHaveBeenCalledTimes(1);

      handle.stop();
      await jest.advanceTimersByTimeAsync(60_000);
      expect(presence.heartbeat).toHaveBeenCalledTimes(2);
      expect(jest.getTimerCount()).toBe(0);
    });

    it('intervalos injetáveis (testes de integração usam timers curtos)', async () => {
      const handle = createPresenceRealtime({
        presence,
        nodeId: NODE,
        heartbeatMs: 50,
        sweepMs: 100,
      });

      handle.start();
      await jest.advanceTimersByTimeAsync(100);
      handle.stop();

      expect(presence.sweep).toHaveBeenCalledTimes(1);
    });
  });
});
