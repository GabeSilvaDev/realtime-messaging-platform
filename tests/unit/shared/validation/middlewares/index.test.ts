import { z } from 'zod';
import {
  validateRequest,
  validateBody,
  validateQuery,
  validateParams,
  validateHeaders,
  validate,
  validateWebSocketMessage,
  createValidationMiddleware,
} from '@/shared/validation/middlewares';

describe('shared/validation/middlewares index', () => {
  it('deve exportar todas as funções de validação (comportamento coberto em validate.middleware.test.ts)', () => {
    expect(typeof validateRequest).toBe('function');
    expect(typeof validateBody).toBe('function');
    expect(typeof validateQuery).toBe('function');
    expect(typeof validateParams).toBe('function');
    expect(typeof validateHeaders).toBe('function');
    expect(typeof validate).toBe('function');
    expect(typeof validateWebSocketMessage).toBe('function');
    expect(typeof createValidationMiddleware).toBe('function');
  });

  it('validateWebSocketMessage deve validar mensagens fora do ciclo HTTP', () => {
    const schema = z.object({ type: z.string() });
    expect(validateWebSocketMessage(schema, { type: 'ping' })).toEqual({
      success: true,
      data: { type: 'ping' },
    });
    expect(validateWebSocketMessage(schema, { type: 1 }).success).toBe(false);
  });
});
