import type { TokenPayload, DecodedToken, TokenPair } from '../types';

export interface ITokenService {
  generateAccessToken(payload: Omit<TokenPayload, 'type'>): string;
  generateRefreshToken(payload: Omit<TokenPayload, 'type'>): string;
  generateTokenPair(payload: Omit<TokenPayload, 'type'>): TokenPair;
  verifyAccessToken(token: string): DecodedToken;
  verifyRefreshToken(token: string): DecodedToken;
  decodeToken(token: string): DecodedToken | null;
  extractFromHeader(header?: string): string | null;
  getRefreshExpiration(): Date;
}
