import type { Request, Response } from 'express';
import { z } from 'zod';
import { HttpStatus, UnauthorizedError } from '@/shared/errors';
import { getAuthenticatedUserId, sendValidationError } from '@/modules/user/controllers/helpers';

describe('controllers/helpers', () => {
  describe('getAuthenticatedUserId', () => {
    it('deve retornar o id do usuário autenticado', () => {
      const req = { user: { id: 'user-1' } } as unknown as Request;
      expect(getAuthenticatedUserId(req)).toBe('user-1');
    });

    it('deve lançar UnauthorizedError quando não há usuário', () => {
      const req = {} as Request;
      expect(() => getAuthenticatedUserId(req)).toThrow(UnauthorizedError);
    });

    it('deve lançar UnauthorizedError quando o id é vazio', () => {
      const req = { user: { id: '' } } as unknown as Request;
      expect(() => getAuthenticatedUserId(req)).toThrow(UnauthorizedError);
    });

    it('deve usar status 401', () => {
      const req = {} as Request;
      try {
        getAuthenticatedUserId(req);
      } catch (error) {
        expect((error as UnauthorizedError).statusCode).toBe(HttpStatus.UNAUTHORIZED);
      }
      expect.assertions(1);
    });
  });

  describe('sendValidationError', () => {
    it('deve responder 400 com as issues do Zod', () => {
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      } as unknown as Response;
      const result = z.object({ name: z.string() }).safeParse({});
      if (result.success) {
        throw new Error('esperava falha de validação');
      }

      sendValidationError(res, result.error.issues);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Dados inválidos',
        errors: result.error.issues,
      });
    });
  });
});
