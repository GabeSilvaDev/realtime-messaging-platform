import { escapeLikePattern } from '@/shared/utils/sql';

describe('escapeLikePattern', () => {
  it('deve escapar barra invertida, % e _ para uso literal em LIKE/ILIKE', () => {
    expect(escapeLikePattern('50%off')).toBe('50\\%off');
    expect(escapeLikePattern('a_b')).toBe('a\\_b');
    expect(escapeLikePattern('a\\b')).toBe('a\\\\b');
  });

  it('deve manter termos sem caracteres especiais inalterados', () => {
    expect(escapeLikePattern('test')).toBe('test');
  });
});
