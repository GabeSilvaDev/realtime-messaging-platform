import { z } from 'zod';

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;
export const MIN_LIMIT = 1;

export const pageSchema = z.coerce
  .number()
  .int({ message: 'Página deve ser um número inteiro' })
  .positive({ message: 'Página deve ser maior que zero' })
  .default(DEFAULT_PAGE);

export const limitSchema = z.coerce
  .number()
  .int({ message: 'Limite deve ser um número inteiro' })
  .min(MIN_LIMIT, { message: `Limite mínimo é ${String(MIN_LIMIT)}` })
  .max(MAX_LIMIT, { message: `Limite máximo é ${String(MAX_LIMIT)}` })
  .default(DEFAULT_LIMIT);

export const offsetSchema = z.coerce
  .number()
  .int({ message: 'Offset deve ser um número inteiro' })
  .nonnegative({ message: 'Offset deve ser maior ou igual a zero' })
  .default(0);

export const sortOrderSchema = z.enum(['asc', 'desc']).default('desc');

export const paginationQuerySchema = z.object({
  page: pageSchema,
  limit: limitSchema,
});

export const paginationWithOffsetSchema = z.object({
  limit: limitSchema,
  offset: offsetSchema,
});

export const sortableQuerySchema = z.object({
  sortBy: z.string().optional(),
  sortOrder: sortOrderSchema,
});

export const searchableQuerySchema = z.object({
  search: z.string().max(200, { message: 'Busca deve ter no máximo 200 caracteres' }).optional(),
  searchFields: z
    .string()
    .transform((val) => val.split(',').map((s) => s.trim()))
    .optional(),
});

export const dateRangeQuerySchema = z
  .object({
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
  })
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return data.startDate <= data.endDate;
      }
      return true;
    },
    { message: 'Data inicial deve ser anterior à data final' }
  );

export const cursorPaginationSchema = z.object({
  cursor: z.string().optional(),
  limit: limitSchema,
  direction: z.enum(['forward', 'backward']).default('forward'),
});

export const fullPaginationQuerySchema = paginationQuerySchema
  .extend(sortableQuerySchema.shape)
  .extend(searchableQuerySchema.shape);

export const fullPaginationWithDateSchema = fullPaginationQuerySchema.extend(
  dateRangeQuerySchema.shape
);

export function createSortableSchema<T extends readonly [string, ...string[]]>(
  allowedFields: T
): z.ZodObject<{
  sortBy: z.ZodOptional<z.ZodEnum<{ [K in T[number]]: K }>>;
  sortOrder: typeof sortOrderSchema;
}> {
  return z.object({
    sortBy: z.enum(allowedFields).optional(),
    sortOrder: sortOrderSchema,
  }) as z.ZodObject<{
    sortBy: z.ZodOptional<z.ZodEnum<{ [K in T[number]]: K }>>;
    sortOrder: typeof sortOrderSchema;
  }>;
}

export function createPaginatedQuerySchema<T extends z.core.$ZodShape>(
  additionalFields: z.ZodObject<T>
): z.ZodObject<typeof paginationQuerySchema.shape & T> {
  return paginationQuerySchema.extend(additionalFields.shape) as z.ZodObject<
    typeof paginationQuerySchema.shape & T
  >;
}

export function calculateOffset(page: number, limit: number): number {
  return (page - 1) * limit;
}

export function calculateTotalPages(total: number, limit: number): number {
  return Math.ceil(total / limit);
}

export function createPaginationMeta(
  page: number,
  limit: number,
  total: number
): {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  offset: number;
} {
  const totalPages = calculateTotalPages(total, limit);
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
    offset: calculateOffset(page, limit),
  };
}

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
export type PaginationWithOffset = z.infer<typeof paginationWithOffsetSchema>;
export type SortableQuery = z.infer<typeof sortableQuerySchema>;
export type SearchableQuery = z.infer<typeof searchableQuerySchema>;
export type DateRangeQuery = z.infer<typeof dateRangeQuerySchema>;
export type CursorPagination = z.infer<typeof cursorPaginationSchema>;
export type FullPaginationQuery = z.infer<typeof fullPaginationQuerySchema>;
