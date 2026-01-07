import { HttpStatus } from '@/shared/errors';
import type { Request, Response } from 'express';
import { UnauthorizedException } from '../exceptions/UnauthorizedException';
import { authService } from '../services/AuthService';
import type { AuthContext } from '../types';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  refreshTokenSchema,
  registerSchema,
  resetPasswordSchema,
} from '../validation/auth.schemas';

export class AuthController {
  async register(req: Request, res: Response): Promise<void> {
    const data = registerSchema.parse(req.body);
    const ctx = this.getAuthContext(req);

    const result = await authService.register(data, ctx);

    res.status(HttpStatus.CREATED).json({
      success: true,
      data: result,
    });
  }

  async login(req: Request, res: Response): Promise<void> {
    const data = loginSchema.parse(req.body);
    const ctx = this.getAuthContext(req);

    const result = await authService.login(data, ctx);

    res.status(HttpStatus.OK).json({
      success: true,
      data: result,
    });
  }

  async logout(req: Request, res: Response): Promise<void> {
    const { refreshToken } = refreshTokenSchema.parse(req.body);

    await authService.logout(refreshToken);

    res.status(HttpStatus.OK).json({
      success: true,
      message: 'Logout realizado com sucesso',
    });
  }

  async refresh(req: Request, res: Response): Promise<void> {
    const { refreshToken } = refreshTokenSchema.parse(req.body);
    const ctx = this.getAuthContext(req);

    const result = await authService.refresh(refreshToken, ctx);

    res.status(HttpStatus.OK).json({
      success: true,
      data: result,
    });
  }

  async forgotPassword(req: Request, res: Response): Promise<void> {
    const data = forgotPasswordSchema.parse(req.body);

    await authService.forgotPassword(data.email);

    res.status(HttpStatus.OK).json({
      success: true,
      message: 'Se o email existir, você receberá um link de recuperação',
    });
  }

  async resetPassword(req: Request, res: Response): Promise<void> {
    const data = resetPasswordSchema.parse(req.body);

    await authService.resetPassword(data);

    res.status(HttpStatus.OK).json({
      success: true,
      message: 'Senha alterada com sucesso',
    });
  }

  async changePassword(req: Request, res: Response): Promise<void> {
    const data = changePasswordSchema.parse(req.body);
    const userId = this.requireUserId(req);

    await authService.changePassword(userId, data);

    res.status(HttpStatus.OK).json({
      success: true,
      message: 'Senha alterada com sucesso',
    });
  }

  async getSessions(req: Request, res: Response): Promise<void> {
    const userId = this.requireUserId(req);

    const sessions = await authService.getActiveSessions(userId);

    res.status(HttpStatus.OK).json({
      success: true,
      data: { sessions },
    });
  }

  async revokeSessions(req: Request, res: Response): Promise<void> {
    const userId = this.requireUserId(req);
    const currentTokenId = req.user?.tokenId;

    const keepCurrent = req.query.keepCurrent === 'true';
    const revokedCount = await authService.revokeAllSessions(
      userId,
      keepCurrent ? currentTokenId : undefined
    );

    res.status(HttpStatus.OK).json({
      success: true,
      message: `${String(revokedCount)} sessão(ões) revogada(s)`,
      data: { revokedCount },
    });
  }

  me(req: Request, res: Response): void {
    const user = req.user;

    if (user === undefined) {
      throw new UnauthorizedException();
    }

    res.status(HttpStatus.OK).json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        username: user.username,
      },
    });
  }

  private requireUserId(req: Request): string {
    const userId = req.user?.id;

    if (userId === undefined || userId === '') {
      throw new UnauthorizedException();
    }

    return userId;
  }

  private getAuthContext(req: Request): AuthContext {
    const forwarded = req.headers['x-forwarded-for'];
    let ip: string | null = null;

    if (typeof forwarded === 'string') {
      const firstIp = forwarded.split(',')[0];
      // istanbul ignore next -- defensive fallback, split always returns a string
      ip = firstIp?.trim() ?? null;
    } else if (req.ip !== undefined && req.ip !== '') {
      ip = req.ip;
    }

    const userAgent = req.headers['user-agent'];

    return {
      ipAddress: ip,
      userAgent: typeof userAgent === 'string' ? userAgent : null,
    };
  }
}

export const authController = new AuthController();
