import {
  uuidSchema,
  emailSchema,
  paginationQuerySchema,
  calculateOffset,
  validateRequest,
  validateBody,
  validateQuery,
  validateParams,
  validateHeaders,
  validate,
  validateWebSocketMessage,
  createValidationMiddleware,
} from '@/shared/validation';

describe('shared/validation index', () => {
  it('deve exportar os schemas re-exportados de ./schemas', () => {
    expect(uuidSchema).toBeDefined();
    expect(emailSchema).toBeDefined();
    expect(paginationQuerySchema).toBeDefined();
    expect(typeof calculateOffset).toBe('function');
  });

  it('deve exportar as funções de validação re-exportadas de ./middlewares', () => {
    expect(typeof validateRequest).toBe('function');
    expect(typeof validateBody).toBe('function');
    expect(typeof validateQuery).toBe('function');
    expect(typeof validateParams).toBe('function');
    expect(typeof validateHeaders).toBe('function');
    expect(typeof validate).toBe('function');
    expect(typeof validateWebSocketMessage).toBe('function');
    expect(typeof createValidationMiddleware).toBe('function');
  });
});
