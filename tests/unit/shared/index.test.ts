jest.mock('@/shared/database/sequelize', () => ({
  sequelize: { name: 'sequelize' },
  connectPostgres: jest.fn(),
  disconnectPostgres: jest.fn(),
}));

jest.mock('@/shared/database/redis', () => ({
  redis: { name: 'redis' },
  connectRedis: jest.fn(),
  disconnectRedis: jest.fn(),
}));

jest.mock('@/shared/database/mongo', () => ({
  mongoose: { name: 'mongoose' },
  connectMongo: jest.fn(),
  disconnectMongo: jest.fn(),
}));

jest.mock('@/shared/database/elasticsearch', () => ({
  elasticsearch: { name: 'elasticsearch' },
  connectElasticsearch: jest.fn(),
  disconnectElasticsearch: jest.fn(),
}));

describe('shared index', () => {
  it('deve exportar a config de banco', () => {
    const shared = require('@/shared');
    expect(shared.config).toBeDefined();
  });

  it('deve exportar as constantes compartilhadas', () => {
    const shared = require('@/shared');
    expect(shared.DEFAULT_PORT).toBeDefined();
    expect(shared.POSTGRES_DEFAULTS).toBeDefined();
    expect(shared.REDIS_DEFAULTS).toBeDefined();
    expect(shared.MONGO_DEFAULTS).toBeDefined();
    expect(shared.ELASTICSEARCH_DEFAULTS).toBeDefined();
    expect(shared.POOL_CONFIG).toBeDefined();
    expect(shared.MONGO_OPTIONS).toBeDefined();
    expect(shared.CORS_DEFAULT_METHODS).toBeDefined();
    expect(shared.CORS_DEFAULT_ALLOWED_HEADERS).toBeDefined();
    expect(shared.CORS_DEFAULT_EXPOSED_HEADERS).toBeDefined();
    expect(shared.CORS_DEFAULT_MAX_AGE).toBeDefined();
    expect(shared.RATE_LIMIT_DEFAULT_WINDOW_MS).toBeDefined();
    expect(shared.RATE_LIMIT_DEFAULT_MAX_REQUESTS).toBeDefined();
    expect(shared.RATE_LIMIT_DEFAULT_KEY_PREFIX).toBeDefined();
    expect(shared.REQUEST_ID_DEFAULT_HEADER_NAME).toBeDefined();
    expect(shared.HSTS_DEFAULT_MAX_AGE).toBeDefined();
  });

  it('deve exportar os módulos de conexão de banco', () => {
    const shared = require('@/shared');
    expect(shared.sequelize).toEqual({ name: 'sequelize' });
    expect(shared.connectPostgres).toBeDefined();
    expect(shared.disconnectPostgres).toBeDefined();
    expect(shared.redis).toEqual({ name: 'redis' });
    expect(shared.connectRedis).toBeDefined();
    expect(shared.disconnectRedis).toBeDefined();
    expect(shared.mongoose).toEqual({ name: 'mongoose' });
    expect(shared.connectMongo).toBeDefined();
    expect(shared.disconnectMongo).toBeDefined();
    expect(shared.elasticsearch).toEqual({ name: 'elasticsearch' });
    expect(shared.connectElasticsearch).toBeDefined();
    expect(shared.disconnectElasticsearch).toBeDefined();
  });

  it('deve exportar os erros compartilhados', () => {
    const shared = require('@/shared');
    expect(shared.AppError).toBeDefined();
    expect(shared.HttpStatus).toBeDefined();
    expect(shared.ErrorCode).toBeDefined();
    expect(shared.ValidationError).toBeDefined();
    expect(shared.UnauthorizedError).toBeDefined();
    expect(shared.AuthErrorReason).toBeDefined();
  });

  it('deve exportar o logger', () => {
    const shared = require('@/shared');
    expect(shared.Logger).toBeDefined();
    expect(shared.initLogger).toBeDefined();
    expect(shared.getLogger).toBeDefined();
    expect(shared.LogLevel).toBeDefined();
    expect(shared.LogCategory).toBeDefined();
    expect(shared.LogModel).toBeDefined();
  });

  it('deve exportar os middlewares compartilhados', () => {
    const shared = require('@/shared');
    expect(shared.errorHandler).toBeDefined();
    expect(shared.requestLogger).toBeDefined();
    expect(shared.createRateLimiter).toBeDefined();
    expect(shared.getRateLimiter).toBeDefined();
    expect(shared.getStrictRateLimiter).toBeDefined();
    expect(shared.getAuthRateLimiter).toBeDefined();
    expect(shared.corsMiddleware).toBeDefined();
    expect(shared.createCorsMiddleware).toBeDefined();
    expect(shared.helmetMiddleware).toBeDefined();
    expect(shared.createHelmetMiddleware).toBeDefined();
    expect(shared.notFoundHandler).toBeDefined();
    expect(shared.requestIdMiddleware).toBeDefined();
    expect(shared.createRequestIdMiddleware).toBeDefined();
  });

  it('deve exportar os utilitários de validação (zod re-export e validators)', () => {
    const shared = require('@/shared');
    expect(shared.validate).toBeDefined();
    expect(shared.validateAsync).toBeDefined();
    expect(shared.validateOrThrow).toBeDefined();
    expect(shared.validateOrThrowAsync).toBeDefined();
    expect(shared.isValid).toBeDefined();
    expect(shared.getValidationErrors).toBeDefined();
    expect(shared.createValidator).toBeDefined();
    expect(shared.mergeSchemas).toBeDefined();
    expect(shared.extendSchema).toBeDefined();
    expect(shared.partialSchema).toBeDefined();
    expect(shared.pickSchema).toBeDefined();
    expect(shared.omitSchema).toBeDefined();
    expect(shared.z).toBeDefined();
  });

  it('deve exportar os schemas de validação e utilitários de paginação', () => {
    const shared = require('@/shared');
    expect(shared.uuidSchema).toBeDefined();
    expect(shared.emailSchema).toBeDefined();
    expect(shared.usernameSchema).toBeDefined();
    expect(shared.passwordSchema).toBeDefined();
    expect(shared.displayNameSchema).toBeDefined();
    expect(shared.phoneSchema).toBeDefined();
    expect(shared.urlSchema).toBeDefined();
    expect(shared.dateSchema).toBeDefined();
    expect(shared.dateStringSchema).toBeDefined();
    expect(shared.timestampSchema).toBeDefined();
    expect(shared.booleanStringSchema).toBeDefined();
    expect(shared.positiveIntSchema).toBeDefined();
    expect(shared.nonNegativeIntSchema).toBeDefined();
    expect(shared.messageContentSchema).toBeDefined();
    expect(shared.chatNameSchema).toBeDefined();
    expect(shared.chatDescriptionSchema).toBeDefined();
    expect(shared.messageTypeSchema).toBeDefined();
    expect(shared.userStatusSchema).toBeDefined();
    expect(shared.chatTypeSchema).toBeDefined();
    expect(shared.mediaSchema).toBeDefined();
    expect(shared.locationSchema).toBeDefined();
    expect(shared.idParamsSchema).toBeDefined();
    expect(shared.slugParamsSchema).toBeDefined();
    expect(shared.tokenSchema).toBeDefined();
    expect(shared.refreshTokenSchema).toBeDefined();
    expect(shared.optionalStringSchema).toBeDefined();
    expect(shared.requiredStringSchema).toBeDefined();
    expect(shared.stringArraySchema).toBeDefined();
    expect(shared.uuidArraySchema).toBeDefined();
    expect(shared.DEFAULT_PAGE).toBeDefined();
    expect(shared.DEFAULT_LIMIT).toBeDefined();
    expect(shared.MAX_LIMIT).toBeDefined();
    expect(shared.MIN_LIMIT).toBeDefined();
    expect(shared.pageSchema).toBeDefined();
    expect(shared.limitSchema).toBeDefined();
    expect(shared.offsetSchema).toBeDefined();
    expect(shared.sortOrderSchema).toBeDefined();
    expect(shared.paginationQuerySchema).toBeDefined();
    expect(shared.paginationWithOffsetSchema).toBeDefined();
    expect(shared.sortableQuerySchema).toBeDefined();
    expect(shared.searchableQuerySchema).toBeDefined();
    expect(shared.dateRangeQuerySchema).toBeDefined();
    expect(shared.cursorPaginationSchema).toBeDefined();
    expect(shared.fullPaginationQuerySchema).toBeDefined();
    expect(shared.fullPaginationWithDateSchema).toBeDefined();
    expect(shared.createSortableSchema).toBeDefined();
    expect(shared.createPaginatedQuerySchema).toBeDefined();
    expect(shared.calculateOffset).toBeDefined();
    expect(shared.calculateTotalPages).toBeDefined();
    expect(shared.createPaginationMeta).toBeDefined();
    expect(shared.validateRequest).toBeDefined();
    expect(shared.validateBody).toBeDefined();
    expect(shared.validateQuery).toBeDefined();
    expect(shared.validateParams).toBeDefined();
    expect(shared.validateHeaders).toBeDefined();
    expect(shared.validateWebSocketMessage).toBeDefined();
    expect(shared.createValidationMiddleware).toBeDefined();
  });
});
