import type { Request, Response } from 'express';
import type { ZodError } from 'zod';
import { HttpStatus, UnauthorizedError } from '@/shared/errors';

export function getAuthenticatedUserId(req: Request): string {
  const user = req.user as { id: string } | undefined;
  if (user?.id === undefined || user.id === '') {
    throw UnauthorizedError.missingToken();
  }
  return user.id;
}

export function sendValidationError(res: Response, issues: ZodError['issues']): void {
  res.status(HttpStatus.BAD_REQUEST).json({
    success: false,
    message: 'Dados inválidos',
    errors: issues,
  });
}
