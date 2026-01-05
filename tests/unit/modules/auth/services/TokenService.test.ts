import jwt from 'jsonwebtoken';
import { TokenService } from '@/modules/auth/services/TokenService';
import { TokenType } from '@/modules/auth/types';

jest.mock('jsonwebtoken');

const mockJwt = jwt as jest.Mocked<typeof jwt>;

describe('TokenService', () => {
  let service: TokenService;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    process.env = { ...originalEnv };
    service = new TokenService();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('constructor', () => {
    it('should use default secrets when env vars not set', () => {
      delete process.env.JWT_ACCESS_SECRET;
      delete process.env.JWT_REFRESH_SECRET;

      const newService = new TokenService();

      expect(newService).toBeDefined();
    });

    it('should use env secrets when provided', () => {
      process.env.JWT_ACCESS_SECRET = 'custom-access-secret';
      process.env.JWT_REFRESH_SECRET = 'custom-refresh-secret';
      process.env.JWT_ACCESS_EXPIRES = '30m';
      process.env.JWT_REFRESH_EXPIRES = '14d';

      const newService = new TokenService();

      expect(newService).toBeDefined();
    });
  });

  describe('generateAccessToken', () => {
    it('should generate an access token', () => {
      const payload = { userId: 'user-123', email: 'test@example.com', username: 'testuser' };
      const expectedToken = 'access-token-mock';

      mockJwt.sign.mockReturnValue(expectedToken as never);

      const result = service.generateAccessToken(payload);

      expect(mockJwt.sign).toHaveBeenCalledWith(
        { ...payload, type: TokenType.ACCESS },
        expect.any(String),
        { expiresIn: expect.any(Number) }
      );
      expect(result).toBe(expectedToken);
    });
  });

  describe('generateRefreshToken', () => {
    it('should generate a refresh token', () => {
      const payload = { userId: 'user-123', email: 'test@example.com', username: 'testuser' };
      const expectedToken = 'refresh-token-mock';

      mockJwt.sign.mockReturnValue(expectedToken as never);

      const result = service.generateRefreshToken(payload);

      expect(mockJwt.sign).toHaveBeenCalledWith(
        { ...payload, type: TokenType.REFRESH },
        expect.any(String),
        { expiresIn: expect.any(Number) }
      );
      expect(result).toBe(expectedToken);
    });
  });

  describe('generateTokenPair', () => {
    it('should generate both access and refresh tokens', () => {
      const payload = { userId: 'user-123', email: 'test@example.com', username: 'testuser' };

      mockJwt.sign
        .mockReturnValueOnce('access-token' as never)
        .mockReturnValueOnce('refresh-token' as never);

      const result = service.generateTokenPair(payload);

      expect(result).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: expect.any(Number),
      });
      expect(mockJwt.sign).toHaveBeenCalledTimes(2);
    });
  });

  describe('verifyAccessToken', () => {
    it('should verify and return decoded access token', () => {
      const decodedToken = {
        userId: 'user-123',
        email: 'test@example.com',
        username: 'testuser',
        type: TokenType.ACCESS,
        iat: 1234567890,
        exp: 1234567890,
      };

      mockJwt.verify.mockReturnValue(decodedToken as never);

      const result = service.verifyAccessToken('valid-access-token');

      expect(mockJwt.verify).toHaveBeenCalledWith('valid-access-token', expect.any(String));
      expect(result).toEqual(decodedToken);
    });

    it('should throw error for invalid token type', () => {
      const decodedToken = {
        userId: 'user-123',
        type: TokenType.REFRESH,
      };

      mockJwt.verify.mockReturnValue(decodedToken as never);

      expect(() => service.verifyAccessToken('refresh-token')).toThrow('Invalid token type');
    });

    it('should throw error for invalid token', () => {
      mockJwt.verify.mockImplementation(() => {
        throw new Error('invalid token');
      });

      expect(() => service.verifyAccessToken('invalid-token')).toThrow('invalid token');
    });
  });

  describe('verifyRefreshToken', () => {
    it('should verify and return decoded refresh token', () => {
      const decodedToken = {
        userId: 'user-123',
        email: 'test@example.com',
        username: 'testuser',
        type: TokenType.REFRESH,
        iat: 1234567890,
        exp: 1234567890,
      };

      mockJwt.verify.mockReturnValue(decodedToken as never);

      const result = service.verifyRefreshToken('valid-refresh-token');

      expect(mockJwt.verify).toHaveBeenCalledWith('valid-refresh-token', expect.any(String));
      expect(result).toEqual(decodedToken);
    });

    it('should throw error for invalid token type', () => {
      const decodedToken = {
        userId: 'user-123',
        type: TokenType.ACCESS,
      };

      mockJwt.verify.mockReturnValue(decodedToken as never);

      expect(() => service.verifyRefreshToken('access-token')).toThrow('Invalid token type');
    });
  });

  describe('decodeToken', () => {
    it('should decode token without verification', () => {
      const decodedToken = {
        userId: 'user-123',
        email: 'test@example.com',
        type: TokenType.ACCESS,
      };

      mockJwt.decode.mockReturnValue(decodedToken as never);

      const result = service.decodeToken('some-token');

      expect(mockJwt.decode).toHaveBeenCalledWith('some-token');
      expect(result).toEqual(decodedToken);
    });

    it('should return null for invalid token', () => {
      mockJwt.decode.mockImplementation(() => {
        throw new Error('invalid');
      });

      const result = service.decodeToken('invalid-token');

      expect(result).toBeNull();
    });
  });

  describe('extractFromHeader', () => {
    it('should extract token from Bearer header', () => {
      const result = service.extractFromHeader('Bearer valid-token-123');

      expect(result).toBe('valid-token-123');
    });

    it('should return null for undefined header', () => {
      const result = service.extractFromHeader(undefined);

      expect(result).toBeNull();
    });

    it('should return null for non-Bearer header', () => {
      const result = service.extractFromHeader('Basic credentials');

      expect(result).toBeNull();
    });

    it('should return null for empty header', () => {
      const result = service.extractFromHeader('');

      expect(result).toBeNull();
    });
  });

  describe('getRefreshExpiration', () => {
    it('should return a future date', () => {
      const now = Date.now();
      const result = service.getRefreshExpiration();

      expect(result).toBeInstanceOf(Date);
      expect(result.getTime()).toBeGreaterThan(now);
    });
  });

  describe('parseExpiration (via constructor)', () => {
    it('should parse seconds', () => {
      process.env.JWT_ACCESS_EXPIRES = '30s';
      const newService = new TokenService();

      mockJwt.sign.mockReturnValue('token' as never);
      newService.generateAccessToken({ userId: '1', email: 'a@b.com', username: 'u' });

      expect(mockJwt.sign).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
        expiresIn: 30,
      });
    });

    it('should parse minutes', () => {
      process.env.JWT_ACCESS_EXPIRES = '15m';
      const newService = new TokenService();

      mockJwt.sign.mockReturnValue('token' as never);
      newService.generateAccessToken({ userId: '1', email: 'a@b.com', username: 'u' });

      expect(mockJwt.sign).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
        expiresIn: 900,
      });
    });

    it('should parse hours', () => {
      process.env.JWT_ACCESS_EXPIRES = '2h';
      const newService = new TokenService();

      mockJwt.sign.mockReturnValue('token' as never);
      newService.generateAccessToken({ userId: '1', email: 'a@b.com', username: 'u' });

      expect(mockJwt.sign).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
        expiresIn: 7200,
      });
    });

    it('should parse days', () => {
      process.env.JWT_ACCESS_EXPIRES = '7d';
      const newService = new TokenService();

      mockJwt.sign.mockReturnValue('token' as never);
      newService.generateAccessToken({ userId: '1', email: 'a@b.com', username: 'u' });

      expect(mockJwt.sign).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
        expiresIn: 604800,
      });
    });

    it('should return default 900 for invalid format', () => {
      process.env.JWT_ACCESS_EXPIRES = 'invalid';
      const newService = new TokenService();

      mockJwt.sign.mockReturnValue('token' as never);
      newService.generateAccessToken({ userId: '1', email: 'a@b.com', username: 'u' });

      expect(mockJwt.sign).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
        expiresIn: 900,
      });
    });
  });
});
