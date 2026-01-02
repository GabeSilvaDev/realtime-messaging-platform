import {
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
} from '@/shared/validation/schemas/pagination.schemas';
import { z } from 'zod';

describe('Pagination Schemas', () => {
  describe('Constants', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_PAGE).toBe(1);
      expect(DEFAULT_LIMIT).toBe(20);
      expect(MAX_LIMIT).toBe(100);
      expect(MIN_LIMIT).toBe(1);
    });
  });

  describe('pageSchema', () => {
    it('should validate a valid page number', () => {
      const result = pageSchema.safeParse(5);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(5);
      }
    });

    it('should coerce string to number', () => {
      const result = pageSchema.safeParse('10');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(10);
      }
    });

    it('should reject zero', () => {
      const result = pageSchema.safeParse(0);
      expect(result.success).toBe(false);
    });

    it('should reject negative numbers', () => {
      const result = pageSchema.safeParse(-1);
      expect(result.success).toBe(false);
    });

    it('should use default when undefined', () => {
      const result = pageSchema.safeParse(undefined);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(DEFAULT_PAGE);
      }
    });

    it('should reject non-integer', () => {
      const result = pageSchema.safeParse(1.5);
      expect(result.success).toBe(false);
    });
  });

  describe('limitSchema', () => {
    it('should validate a valid limit', () => {
      const result = limitSchema.safeParse(50);
      expect(result.success).toBe(true);
    });

    it('should reject limit above maximum', () => {
      const result = limitSchema.safeParse(MAX_LIMIT + 1);
      expect(result.success).toBe(false);
    });

    it('should reject limit below minimum', () => {
      const result = limitSchema.safeParse(0);
      expect(result.success).toBe(false);
    });

    it('should use default when undefined', () => {
      const result = limitSchema.safeParse(undefined);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(DEFAULT_LIMIT);
      }
    });
  });

  describe('offsetSchema', () => {
    it('should validate zero offset', () => {
      const result = offsetSchema.safeParse(0);
      expect(result.success).toBe(true);
    });

    it('should validate positive offset', () => {
      const result = offsetSchema.safeParse(100);
      expect(result.success).toBe(true);
    });

    it('should reject negative offset', () => {
      const result = offsetSchema.safeParse(-1);
      expect(result.success).toBe(false);
    });

    it('should use default when undefined', () => {
      const result = offsetSchema.safeParse(undefined);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(0);
      }
    });
  });

  describe('sortOrderSchema', () => {
    it('should validate asc', () => {
      const result = sortOrderSchema.safeParse('asc');
      expect(result.success).toBe(true);
    });

    it('should validate desc', () => {
      const result = sortOrderSchema.safeParse('desc');
      expect(result.success).toBe(true);
    });

    it('should reject invalid sort order', () => {
      const result = sortOrderSchema.safeParse('invalid');
      expect(result.success).toBe(false);
    });

    it('should default to desc', () => {
      const result = sortOrderSchema.safeParse(undefined);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('desc');
      }
    });
  });

  describe('paginationQuerySchema', () => {
    it('should validate complete pagination query', () => {
      const result = paginationQuerySchema.safeParse({ page: 2, limit: 30 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ page: 2, limit: 30 });
      }
    });

    it('should use defaults for empty object', () => {
      const result = paginationQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(DEFAULT_PAGE);
        expect(result.data.limit).toBe(DEFAULT_LIMIT);
      }
    });
  });

  describe('paginationWithOffsetSchema', () => {
    it('should validate offset-based pagination', () => {
      const result = paginationWithOffsetSchema.safeParse({ limit: 20, offset: 40 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ limit: 20, offset: 40 });
      }
    });
  });

  describe('sortableQuerySchema', () => {
    it('should validate sortable query', () => {
      const result = sortableQuerySchema.safeParse({ sortBy: 'createdAt', sortOrder: 'asc' });
      expect(result.success).toBe(true);
    });

    it('should accept optional sortBy', () => {
      const result = sortableQuerySchema.safeParse({ sortOrder: 'desc' });
      expect(result.success).toBe(true);
    });
  });

  describe('searchableQuerySchema', () => {
    it('should validate search query', () => {
      const result = searchableQuerySchema.safeParse({ search: 'test' });
      expect(result.success).toBe(true);
    });

    it('should reject search exceeding max length', () => {
      const result = searchableQuerySchema.safeParse({ search: 'a'.repeat(201) });
      expect(result.success).toBe(false);
    });

    it('should transform searchFields to array', () => {
      const result = searchableQuerySchema.safeParse({
        search: 'test',
        searchFields: 'name,email,title',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.searchFields).toEqual(['name', 'email', 'title']);
      }
    });

    it('should trim whitespace from searchFields', () => {
      const result = searchableQuerySchema.safeParse({
        searchFields: ' name , email , title ',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.searchFields).toEqual(['name', 'email', 'title']);
      }
    });
  });

  describe('dateRangeQuerySchema', () => {
    it('should validate date range', () => {
      const result = dateRangeQuerySchema.safeParse({
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      });
      expect(result.success).toBe(true);
    });

    it('should accept only startDate', () => {
      const result = dateRangeQuerySchema.safeParse({
        startDate: '2024-01-01',
      });
      expect(result.success).toBe(true);
    });

    it('should accept only endDate', () => {
      const result = dateRangeQuerySchema.safeParse({
        endDate: '2024-12-31',
      });
      expect(result.success).toBe(true);
    });

    it('should reject startDate after endDate', () => {
      const result = dateRangeQuerySchema.safeParse({
        startDate: '2024-12-31',
        endDate: '2024-01-01',
      });
      expect(result.success).toBe(false);
    });

    it('should accept empty object', () => {
      const result = dateRangeQuerySchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });

  describe('cursorPaginationSchema', () => {
    it('should validate cursor pagination', () => {
      const result = cursorPaginationSchema.safeParse({
        cursor: 'abc123',
        limit: 20,
        direction: 'forward',
      });
      expect(result.success).toBe(true);
    });

    it('should accept backward direction', () => {
      const result = cursorPaginationSchema.safeParse({
        cursor: 'abc123',
        limit: 20,
        direction: 'backward',
      });
      expect(result.success).toBe(true);
    });

    it('should default direction to forward', () => {
      const result = cursorPaginationSchema.safeParse({
        limit: 20,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.direction).toBe('forward');
      }
    });

    it('should accept optional cursor', () => {
      const result = cursorPaginationSchema.safeParse({
        limit: 20,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.cursor).toBeUndefined();
      }
    });
  });

  describe('fullPaginationQuerySchema', () => {
    it('should validate full pagination query', () => {
      const result = fullPaginationQuerySchema.safeParse({
        page: 1,
        limit: 20,
        sortBy: 'createdAt',
        sortOrder: 'desc',
        search: 'test',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('fullPaginationWithDateSchema', () => {
    it('should validate full pagination with date range', () => {
      const result = fullPaginationWithDateSchema.safeParse({
        page: 1,
        limit: 20,
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('createSortableSchema', () => {
    it('should create schema with allowed sort fields', () => {
      const schema = createSortableSchema(['name', 'createdAt', 'updatedAt'] as const);

      const validResult = schema.safeParse({ sortBy: 'name', sortOrder: 'asc' });
      expect(validResult.success).toBe(true);

      const invalidResult = schema.safeParse({ sortBy: 'invalid', sortOrder: 'asc' });
      expect(invalidResult.success).toBe(false);
    });

    it('should allow optional sortBy', () => {
      const schema = createSortableSchema(['name', 'createdAt'] as const);

      const result = schema.safeParse({ sortOrder: 'desc' });
      expect(result.success).toBe(true);
    });
  });

  describe('createPaginatedQuerySchema', () => {
    it('should create paginated schema with additional fields', () => {
      const additionalFields = z.object({
        status: z.enum(['active', 'inactive']),
        type: z.string().optional(),
      });

      const schema = createPaginatedQuerySchema(additionalFields);

      const result = schema.safeParse({
        page: 1,
        limit: 10,
        status: 'active',
      });
      expect(result.success).toBe(true);
    });

    it('should include pagination defaults', () => {
      const additionalFields = z.object({
        category: z.string(),
      });

      const schema = createPaginatedQuerySchema(additionalFields);

      const result = schema.safeParse({ category: 'test' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(DEFAULT_PAGE);
        expect(result.data.limit).toBe(DEFAULT_LIMIT);
      }
    });
  });

  describe('calculateOffset', () => {
    it('should calculate offset for first page', () => {
      expect(calculateOffset(1, 20)).toBe(0);
    });

    it('should calculate offset for second page', () => {
      expect(calculateOffset(2, 20)).toBe(20);
    });

    it('should calculate offset for arbitrary page', () => {
      expect(calculateOffset(5, 10)).toBe(40);
    });
  });

  describe('calculateTotalPages', () => {
    it('should calculate total pages for exact division', () => {
      expect(calculateTotalPages(100, 20)).toBe(5);
    });

    it('should round up for remainder', () => {
      expect(calculateTotalPages(101, 20)).toBe(6);
    });

    it('should return 1 for total less than limit', () => {
      expect(calculateTotalPages(5, 20)).toBe(1);
    });

    it('should return 0 for zero total', () => {
      expect(calculateTotalPages(0, 20)).toBe(0);
    });
  });

  describe('createPaginationMeta', () => {
    it('should create pagination meta for first page', () => {
      const meta = createPaginationMeta(1, 20, 100);

      expect(meta.page).toBe(1);
      expect(meta.limit).toBe(20);
      expect(meta.total).toBe(100);
      expect(meta.totalPages).toBe(5);
      expect(meta.hasNext).toBe(true);
      expect(meta.hasPrev).toBe(false);
      expect(meta.offset).toBe(0);
    });

    it('should create pagination meta for last page', () => {
      const meta = createPaginationMeta(5, 20, 100);

      expect(meta.hasNext).toBe(false);
      expect(meta.hasPrev).toBe(true);
    });

    it('should create pagination meta for middle page', () => {
      const meta = createPaginationMeta(3, 20, 100);

      expect(meta.hasNext).toBe(true);
      expect(meta.hasPrev).toBe(true);
      expect(meta.offset).toBe(40);
    });

    it('should handle single page', () => {
      const meta = createPaginationMeta(1, 20, 10);

      expect(meta.totalPages).toBe(1);
      expect(meta.hasNext).toBe(false);
      expect(meta.hasPrev).toBe(false);
    });
  });
});
