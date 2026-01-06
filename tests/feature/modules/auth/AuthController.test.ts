import express, { Application, Request, Response, NextFunction } from 'express';
import request from 'supertest';
import { HttpStatus, ErrorCode, AppError } from '@/shared/errors';
import { errorHandler } from '@/shared/middlewares/errorHandler';

const mockAuthService = {
  register: jest.fn(),
  login: jest.fn(),
  logout: jest.fn(),
  refresh: jest.fn(),
  forgotPassword: jest.fn(),
  resetPassword: jest.fn(),
  changePassword: jest.fn(),
  getActiveSessions: jest.fn(),
  revokeAllSessions: jest.fn(),
  validateAccessToken: jest.fn(),
};

jest.mock('@/modules/auth/services/AuthService', () => ({
  AuthService: jest.fn(),
  authService: mockAuthService,
}));

jest.mock('@/modules/auth/services/TokenService', () => ({
  TokenService: jest.fn().mockImplementation(() => ({
    verifyAccessToken: jest.fn().mockReturnValue({
      userId: 'user-123',
      email: 'test@example.com',
      username: 'testuser',
      tokenId: 'token-123',
    }),
    extractFromHeader: jest.fn().mockReturnValue('valid-token'),
  })),
}));

let shouldAuthenticate = false;
const mockUserForAuth = {
  id: 'user-123',
  email: 'test@example.com',
  username: 'testuser',
};

jest.mock('@/modules/auth/middlewares/authenticate', () => ({
  authenticate: (req: Request, _res: Response, next: NextFunction): void => {
    if (shouldAuthenticate) {
      const authHeader = req.headers.authorization;
      if (authHeader === undefined || authHeader === '') {
        const { AppError, HttpStatus, ErrorCode } = require('@/shared/errors');
        next(
          new AppError(
            'Token de autenticação não fornecido',
            HttpStatus.UNAUTHORIZED,
            ErrorCode.UNAUTHORIZED
          )
        );
        return;
      }
      req.user = {
        id: mockUserForAuth.id,
        email: mockUserForAuth.email,
        username: mockUserForAuth.username,
        tokenId: 'token-123',
      };
    }
    next();
  },
  optionalAuth: (_req: Request, _res: Response, next: NextFunction): void => {
    next();
  },
}));

import { authRoutes } from '@/modules/auth/routes';

const createEmailExistsError = () =>
  new AppError('Email já cadastrado', HttpStatus.CONFLICT, ErrorCode.EMAIL_ALREADY_EXISTS);
const createUsernameExistsError = () =>
  new AppError('Username já em uso', HttpStatus.CONFLICT, ErrorCode.USERNAME_ALREADY_EXISTS);
const createInvalidCredentialsError = () =>
  new AppError('Credenciais inválidas', HttpStatus.UNAUTHORIZED, ErrorCode.INVALID_CREDENTIALS);
const createInvalidTokenError = () =>
  new AppError('Token inválido ou expirado', HttpStatus.UNAUTHORIZED, ErrorCode.INVALID_TOKEN);
const createUserNotFoundError = () =>
  new AppError('Usuário não encontrado', HttpStatus.NOT_FOUND, ErrorCode.USER_NOT_FOUND);
const createInvalidPasswordError = () =>
  new AppError('Senha atual incorreta', HttpStatus.BAD_REQUEST, ErrorCode.INVALID_PASSWORD);
const createSamePasswordError = () =>
  new AppError('Nova senha deve ser diferente da atual', HttpStatus.BAD_REQUEST, ErrorCode.SAME_PASSWORD);

