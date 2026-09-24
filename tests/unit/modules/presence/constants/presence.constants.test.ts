import {
  MANUAL_PRESENCE_STATUSES,
  PRESENCE_CACHE_KEYS,
  PRESENCE_CONSTANTS,
  PRESENCE_KEYS,
  PRESENCE_STATES,
  compareByPresence,
  effectiveState,
  toManualStatus,
} from '@/modules/presence/constants';

describe('presence constants', () => {
  it('define TTL de 30 s, heartbeat de 15 s e varredura de 30 s (spec §2)', () => {
    expect(PRESENCE_CONSTANTS).toEqual({
      TTL_MS: 30_000,
      HEARTBEAT_MS: 15_000,
      SWEEP_MS: 30_000,
      SWEEP_SCAN_COUNT: 100,
      CONNECTIONS_KEY_TTL_MS: 120_000,
      MAX_QUERY_USER_IDS: 100,
      AUDIENCE_CACHE_TTL_SECONDS: 300,
    });
  });

  it('monta as chaves do Redis', () => {
    expect(PRESENCE_KEYS.connections('u1')).toBe('presence:conns:u1');
    expect(PRESENCE_KEYS.manual('u1')).toBe('presence:manual:u1');
    expect(PRESENCE_KEYS.CONNECTIONS_PREFIX).toBe('presence:conns:');
    expect(PRESENCE_CACHE_KEYS.audience('u1')).toBe('presence:audience:u1');
  });

  it('lista status manuais e estados', () => {
    expect(MANUAL_PRESENCE_STATUSES).toEqual(['available', 'away', 'busy']);
    expect(PRESENCE_STATES).toEqual(['online', 'away', 'busy', 'offline']);
  });

  it.each([
    ['available', 'available'],
    ['away', 'away'],
    ['busy', 'busy'],
    [null, 'available'],
    ['online', 'available'],
    [42, 'available'],
  ])('toManualStatus(%p) → %s', (raw, expected) => {
    expect(toManualStatus(raw)).toBe(expected);
  });

  it.each([
    [false, 'busy', 'offline'],
    [true, 'available', 'online'],
    [true, 'away', 'away'],
    [true, 'busy', 'busy'],
  ] as const)('effectiveState(conectado=%p, %s) → %s', (connected, manual, expected) => {
    expect(effectiveState(connected, manual)).toBe(expected);
  });

  it('compareByPresence: online → away → busy → offline (visto mais recente primeiro, sem data no fim)', () => {
    const entries = [
      { name: 'semData', state: 'offline', lastSeenAt: null },
      { name: 'ocupado', state: 'busy', lastSeenAt: null },
      { name: 'antigo', state: 'offline', lastSeenAt: new Date('2026-09-25T10:00:00.000Z') },
      { name: 'online', state: 'online', lastSeenAt: null },
      { name: 'recente', state: 'offline', lastSeenAt: new Date('2026-09-26T10:00:00.000Z') },
      { name: 'ausente', state: 'away', lastSeenAt: null },
    ] as const;

    expect([...entries].sort(compareByPresence).map((entry) => entry.name)).toEqual([
      'online',
      'ausente',
      'ocupado',
      'recente',
      'antigo',
      'semData',
    ]);
  });
});
