import { AppError, ErrorCode, HttpStatus } from '@/shared/errors';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ValidationException } from '../exceptions/ValidationException';

type AsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<void> | void;

export function asyncHandler(fn: AsyncRequestHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch((error: unknown) => {
      next(transformError(error));
    });
  };
}

function isAppErrorLike(error: unknown): error is AppError {
  if (error === null || typeof error !== 'object') {
    return false;
  }
  const err = error as Record<string, unknown>;
  return (
    typeof err.statusCode === 'number' &&
    typeof err.code === 'string' &&
    typeof err.message === 'string' &&
    typeof err.isOperational === 'boolean'
  );
}

function transformError(error: unknown): AppError {
  if (isAppErrorLike(error)) {
    return error;
  }

  if (error instanceof Error && error.name === 'ZodError') {
    const zodError = error as unknown as {
      issues?: { path: (string | number)[]; message: string }[];
    };
    if (Array.isArray(zodError.issues)) {
      return ValidationException.fromZodError({ issues: zodError.issues });
    }
    return new ValidationException();
  }

  if (error instanceof Error) {
    return new AppError(
      'Erro interno do servidor',
      HttpStatus.INTERNAL_SERVER_ERROR,
      ErrorCode.INTERNAL_ERROR
    );
  }

  return new AppError(
    'Erro interno do servidor',
    HttpStatus.INTERNAL_SERVER_ERROR,
    ErrorCode.INTERNAL_ERROR
  );
}
