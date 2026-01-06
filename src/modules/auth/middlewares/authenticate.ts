import type { Request, Response, NextFunction } from 'express';
import { authService } from '@/modules/auth/services/AuthService';
import { TokenService } from '@/modules/auth/services/TokenService';
import { AppError, HttpStatus, ErrorCode } from '@/shared/errors';

const tokenService = new TokenService();

declare module 'express-serve-static-core' {
  interface Request {
    user?: {
      id: string;
      email: string;
      username: string;
      tokenId?: string;
    };
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader === undefined || authHeader === '') {
      throw new AppError(
        'Token de autenticação não fornecido',
        HttpStatus.UNAUTHORIZED,
        ErrorCode.UNAUTHORIZED
      );
    }

    const token = tokenService.extractFromHeader(authHeader);
    if (token === null || token === '') {
      throw new AppError(
        'Formato de token inválido',
        HttpStatus.UNAUTHORIZED,
        ErrorCode.INVALID_TOKEN
      );
    }

    const validation = authService.validateAccessToken(token);
    if (!validation.valid || validation.userId === undefined || validation.userId === '') {
      throw new AppError(
        'Token inválido ou expirado',
        HttpStatus.UNAUTHORIZED,
        ErrorCode.INVALID_TOKEN
      );
    }

    const decoded = tokenService.verifyAccessToken(token);

    req.user = {
      id: decoded.userId,
      email: decoded.email,
      username: decoded.username,
    };

    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
      return;
    }

    next(
      new AppError('Token inválido ou expirado', HttpStatus.UNAUTHORIZED, ErrorCode.INVALID_TOKEN)
    );
  }
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader === undefined || authHeader === '') {
      next();
      return;
    }

    const token = tokenService.extractFromHeader(authHeader);
    if (token === null || token === '') {
      next();
      return;
    }

    const validation = authService.validateAccessToken(token);
    if (validation.valid && validation.userId !== undefined && validation.userId !== '') {
      const decoded = tokenService.verifyAccessToken(token);
      req.user = {
        id: decoded.userId,
        email: decoded.email,
        username: decoded.username,
      };
    }

    next();
  } catch {
    next();
  }
}
