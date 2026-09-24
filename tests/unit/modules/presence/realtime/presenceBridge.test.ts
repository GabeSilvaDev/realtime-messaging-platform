jest.mock('@/modules/presence/services', () => ({ presenceService: {} }));
jest.mock('@/shared/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { registerPresenceBridge } from '@/modules/presence/realtime';
import type { PresenceStateEntry } from '@/modules/presence/types';
import { EventBus } from '@/shared/event-bus/EventBus';
import { logger } from '@/shared/logger';
import { PresenceEvents, UserEvents } from '@/shared/types';
import { createFakeServer, type FakeServer } from '../../../../support/realtime/fakeSocket';

const ANA = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const CAROL = '33333333-3333-4333-8333-333333333333';
const LAST_SEEN = new Date('2026-09-26T10:00:00.000Z');

function states(entries: [string, PresenceStateEntry][]): Map<string, PresenceStateEntry> {
  return new Map(entries);
}

describe('registerPresenceBridge', () => {
  let bus: EventBus;
  let io: FakeServer;
  let presence: { presenceAudience: jest.Mock; getStates: jest.Mock; getVisibleStates: jest.Mock };
  let unregister: () => void;

  beforeEach(() => {
    EventBus.resetInstance();
    bus = EventBus.getInstance();
    io = createFakeServer();
    presence = {
      presenceAudience: jest.fn().mockResolvedValue([BOB, CAROL]),
      getStates: jest.fn(async (ids: string[]) =>
        states(ids.map((id) => [id, { state: 'busy', lastSeenAt: null }]))
      ),
      getVisibleStates: jest.fn(),
    };
    unregister = registerPresenceBridge(io.asServer(), { presence, bus });
  });

  afterEach(() => {
    unregister();
    EventBus.resetInstance();
  });

  it('presence:online → presence:update com o estado real para a audiência', async () => {
    await bus.publish(PresenceEvents.ONLINE, { userId: ANA, timestamp: new Date() });

    expect(presence.presenceAudience).toHaveBeenCalledWith(ANA);
    expect(presence.getStates).toHaveBeenCalledWith([ANA]);
    expect(io.emits).toEqual([
      [
        [`user:${BOB}`, `user:${CAROL}`],
        'presence:update',
        { userId: ANA, state: 'busy', lastSeenAt: null },
      ],
    ]);
  });

  it('audiência vazia ou usuário ausente da leitura: nada é emitido', async () => {
    presence.presenceAudience.mockResolvedValueOnce([]);
    await bus.publish(PresenceEvents.ONLINE, { userId: ANA, timestamp: new Date() });

    presence.getStates.mockResolvedValueOnce(new Map());
    await bus.publish(PresenceEvents.ONLINE, { userId: ANA, timestamp: new Date() });

    expect(io.emits).toEqual([]);
  });

  // Fix round 1 (revisão, CRÍTICO/privacidade): bloqueio é por direção. `presenceAudience` já
  // aplica `listBlockedEitherIds` (os dois sentidos) — a ponte só usa a audiência que recebe, nunca
  // adiciona ninguém de volta. Um usuário bloqueado no sentido inverso (ele bloqueou o emissor, não
  // o contrário) nunca aparece na audiência e por isso nunca recebe `presence:update`.
  it('presence:online: quem bloqueou o emissor no sentido inverso nunca recebe o presence:update (a ponte só usa a audiência devolvida)', async () => {
    presence.presenceAudience.mockResolvedValueOnce([CAROL]);

    await bus.publish(PresenceEvents.ONLINE, { userId: ANA, timestamp: new Date() });

    expect(io.emits).toEqual([
      [[`user:${CAROL}`], 'presence:update', { userId: ANA, state: 'busy', lastSeenAt: null }],
    ]);
  });

  // Task 8 review: `disconnect`/`sweep` gravam `last_seen_at` antes de publicar `presence:offline`
  // — o evento pode chegar atrasado. A ponte nunca confia no payload: relê o estado atual.
  it('presence:offline → presence:update com o estado atual (relido, não o do payload)', async () => {
    presence.getStates.mockResolvedValueOnce(
      states([[ANA, { state: 'offline', lastSeenAt: LAST_SEEN }]])
    );

    await bus.publish(PresenceEvents.OFFLINE, { userId: ANA, lastSeen: LAST_SEEN });

    expect(presence.getStates).toHaveBeenCalledWith([ANA]);
    expect(io.emits).toEqual([
      [
        [`user:${BOB}`, `user:${CAROL}`],
        'presence:update',
        { userId: ANA, state: 'offline', lastSeenAt: LAST_SEEN },
      ],
    ]);
  });

  it('presence:offline obsoleto (usuário já está online de novo): emite o estado atual, não offline', async () => {
    presence.getStates.mockResolvedValueOnce(
      states([[ANA, { state: 'online', lastSeenAt: null }]])
    );

    await bus.publish(PresenceEvents.OFFLINE, { userId: ANA, lastSeen: LAST_SEEN });

    expect(io.emits).toEqual([
      [
        [`user:${BOB}`, `user:${CAROL}`],
        'presence:update',
        { userId: ANA, state: 'online', lastSeenAt: null },
      ],
    ]);
  });

  it.each([
    ['busy', 'busy'],
    ['away', 'away'],
    ['available', 'online'],
  ] as const)(
    'presence:status-changed (status %s no payload, %s no estado atual) → o estado atual vai para a audiência e as outras abas do usuário',
    async (status, state) => {
      presence.getStates.mockResolvedValueOnce(states([[ANA, { state, lastSeenAt: null }]]));

      await bus.publish(PresenceEvents.STATUS_CHANGED, { userId: ANA, status });

      expect(presence.getStates).toHaveBeenCalledWith([ANA]);
      expect(io.emits).toEqual([
        [
          [`user:${BOB}`, `user:${CAROL}`, `user:${ANA}`],
          'presence:update',
          { userId: ANA, state, lastSeenAt: null },
        ],
      ]);
    }
  );

  it('duas mudanças de status em ordem trocada: cada emissão usa o estado atual da hora, nunca o do payload', async () => {
    presence.getStates
      .mockResolvedValueOnce(states([[ANA, { state: 'busy', lastSeenAt: null }]]))
      .mockResolvedValueOnce(states([[ANA, { state: 'away', lastSeenAt: null }]]));

    await bus.publish(PresenceEvents.STATUS_CHANGED, { userId: ANA, status: 'away' });
    await bus.publish(PresenceEvents.STATUS_CHANGED, { userId: ANA, status: 'busy' });

    expect(io.emits.map(([, , payload]) => (payload as { state: string }).state)).toEqual([
      'busy',
      'away',
    ]);
  });

  it('user:blocked → cada lado passa a ver o outro offline, na hora', async () => {
    await bus.publish(UserEvents.BLOCKED, { userId: ANA, blockedUserId: BOB });

    expect(io.emits).toEqual([
      [[`user:${BOB}`], 'presence:update', { userId: ANA, state: 'offline', lastSeenAt: null }],
      [[`user:${ANA}`], 'presence:update', { userId: BOB, state: 'offline', lastSeenAt: null }],
    ]);
  });

  // Fix round 1 (revisão, CRÍTICO/privacidade): bloqueio é por direção — A desbloquear B não
  // implica B ter desbloqueado A. Por isso `user:unblocked` relê via `getVisibleStates(viewer,
  // [subject])` (nunca `getStates`), que reaplica o filtro dos dois sentidos.
  it('user:unblocked → cada lado recebe o estado real do outro (via getVisibleStates, com o filtro de bloqueio dos dois sentidos)', async () => {
    presence.getVisibleStates.mockImplementation(async (_viewerId: string, ids: string[]) =>
      ids.map((id) =>
        id === ANA
          ? { userId: ANA, state: 'online', lastSeenAt: null }
          : { userId: BOB, state: 'offline', lastSeenAt: LAST_SEEN }
      )
    );

    await bus.publish(UserEvents.UNBLOCKED, { userId: ANA, unblockedUserId: BOB });

    expect(presence.getVisibleStates).toHaveBeenCalledWith(BOB, [ANA]);
    expect(presence.getVisibleStates).toHaveBeenCalledWith(ANA, [BOB]);
    expect(io.emits).toEqual([
      [[`user:${BOB}`], 'presence:update', { userId: ANA, state: 'online', lastSeenAt: null }],
      [
        [`user:${ANA}`],
        'presence:update',
        { userId: BOB, state: 'offline', lastSeenAt: LAST_SEEN },
      ],
    ]);
  });

  it('user:unblocked: se o bloqueio continuar no sentido inverso, os dois continuam vendo offline (não vaza o estado real)', async () => {
    // ANA desbloqueou BOB, mas BOB ainda bloqueia ANA (ou o contrário) — getVisibleStates já
    // devolve offline para os dois sentidos enquanto durar QUALQUER bloqueio entre os dois.
    presence.getVisibleStates.mockImplementation(async (_viewerId: string, ids: string[]) =>
      ids.map((id) => ({ userId: id, state: 'offline' as const, lastSeenAt: null }))
    );

    await bus.publish(UserEvents.UNBLOCKED, { userId: ANA, unblockedUserId: BOB });

    expect(io.emits).toEqual([
      [[`user:${BOB}`], 'presence:update', { userId: ANA, state: 'offline', lastSeenAt: null }],
      [[`user:${ANA}`], 'presence:update', { userId: BOB, state: 'offline', lastSeenAt: null }],
    ]);
  });

  it('user:unblocked: quando os dois sentidos estão liberados (o outro lado também desbloqueou), o estado real é revelado', async () => {
    // Continuação do teste anterior: agora BOB também desbloqueou ANA — os dois sentidos estão
    // livres e getVisibleStates deixa de esconder.
    presence.getVisibleStates.mockImplementation(async (_viewerId: string, ids: string[]) =>
      ids.map((id) => ({
        userId: id,
        state: id === ANA ? ('online' as const) : ('busy' as const),
        lastSeenAt: null,
      }))
    );

    await bus.publish(UserEvents.UNBLOCKED, { userId: BOB, unblockedUserId: ANA });

    expect(io.emits).toEqual([
      [[`user:${ANA}`], 'presence:update', { userId: BOB, state: 'busy', lastSeenAt: null }],
      [[`user:${BOB}`], 'presence:update', { userId: ANA, state: 'online', lastSeenAt: null }],
    ]);
  });

  it('user:unblocked de alguém que não veio na leitura não emite', async () => {
    presence.getVisibleStates.mockResolvedValue([]);

    await bus.publish(UserEvents.UNBLOCKED, { userId: ANA, unblockedUserId: BOB });

    expect(io.emits).toEqual([]);
  });

  it('emissões sobre o mesmo usuário saem na ordem dos eventos (online lento, offline rápido)', async () => {
    let releaseAudience: (ids: string[]) => void = () => undefined;
    presence.presenceAudience.mockImplementationOnce(
      () =>
        new Promise<string[]>((resolve) => {
          releaseAudience = resolve;
        })
    );
    presence.getStates
      .mockResolvedValueOnce(states([[ANA, { state: 'busy', lastSeenAt: null }]]))
      .mockResolvedValueOnce(states([[ANA, { state: 'offline', lastSeenAt: LAST_SEEN }]]));

    const online = bus.publish(PresenceEvents.ONLINE, { userId: ANA, timestamp: new Date() });
    const offline = bus.publish(PresenceEvents.OFFLINE, { userId: ANA, lastSeen: LAST_SEEN });
    await new Promise((resolve) => setImmediate(resolve));
    expect(io.emits).toEqual([]);
    releaseAudience([BOB]);
    await Promise.all([online, offline]);

    expect(io.emits.map(([, , payload]) => (payload as { state: string }).state)).toEqual([
      'busy',
      'offline',
    ]);
  });

  it('falha na leitura é logada, não propaga e não trava a fila do usuário', async () => {
    presence.presenceAudience.mockRejectedValueOnce(new Error('redis down'));
    presence.presenceAudience.mockRejectedValueOnce('timeout');

    await expect(
      bus.publish(PresenceEvents.OFFLINE, { userId: ANA, lastSeen: LAST_SEEN })
    ).resolves.toEqual(expect.any(String));
    await bus.publish(PresenceEvents.OFFLINE, { userId: ANA, lastSeen: LAST_SEEN });
    await bus.publish(PresenceEvents.OFFLINE, { userId: ANA, lastSeen: LAST_SEEN });

    expect(logger.error).toHaveBeenCalledWith(
      'Falha ao avisar a mudança de presença',
      expect.objectContaining({ message: 'redis down' }),
      { userId: ANA }
    );
    expect(logger.error).toHaveBeenCalledWith(
      'Falha ao avisar a mudança de presença',
      expect.objectContaining({ message: 'timeout' }),
      { userId: ANA }
    );
    expect(io.emits).toHaveLength(1);
  });

  // Fix round 1 (menor, consistência): se o próprio `logger.error` do catch principal lançar, a
  // fila não pode ficar travada para sempre — a limpeza roda nos dois desfechos de `next` (não só
  // quando ele resolve) e a rejeição resultante é logada (não propaga).
  it('falha ao logar o erro original não trava a fila: a limpeza roda mesmo assim e o próximo evento processa normalmente', async () => {
    presence.presenceAudience.mockRejectedValueOnce(new Error('redis down'));
    (logger.error as jest.Mock).mockImplementationOnce(() => {
      throw new Error('logger caiu');
    });

    await bus.publish(PresenceEvents.OFFLINE, { userId: ANA, lastSeen: LAST_SEEN });

    expect(logger.error).toHaveBeenNthCalledWith(
      1,
      'Falha ao avisar a mudança de presença',
      expect.objectContaining({ message: 'redis down' }),
      { userId: ANA }
    );
    expect(logger.error).toHaveBeenNthCalledWith(
      2,
      'Falha ao limpar a fila de presença do usuário',
      expect.objectContaining({ message: 'logger caiu' }),
      { userId: ANA }
    );

    // valor não-Error lançado pelo catch principal: a limpeza também envolve em `new Error(...)`.
    presence.presenceAudience.mockRejectedValueOnce(new Error('redis down de novo'));
    (logger.error as jest.Mock).mockImplementationOnce(() => {
      throw 'logger caiu de novo';
    });

    await bus.publish(PresenceEvents.OFFLINE, { userId: ANA, lastSeen: LAST_SEEN });

    expect(logger.error).toHaveBeenNthCalledWith(
      4,
      'Falha ao limpar a fila de presença do usuário',
      expect.objectContaining({ message: 'logger caiu de novo' }),
      { userId: ANA }
    );

    await bus.publish(PresenceEvents.OFFLINE, { userId: ANA, lastSeen: LAST_SEEN });
    expect(io.emits).toHaveLength(1);
  });

  it('a função devolvida cancela as inscrições; o padrão usa o EventBus e o presenceService', async () => {
    unregister();
    await bus.publish(PresenceEvents.OFFLINE, { userId: ANA, lastSeen: LAST_SEEN });

    expect(io.emits).toEqual([]);
    expect(registerPresenceBridge(io.asServer())).toBeInstanceOf(Function);
  });
});
