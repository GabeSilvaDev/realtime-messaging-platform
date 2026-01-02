import { ValidationError } from '@/shared/errors/ValidationError';
import { HttpStatus, ErrorCode } from '@/shared/types';

describe('ValidationError', () => {
  describe('constructor', () => {
    it('should create a ValidationError with empty fields', () => {
      const error = new ValidationError('Validation failed');

      expect(error.message).toBe('Validation failed');
      expect(error.statusCode).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(error.fields).toEqual([]);
    });

    it('should create a ValidationError with fields', () => {
      const fields = [{ field: 'email', message: 'Invalid email' }];
      const error = new ValidationError('Validation failed', fields);

      expect(error.fields).toEqual(fields);
    });

    it('should have correct prototype chain', () => {
      const error = new ValidationError('Validation failed');

      expect(error).toBeInstanceOf(ValidationError);
      expect(error).toBeInstanceOf(Error);
    });

    it('should convert fields to details', () => {
      const fields = [
        { field: 'email', message: 'Invalid email', code: 'INVALID_EMAIL' },
        { field: 'password', message: 'Too short', code: 'MIN_LENGTH' },
      ];
      const error = new ValidationError('Validation failed', fields);

      expect(error.details).toBeDefined();
      expect(error.details?.length).toBe(2);
      expect(error.details?.[0]).toEqual({
        field: 'email',
        message: 'Invalid email',
        code: 'INVALID_EMAIL',
      });
    });
  });

  describe('toJSON', () => {
    it('should return a JSON representation with fields', () => {
      const fields = [{ field: 'email', message: 'Invalid email' }];
      const error = new ValidationError('Validation failed', fields);
      const json = error.toJSON();

      expect(json.error).toHaveProperty('fields', fields);
      expect(json.error).toHaveProperty('code', ErrorCode.VALIDATION_ERROR);
      expect(json.error).toHaveProperty('message', 'Validation failed');
      expect(json.error).toHaveProperty('statusCode', HttpStatus.UNPROCESSABLE_ENTITY);
      expect(json.error).toHaveProperty('timestamp');
    });
  });

  describe('static factory methods', () => {
    it('should create a ValidationError from fields', () => {
      const fields = [
        { field: 'email', message: 'Invalid email' },
        { field: 'password', message: 'Too short' },
      ];
      const error = ValidationError.fromFields(fields);

      expect(error.message).toBe('Validation failed for fields: email, password');
      expect(error.fields).toEqual(fields);
    });

    it('should create a field validation error', () => {
      const error = ValidationError.field('email', 'Invalid email', 'INVALID_FORMAT');

      expect(error.fields).toHaveLength(1);
      expect(error.fields[0]).toEqual({
        field: 'email',
        message: 'Invalid email',
        code: 'INVALID_FORMAT',
      });
    });

    it('should create a field validation error without code', () => {
      const error = ValidationError.field('email', 'Invalid email');

      expect(error.fields[0]?.code).toBeUndefined();
    });

    it('should create a required field error', () => {
      const error = ValidationError.required('email');

      expect(error.fields[0]?.field).toBe('email');
      expect(error.fields[0]?.code).toBe('REQUIRED');
      expect(error.fields[0]?.message).toBe('email is required');
    });

    it('should create an invalid field error with reason', () => {
      const error = ValidationError.invalid('email', 'must be a valid email');

      expect(error.fields[0]?.field).toBe('email');
      expect(error.fields[0]?.code).toBe('INVALID');
      expect(error.fields[0]?.message).toBe('email is invalid: must be a valid email');
    });

    it('should create an invalid field error without reason', () => {
      const error = ValidationError.invalid('email');

      expect(error.fields[0]?.field).toBe('email');
      expect(error.fields[0]?.code).toBe('INVALID');
      expect(error.fields[0]?.message).toBe('email is invalid');
    });

    it('should create a minLength error', () => {
      const error = ValidationError.minLength('password', 8);

      expect(error.fields[0]?.field).toBe('password');
      expect(error.fields[0]?.code).toBe('MIN_LENGTH');
      expect(error.fields[0]?.message).toBe('password must be at least 8 characters');
    });

    it('should create a maxLength error', () => {
      const error = ValidationError.maxLength('username', 20);

      expect(error.fields[0]?.field).toBe('username');
      expect(error.fields[0]?.code).toBe('MAX_LENGTH');
      expect(error.fields[0]?.message).toBe('username must be at most 20 characters');
    });

    it('should create an email error', () => {
      const error = ValidationError.email('email');

      expect(error.fields[0]?.field).toBe('email');
      expect(error.fields[0]?.code).toBe('INVALID_EMAIL');
      expect(error.fields[0]?.message).toBe('email must be a valid email address');
    });

    it('should create a uuid error', () => {
      const error = ValidationError.uuid('id');

      expect(error.fields[0]?.field).toBe('id');
      expect(error.fields[0]?.code).toBe('INVALID_UUID');
      expect(error.fields[0]?.message).toBe('id must be a valid UUID');
    });

    it('should create an enum error', () => {
      const error = ValidationError.enum('status', ['active', 'inactive', 'pending']);

      expect(error.fields[0]?.field).toBe('status');
      expect(error.fields[0]?.code).toBe('INVALID_ENUM');
      expect(error.fields[0]?.message).toBe('status must be one of: active, inactive, pending');
    });
  });
});
