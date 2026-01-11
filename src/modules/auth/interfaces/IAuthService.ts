import type {
  RegisterDTO,
  LoginDTO,
  AuthResponseDTO,
  RefreshResponseDTO,
  ResetPasswordDTO,
  ChangePasswordDTO,
  AuthContext,
} from '../types';

export interface IAuthService {
  register(data: RegisterDTO, ctx?: AuthContext): Promise<AuthResponseDTO>;
  login(data: LoginDTO, ctx?: AuthContext): Promise<AuthResponseDTO>;
  logout(refreshToken: string): Promise<void>;
  refresh(refreshToken: string, ctx?: AuthContext): Promise<RefreshResponseDTO>;
  forgotPassword(email: string): Promise<{ token: string }>;
  resetPassword(data: ResetPasswordDTO): Promise<void>;
  changePassword(userId: string, data: ChangePasswordDTO): Promise<void>;
  revokeAllSessions(userId: string, exceptTokenId?: string): Promise<number>;
  getActiveSessions(
    userId: string
  ): Promise<{ id: string; userAgent: string | null; ipAddress: string | null; createdAt: Date }[]>;
  validateAccessToken(token: string): { valid: boolean; userId?: string };
}
