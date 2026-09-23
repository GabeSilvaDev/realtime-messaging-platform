import * as utilsIndex from '@/shared/utils';
import { z, validate, createValidator } from '@/shared/utils';
import { slugify, capitalize, generateUUID } from '@/shared/utils';

describe('shared/utils index', () => {
  it('deve expor todos os re-exports nomeados (getters do barrel) como definidos', () => {
    const keys = Object.keys(utilsIndex);
    // sanity check: o barrel reexporta validator.ts (~13 nomes) + helpers.ts (~47 nomes)
    expect(keys.length).toBeGreaterThan(50);
    for (const key of keys) {
      expect(utilsIndex[key as keyof typeof utilsIndex]).toBeDefined();
    }
  });

  it('deve exportar os utilitários de validação (validator.ts)', () => {
    expect(z).toBeDefined();
    expect(typeof validate).toBe('function');
    expect(typeof createValidator).toBe('function');

    const schema = z.object({ name: z.string() });
    expect(validate(schema, { name: 'ok' })).toEqual({ success: true, data: { name: 'ok' } });
  });

  it('deve exportar os helpers (helpers.ts)', () => {
    expect(typeof slugify).toBe('function');
    expect(typeof capitalize).toBe('function');
    expect(typeof generateUUID).toBe('function');

    expect(slugify('Título Ção')).toBe('titulo-cao');
    expect(capitalize('hello')).toBe('Hello');
    expect(generateUUID()).toMatch(/^[0-9a-f-]{36}$/);
  });
});
