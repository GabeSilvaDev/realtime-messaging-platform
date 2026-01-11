import type {
  RegisterDTO,
  LoginDTO,
  AuthResponseDTO,
  RefreshResponseDTO,
  ResetPasswordDTO,
  ChangePasswordDTO,
  AuthContext,
} from '../types';
import { TokenService } from './TokenService';
import { PasswordService } from './PasswordService';
import { refreshTokenRepository } from '../repositories/RefreshTokenRepository';
import { userRepository } from '../repositories/UserRepository';
import type { IUserRepository, IAuthService } from '../interfaces';
import { AuthEvents } from '../events/AuthEvents';
import { redis } from '@/shared/database';
import { PASSWORD_RESET_PREFIX, PASSWORD_RESET_TTL } from '../constants/auth.constants';
import {
  EmailAlreadyExistsException,
  UsernameAlreadyExistsException,
  InvalidCredentialsException,
  InvalidTokenException,
  UserNotFoundException,
  InvalidPasswordException,
  SamePasswordException,
} from '../exceptions';

export class AuthService implements IAuthService {
  constructor(
    private readonly tokens: TokenService = new TokenService(),
    private readonly passwords: PasswordService = new PasswordService(),
    private readonly users: IUserRepository = userRepository,
    private readonly refreshTokens = refreshTokenRepository,
    private readonly events = new AuthEvents()
  ) {}

  async register(data: RegisterDTO, ctx?: AuthContext): Promise<AuthResponseDTO> {
    const [emailExists, usernameExists] = await Promise.all([
      this.users.findByEmail(data.email),
      this.users.findByUsername(data.username),
    ]);

    if (emailExists) {
      throw new EmailAlreadyExistsException();
    }
    if (usernameExists) {
      throw new UsernameAlreadyExistsException();
    }

    const hashedPassword = await this.passwords.hash(data.password);
    const user = await this.users.create({
      ...data,
      password: hashedPassword,
    });

    const tokens = await this.createTokens(user.id, user.email, user.username, ctx);

    this.events.emitRegister(user.id, user.email);

    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
      },
      tokens,
    };
  }

  async login(data: LoginDTO, ctx?: AuthContext): Promise<AuthResponseDTO> {
    const user = await this.users.findByEmail(data.email);
    if (!user) {
      this.events.emitLoginFailed(data.email, 'User not found');
      throw new InvalidCredentialsException();
    }

    const isValid = await this.passwords.compare(data.password, user.password);
    if (!isValid) {
      this.events.emitLoginFailed(data.email, 'Invalid password');
      throw new InvalidCredentialsException();
    }

    const tokens = await this.createTokens(user.id, user.email, user.username, ctx);

    this.events.emitLogin(user.id, user.email);

    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
      },
      tokens,
    };
  }

  async logout(refreshToken: string): Promise<void> {
    const token = await this.refreshTokens.findByToken(refreshToken);
    if (token) {
      await this.refreshTokens.revoke(token);
      this.events.emitLogout(token.userId);
    }
  }

  async refresh(refreshToken: string, ctx?: AuthContext): Promise<RefreshResponseDTO> {
    const decoded = this.tokens.verifyRefreshToken(refreshToken);

    const storedToken = await this.refreshTokens.findByToken(refreshToken);
    if (storedToken?.isValid() !== true) {
      throw new InvalidTokenException();
    }

    const user = await this.users.findById(decoded.userId);
    if (!user) {
      await this.refreshTokens.revoke(storedToken);
      throw new UserNotFoundException();
    }

    await this.refreshTokens.revoke(storedToken);
    const tokens = await this.createTokens(user.id, user.email, user.username, ctx);

    return { tokens };
  }

  async forgotPassword(email: string): Promise<{ token: string }> {
    const user = await this.users.findByEmail(email);

    if (!user) {
      return { token: '' };
    }

    const { token, hash } = this.passwords.generateResetToken();

    await redis.set(`${PASSWORD_RESET_PREFIX}${hash}`, user.id, 'EX', PASSWORD_RESET_TTL);

    this.events.emitPasswordResetRequest(user.id, user.email);

    return { token };
  }

  async resetPassword(data: ResetPasswordDTO): Promise<void> {
    const hash = this.passwords.hashToken(data.token);
    const key = `${PASSWORD_RESET_PREFIX}${hash}`;

    const userId = await redis.get(key);
    if (userId === null) {
      throw new InvalidTokenException();
    }

    const hashedPassword = await this.passwords.hash(data.newPassword);

    await this.users.updatePassword(userId, hashedPassword);

    await redis.del(key);

    await this.refreshTokens.revokeAllForUser(userId);

    this.events.emitPasswordReset(userId);
  }

  async changePassword(userId: string, data: ChangePasswordDTO): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UserNotFoundException();
    }

    const isValid = await this.passwords.compare(data.currentPassword, user.password);
    if (!isValid) {
      throw new InvalidPasswordException();
    }

    const isSame = await this.passwords.compare(data.newPassword, user.password);
    if (isSame) {
      throw new SamePasswordException();
    }

    const hashedPassword = await this.passwords.hash(data.newPassword);
    await this.users.updatePassword(userId, hashedPassword);

    this.events.emitPasswordChange(userId);
  }

  async revokeAllSessions(userId: string, exceptTokenId?: string): Promise<number> {
    if (exceptTokenId !== undefined) {
      return this.refreshTokens.revokeAllExcept(userId, exceptTokenId);
    }
    return this.refreshTokens.revokeAllForUser(userId);
  }

  async getActiveSessions(
    userId: string
  ): Promise<
    { id: string; userAgent: string | null; ipAddress: string | null; createdAt: Date }[]
  > {
    const tokens = await this.refreshTokens.findActiveByUserId(userId);
    return tokens
      .filter((t) => t.isValid())
      .map((t) => ({
        id: t.id,
        userAgent: t.userAgent,
        ipAddress: t.ipAddress,
        createdAt: t.createdAt,
      }));
  }

  validateAccessToken(token: string): { valid: boolean; userId?: string } {
    try {
      const decoded = this.tokens.verifyAccessToken(token);
      return { valid: true, userId: decoded.userId };
    } catch {
      return { valid: false };
    }
  }

  private async createTokens(
    userId: string,
    email: string,
    username: string,
    ctx?: AuthContext
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const tokens = this.tokens.generateTokenPair({ userId, email, username });

    await this.refreshTokens.create({
      userId,
      token: tokens.refreshToken,
      expiresAt: this.tokens.getRefreshExpiration(),
      userAgent: ctx?.userAgent,
      ipAddress: ctx?.ipAddress,
    });

    return tokens;
  }
}

export const authService = new AuthService();
