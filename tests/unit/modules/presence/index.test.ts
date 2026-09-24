import * as presenceModule from '@/modules/presence';

describe('presence module index', () => {
  it('deve exportar constantes e validação', () => {
    expect(presenceModule.PRESENCE_CONSTANTS.TTL_MS).toBe(30_000);
    expect(presenceModule.effectiveState(true, 'busy')).toBe('busy');
    expect(presenceModule.presenceStatusSchema).toBeDefined();
    expect(presenceModule.presenceQuerySchema).toBeDefined();
  });
});
