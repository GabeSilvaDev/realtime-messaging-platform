import jwt, { JwtPayload, SignOptions } from 'jsonwebtoken';
import type { TokenPayload, DecodedToken, TokenPair } from '../types';
import { TokenType } from '../types';

export class TokenService {
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  private readonly accessExpiresIn: number;
  private readonly refreshExpiresIn: number;

  constructor() {
    this.accessSecret = process.env.JWT_ACCESS_SECRET ?? 'access-secret-dev';
    this.refreshSecret = process.env.JWT_REFRESH_SECRET ?? 'refresh-secret-dev';
    this.accessExpiresIn = this.parseExpiration(process.env.JWT_ACCESS_EXPIRES ?? '15m');
    this.refreshExpiresIn = this.parseExpiration(process.env.JWT_REFRESH_EXPIRES ?? '7d');
  }

  generateAccessToken(payload: Omit<TokenPayload, 'type'>): string {
    const options: SignOptions = { expiresIn: this.accessExpiresIn };
    return jwt.sign({ ...payload, type: TokenType.ACCESS }, this.accessSecret, options);
  }

  generateRefreshToken(payload: Omit<TokenPayload, 'type'>): string {
    const options: SignOptions = { expiresIn: this.refreshExpiresIn };
    return jwt.sign({ ...payload, type: TokenType.REFRESH }, this.refreshSecret, options);
  }

  generateTokenPair(payload: Omit<TokenPayload, 'type'>): TokenPair {
    return {
      accessToken: this.generateAccessToken(payload),
      refreshToken: this.generateRefreshToken(payload),
      expiresIn: this.accessExpiresIn,
    };
  }

  verifyAccessToken(token: string): DecodedToken {
    const decoded = jwt.verify(token, this.accessSecret) as JwtPayload & TokenPayload;
    if (decoded.type !== TokenType.ACCESS) {
      throw new Error('Invalid token type');
    }
    return decoded as DecodedToken;
  }

  verifyRefreshToken(token: string): DecodedToken {
    const decoded = jwt.verify(token, this.refreshSecret) as JwtPayload & TokenPayload;
    if (decoded.type !== TokenType.REFRESH) {
      throw new Error('Invalid token type');
    }
    return decoded as DecodedToken;
  }

  decodeToken(token: string): DecodedToken | null {
    try {
      return jwt.decode(token) as DecodedToken;
    } catch {
      return null;
    }
  }

  extractFromHeader(header?: string): string | null {
    if (header === undefined) {
      return null;
    }
    if (header.startsWith('Bearer ')) {
      return header.slice(7);
    }
    return null;
  }

  getRefreshExpiration(): Date {
    return new Date(Date.now() + this.refreshExpiresIn * 1000);
  }

  private parseExpiration(exp: string): number {
    const match = /^(\d+)([smhd])$/.exec(exp);
    if (match?.[1] === undefined || match[2] === undefined) {
      return 900;
    }

    const value = parseInt(match[1], 10);
    const unit = match[2] as 's' | 'm' | 'h' | 'd';
    const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
    return value * multipliers[unit];
  }
}

export const tokenService = new TokenService();
