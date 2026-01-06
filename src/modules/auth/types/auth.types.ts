export enum TokenType {
  ACCESS = 'access',
  REFRESH = 'refresh',
  PASSWORD_RESET = 'password_reset',
}

export interface TokenPayload {
  userId: string;
  email: string;
  username: string;
  type: TokenType;
}

export interface DecodedToken extends TokenPayload {
  iat: number;
  exp: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface RefreshTokenAttributes {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  isRevoked: boolean;
  revokedAt: Date | null;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type RefreshTokenCreation = Omit<
  RefreshTokenAttributes,
  'id' | 'isRevoked' | 'revokedAt' | 'createdAt' | 'updatedAt'
> & {
  userAgent?: string | null;
  ipAddress?: string | null;
};

export interface AuthContext {
  userId?: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface AuthEventData {
  userId?: string;
  email?: string;
  reason?: string;
  timestamp: Date;
}
