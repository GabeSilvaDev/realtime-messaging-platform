import { ValidationException } from '@/modules/auth/exceptions/ValidationException';
import { AppError, HttpStatus, ErrorCode } from '@/shared/errors';

describe('ValidationException', () => {
  describe('constructor', () => {
    it('should create an exception with default message', () => {
      const exception = new ValidationException();

      expect(exception.message).toBe('Dados inválidos');
      expect(exception.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(exception.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('should create an exception with custom message', () => {
      const exception = new ValidationException('Custom validation error');

      expect(exception.message).toBe('Custom validation error');
      expect(exception.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(exception.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('should create an exception with details', () => {
      const details = [
        { field: 'email', message: 'Email inválido' },
        { field: 'password', message: 'Senha muito curta' },
      ];
      const exception = new ValidationException('Dados inválidos', details);

      expect(exception.details).toEqual(details);
    });

    it('should extend AppError', () => {
      const exception = new ValidationException();

      expect(exception).toBeInstanceOf(AppError);
    });

    it('should be operational', () => {
      const exception = new ValidationException();

      expect(exception.isOperational).toBe(true);
    });
  });

  describe('fromZodError', () => {
    it('should create exception from ZodError with issues', () => {
      const zodError = {
        issues: [
          { path: ['email'], message: 'Email inválido' },
          { path: ['password'], message: 'Senha muito curta' },
        ],
      };

      const exception = ValidationException.fromZodError(zodError);

      expect(exception.message).toBe('Dados inválidos');
      expect(exception.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(exception.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(exception.details).toEqual([
        { field: 'email', message: 'Email inválido' },
        { field: 'password', message: 'Senha muito curta' },
      ]);
    });

    it('should handle nested paths', () => {
      const zodError = {
        issues: [{ path: ['address', 'street'], message: 'Rua inválida' }],
      };

      const exception = ValidationException.fromZodError(zodError);

      expect(exception.details).toEqual([{ field: 'address.street', message: 'Rua inválida' }]);
    });

    it('should handle numeric paths', () => {
      const zodError = {
        issues: [{ path: ['items', 0, 'name'], message: 'Nome inválido' }],
      };

      const exception = ValidationException.fromZodError(zodError);

      expect(exception.details).toEqual([{ field: 'items.0.name', message: 'Nome inválido' }]);
    });

    it('should handle empty issues', () => {
      const zodError = { issues: [] };

      const exception = ValidationException.fromZodError(zodError);

      expect(exception.details).toEqual([]);
    });

    it('should handle undefined issues', () => {
      const zodError = {};

      const exception = ValidationException.fromZodError(zodError);

      expect(exception.details).toBeUndefined();
    });
  });
});
