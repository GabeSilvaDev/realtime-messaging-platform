import express, { type Application } from 'express';
import request from 'supertest';
import { errorHandler } from '@/shared/middlewares/errorHandler';
import { AppError, ErrorCode, HttpStatus } from '@/shared/errors';

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
    verifyAccessToken: jest.fn(),
    extractFromHeader: jest.fn(),
  })),
}));

import { authRoutes } from '@/modules/auth/routes';

describe('Rate limit de autenticação — Feature', () => {
  let app: Application;
  const credentials = { email: 'user@example.com', password: 'WrongPass123!' };

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);
    app.use(errorHandler);
  });

  it('6ª tentativa de login com falha deve retornar 429', async () => {
    mockAuthService.login.mockRejectedValue(
      new AppError('Credenciais inválidas', HttpStatus.UNAUTHORIZED, ErrorCode.INVALID_CREDENTIALS)
    );

    for (let attempt = 1; attempt <= 5; attempt++) {
      const response = await request(app).post('/api/auth/login').send(credentials);
      expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
    }

    const blocked = await request(app).post('/api/auth/login').send(credentials);

    expect(blocked.status).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(blocked.body.error.code).toBe(ErrorCode.RATE_LIMITED);
    expect(blocked.headers['ratelimit-limit']).toBeDefined();
  });

  it('forgot-password deve limitar a 5 requisições', async () => {
    mockAuthService.forgotPassword.mockResolvedValue(undefined);

    for (let attempt = 1; attempt <= 5; attempt++) {
      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'user@example.com' });
      expect(response.status).not.toBe(HttpStatus.TOO_MANY_REQUESTS);
    }

    const blocked = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'user@example.com' });

    expect(blocked.status).toBe(HttpStatus.TOO_MANY_REQUESTS);
  });
});
