import { HttpStatus, ErrorCode } from '../types';
import type { ErrorDetails } from '../interfaces';

export class AppError extends Error {
  public readonly statusCode: HttpStatus;
  public readonly code: ErrorCode;
  public readonly isOperational: boolean;
  public readonly details?: ErrorDetails[];
  public readonly timestamp: Date;

  constructor(
    message: string,
    statusCode: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR,
    code: ErrorCode = ErrorCode.INTERNAL_ERROR,
    isOperational = true,
    details?: ErrorDetails[]
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.details = details;
    this.timestamp = new Date();

    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }

  public toJSON(): Record<string, unknown> {
    return {
      error: {
        code: this.code,
        message: this.message,
        statusCode: this.statusCode,
        details: this.details,
        timestamp: this.timestamp.toISOString(),
      },
    };
  }

  public static isAppError(error: unknown): error is AppError {
    if (error === null || typeof error !== 'object') {
      return false;
    }
    const err = error as Record<string, unknown>;
    return (
      typeof err.statusCode === 'number' &&
      typeof err.code === 'string' &&
      typeof err.message === 'string' &&
      typeof err.isOperational === 'boolean' &&
      err.timestamp instanceof Date
    );
  }

  public static badRequest(message: string, details?: ErrorDetails[]): AppError {
    return new AppError(message, HttpStatus.BAD_REQUEST, ErrorCode.BAD_REQUEST, true, details);
  }

  public static notFound(resource: string): AppError {
    return new AppError(`${resource} not found`, HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND);
  }

  public static conflict(message: string): AppError {
    return new AppError(message, HttpStatus.CONFLICT, ErrorCode.CONFLICT);
  }

  public static internal(message: string): AppError {
    return new AppError(message, HttpStatus.INTERNAL_SERVER_ERROR, ErrorCode.INTERNAL_ERROR, false);
  }

  public static serviceUnavailable(service: string): AppError {
    return new AppError(
      `${service} is currently unavailable`,
      HttpStatus.SERVICE_UNAVAILABLE,
      ErrorCode.SERVICE_UNAVAILABLE
    );
  }
}
