import { AppError } from '@/shared/errors/AppError';
import { HttpStatus, ErrorCode } from '@/shared/types';

describe('AppError', () => {
  describe('constructor', () => {
    it('should create an AppError with default values', () => {
      const error = new AppError('Test error');

      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(error.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(error.isOperational).toBe(true);
      expect(error.timestamp).toBeInstanceOf(Date);
    });

    it('should create an AppError with custom values', () => {
      const error = new AppError(
        'Custom error',
        HttpStatus.BAD_REQUEST,
        ErrorCode.BAD_REQUEST,
        false
      );

      expect(error.message).toBe('Custom error');
      expect(error.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(error.code).toBe(ErrorCode.BAD_REQUEST);
      expect(error.isOperational).toBe(false);
    });
  });

  describe('toJSON', () => {
    it('should return a JSON representation of the error', () => {
      const error = new AppError('Test error', HttpStatus.BAD_REQUEST, ErrorCode.BAD_REQUEST);
      const json = error.toJSON();

      expect(json).toHaveProperty('error');
      expect(json.error).toHaveProperty('code', ErrorCode.BAD_REQUEST);
      expect(json.error).toHaveProperty('message', 'Test error');
      expect(json.error).toHaveProperty('statusCode', HttpStatus.BAD_REQUEST);
    });
  });

  describe('isAppError', () => {
    it('should return true for AppError instances', () => {
      const error = new AppError('Test error');
      expect(AppError.isAppError(error)).toBe(true);
    });

    it('should return false for regular Error instances', () => {
      const error = new Error('Test error');
      expect(AppError.isAppError(error)).toBe(false);
    });
  });

  describe('static factory methods', () => {
    it('should create a badRequest error', () => {
      const error = AppError.badRequest('Bad request');

      expect(error.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(error.code).toBe(ErrorCode.BAD_REQUEST);
    });

    it('should create a notFound error', () => {
      const error = AppError.notFound('User');

      expect(error.message).toBe('User not found');
      expect(error.statusCode).toBe(HttpStatus.NOT_FOUND);
      expect(error.code).toBe(ErrorCode.NOT_FOUND);
    });

    it('should create a conflict error', () => {
      const error = AppError.conflict('Resource already exists');

      expect(error.statusCode).toBe(HttpStatus.CONFLICT);
      expect(error.code).toBe(ErrorCode.CONFLICT);
    });

    it('should create an internal error', () => {
      const error = AppError.internal('Internal error');

      expect(error.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(error.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(error.isOperational).toBe(false);
    });

    it('should create a serviceUnavailable error', () => {
      const error = AppError.serviceUnavailable('Database');

      expect(error.message).toBe('Database is currently unavailable');
      expect(error.statusCode).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(error.code).toBe(ErrorCode.SERVICE_UNAVAILABLE);
    });
  });
});
