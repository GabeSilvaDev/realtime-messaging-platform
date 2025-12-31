import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { AppError, HttpStatus, ErrorCode } from '../../errors';
import { getLogger, LogCategory } from '../../logger';
import type {
  ValidationSchemas,
  ValidationTarget,
  ValidationErrorDetail,
  ZodSchema,
  ZodError,
  ZodIssue,
  ZodIssueInvalidType,
  ZodIssueTooSmall,
  ZodIssueTooBig,
} from '../../types/validation.types';

function formatZodErrors(error: ZodError): ValidationErrorDetail[] {
  return error.issues.map((issue: ZodIssue) => {
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
      }
    } else if (issue.code === 'too_big') {
      const bigIssue = issue as ZodIssueTooBig;
      if (bigIssue.origin === 'string') {
        message = `Deve ter no máximo ${String(bigIssue.maximum)} caractere(s)`;
      } else if (bigIssue.origin === 'number') {
        message = `Deve ser menor ou igual a ${String(bigIssue.maximum)}`;
      }
    }

    const path = issue.path;

    return {
      field: path.length > 0 ? path.map((p) => p.toString()).join('.') : 'value',
      message,
      code: issue.code,
      path: path.map((p) => (typeof p === 'symbol' ? p.toString() : p)),
      received: issue.input,
      expected: 'expected' in issue ? (issue.expected as string) : undefined,
    };
  });
}

function validateTarget(
  schema: ZodSchema,
  data: unknown,
  target: ValidationTarget
): { success: true; data: unknown } | { success: false; errors: ValidationErrorDetail[] } {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors = formatZodErrors(result.error).map((err) => ({
    ...err,
    field: `${target}.${err.field}`,
  }));

  return { success: false, errors };
}

export function validateRequest(schemas: ValidationSchemas): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const logger = getLogger().child('ValidationMiddleware');
    logger.setCategory(LogCategory.HTTP);

    const allErrors: ValidationErrorDetail[] = [];
    const requestId = String(req.headers['x-request-id'] ?? 'unknown');

    if (schemas.body) {
      const result = validateTarget(schemas.body, req.body, 'body');
      if (result.success) {
        req.body = result.data;
      } else {
        allErrors.push(...result.errors);
      }
    }

    if (schemas.query) {
      const result = validateTarget(schemas.query, req.query, 'query');
      if (result.success) {
        req.query = result.data as typeof req.query;
      } else {
        allErrors.push(...result.errors);
      }
    }

    if (schemas.params) {
      const result = validateTarget(schemas.params, req.params, 'params');
      if (result.success) {
        req.params = result.data as typeof req.params;
      } else {
        allErrors.push(...result.errors);
      }
    }

    if (schemas.headers) {
      const headersToValidate = Object.fromEntries(
        Object.entries(req.headers).map(([key, value]) => [key.toLowerCase(), value])
      );
      const result = validateTarget(schemas.headers, headersToValidate, 'headers');
      if (!result.success) {
        allErrors.push(...result.errors);
      }
    }

    if (allErrors.length > 0) {
      logger.warn(`[${requestId}] Validation failed: ${String(allErrors.length)} error(s)`, {
        errors: allErrors,
        path: req.path,
        method: req.method,
      });

      const error = new AppError(
        'Validation failed',
        HttpStatus.UNPROCESSABLE_ENTITY,
        ErrorCode.VALIDATION_ERROR,
        true,
        allErrors.map((e) => ({
          field: e.field,
          message: e.message,
        }))
      );

      next(error);
      return;
    }

    next();
  };
}

export function validateBody<T>(schema: ZodSchema<T>): RequestHandler {
  return validateRequest({ body: schema });
}

export function validateQuery<T>(schema: ZodSchema<T>): RequestHandler {
  return validateRequest({ query: schema });
}

export function validateParams<T>(schema: ZodSchema<T>): RequestHandler {
  return validateRequest({ params: schema });
}

export function validateHeaders<T>(schema: ZodSchema<T>): RequestHandler {
  return validateRequest({ headers: schema });
}

export function validate(schemas: ValidationSchemas): RequestHandler {
  return validateRequest(schemas);
}

export function validateWebSocketMessage<T>(
  schema: ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: ValidationErrorDetail[] } {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    errors: formatZodErrors(result.error),
  };
}

export function createValidationMiddleware<TBody, TQuery, TParams>(options: {
  body?: ZodSchema<TBody>;
  query?: ZodSchema<TQuery>;
  params?: ZodSchema<TParams>;
}): RequestHandler {
  return validateRequest(options);
}
