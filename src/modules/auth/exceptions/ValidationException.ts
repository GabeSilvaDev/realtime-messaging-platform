import { AppError, HttpStatus, ErrorCode } from '@/shared/errors';
import type { ErrorDetails } from '@/shared/interfaces';

export class ValidationException extends AppError {
  constructor(message = 'Dados inválidos', details?: ErrorDetails[]) {
    super(message, HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_ERROR, true, details);
  }

  static fromZodError(error: {
    issues?: { path: (string | number)[]; message: string }[];
  }): ValidationException {
    const details = error.issues?.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));

    return new ValidationException('Dados inválidos', details);
  }
}
