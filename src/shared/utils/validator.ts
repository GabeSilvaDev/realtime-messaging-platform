import { z } from 'zod';
import type {
  ValidationResult,
  ValidationErrorDetail,
  ValidationOptions,
  FormattedValidationError,
  ZodSchema,
  ZodError,
  ZodIssue,
  ZodIssueInvalidType,
  ZodIssueTooSmall,
  ZodIssueTooBig,
  ZodIssueInvalidStringFormat,
  ZodIssueInvalidValue,
} from '../types/validation.types';
import {
  VALIDATION_ERROR_MESSAGES,
  DEFAULT_VALIDATION_ERROR_MESSAGE,
  DEFAULT_FIELD_NAME,
} from '../constants/validation.constants';

function getFieldPath(issue: ZodIssue): string {
  const path = issue.path;
  if (path.length === 0) {
    return DEFAULT_FIELD_NAME;
  }
  return path.map((p) => String(p)).join('.');
}

function translateErrorCode(code: string): string {
  return VALIDATION_ERROR_MESSAGES[code] ?? DEFAULT_VALIDATION_ERROR_MESSAGE;
}

function formatZodIssue(issue: ZodIssue): ValidationErrorDetail {
  let message = issue.message;

  if (issue.code === 'invalid_type') {
    const typeIssue = issue as ZodIssueInvalidType;
    message = `Esperado ${typeIssue.expected}, recebido ${typeof typeIssue.input}`;
  } else if (issue.code === 'too_small') {
    const smallIssue = issue as ZodIssueTooSmall;
    if (smallIssue.origin === 'string') {
      message = `Deve ter pelo menos ${String(smallIssue.minimum)} caractere(s)`;
    } else if (smallIssue.origin === 'number') {
      message = `Deve ser maior ou igual a ${String(smallIssue.minimum)}`;
    } else if (smallIssue.origin === 'array') {
      message = `Deve ter pelo menos ${String(smallIssue.minimum)} item(s)`;
    }
  } else if (issue.code === 'too_big') {
    const bigIssue = issue as ZodIssueTooBig;
    if (bigIssue.origin === 'string') {
      message = `Deve ter no máximo ${String(bigIssue.maximum)} caractere(s)`;
    } else if (bigIssue.origin === 'number') {
      message = `Deve ser menor ou igual a ${String(bigIssue.maximum)}`;
    } else if (bigIssue.origin === 'array') {
      message = `Deve ter no máximo ${String(bigIssue.maximum)} item(s)`;
    }
  } else if (issue.code === 'invalid_format') {
    const formatIssue: ZodIssueInvalidStringFormat = issue;
    if (formatIssue.format === 'email') {
      message = 'Email inválido';
    } else if (formatIssue.format === 'url') {
      message = 'URL inválida';
    } else if (formatIssue.format === 'uuid') {
      message = 'UUID inválido';
    } else if (formatIssue.format === 'regex') {
      message = 'Formato inválido';
    }
  } else if (issue.code === 'invalid_value') {
    const valueIssue = issue as ZodIssueInvalidValue;
    message = `Deve ser um dos valores: ${valueIssue.values.join(', ')}`;
  }

  return {
    field: getFieldPath(issue),
    message,
    code: issue.code,
    path: issue.path.map((p) => String(p)),
    received: issue.input,
    expected: 'expected' in issue ? (issue.expected as string) : undefined,
  };
}

function formatZodError(error: ZodError): ValidationErrorDetail[] {
  return error.issues.map(formatZodIssue);
}

export function validate<T>(
  schema: ZodSchema<T>,
  data: unknown,
  _options: ValidationOptions = {}
): ValidationResult<T> {
  const result = schema.safeParse(data);

  if (result.success) {
    return {
      success: true,
      data: result.data,
    };
  }

  const zodError = result.error as ZodError;
  return {
    success: false,
    errors: formatZodError(zodError),
  };
}

export async function validateAsync<T>(
  schema: ZodSchema<T>,
  data: unknown,
  _options: ValidationOptions = {}
): Promise<ValidationResult<T>> {
  const result = await schema.safeParseAsync(data);

  if (result.success) {
    return {
      success: true,
      data: result.data,
    };
  }

  const zodError = result.error as ZodError;
  return {
    success: false,
    errors: formatZodError(zodError),
  };
}