describe('AuthController Feature Tests', () => {
  let app: Application;

  const mockUser = {
    id: 'user-123',
    username: 'testuser',
    email: 'test@example.com',
    displayName: 'Test User',
  };

  const mockTokens = {
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token',
    expiresIn: 900,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    app = express();
    app.use(express.json());
    app.use('/api/v1/auth', authRoutes);
    app.use(errorHandler);
  });

  describe('POST /api/v1/auth/register', () => {
    const validRegisterData = {
      username: 'newuser',
      email: 'newuser@example.com',
      password: 'Password123!',
      displayName: 'New User',
    };

    it('should register a new user successfully', async () => {
      mockAuthService.register.mockResolvedValue({
        user: mockUser,
        tokens: mockTokens,
      });

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(validRegisterData)
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(HttpStatus.CREATED);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user).toEqual(mockUser);
      expect(response.body.data.tokens).toEqual(mockTokens);
      expect(mockAuthService.register).toHaveBeenCalledWith(
        validRegisterData,
        expect.any(Object)
      );
    });

    it('should return 409 when email already exists', async () => {
      mockAuthService.register.mockRejectedValue(createEmailExistsError());

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(validRegisterData)
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(HttpStatus.CONFLICT);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe(ErrorCode.EMAIL_ALREADY_EXISTS);
    });

    it('should return 409 when username already exists', async () => {
      mockAuthService.register.mockRejectedValue(createUsernameExistsError());

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(validRegisterData)
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(HttpStatus.CONFLICT);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe(ErrorCode.USERNAME_ALREADY_EXISTS);
    });

    it('should return 400 for invalid email format', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({ ...validRegisterData, email: 'invalid-email' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('should return 400 for missing required fields', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'test@example.com' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('should return 400 for short password', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({ ...validRegisterData, password: '123' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
      expect(response.body.success).toBe(false);
    });

    it('should return 400 for short username', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({ ...validRegisterData, username: 'ab' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
    });

    it('should include IP and user-agent in context', async () => {
      mockAuthService.register.mockResolvedValue({
        user: mockUser,
        tokens: mockTokens,
      });

      await request(app)
        .post('/api/v1/auth/register')
        .send(validRegisterData)
        .set('Content-Type', 'application/json')
        .set('User-Agent', 'Test Agent')
        .set('X-Forwarded-For', '192.168.1.1');

      expect(mockAuthService.register).toHaveBeenCalledWith(
        validRegisterData,
        expect.objectContaining({
          userAgent: 'Test Agent',
          ipAddress: '192.168.1.1',
        })
      );
    });
  });

  describe('POST /api/v1/auth/login', () => {
    const validLoginData = {
      email: 'test@example.com',
      password: 'Password123!',
    };

    it('should login successfully with valid credentials', async () => {
      mockAuthService.login.mockResolvedValue({
        user: mockUser,
        tokens: mockTokens,
      });

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send(validLoginData)
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user).toEqual(mockUser);
      expect(response.body.data.tokens).toEqual(mockTokens);
    });

    it('should return 401 for invalid credentials', async () => {
      mockAuthService.login.mockRejectedValue(createInvalidCredentialsError());

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send(validLoginData)
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe(ErrorCode.INVALID_CREDENTIALS);
    });

    it('should return 400 for missing email', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ password: 'Password123!' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
      expect(response.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('should return 400 for missing password', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'test@example.com' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
      expect(response.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('should return 400 for invalid email format', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'not-an-email', password: 'Password123!' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('should logout successfully', async () => {
      mockAuthService.logout.mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/v1/auth/logout')
        .send({ refreshToken: 'valid-refresh-token' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Logout realizado com sucesso');
      expect(mockAuthService.logout).toHaveBeenCalledWith('valid-refresh-token');
    });

    it('should return 400 for missing refreshToken', async () => {
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .send({})
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
      expect(response.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('should return 400 for empty refreshToken', async () => {
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .send({ refreshToken: '' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('should refresh tokens successfully', async () => {
      mockAuthService.refresh.mockResolvedValue({ tokens: mockTokens });

      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'valid-refresh-token' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.success).toBe(true);
      expect(response.body.data.tokens).toEqual(mockTokens);
    });

    it('should return 401 for invalid refresh token', async () => {
      mockAuthService.refresh.mockRejectedValue(createInvalidTokenError());

      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'invalid-token' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
      expect(response.body.error.code).toBe(ErrorCode.INVALID_TOKEN);
    });

    it('should return 404 when user not found', async () => {
      mockAuthService.refresh.mockRejectedValue(createUserNotFoundError());

      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'valid-token-invalid-user' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(HttpStatus.NOT_FOUND);
      expect(response.body.error.code).toBe(ErrorCode.USER_NOT_FOUND);
    });

    it('should return 400 for missing refreshToken', async () => {
      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({})
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
      expect(response.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    });
  });

  describe('POST /api/v1/auth/forgot-password', () => {
    it('should return success for existing email', async () => {
      mockAuthService.forgotPassword.mockResolvedValue({ token: 'reset-token' });

      const response = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'test@example.com' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe(
        'Se o email existir, você receberá um link de recuperação'
      );
    });

    it('should return success for non-existent email (security)', async () => {
      mockAuthService.forgotPassword.mockResolvedValue({ token: '' });

      const response = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'nonexistent@example.com' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.success).toBe(true);
    });

    it('should return 400 for invalid email format', async () => {
      const response = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'invalid-email' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
      expect(response.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('should return 400 for missing email', async () => {
      const response = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({})
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
    });
  });

  describe('POST /api/v1/auth/reset-password', () => {
    it('should reset password successfully', async () => {
      mockAuthService.resetPassword.mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token: 'valid-reset-token', newPassword: 'NewPassword123!' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Senha alterada com sucesso');
    });

    it('should return 401 for invalid reset token', async () => {
      mockAuthService.resetPassword.mockRejectedValue(createInvalidTokenError());

      const response = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token: 'invalid-token', newPassword: 'NewPassword123!' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
      expect(response.body.error.code).toBe(ErrorCode.INVALID_TOKEN);
    });

    it('should return 400 for missing token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ newPassword: 'NewPassword123!' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
      expect(response.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('should return 400 for missing newPassword', async () => {
      const response = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token: 'valid-token' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
    });

    it('should return 400 for weak new password', async () => {
      const response = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token: 'valid-token', newPassword: '123' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
      expect(response.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    });
  });

  describe('Protected routes without authentication', () => {
    it('POST /api/v1/auth/change-password should return 401', async () => {
      const response = await request(app)
        .post('/api/v1/auth/change-password')
        .send({ currentPassword: 'OldPassword123!', newPassword: 'NewPassword123!' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
    });

    it('GET /api/v1/auth/me should return 401', async () => {
      const response = await request(app).get('/api/v1/auth/me');

      expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
    });

    it('GET /api/v1/auth/sessions should return 401', async () => {
      const response = await request(app).get('/api/v1/auth/sessions');

      expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
    });

    it('DELETE /api/v1/auth/sessions should return 401', async () => {
      const response = await request(app).delete('/api/v1/auth/sessions');

      expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
    });
  });
});

describe('AuthController Protected Routes', () => {
  let app: Application;
  const validToken = 'Bearer valid-token';

  const mockUser = {
    id: 'user-123',
    username: 'testuser',
    email: 'test@example.com',
    displayName: 'Test User',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    shouldAuthenticate = true;

    app = express();
    app.use(express.json());
    app.use('/api/v1/auth', authRoutes);
    app.use(errorHandler);
  });

  afterEach(() => {
    shouldAuthenticate = false;
  });

  describe('GET /api/v1/auth/me', () => {
    it('should return current user data', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', validToken);

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(mockUser.id);
      expect(response.body.data.email).toBe(mockUser.email);
      expect(response.body.data.username).toBe(mockUser.username);
    });
  });

  describe('GET /api/v1/auth/sessions', () => {
    it('should return active sessions', async () => {
      const mockSessions = [
        {
          id: 'session-1',
          userAgent: 'Mozilla/5.0',
          ipAddress: '127.0.0.1',
          createdAt: new Date(),
        },
        {
          id: 'session-2',
          userAgent: 'Chrome/100.0',
          ipAddress: '192.168.1.1',
          createdAt: new Date(),
        },
      ];

      mockAuthService.getActiveSessions.mockResolvedValue(mockSessions);

      const response = await request(app)
        .get('/api/v1/auth/sessions')
        .set('Authorization', validToken);

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.success).toBe(true);
      expect(response.body.data.sessions).toHaveLength(2);
      expect(mockAuthService.getActiveSessions).toHaveBeenCalledWith(mockUser.id);
    });

    it('should return empty array when no sessions', async () => {
      mockAuthService.getActiveSessions.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/v1/auth/sessions')
        .set('Authorization', validToken);

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.data.sessions).toEqual([]);
    });
  });

  describe('DELETE /api/v1/auth/sessions', () => {
    it('should revoke all sessions', async () => {
      mockAuthService.revokeAllSessions.mockResolvedValue(3);

      const response = await request(app)
        .delete('/api/v1/auth/sessions')
        .set('Authorization', validToken);

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.success).toBe(true);
      expect(response.body.data.revokedCount).toBe(3);
      expect(mockAuthService.revokeAllSessions).toHaveBeenCalledWith(mockUser.id, undefined);
    });

    it('should keep current session when keepCurrent=true', async () => {
      mockAuthService.revokeAllSessions.mockResolvedValue(2);

      const response = await request(app)
        .delete('/api/v1/auth/sessions?keepCurrent=true')
        .set('Authorization', validToken);

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.data.revokedCount).toBe(2);
      expect(mockAuthService.revokeAllSessions).toHaveBeenCalledWith(
        mockUser.id,
        'token-123'
      );
    });

    it('should not keep current session when keepCurrent=false', async () => {
      mockAuthService.revokeAllSessions.mockResolvedValue(3);

      const response = await request(app)
        .delete('/api/v1/auth/sessions?keepCurrent=false')
        .set('Authorization', validToken);

      expect(response.status).toBe(HttpStatus.OK);
      expect(mockAuthService.revokeAllSessions).toHaveBeenCalledWith(mockUser.id, undefined);
    });
  });

  describe('POST /api/v1/auth/change-password', () => {
    const validChangePasswordData = {
      currentPassword: 'OldPassword123!',
      newPassword: 'NewPassword123!',
    };

    it('should change password successfully', async () => {
      mockAuthService.changePassword.mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/v1/auth/change-password')
        .send(validChangePasswordData)
        .set('Content-Type', 'application/json')
        .set('Authorization', validToken);

      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Senha alterada com sucesso');
      expect(mockAuthService.changePassword).toHaveBeenCalledWith(
        mockUser.id,
        validChangePasswordData
      );
    });

    it('should return 400 for incorrect current password', async () => {
      mockAuthService.changePassword.mockRejectedValue(createInvalidPasswordError());

      const response = await request(app)
        .post('/api/v1/auth/change-password')
        .send(validChangePasswordData)
        .set('Content-Type', 'application/json')
        .set('Authorization', validToken);

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
      expect(response.body.error.code).toBe(ErrorCode.INVALID_PASSWORD);
    });

    it('should return 400 when new password is same as current', async () => {
      mockAuthService.changePassword.mockRejectedValue(createSamePasswordError());

      const response = await request(app)
        .post('/api/v1/auth/change-password')
        .send({
          currentPassword: 'SamePassword123!',
          newPassword: 'SamePassword123!',
        })
        .set('Content-Type', 'application/json')
        .set('Authorization', validToken);

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
      expect(response.body.error.code).toBe(ErrorCode.SAME_PASSWORD);
    });

    it('should return 404 when user not found', async () => {
      mockAuthService.changePassword.mockRejectedValue(createUserNotFoundError());

      const response = await request(app)
        .post('/api/v1/auth/change-password')
        .send(validChangePasswordData)
        .set('Content-Type', 'application/json')
        .set('Authorization', validToken);

      expect(response.status).toBe(HttpStatus.NOT_FOUND);
      expect(response.body.error.code).toBe(ErrorCode.USER_NOT_FOUND);
    });

    it('should return 400 for missing currentPassword', async () => {
      const response = await request(app)
        .post('/api/v1/auth/change-password')
        .send({ newPassword: 'NewPassword123!' })
        .set('Content-Type', 'application/json')
        .set('Authorization', validToken);

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
      expect(response.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('should return 400 for missing newPassword', async () => {
      const response = await request(app)
        .post('/api/v1/auth/change-password')
        .send({ currentPassword: 'OldPassword123!' })
        .set('Content-Type', 'application/json')
        .set('Authorization', validToken);

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
      expect(response.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('should return 400 for weak new password', async () => {
      const response = await request(app)
        .post('/api/v1/auth/change-password')
        .send({ currentPassword: 'OldPassword123!', newPassword: '123' })
        .set('Content-Type', 'application/json')
        .set('Authorization', validToken);

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
    });
  });
});
