import type { z } from 'zod';

/**
 * Zod schema generic type
 */
export type ZodSchema<T = unknown> = z.ZodType<T>;

/**
 * Zod error type
 */
export type ZodError = z.core.$ZodError;

/**
 * Zod issue type
 */
export type ZodIssue = z.core.$ZodIssue;

export type ValidationTarget = 'body' | 'query' | 'params' | 'headers';

export interface ValidationSchemas {
  body?: z.ZodType;
  query?: z.ZodType;
  params?: z.ZodType;
  headers?: z.ZodType;
}

export interface ValidationOptions {
  abortEarly?: boolean;
  stripUnknown?: boolean;
  context?: Record<string, unknown>;
}

export interface ValidationErrorDetail {
  field: string;
  message: string;
  code: string;
  path: (string | number)[];
  received?: unknown;
  expected?: string;
}

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: ValidationErrorDetail[];
}

export interface FormattedValidationError {
  field: string;
  message: string;
  code: string;
}

export type ZodValidationError = z.core.$ZodError;
export type ZodValidationIssue = z.core.$ZodIssue;

/**
 * Zod issue types for specific error handling
 */
export type ZodIssueInvalidType = z.core.$ZodIssueInvalidType;
export type ZodIssueTooSmall = z.core.$ZodIssueTooSmall;
export type ZodIssueTooBig = z.core.$ZodIssueTooBig;
export type ZodIssueInvalidStringFormat = z.core.$ZodIssueInvalidStringFormat;
export type ZodIssueInvalidValue = z.core.$ZodIssueInvalidValue;

export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface SortParams {
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

export interface SearchParams {
  search?: string;
  searchFields?: string[];
}

export interface DateRangeParams {
  startDate?: Date;
  endDate?: Date;
}