export function validateOrThrow<T>(
  schema: ZodSchema<T>,
  data: unknown,
  options: ValidationOptions = {}
): T {
  const result = validate(schema, data, options);

  if (!result.success) {
    const error = new Error('Validation failed');
    (error as Error & { validationErrors: ValidationErrorDetail[] }).validationErrors =
      result.errors!;
    throw error;
  }

  return result.data as T;
}

export async function validateOrThrowAsync<T>(
  schema: ZodSchema<T>,
  data: unknown,
  options: ValidationOptions = {}
): Promise<T> {
  const result = await validateAsync(schema, data, options);

  if (!result.success) {
    const error = new Error('Validation failed');
    (error as Error & { validationErrors: ValidationErrorDetail[] }).validationErrors =
      result.errors!;
    throw error;
  }

  return result.data as T;
}

export function isValid<T>(schema: ZodSchema<T>, data: unknown): boolean {
  const result = schema.safeParse(data);
  return result.success;
}

export function getValidationErrors(error: ZodError): FormattedValidationError[] {
  return error.issues.map((issue) => ({
    field: getFieldPath(issue),
    message: issue.message,
    code: translateErrorCode(issue.code),
  }));
}

export function createValidator<T>(schema: ZodSchema<T>): {
  validate: (data: unknown, options?: ValidationOptions) => ValidationResult<T>;
  validateAsync: (data: unknown, options?: ValidationOptions) => Promise<ValidationResult<T>>;
  validateOrThrow: (data: unknown, options?: ValidationOptions) => T;
  validateOrThrowAsync: (data: unknown, options?: ValidationOptions) => Promise<T>;
  isValid: (data: unknown) => boolean;
  schema: ZodSchema<T>;
} {
  return {
    validate: (data: unknown, options?: ValidationOptions) => validate(schema, data, options),
    validateAsync: (data: unknown, options?: ValidationOptions) =>
      validateAsync(schema, data, options),
    validateOrThrow: (data: unknown, options?: ValidationOptions) =>
      validateOrThrow(schema, data, options),
    validateOrThrowAsync: (data: unknown, options?: ValidationOptions) =>
      validateOrThrowAsync(schema, data, options),
    isValid: (data: unknown) => isValid(schema, data),
    schema,
  };
}

export function mergeSchemas<T extends z.core.$ZodShape, U extends z.core.$ZodShape>(
  schema1: z.ZodObject<T>,
  schema2: z.ZodObject<U>
): z.ZodObject<T & U> {
  return schema1.extend(schema2.shape) as z.ZodObject<T & U>;
}

export function extendSchema<T extends z.core.$ZodShape, U extends z.core.$ZodShape>(
  baseSchema: z.ZodObject<T>,
  extension: U
): z.ZodObject<T & U> {
  return baseSchema.extend(extension) as z.ZodObject<T & U>;
}

export function partialSchema<T extends z.core.$ZodShape>(
  schema: z.ZodObject<T>
): z.ZodObject<{ [K in keyof T]: z.ZodOptional<T[K]> }> {
  return schema.partial() as z.ZodObject<{ [K in keyof T]: z.ZodOptional<T[K]> }>;
}

export function pickSchema<T extends z.core.$ZodShape, K extends keyof T>(
  schema: z.ZodObject<T>,
  keys: K[]
): z.ZodObject<Pick<T, K>> {
  const mask: Partial<Record<K, true>> = {};
  for (const key of keys) {
    mask[key] = true;
  }
  return schema.pick(mask as Partial<Record<keyof T, true>>) as z.ZodObject<Pick<T, K>>;
}

export function omitSchema<T extends z.core.$ZodShape, K extends keyof T>(
  schema: z.ZodObject<T>,
  keys: K[]
): z.ZodObject<Omit<T, K>> {
  const mask: Partial<Record<K, true>> = {};
  for (const key of keys) {
    mask[key] = true;
  }
  return schema.omit(mask as Partial<Record<keyof T, true>>) as z.ZodObject<Omit<T, K>>;
}

export { z };
export type { ZodSchema, ZodError, ZodIssue };
