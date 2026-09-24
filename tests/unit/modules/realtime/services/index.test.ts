import { TypingService } from '@/modules/realtime/services';

describe('realtime services index', () => {
  it('deve exportar o TypingService', () => {
    expect(new TypingService()).toBeInstanceOf(TypingService);
  });
});
