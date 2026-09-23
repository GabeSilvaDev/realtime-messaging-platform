import {
  uuidSchema,
  emailSchema,
  usernameSchema,
  passwordSchema,
  displayNameSchema,
  phoneSchema,
  urlSchema,
  dateSchema,
  dateStringSchema,
  timestampSchema,
  booleanStringSchema,
  positiveIntSchema,
  nonNegativeIntSchema,
  messageContentSchema,
  chatNameSchema,
  chatDescriptionSchema,
  messageTypeSchema,
  userStatusSchema,
  chatTypeSchema,
  mediaSchema,
  locationSchema,
  idParamsSchema,
  slugParamsSchema,
  tokenSchema,
  refreshTokenSchema,
  optionalStringSchema,
  requiredStringSchema,
  stringArraySchema,
  uuidArraySchema,
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  MIN_LIMIT,
  pageSchema,
  limitSchema,
  offsetSchema,
  sortOrderSchema,
  paginationQuerySchema,
  paginationWithOffsetSchema,
  sortableQuerySchema,
  searchableQuerySchema,
  dateRangeQuerySchema,
  cursorPaginationSchema,
  fullPaginationQuerySchema,
  fullPaginationWithDateSchema,
  createSortableSchema,
  createPaginatedQuerySchema,
  calculateOffset,
  calculateTotalPages,
  createPaginationMeta,
} from '@/shared/validation/schemas';

describe('shared/validation/schemas index', () => {
  it('deve exportar os schemas de common.schemas', () => {
    expect(uuidSchema).toBeDefined();
    expect(emailSchema).toBeDefined();
    expect(usernameSchema).toBeDefined();
    expect(passwordSchema).toBeDefined();
    expect(displayNameSchema).toBeDefined();
    expect(phoneSchema).toBeDefined();
    expect(urlSchema).toBeDefined();
    expect(dateSchema).toBeDefined();
    expect(dateStringSchema).toBeDefined();
    expect(timestampSchema).toBeDefined();
    expect(booleanStringSchema).toBeDefined();
    expect(positiveIntSchema).toBeDefined();
    expect(nonNegativeIntSchema).toBeDefined();
    expect(messageContentSchema).toBeDefined();
    expect(chatNameSchema).toBeDefined();
    expect(chatDescriptionSchema).toBeDefined();
    expect(messageTypeSchema).toBeDefined();
    expect(userStatusSchema).toBeDefined();
    expect(chatTypeSchema).toBeDefined();
    expect(mediaSchema).toBeDefined();
    expect(locationSchema).toBeDefined();
    expect(idParamsSchema).toBeDefined();
    expect(slugParamsSchema).toBeDefined();
    expect(tokenSchema).toBeDefined();
    expect(refreshTokenSchema).toBeDefined();
    expect(optionalStringSchema).toBeDefined();
    expect(requiredStringSchema).toBeDefined();
    expect(stringArraySchema).toBeDefined();
    expect(uuidArraySchema).toBeDefined();

    expect(uuidSchema.safeParse('not-a-uuid').success).toBe(false);
  });

  it('deve exportar os schemas e utilitários de pagination.schemas', () => {
    expect(DEFAULT_PAGE).toBeDefined();
    expect(DEFAULT_LIMIT).toBeDefined();
    expect(MAX_LIMIT).toBeDefined();
    expect(MIN_LIMIT).toBeDefined();
    expect(pageSchema).toBeDefined();
    expect(limitSchema).toBeDefined();
    expect(offsetSchema).toBeDefined();
    expect(sortOrderSchema).toBeDefined();
    expect(paginationQuerySchema).toBeDefined();
    expect(paginationWithOffsetSchema).toBeDefined();
    expect(sortableQuerySchema).toBeDefined();
    expect(searchableQuerySchema).toBeDefined();
    expect(dateRangeQuerySchema).toBeDefined();
    expect(cursorPaginationSchema).toBeDefined();
    expect(fullPaginationQuerySchema).toBeDefined();
    expect(fullPaginationWithDateSchema).toBeDefined();
    expect(typeof createSortableSchema).toBe('function');
    expect(typeof createPaginatedQuerySchema).toBe('function');
    expect(typeof calculateOffset).toBe('function');
    expect(typeof calculateTotalPages).toBe('function');
    expect(typeof createPaginationMeta).toBe('function');

    expect(calculateOffset(2, 10)).toBe(10);
    expect(calculateTotalPages(25, 10)).toBe(3);
  });
});
