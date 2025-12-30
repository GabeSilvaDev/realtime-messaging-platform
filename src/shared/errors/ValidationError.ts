import { HttpStatus, ErrorCode } from '../types';
import type { ErrorDetails, FieldError } from '../interfaces';
import { AppError } from './AppError';

export class ValidationError extends AppError {
  public readonly fields: FieldError[];

  constructor(message: string, fields: FieldError[] = []) {
    const details: ErrorDetails[] = fields.map((f) => ({
      field: f.field,
      message: f.message,
      code: f.code,
    }));

    super(message, HttpStatus.UNPROCESSABLE_ENTITY, ErrorCode.VALIDATION_ERROR, true, details);

    this.fields = fields;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  public override toJSON(): Record<string, unknown> {
    return {
      error: {
        code: this.code,
        message: this.message,
        statusCode: this.statusCode,
        fields: this.fields,
        timestamp: this.timestamp.toISOString(),
      },
    };
  }

  public static fromFields(fields: FieldError[]): ValidationError {
    const fieldNames = fields.map((f) => f.field).join(', ');
    return new ValidationError(`Validation failed for fields: ${fieldNames}`, fields);
  }

  public static field(field: string, message: string, code?: string): ValidationError {
    return new ValidationError(`Validation failed: ${message}`, [{ field, message, code }]);
  }

  public static required(field: string): ValidationError {
    return ValidationError.field(field, `${field} is required`, 'REQUIRED');
  }

  public static invalid(field: string, reason?: string): ValidationError {
    const message = reason !== undefined ? `${field} is invalid: ${reason}` : `${field} is invalid`;
    return ValidationError.field(field, message, 'INVALID');
  }

  public static minLength(field: string, min: number): ValidationError {
    return ValidationError.field(
      field,
      `${field} must be at least ${String(min)} characters`,
      'MIN_LENGTH'
    );
  }

  public static maxLength(field: string, max: number): ValidationError {
    return ValidationError.field(
      field,
      `${field} must be at most ${String(max)} characters`,
      'MAX_LENGTH'
    );
  }

  public static email(field: string): ValidationError {
    return ValidationError.field(field, `${field} must be a valid email address`, 'INVALID_EMAIL');
  }

  public static uuid(field: string): ValidationError {
    return ValidationError.field(field, `${field} must be a valid UUID`, 'INVALID_UUID');
  }

  public static enum(field: string, allowedValues: string[]): ValidationError {
    return ValidationError.field(
      field,
      `${field} must be one of: ${allowedValues.join(', ')}`,
      'INVALID_ENUM'
    );
  }
}
