jest.mock('@/shared/database/redis', () => ({ redis: {} }));

import * as presenceModule from '@/modules/presence';

describe('presence module index', () => {
  it('deve exportar constantes e validação', () => {
    expect(presenceModule.PRESENCE_CONSTANTS.TTL_MS).toBe(30_000);
    expect(presenceModule.effectiveState(true, 'busy')).toBe('busy');
    expect(presenceModule.presenceStatusSchema).toBeDefined();
    expect(presenceModule.presenceQuerySchema).toBeDefined();
  });

  it('deve exportar o service e a instância padrão', () => {
    expect(presenceModule.presenceService).toBeInstanceOf(presenceModule.PresenceService);
  });

  it('deve exportar os listeners de invalidação da audiência', () => {
    expect(presenceModule.registerPresenceCacheListeners).toBeInstanceOf(Function);
  });
});
